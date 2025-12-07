/**
 * MasterClockProcessor - Sample-accurate clock running in AudioWorklet
 *
 * Emits tick messages at configurable PPQN (pulses per quarter note)
 * for driving sequencers with sample-accurate timing.
 */

class MasterClockProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.state = {
      isRunning: false,
      bpm: 120,
      ppqn: 96,
      swing: 0,
      swingSubdivision: 4,
    };

    this.samplesSinceLastTick = 0;
    this.currentTick = 0;
    this.actualSampleRate = sampleRate || 48000;
    this.samplesPerTick = 0;

    this.updateSamplesPerTick();

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'start':
        this.state.isRunning = true;
        this.samplesSinceLastTick = 0;
        this.currentTick = 0;
        this.port.postMessage({ type: 'started' });
        break;

      case 'stop':
        this.state.isRunning = false;
        this.port.postMessage({ type: 'stopped' });
        break;

      case 'pause':
        this.state.isRunning = false;
        this.port.postMessage({ type: 'paused' });
        break;

      case 'resume':
        this.state.isRunning = true;
        this.port.postMessage({ type: 'resumed' });
        break;

      case 'setTempo':
        this.state.bpm = data.bpm;
        this.updateSamplesPerTick();
        break;

      case 'setSwing':
        this.state.swing = Math.max(0, Math.min(1, data.swing));
        break;

      case 'setPpqn':
        this.state.ppqn = data.ppqn;
        this.updateSamplesPerTick();
        break;
    }
  }

  updateSamplesPerTick() {
    // samples per tick = (samples per second) / (ticks per second)
    // ticks per second = (bpm / 60) * ppqn
    const ticksPerSecond = (this.state.bpm / 60) * this.state.ppqn;
    this.samplesPerTick = this.actualSampleRate / ticksPerSecond;
  }

  getSwingOffset(tick) {
    // Apply swing to every other 16th note
    // At 96 PPQN, 16th notes are every 24 ticks (ppqn / 4)
    const ticksPerSixteenth = this.state.ppqn / 4;
    const sixteenthIndex = Math.floor(tick / ticksPerSixteenth);
    const positionInSwingPair = sixteenthIndex % 2;
    const positionWithinSixteenth = tick % ticksPerSixteenth;

    // Only apply swing at the start of offbeat 16th notes (tick 0 within the 16th)
    if (positionInSwingPair === 1 && positionWithinSixteenth === 0) {
      // This is the start of an "offbeat" 16th note - apply swing delay
      // swing of 0 = no delay, swing of 0.5 = triplet feel, swing of 1 = dotted 8th feel
      // Max swing pushes the offbeat 2/3 of the way toward the next downbeat
      return this.state.swing * this.samplesPerTick * ticksPerSixteenth * 0.66;
    }
    return 0;
  }

  process(inputs, outputs, parameters) {
    if (!this.state.isRunning) {
      return true;
    }

    const blockSize = 128; // Standard AudioWorklet block size

    // Process the block and emit ticks
    for (let i = 0; i < blockSize; i++) {
      this.samplesSinceLastTick++;

      // Check if we've reached the next tick
      // Swing is applied as a one-time offset at specific ticks, not added to interval
      if (this.samplesSinceLastTick >= this.samplesPerTick) {
        // Check for swing offset on this tick
        const swingDelay = this.getSwingOffset(this.currentTick);

        if (swingDelay > 0 && this.samplesSinceLastTick < this.samplesPerTick + swingDelay) {
          // We're in swing delay territory - wait a bit longer
          continue;
        }

        // Calculate precise time for this tick
        const tickTime = currentTime + (i / sampleRate);

        // Emit tick
        // ppqn/4 = ticks per 16th note (96/4 = 24 ticks per 16th note)
        const ticksPerSixteenth = this.state.ppqn / 4;
        this.port.postMessage({
          type: 'tick',
          tick: this.currentTick,
          time: tickTime,
          step: Math.floor(this.currentTick / ticksPerSixteenth), // 16th note step
          beat: Math.floor(this.currentTick / this.state.ppqn),
          bar: Math.floor(this.currentTick / (this.state.ppqn * 4)),
        });

        this.samplesSinceLastTick -= this.samplesPerTick;
        this.currentTick++;
      }
    }

    return true;
  }
}

registerProcessor('master-clock-processor', MasterClockProcessor);

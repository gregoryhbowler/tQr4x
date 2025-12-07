/**
 * SampleProcessor - AudioWorklet for granular sample processing
 *
 * Handles grain-based synthesis with:
 * - Variable grain length and density
 * - Scan position with adjustable speed
 * - Spread (position variance)
 * - Stereo panning per grain
 * - Hanning window envelope per grain
 */

class SampleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Sample data (mono float32 array)
    this.sampleData = null;
    this.sampleRate = 44100;
    this.sampleLength = 0;

    // Granular parameters
    this.params = {
      startPoint: 0,        // 0-1 normalized
      scanSpeed: 1,         // 0-8x
      grainLength: 0.05,    // seconds
      grainDensity: 20,     // grains per second
      spread: 0,            // 0-1 position variance
      grainPan: 0,          // -1 to 1 stereo spread
    };

    // Playback state
    this.isActive = false;
    this.velocity = 1;
    this.scanPosition = 0;  // Current position in sample (0-1)

    // Grain pool
    this.grains = [];
    this.maxGrains = 64;    // Maximum concurrent grains
    this.samplesSinceLastGrain = 0;

    // Initialize grain pool
    for (let i = 0; i < this.maxGrains; i++) {
      this.grains.push({
        active: false,
        startSample: 0,
        currentSample: 0,
        lengthSamples: 0,
        pan: 0,
        amplitude: 1,
      });
    }

    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      const { type } = event.data;

      switch (type) {
        case 'loadSample':
          this.loadSample(event.data);
          break;
        case 'trigger':
          this.trigger(event.data);
          break;
        case 'release':
          this.release();
          break;
        case 'updateParams':
          Object.assign(this.params, event.data.params);
          break;
      }
    };
  }

  /**
   * Load sample data from main thread
   */
  loadSample({ sampleData, sampleRate }) {
    // Copy the sample data (comes as Float32Array)
    this.sampleData = new Float32Array(sampleData);
    this.sampleRate = sampleRate;
    this.sampleLength = sampleData.length;
  }

  /**
   * Trigger granular playback
   */
  trigger({ velocity, params }) {
    this.isActive = true;
    this.velocity = velocity || 1;

    if (params) {
      Object.assign(this.params, params);
    }

    // Set initial scan position from startPoint
    this.scanPosition = this.params.startPoint;
    this.samplesSinceLastGrain = Infinity; // Trigger first grain immediately
  }

  /**
   * Release - stop generating new grains
   */
  release() {
    this.isActive = false;
    // Existing grains will play out naturally
  }

  /**
   * Generate Hanning window value for position in grain
   */
  hanningWindow(position) {
    // position is 0-1 through the grain
    return 0.5 * (1 - Math.cos(2 * Math.PI * position));
  }

  /**
   * Get an inactive grain from the pool
   */
  getAvailableGrain() {
    for (let i = 0; i < this.grains.length; i++) {
      if (!this.grains[i].active) {
        return this.grains[i];
      }
    }
    return null; // No available grains
  }

  /**
   * Spawn a new grain
   */
  spawnGrain() {
    const grain = this.getAvailableGrain();
    if (!grain || !this.sampleData) return;

    // Calculate grain start position with spread
    let startPos = this.scanPosition;
    if (this.params.spread > 0) {
      const spreadAmount = (Math.random() - 0.5) * 2 * this.params.spread;
      startPos = Math.max(0, Math.min(1, startPos + spreadAmount * 0.2));
    }

    // Convert to sample index
    const startSample = Math.floor(startPos * this.sampleLength);

    // Calculate grain length in samples
    const lengthSamples = Math.floor(this.params.grainLength * sampleRate);

    // Calculate pan with spread
    let pan = 0;
    if (this.params.grainPan !== 0) {
      pan = this.params.grainPan * (Math.random() * 2 - 1);
    }

    // Configure grain
    grain.active = true;
    grain.startSample = startSample;
    grain.currentSample = 0;
    grain.lengthSamples = lengthSamples;
    grain.pan = Math.max(-1, Math.min(1, pan));
    grain.amplitude = this.velocity;
  }

  /**
   * Process audio - called at sample rate
   */
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const leftChannel = output[0];
    const rightChannel = output[1];

    if (!leftChannel || !rightChannel) return true;

    const blockSize = leftChannel.length;

    // Clear output
    for (let i = 0; i < blockSize; i++) {
      leftChannel[i] = 0;
      rightChannel[i] = 0;
    }

    // If no sample loaded, return silence
    if (!this.sampleData || this.sampleLength === 0) {
      return true;
    }

    // Calculate samples between grains based on density
    const samplesPerGrain = sampleRate / this.params.grainDensity;

    // Process each sample in the block
    for (let i = 0; i < blockSize; i++) {
      // Check if we should spawn a new grain
      if (this.isActive) {
        this.samplesSinceLastGrain++;

        if (this.samplesSinceLastGrain >= samplesPerGrain) {
          this.spawnGrain();
          this.samplesSinceLastGrain = 0;
        }

        // Advance scan position based on scan speed
        // scanSpeed of 1 = move through sample at normal rate
        // scanSpeed of 0 = freeze
        const scanIncrement = this.params.scanSpeed / sampleRate;
        this.scanPosition += scanIncrement;

        // Wrap scan position
        if (this.scanPosition > 1) {
          this.scanPosition -= 1;
        } else if (this.scanPosition < 0) {
          this.scanPosition += 1;
        }
      }

      // Mix all active grains
      for (const grain of this.grains) {
        if (!grain.active) continue;

        // Get sample from buffer
        const sampleIndex = grain.startSample + grain.currentSample;

        if (sampleIndex >= 0 && sampleIndex < this.sampleLength) {
          const sample = this.sampleData[sampleIndex];

          // Apply Hanning window
          const windowPosition = grain.currentSample / grain.lengthSamples;
          const envelope = this.hanningWindow(windowPosition);

          const amplitude = sample * envelope * grain.amplitude;

          // Apply pan (constant power panning)
          const panAngle = (grain.pan + 1) * Math.PI / 4; // 0 to PI/2
          const leftGain = Math.cos(panAngle);
          const rightGain = Math.sin(panAngle);

          leftChannel[i] += amplitude * leftGain;
          rightChannel[i] += amplitude * rightGain;
        }

        // Advance grain position
        grain.currentSample++;

        // Deactivate finished grains
        if (grain.currentSample >= grain.lengthSamples) {
          grain.active = false;
        }
      }
    }

    // Soft clip output to prevent distortion from many overlapping grains
    for (let i = 0; i < blockSize; i++) {
      leftChannel[i] = Math.tanh(leftChannel[i]);
      rightChannel[i] = Math.tanh(rightChannel[i]);
    }

    return true;
  }
}

registerProcessor('sample-processor', SampleProcessor);

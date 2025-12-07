/**
 * OceanVoice - Granular synthesis engine for atmospheric textures
 *
 * Based on granular synthesis with:
 * - Pitch control (semitones)
 * - Grain size and density
 * - Position and spread in sample
 * - HPF/LPF filtering
 * - Multiple grain envelope shapes (hanning, trapezoid, exponential, etc.)
 */

export type GrainShape = 'hanning' | 'trapezoid' | 'exponentialUp' | 'exponentialDown' | 'rectangle' | 'trapezium';

export interface OceanVoiceParams {
  // Pitch in semitones (-24 to +24)
  pitch: number;

  // Grain parameters
  grainSize: number;       // Grain size in milliseconds (10 - 4000)
  density: number;         // Grains per second as percentage (0 - 200)
  position: number;        // Position in sample 0-100%
  spread: number;          // Random spread around position 0-100%
  grainShape: GrainShape;  // Envelope shape for grains

  // Filters
  hpfFreq: number;         // High-pass filter frequency (20 - 20000)
  lpfFreq: number;         // Low-pass filter frequency (20 - 20000)

  // Output
  volume: number;          // Volume 0-100%

  // Sample URL (for persistence when copying patterns)
  sampleUrl?: string;
}

const DEFAULT_PARAMS: OceanVoiceParams = {
  pitch: 12,
  grainSize: 100,
  density: 100,
  position: 50,
  spread: 10,
  grainShape: 'hanning',
  hpfFreq: 20,
  lpfFreq: 20000,
  volume: 80,
};



export class OceanVoice {
  private ctx: AudioContext;
  private output: GainNode;
  private params: OceanVoiceParams;

  // Sample buffer
  private sampleBuffer: AudioBuffer | null = null;
  private reversedBuffer: AudioBuffer | null = null;

  // Sample info
  private sampleName: string = '';
  private sampleDuration: number = 0;

  // Active grains tracking
  private activeGrains: Set<AudioBufferSourceNode> = new Set();

  constructor(ctx: AudioContext, destination?: AudioNode) {
    this.ctx = ctx;
    this.params = { ...DEFAULT_PARAMS };

    this.output = ctx.createGain();
    this.output.gain.value = this.params.volume / 100;

    if (destination) {
      this.output.connect(destination);
    } else {
      this.output.connect(ctx.destination);
    }
  }

  /**
   * Load a sample from an AudioBuffer
   */
  loadSample(buffer: AudioBuffer, name: string = 'sample'): void {
    this.sampleBuffer = buffer;
    this.sampleName = name;
    this.sampleDuration = buffer.duration;
    this.createReversedBuffer();
  }

  /**
   * Load sample from URL
   */
  async loadSampleFromUrl(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      const name = url.split('/').pop() || 'sample';
      this.loadSample(audioBuffer, name);
      // Store the URL for persistence (pattern copy/paste)
      this.params.sampleUrl = url;
    } catch (error) {
      console.error('Failed to load sample from URL:', error);
      throw error;
    }
  }

  /**
   * Load sample from File object
   */
  async loadSampleFromFile(file: File): Promise<void> {
    // Read as ArrayBuffer for audio decoding
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.loadSample(audioBuffer, file.name);

    // Also read as data URL for persistence (pattern copy/paste)
    const dataUrl = await this.fileToDataUrl(file);
    this.params.sampleUrl = dataUrl;
  }

  /**
   * Convert a File to a data URL for persistence
   */
  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Create reversed copy of sample buffer
   */
  private createReversedBuffer(): void {
    if (!this.sampleBuffer) return;

    const numChannels = this.sampleBuffer.numberOfChannels;
    const length = this.sampleBuffer.length;

    this.reversedBuffer = this.ctx.createBuffer(
      numChannels,
      length,
      this.sampleBuffer.sampleRate
    );

    for (let channel = 0; channel < numChannels; channel++) {
      const sourceData = this.sampleBuffer.getChannelData(channel);
      const destData = this.reversedBuffer.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        destData[i] = sourceData[length - 1 - i];
      }
    }
  }

  /**
   * Trigger the ocean voice - schedules grains for one step
   */
  trigger(time: number, velocity: number = 1, paramLocks?: Partial<OceanVoiceParams>): void {
    console.log('[Ocean] trigger called', {
      time,
      velocity,
      hasSample: !!this.sampleBuffer,
      sampleDuration: this.sampleBuffer?.duration,
      ctxState: this.ctx.state,
      outputConnected: this.output.numberOfOutputs,
      paramLocks,
      voiceParams: this.params
    });

    if (!this.sampleBuffer) {
      console.log('[Ocean] No sample buffer, playing click');
      this.triggerClick(time, velocity);
      return;
    }

    // Use voice params, with paramLocks overriding specific values if provided
    const p = paramLocks ? { ...this.params, ...paramLocks } : this.params;
    console.log('[Ocean] Scheduling grains with params', { pitch: p.pitch, density: p.density, grainSize: p.grainSize, volume: p.volume });

    // Schedule grains for this trigger
    this.scheduleGrains(time, velocity, p);
  }

  /**
   * Schedule grains for a trigger event
   */
  private scheduleGrains(startTime: number, velocity: number, p: OceanVoiceParams): void {
    if (!this.sampleBuffer) return;

    // Calculate grain interval from density
    // density 100 = ~10 grains per second, density 200 = ~20 grains per second
    const grainsPerSecond = (p.density / 100) * 10;
    const grainInterval = 1 / grainsPerSecond;

    // Schedule grains for a short duration (one step worth, ~125ms at 120bpm)
    const duration = 0.125;
    const numGrains = Math.max(1, Math.floor(duration / grainInterval));

    for (let i = 0; i < numGrains; i++) {
      const grainTime = startTime + i * grainInterval;
      this.spawnGrain(grainTime, velocity, p);
    }
  }

  /**
   * Spawn a single grain
   *
   * Pitch mapping (tape-style varispeed):
   *   +24 = forward, double speed (octave up)
   *   +12 = forward, original speed
   *     0 = forward, half speed (octave down)
   *    -1 = reversed, half speed (octave down)
   *   -12 = reversed, original speed
   *   -24 = reversed, double speed (octave up)
   *
   * Negative pitch = reversed buffer
   * Semitones from original = |pitch| - 12
   */
  private spawnGrain(time: number, velocity: number, p: OceanVoiceParams): void {
    // Negative pitch uses reversed buffer
    const buffer = p.pitch < 0 ? this.reversedBuffer : this.sampleBuffer;
    if (!buffer) return;

    // Calculate playback rate: |pitch| determines semitones from original speed
    // |pitch| = 12 means original speed, |pitch| = 24 means octave up, |pitch| = 0 means octave down
    const semitones = Math.abs(p.pitch) - 12;
    const playbackRate = Math.pow(2, semitones / 12);

    // Calculate grain size in seconds
    const grainSizeSeconds = p.grainSize / 1000;

    // Calculate position with spread
    const basePosition = (p.position / 100) * buffer.duration;
    const spreadRange = (p.spread / 100) * buffer.duration;
    const randomOffset = (Math.random() - 0.5) * 2 * spreadRange;
    let startPosition = basePosition + randomOffset;

    // Clamp position to valid range
    startPosition = Math.max(0, Math.min(buffer.duration - grainSizeSeconds, startPosition));

    // Create source
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    // Create HPF
    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(p.hpfFreq, time);
    hpf.Q.value = 0.7;

    // Create LPF
    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(p.lpfFreq, time);
    lpf.Q.value = 0.7;

    // Create grain envelope gain node
    const grainGain = this.ctx.createGain();
    const adjustedDuration = grainSizeSeconds / playbackRate;
    const maxAmplitude = velocity * (p.volume / 100);

    // Ensure time is slightly in the future to avoid scheduling conflicts
    const safeTime = Math.max(time, this.ctx.currentTime + 0.005);

    // Use simple attack-sustain-release envelope
    // Attack and release are percentage of total duration
    let attackPct: number;
    let releasePct: number;

    switch (p.grainShape) {
      case 'hanning':
        // Symmetric attack/release, no sustain
        attackPct = 0.5;
        releasePct = 0.5;
        break;
      case 'trapezoid':
        attackPct = 0.1;
        releasePct = 0.1;
        break;
      case 'trapezium':
        attackPct = 0.2;
        releasePct = 0.3;
        break;
      case 'exponentialUp':
        attackPct = 0.8;
        releasePct = 0.2;
        break;
      case 'exponentialDown':
        attackPct = 0.2;
        releasePct = 0.8;
        break;
      case 'rectangle':
      default:
        attackPct = 0.02;
        releasePct = 0.02;
        break;
    }

    const attackEnd = safeTime + adjustedDuration * attackPct;
    const releaseStart = safeTime + adjustedDuration * (1 - releasePct);
    const endTime = safeTime + adjustedDuration;

    // Start at 0
    grainGain.gain.setValueAtTime(0, safeTime);
    // Ramp to peak
    grainGain.gain.linearRampToValueAtTime(maxAmplitude, attackEnd);

    // Only add sustain hold if there's a gap between attack and release
    if (releaseStart > attackEnd + 0.001) {
      grainGain.gain.setValueAtTime(maxAmplitude, releaseStart);
    }

    // Ramp down to 0
    grainGain.gain.linearRampToValueAtTime(0, endTime);

    // Connect chain: source -> hpf -> lpf -> grainGain -> output
    source.connect(hpf);
    hpf.connect(lpf);
    lpf.connect(grainGain);
    grainGain.connect(this.output);

    // Track active grains
    this.activeGrains.add(source);

    source.onended = () => {
      this.activeGrains.delete(source);
      source.disconnect();
      hpf.disconnect();
      lpf.disconnect();
      grainGain.disconnect();
    };

    // Start and stop the grain using safeTime to match envelope scheduling
    source.start(safeTime, startPosition, grainSizeSeconds);
    source.stop(safeTime + adjustedDuration + 0.01);
  }

  /**
   * Trigger a click sound when no sample is loaded
   */
  private triggerClick(time: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.05);

    gain.gain.setValueAtTime(velocity * 0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(gain);
    gain.connect(this.output);

    osc.start(time);
    osc.stop(time + 0.1);
  }

  /**
   * Stop all active grains
   */
  stopAllGrains(): void {
    for (const source of this.activeGrains) {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
    this.activeGrains.clear();
  }

  // === Sample Info ===

  getSampleName(): string { return this.sampleName; }
  getSampleDuration(): number { return this.sampleDuration; }
  hasSample(): boolean { return this.sampleBuffer !== null; }

  /**
   * Get waveform data for visualization
   */
  getWaveformData(resolution: number = 200): Float32Array | null {
    if (!this.sampleBuffer) return null;

    const channelData = this.sampleBuffer.getChannelData(0);
    const samplesPerBucket = Math.floor(channelData.length / resolution);
    const waveform = new Float32Array(resolution);

    for (let i = 0; i < resolution; i++) {
      const start = i * samplesPerBucket;
      let max = 0;
      for (let j = 0; j < samplesPerBucket; j++) {
        const abs = Math.abs(channelData[start + j] || 0);
        if (abs > max) max = abs;
      }
      waveform[i] = max;
    }

    return waveform;
  }

  // === Parameter Methods ===

  getParams(): OceanVoiceParams {
    return { ...this.params };
  }

  setParams(params: Partial<OceanVoiceParams>): void {
    console.log('[Ocean] setParams called with:', params);
    Object.assign(this.params, params);
    console.log('[Ocean] params now:', this.params);
    if (params.volume !== undefined) {
      this.output.gain.setValueAtTime(this.params.volume / 100, this.ctx.currentTime);
    }
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
    this.stopAllGrains();
  }

  getOutput(): GainNode {
    return this.output;
  }

  dispose(): void {
    this.stopAllGrains();
    this.disconnect();
    this.sampleBuffer = null;
    this.reversedBuffer = null;
  }
}

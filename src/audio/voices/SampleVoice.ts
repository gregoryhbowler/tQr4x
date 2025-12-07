/**
 * SampleVoice - Sample playback with standard and granular modes
 *
 * Standard Mode:
 * - Sample playback with start point, pitch, direction
 * - ADSR envelope
 * - LP/HP filters
 *
 * Granular Mode:
 * - Grain-based synthesis via AudioWorklet
 * - Scan speed, grain length, density, spread, pan
 */

export type SampleMode = 'standard' | 'granular';
export type PlayDirection = 'forward' | 'reverse';

export interface SampleVoiceParams {
  // Mode
  mode: SampleMode;

  // === STANDARD MODE PARAMS ===
  startPoint: number;      // 0-1 normalized position in sample
  pitch: number;           // Semitones (-24 to +24), 0 = original pitch
  direction: PlayDirection;

  // Envelope (ADSR)
  attack: number;          // seconds (0.001 - 2)
  decay: number;           // seconds (0.001 - 2)
  sustain: number;         // 0-1
  release: number;         // seconds (0.001 - 5)

  // Filters
  lpEnabled: boolean;
  lpCutoff: number;        // Hz (20 - 20000)
  lpResonance: number;     // 0-20
  hpEnabled: boolean;
  hpCutoff: number;        // Hz (20 - 20000)
  hpResonance: number;     // 0-20

  // === GRANULAR MODE PARAMS ===
  scanSpeed: number;       // 0-8 (0 = frozen, 1 = normal, 8 = 8x speed)
  grainLength: number;     // seconds (0.001 - 1.0)
  grainDensity: number;    // grains per second (1 - 100)
  spread: number;          // 0-1 (shifts starting point variance)
  grainPan: number;        // -1 to 1 (stereo spread for grains)

  // Output
  gain: number;            // 0-1

  // Sample URL (for persistence when copying patterns)
  sampleUrl?: string;
}

const DEFAULT_PARAMS: SampleVoiceParams = {
  mode: 'standard',

  // Standard
  startPoint: 0,
  pitch: 0,
  direction: 'forward',
  attack: 0.001,
  decay: 0.1,
  sustain: 1,
  release: 0.1,
  lpEnabled: false,
  lpCutoff: 20000,
  lpResonance: 0,
  hpEnabled: false,
  hpCutoff: 20,
  hpResonance: 0,

  // Granular
  scanSpeed: 1,
  grainLength: 0.05,
  grainDensity: 20,
  spread: 0,
  grainPan: 0,

  gain: 0.8
};

export const SAMPLE_PRESETS: Record<string, Partial<SampleVoiceParams>> = {
  default: {
    mode: 'standard',
    startPoint: 0,
    pitch: 0,
    direction: 'forward',
    attack: 0.001,
    decay: 0.1,
    sustain: 1,
    release: 0.1,
  },

  oneShot: {
    mode: 'standard',
    attack: 0.001,
    decay: 0.5,
    sustain: 0,
    release: 0.01,
  },

  pad: {
    mode: 'standard',
    attack: 0.3,
    decay: 0.5,
    sustain: 0.7,
    release: 0.5,
    lpEnabled: true,
    lpCutoff: 3000,
  },

  granularFreeze: {
    mode: 'granular',
    scanSpeed: 0,
    grainLength: 0.1,
    grainDensity: 30,
    spread: 0.2,
  },

  granularTexture: {
    mode: 'granular',
    scanSpeed: 0.5,
    grainLength: 0.05,
    grainDensity: 50,
    spread: 0.5,
    grainPan: 0.7,
  },

  granularStutter: {
    mode: 'granular',
    scanSpeed: 2,
    grainLength: 0.02,
    grainDensity: 80,
    spread: 0.1,
  },

  reverse: {
    mode: 'standard',
    direction: 'reverse',
    attack: 0.05,
    release: 0.3,
  },

  filtered: {
    mode: 'standard',
    lpEnabled: true,
    lpCutoff: 800,
    lpResonance: 8,
    hpEnabled: true,
    hpCutoff: 200,
  },
};

export class SampleVoice {
  private ctx: AudioContext;
  private output: GainNode;
  private params: SampleVoiceParams;

  // Sample buffer
  private sampleBuffer: AudioBuffer | null = null;
  private reversedBuffer: AudioBuffer | null = null;

  // Granular worklet
  private granularWorklet: AudioWorkletNode | null = null;
  private granularWorkletReady = false;

  // Sample info for UI
  private sampleName: string = '';
  private sampleDuration: number = 0;

  constructor(ctx: AudioContext, destination?: AudioNode) {
    this.ctx = ctx;
    this.params = { ...DEFAULT_PARAMS };

    this.output = ctx.createGain();
    this.output.gain.value = this.params.gain;

    if (destination) {
      this.output.connect(destination);
    } else {
      this.output.connect(ctx.destination);
    }
  }

  /**
   * Initialize the granular worklet
   */
  async initGranularWorklet(): Promise<void> {
    if (this.granularWorkletReady) return;

    try {
      const base = import.meta.env.BASE_URL || '/';
      await this.ctx.audioWorklet.addModule(`${base}worklets/sample-processor.js`);
      this.granularWorklet = new AudioWorkletNode(this.ctx, 'sample-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2], // Stereo output
      });
      this.granularWorklet.connect(this.output);
      this.granularWorkletReady = true;

      // Send current sample to worklet if we have one
      if (this.sampleBuffer) {
        this.sendSampleToWorklet();
      }
    } catch (error) {
      console.error('Failed to initialize granular worklet:', error);
    }
  }

  /**
   * Send sample data to the granular worklet
   */
  private sendSampleToWorklet(): void {
    if (!this.granularWorklet || !this.sampleBuffer) return;

    // Get channel data (use mono or first channel)
    const channelData = this.sampleBuffer.getChannelData(0);

    // Send sample data to worklet
    this.granularWorklet.port.postMessage({
      type: 'loadSample',
      sampleData: channelData,
      sampleRate: this.sampleBuffer.sampleRate,
    });
  }

  /**
   * Load a sample from an AudioBuffer
   */
  loadSample(buffer: AudioBuffer, name: string = 'sample'): void {
    this.sampleBuffer = buffer;
    this.sampleName = name;
    this.sampleDuration = buffer.duration;

    // Create reversed buffer
    this.createReversedBuffer();

    // Send to worklet if in granular mode
    if (this.granularWorkletReady) {
      this.sendSampleToWorklet();
    }
  }

  /**
   * Load sample from URL
   */
  async loadSampleFromUrl(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

      // Extract filename from URL
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
   * Load sample from File object (for drag & drop or file input)
   */
  async loadSampleFromFile(file: File): Promise<void> {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Convert to data URL FIRST before decodeAudioData potentially detaches the buffer
    const dataUrl = this.arrayBufferToDataUrl(arrayBuffer, file.type || 'audio/wav');
    this.params.sampleUrl = dataUrl;

    // Now decode for audio playback (may detach/consume the buffer)
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.loadSample(audioBuffer, file.name);
  }

  /**
   * Convert an ArrayBuffer to a data URL
   */
  private arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
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
   * Trigger the sample voice at a specific time
   */
  trigger(time: number, velocity: number = 1, paramLocks?: Partial<SampleVoiceParams>): void {
    if (!this.sampleBuffer) {
      // No sample loaded - emit a short click as placeholder
      this.triggerClick(time, velocity);
      return;
    }

    const p = paramLocks ? { ...this.params, ...paramLocks } : this.params;

    if (p.mode === 'standard') {
      this.triggerStandard(time, velocity, p);
    } else {
      this.triggerGranular(time, velocity, p);
    }
  }

  /**
   * Trigger in standard mode
   */
  private triggerStandard(time: number, velocity: number, p: SampleVoiceParams): void {
    const buffer = p.direction === 'reverse' ? this.reversedBuffer : this.sampleBuffer;
    if (!buffer) return;

    // Create source
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Apply pitch (semitones to playback rate)
    const playbackRate = Math.pow(2, p.pitch / 12);
    console.log('[SampleVoice] Trigger - pitch:', p.pitch, 'playbackRate:', playbackRate, 'buffer sampleRate:', buffer.sampleRate, 'ctx sampleRate:', this.ctx.sampleRate);
    source.playbackRate.setValueAtTime(playbackRate, time);

    // Calculate start offset
    const startOffset = p.startPoint * buffer.duration;

    // Create filter chain
    let currentNode: AudioNode = source;

    // Highpass filter
    if (p.hpEnabled && p.hpCutoff > 20) {
      const hpFilter = this.ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.setValueAtTime(p.hpCutoff, time);
      hpFilter.Q.setValueAtTime(p.hpResonance, time);
      currentNode.connect(hpFilter);
      currentNode = hpFilter;
    }

    // Lowpass filter
    if (p.lpEnabled && p.lpCutoff < 20000) {
      const lpFilter = this.ctx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      lpFilter.frequency.setValueAtTime(p.lpCutoff, time);
      lpFilter.Q.setValueAtTime(p.lpResonance, time);
      currentNode.connect(lpFilter);
      currentNode = lpFilter;
    }

    // Envelope gain
    const envGain = this.ctx.createGain();
    currentNode.connect(envGain);

    // Apply ADSR envelope
    const peakLevel = velocity;
    const sustainLevel = velocity * p.sustain;

    envGain.gain.setValueAtTime(0, time);
    envGain.gain.linearRampToValueAtTime(peakLevel, time + p.attack);
    envGain.gain.linearRampToValueAtTime(sustainLevel, time + p.attack + p.decay);

    // Calculate total duration based on sample length and playback rate
    const remainingDuration = (buffer.duration - startOffset) / playbackRate;
    const envelopeDuration = p.attack + p.decay + remainingDuration;

    // Release at end
    envGain.gain.setValueAtTime(sustainLevel, time + envelopeDuration - p.release);
    envGain.gain.linearRampToValueAtTime(0, time + envelopeDuration);

    // Connect to output
    envGain.connect(this.output);

    // Start playback
    source.start(time, startOffset);
    source.stop(time + envelopeDuration + 0.1);
  }

  /**
   * Trigger in granular mode
   */
  private triggerGranular(time: number, velocity: number, p: SampleVoiceParams): void {
    if (!this.granularWorklet) {
      // Worklet not ready, initialize and retry
      this.initGranularWorklet().then(() => {
        if (this.granularWorklet) {
          this.triggerGranular(time, velocity, p);
        }
      });
      return;
    }

    // Send trigger and parameters to worklet
    this.granularWorklet.port.postMessage({
      type: 'trigger',
      time,
      velocity,
      params: {
        startPoint: p.startPoint,
        scanSpeed: p.scanSpeed,
        grainLength: p.grainLength,
        grainDensity: p.grainDensity,
        spread: p.spread,
        grainPan: p.grainPan,
      },
    });
  }

  /**
   * Release granular voice (stop grain generation)
   */
  releaseGrains(): void {
    if (this.granularWorklet) {
      this.granularWorklet.port.postMessage({ type: 'release' });
    }
  }

  /**
   * Trigger a click sound when no sample is loaded
   */
  private triggerClick(time: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, time);
    osc.frequency.exponentialRampToValueAtTime(200, time + 0.02);

    gain.gain.setValueAtTime(velocity * 0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.connect(gain);
    gain.connect(this.output);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  // === Getters/Setters ===

  get mode(): SampleMode { return this.params.mode; }
  set mode(value: SampleMode) {
    const previousMode = this.params.mode;
    this.params.mode = value;

    if (value === 'granular' && !this.granularWorkletReady) {
      this.initGranularWorklet();
    } else if (value === 'standard' && previousMode === 'granular') {
      // Stop granular playback when switching back to standard
      this.releaseGrains();
    }
  }

  get startPoint(): number { return this.params.startPoint; }
  set startPoint(value: number) { this.params.startPoint = Math.max(0, Math.min(1, value)); }

  get pitch(): number { return this.params.pitch; }
  set pitch(value: number) { this.params.pitch = Math.max(-24, Math.min(24, value)); }

  get direction(): PlayDirection { return this.params.direction; }
  set direction(value: PlayDirection) { this.params.direction = value; }

  get attack(): number { return this.params.attack; }
  set attack(value: number) { this.params.attack = Math.max(0.001, Math.min(2, value)); }

  get decay(): number { return this.params.decay; }
  set decay(value: number) { this.params.decay = Math.max(0.001, Math.min(2, value)); }

  get sustain(): number { return this.params.sustain; }
  set sustain(value: number) { this.params.sustain = Math.max(0, Math.min(1, value)); }

  get release(): number { return this.params.release; }
  set release(value: number) { this.params.release = Math.max(0.001, Math.min(5, value)); }

  get lpEnabled(): boolean { return this.params.lpEnabled; }
  set lpEnabled(value: boolean) { this.params.lpEnabled = value; }

  get lpCutoff(): number { return this.params.lpCutoff; }
  set lpCutoff(value: number) { this.params.lpCutoff = Math.max(20, Math.min(20000, value)); }

  get lpResonance(): number { return this.params.lpResonance; }
  set lpResonance(value: number) { this.params.lpResonance = Math.max(0, Math.min(20, value)); }

  get hpEnabled(): boolean { return this.params.hpEnabled; }
  set hpEnabled(value: boolean) { this.params.hpEnabled = value; }

  get hpCutoff(): number { return this.params.hpCutoff; }
  set hpCutoff(value: number) { this.params.hpCutoff = Math.max(20, Math.min(20000, value)); }

  get hpResonance(): number { return this.params.hpResonance; }
  set hpResonance(value: number) { this.params.hpResonance = Math.max(0, Math.min(20, value)); }

  get scanSpeed(): number { return this.params.scanSpeed; }
  set scanSpeed(value: number) { this.params.scanSpeed = Math.max(0, Math.min(8, value)); }

  get grainLength(): number { return this.params.grainLength; }
  set grainLength(value: number) { this.params.grainLength = Math.max(0.001, Math.min(1, value)); }

  get grainDensity(): number { return this.params.grainDensity; }
  set grainDensity(value: number) { this.params.grainDensity = Math.max(1, Math.min(100, value)); }

  get spread(): number { return this.params.spread; }
  set spread(value: number) { this.params.spread = Math.max(0, Math.min(1, value)); }

  get grainPan(): number { return this.params.grainPan; }
  set grainPan(value: number) { this.params.grainPan = Math.max(-1, Math.min(1, value)); }

  get gain(): number { return this.params.gain; }
  set gain(value: number) {
    this.params.gain = Math.max(0, Math.min(1, value));
    this.output.gain.setValueAtTime(this.params.gain, this.ctx.currentTime);
  }

  // === Sample Info ===

  getSampleName(): string { return this.sampleName; }
  getSampleDuration(): number { return this.sampleDuration; }
  hasSample(): boolean { return this.sampleBuffer !== null; }

  /**
   * Get waveform data for visualization (downsampled)
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

  getParams(): SampleVoiceParams {
    return { ...this.params };
  }

  setParams(params: Partial<SampleVoiceParams>): void {
    const previousMode = this.params.mode;
    Object.assign(this.params, params);
    if (params.gain !== undefined) {
      this.output.gain.setValueAtTime(this.params.gain, this.ctx.currentTime);
    }
    if (params.mode === 'granular' && !this.granularWorkletReady) {
      this.initGranularWorklet();
    } else if (params.mode === 'standard' && previousMode === 'granular') {
      // Stop granular playback when switching back to standard
      this.releaseGrains();
    }
  }

  loadPreset(presetName: keyof typeof SAMPLE_PRESETS): void {
    const preset = SAMPLE_PRESETS[presetName];
    if (preset) {
      this.setParams(preset);
    }
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
    if (this.granularWorklet) {
      this.granularWorklet.disconnect();
    }
  }

  getOutput(): GainNode {
    return this.output;
  }

  dispose(): void {
    this.disconnect();
    this.sampleBuffer = null;
    this.reversedBuffer = null;
    this.granularWorklet = null;
  }
}

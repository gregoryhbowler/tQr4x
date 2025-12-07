/**
 * NoiseVoice - Noise and hi-hat synthesis
 *
 * Features:
 * - White noise source
 * - Bandpass/HP filtered noise
 * - Optional FM metallic layer (for 808-style hats)
 * - Fast AD envelope
 * - Click/impulse option
 */

import { applyOneShotEnvelope, type CurveType } from './Envelope';

export type NoiseType = 'white' | 'pink' | 'brown';
export type FilterType = 'highpass' | 'bandpass' | 'lowpass';

export interface NoiseVoiceParams {
  // Noise
  noiseType: NoiseType;
  noiseGain: number;          // 0-1

  // Filter
  filterType: FilterType;
  filterFreq: number;         // Hz
  filterQ: number;            // Resonance

  // Envelope
  attack: number;             // seconds
  decay: number;              // seconds
  curve: CurveType;

  // Metallic layer (FM)
  metallicEnabled: boolean;
  metallicFreq: number;       // Base frequency
  metallicRatio1: number;     // First modulator ratio
  metallicRatio2: number;     // Second modulator ratio
  metallicIndex: number;      // FM depth
  metallicGain: number;       // Mix level 0-1

  // Click/impulse
  clickEnabled: boolean;
  clickFreq: number;          // Click pitch
  clickDecay: number;         // Click decay time

  // Output
  gain: number;
}

const DEFAULT_PARAMS: NoiseVoiceParams = {
  noiseType: 'white',
  noiseGain: 1,

  filterType: 'highpass',
  filterFreq: 8000,
  filterQ: 1,

  attack: 0.001,
  decay: 0.08,
  curve: 'exponential',

  metallicEnabled: false,
  metallicFreq: 40,
  metallicRatio1: 1.414,
  metallicRatio2: 1.732,
  metallicIndex: 2,
  metallicGain: 0.5,

  clickEnabled: false,
  clickFreq: 1500,
  clickDecay: 0.002,

  gain: 0.8
};

export const NOISE_PRESETS: Record<string, Partial<NoiseVoiceParams>> = {
  closedHat: {
    noiseType: 'white',
    filterType: 'highpass',
    filterFreq: 8000,
    filterQ: 1.5,
    attack: 0.001,
    decay: 0.04,
    metallicEnabled: true,
    metallicFreq: 40,
    metallicRatio1: 1.414,
    metallicRatio2: 1.732,
    metallicIndex: 3,
    metallicGain: 0.6,
    clickEnabled: true,
    clickFreq: 1200,
    clickDecay: 0.003,
  },

  openHat: {
    noiseType: 'white',
    filterType: 'bandpass',
    filterFreq: 10000,
    filterQ: 0.8,
    attack: 0.001,
    decay: 0.35,
    metallicEnabled: true,
    metallicFreq: 40,
    metallicRatio1: 1.414,
    metallicRatio2: 1.732,
    metallicIndex: 2,
    metallicGain: 0.5,
    clickEnabled: true,
    clickFreq: 1000,
    clickDecay: 0.005,
  },

  ride: {
    noiseType: 'white',
    filterType: 'bandpass',
    filterFreq: 6000,
    filterQ: 1.2,
    attack: 0.001,
    decay: 1.2,
    metallicEnabled: true,
    metallicFreq: 300,
    metallicRatio1: 1.5,
    metallicRatio2: 2.333,
    metallicIndex: 2.5,
    metallicGain: 0.7,
  },

  crash: {
    noiseType: 'white',
    filterType: 'bandpass',
    filterFreq: 5000,
    filterQ: 0.5,
    attack: 0.001,
    decay: 2,
    metallicEnabled: true,
    metallicFreq: 200,
    metallicRatio1: 1.618,
    metallicRatio2: 2.414,
    metallicIndex: 3,
    metallicGain: 0.6,
  },

  shaker: {
    noiseType: 'white',
    filterType: 'bandpass',
    filterFreq: 5000,
    filterQ: 2,
    attack: 0.001,
    decay: 0.05,
    metallicEnabled: false,
  },

  snap: {
    noiseType: 'white',
    filterType: 'bandpass',
    filterFreq: 2500,
    filterQ: 3,
    attack: 0.001,
    decay: 0.03,
    clickEnabled: true,
    clickFreq: 2000,
    clickDecay: 0.01,
  },

  rim: {
    noiseType: 'white',
    filterType: 'highpass',
    filterFreq: 3000,
    filterQ: 4,
    attack: 0.0005,
    decay: 0.02,
    clickEnabled: true,
    clickFreq: 800,
    clickDecay: 0.008,
    noiseGain: 0.4,
    metallicEnabled: true,
    metallicFreq: 500,
    metallicRatio1: 1.2,
    metallicRatio2: 1.8,
    metallicIndex: 4,
    metallicGain: 0.8,
  },

  hiss: {
    noiseType: 'white',
    filterType: 'highpass',
    filterFreq: 12000,
    filterQ: 0.5,
    attack: 0.3,
    decay: 0.5,
    curve: 'linear',
  },

  static: {
    noiseType: 'white',
    filterType: 'bandpass',
    filterFreq: 3000,
    filterQ: 0.3,
    attack: 0.001,
    decay: 0.1,
    metallicEnabled: true,
    metallicFreq: 50,
    metallicRatio1: 7.1,
    metallicRatio2: 11.3,
    metallicIndex: 5,
    metallicGain: 0.3,
  }
};

export class NoiseVoice {
  private ctx: AudioContext;
  private output: GainNode;
  private params: NoiseVoiceParams;

  // Pre-computed noise buffers
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;
  private brownNoiseBuffer: AudioBuffer | null = null;

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

    // Pre-generate noise buffers
    this.generateNoiseBuffers();
  }

  private generateNoiseBuffers(): void {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 2; // 2 seconds of noise

    // White noise
    this.whiteNoiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const whiteData = this.whiteNoiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      whiteData[i] = Math.random() * 2 - 1;
    }

    // Pink noise (approximation using Paul Kellet's method)
    this.pinkNoiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const pinkData = this.pinkNoiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    // Brown noise (integrated white noise)
    this.brownNoiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const brownData = this.brownNoiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      brownData[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = brownData[i];
      brownData[i] *= 3.5; // Compensate for gain loss
    }
  }

  private getNoiseBuffer(): AudioBuffer | null {
    switch (this.params.noiseType) {
      case 'white': return this.whiteNoiseBuffer;
      case 'pink': return this.pinkNoiseBuffer;
      case 'brown': return this.brownNoiseBuffer;
    }
  }

  /**
   * Trigger the noise voice at a specific time
   */
  trigger(time: number, velocity: number = 1, paramLocks?: Partial<NoiseVoiceParams>): void {
    const p = paramLocks ? { ...this.params, ...paramLocks } : this.params;

    // Master envelope for this trigger
    const masterEnv = this.ctx.createGain();

    // Noise layer
    if (p.noiseGain > 0) {
      const noiseBuffer = this.getNoiseBuffer();
      if (noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = p.filterType;
        filter.frequency.setValueAtTime(p.filterFreq, time);
        filter.Q.value = p.filterQ;

        const noiseEnv = this.ctx.createGain();

        noise.connect(filter);
        filter.connect(noiseEnv);

        applyOneShotEnvelope(
          noiseEnv.gain,
          p.attack,
          p.decay,
          time,
          velocity * p.noiseGain,
          1,
          p.curve
        );

        noiseEnv.connect(masterEnv);

        noise.start(time);
        noise.stop(time + p.attack + p.decay + 0.1);
      }
    }

    // Metallic layer (6-operator FM for bell-like partials)
    if (p.metallicEnabled && p.metallicGain > 0) {
      // Create three oscillators for inharmonic metallic sound
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const osc3 = this.ctx.createOscillator();

      osc1.type = 'square';  // Square for more harmonics
      osc2.type = 'square';
      osc3.type = 'square';

      const freq1 = p.metallicFreq;
      const freq2 = p.metallicFreq * p.metallicRatio1;
      const freq3 = p.metallicFreq * p.metallicRatio2;

      osc1.frequency.setValueAtTime(freq1, time);
      osc2.frequency.setValueAtTime(freq2, time);
      osc3.frequency.setValueAtTime(freq3, time);

      // FM modulation
      const modGain1 = this.ctx.createGain();
      const modGain2 = this.ctx.createGain();
      modGain1.gain.setValueAtTime(p.metallicIndex * freq2, time);
      modGain2.gain.setValueAtTime(p.metallicIndex * freq3, time);

      osc2.connect(modGain1);
      modGain1.connect(osc1.frequency);

      osc3.connect(modGain2);
      modGain2.connect(osc2.frequency);

      // Envelope
      const metallicEnv = this.ctx.createGain();

      applyOneShotEnvelope(
        metallicEnv.gain,
        p.attack,
        p.decay,
        time,
        velocity * p.metallicGain * 0.3, // Lower volume for metallic layer
        1,
        p.curve
      );

      // Highpass to remove low frequencies
      const metallicFilter = this.ctx.createBiquadFilter();
      metallicFilter.type = 'highpass';
      metallicFilter.frequency.setValueAtTime(p.filterFreq * 0.5, time);

      osc1.connect(metallicFilter);
      metallicFilter.connect(metallicEnv);
      metallicEnv.connect(masterEnv);

      const duration = p.attack + p.decay + 0.1;
      osc1.start(time);
      osc2.start(time);
      osc3.start(time);
      osc1.stop(time + duration);
      osc2.stop(time + duration);
      osc3.stop(time + duration);
    }

    // Click layer
    if (p.clickEnabled) {
      const click = this.ctx.createOscillator();
      click.type = 'sine';
      click.frequency.setValueAtTime(p.clickFreq, time);

      const clickEnv = this.ctx.createGain();

      applyOneShotEnvelope(
        clickEnv.gain,
        0.0001,
        p.clickDecay,
        time,
        velocity * 0.5,
        1,
        'exponential'
      );

      click.connect(clickEnv);
      clickEnv.connect(masterEnv);

      click.start(time);
      click.stop(time + p.clickDecay + 0.01);
    }

    // Connect master envelope to output
    masterEnv.gain.setValueAtTime(1, time);
    masterEnv.connect(this.output);
  }

  // Parameter getters/setters
  get noiseType(): NoiseType { return this.params.noiseType; }
  set noiseType(value: NoiseType) { this.params.noiseType = value; }

  get noiseGain(): number { return this.params.noiseGain; }
  set noiseGain(value: number) { this.params.noiseGain = Math.max(0, Math.min(1, value)); }

  get filterType(): FilterType { return this.params.filterType; }
  set filterType(value: FilterType) { this.params.filterType = value; }

  get filterFreq(): number { return this.params.filterFreq; }
  set filterFreq(value: number) { this.params.filterFreq = Math.max(20, Math.min(20000, value)); }

  get filterQ(): number { return this.params.filterQ; }
  set filterQ(value: number) { this.params.filterQ = Math.max(0.1, Math.min(20, value)); }

  get attack(): number { return this.params.attack; }
  set attack(value: number) { this.params.attack = Math.max(0.0001, Math.min(0.5, value)); }

  get decay(): number { return this.params.decay; }
  set decay(value: number) { this.params.decay = Math.max(0.001, Math.min(5, value)); }

  get curve(): CurveType { return this.params.curve; }
  set curve(value: CurveType) { this.params.curve = value; }

  get metallicEnabled(): boolean { return this.params.metallicEnabled; }
  set metallicEnabled(value: boolean) { this.params.metallicEnabled = value; }

  get metallicFreq(): number { return this.params.metallicFreq; }
  set metallicFreq(value: number) { this.params.metallicFreq = Math.max(20, Math.min(500, value)); }

  get metallicRatio1(): number { return this.params.metallicRatio1; }
  set metallicRatio1(value: number) { this.params.metallicRatio1 = Math.max(0.5, Math.min(5, value)); }

  get metallicRatio2(): number { return this.params.metallicRatio2; }
  set metallicRatio2(value: number) { this.params.metallicRatio2 = Math.max(0.5, Math.min(5, value)); }

  get metallicIndex(): number { return this.params.metallicIndex; }
  set metallicIndex(value: number) { this.params.metallicIndex = Math.max(0, Math.min(10, value)); }

  get metallicGain(): number { return this.params.metallicGain; }
  set metallicGain(value: number) { this.params.metallicGain = Math.max(0, Math.min(1, value)); }

  get clickEnabled(): boolean { return this.params.clickEnabled; }
  set clickEnabled(value: boolean) { this.params.clickEnabled = value; }

  get clickFreq(): number { return this.params.clickFreq; }
  set clickFreq(value: number) { this.params.clickFreq = Math.max(100, Math.min(5000, value)); }

  get clickDecay(): number { return this.params.clickDecay; }
  set clickDecay(value: number) { this.params.clickDecay = Math.max(0.001, Math.min(0.1, value)); }

  get gain(): number { return this.params.gain; }
  set gain(value: number) {
    this.params.gain = Math.max(0, Math.min(1, value));
    this.output.gain.setValueAtTime(this.params.gain, this.ctx.currentTime);
  }

  getParams(): NoiseVoiceParams {
    return { ...this.params };
  }

  setParams(params: Partial<NoiseVoiceParams>): void {
    Object.assign(this.params, params);
    if (params.gain !== undefined) {
      this.output.gain.setValueAtTime(this.params.gain, this.ctx.currentTime);
    }
  }

  loadPreset(presetName: keyof typeof NOISE_PRESETS): void {
    const preset = NOISE_PRESETS[presetName];
    if (preset) {
      this.setParams(preset);
    }
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  getOutput(): GainNode {
    return this.output;
  }
}

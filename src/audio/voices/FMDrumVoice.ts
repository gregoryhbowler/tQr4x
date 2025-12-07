/**
 * FMDrumVoice - 3-operator FM drum synthesis
 *
 * Architecture:
 * - Carrier oscillator (main tone)
 * - Modulator 1 (primary FM)
 * - Modulator 2 (secondary FM for complexity)
 * - Pitch envelope for transient punch
 * - Noise mixer for snare/texture
 */

import { applyOneShotEnvelope, applyPitchEnvelope, type CurveType } from './Envelope';

export interface FMDrumParams {
  // Pitch
  pitch: number;              // Base frequency in Hz
  pitchEnvAmount: number;     // Pitch envelope amount (multiplier, e.g., 4 = 4x start pitch)
  pitchEnvDecay: number;      // Pitch envelope decay time in seconds

  // Operator 1 (Modulator 1)
  op1Ratio: number;           // Frequency ratio to carrier
  op1Index: number;           // FM index (modulation depth)
  op1Feedback: number;        // Self-feedback amount (0-1)

  // Operator 2 (Modulator 2)
  op2Ratio: number;           // Frequency ratio to carrier
  op2Index: number;           // FM index
  op2ToOp1: number;           // Op2 modulates Op1 amount (0-1)

  // Amplitude envelope
  ampAttack: number;          // Attack time in seconds
  ampDecay: number;           // Decay time in seconds
  ampCurve: CurveType;        // Envelope curve type

  // Noise mix
  noiseMix: number;           // 0-1, amount of noise in output
  noiseDecay: number;         // Noise envelope decay
  noiseFilterFreq: number;    // Highpass filter frequency for noise

  // Output
  gain: number;               // Output gain 0-1
}

const DEFAULT_PARAMS: FMDrumParams = {
  pitch: 55,
  pitchEnvAmount: 4,
  pitchEnvDecay: 0.05,

  op1Ratio: 1.5,
  op1Index: 3,
  op1Feedback: 0,

  op2Ratio: 3,
  op2Index: 1,
  op2ToOp1: 0.5,

  ampAttack: 0.001,
  ampDecay: 0.3,
  ampCurve: 'exponential',

  noiseMix: 0,
  noiseDecay: 0.1,
  noiseFilterFreq: 2000,

  gain: 0.8
};

// Preset drums
export const FM_DRUM_PRESETS: Record<string, Partial<FMDrumParams>> = {
  kick: {
    pitch: 55,
    pitchEnvAmount: 6,
    pitchEnvDecay: 0.04,
    op1Ratio: 1,
    op1Index: 2,
    op1Feedback: 0.1,
    op2Ratio: 2,
    op2Index: 0.5,
    op2ToOp1: 0,
    ampAttack: 0.001,
    ampDecay: 0.4,
    noiseMix: 0.02,
    noiseDecay: 0.02,
  },

  snare: {
    pitch: 180,
    pitchEnvAmount: 2,
    pitchEnvDecay: 0.03,
    op1Ratio: 1.47,
    op1Index: 4,
    op1Feedback: 0.2,
    op2Ratio: 2.9,
    op2Index: 2,
    op2ToOp1: 0.4,
    ampAttack: 0.001,
    ampDecay: 0.15,
    noiseMix: 0.6,
    noiseDecay: 0.12,
    noiseFilterFreq: 3000,
  },

  tom: {
    pitch: 100,
    pitchEnvAmount: 3,
    pitchEnvDecay: 0.06,
    op1Ratio: 1.2,
    op1Index: 2.5,
    op1Feedback: 0.05,
    op2Ratio: 2.5,
    op2Index: 1,
    op2ToOp1: 0.3,
    ampAttack: 0.001,
    ampDecay: 0.25,
    noiseMix: 0.05,
    noiseDecay: 0.03,
  },

  clap: {
    pitch: 400,
    pitchEnvAmount: 1.5,
    pitchEnvDecay: 0.01,
    op1Ratio: 2.3,
    op1Index: 5,
    op1Feedback: 0.3,
    op2Ratio: 4.7,
    op2Index: 3,
    op2ToOp1: 0.6,
    ampAttack: 0.005,
    ampDecay: 0.12,
    noiseMix: 0.7,
    noiseDecay: 0.1,
    noiseFilterFreq: 1500,
  },

  perc: {
    pitch: 300,
    pitchEnvAmount: 2,
    pitchEnvDecay: 0.02,
    op1Ratio: 2.5,
    op1Index: 6,
    op1Feedback: 0.15,
    op2Ratio: 5.2,
    op2Index: 2,
    op2ToOp1: 0.5,
    ampAttack: 0.001,
    ampDecay: 0.08,
    noiseMix: 0.1,
    noiseDecay: 0.04,
  },

  zap: {
    pitch: 800,
    pitchEnvAmount: 8,
    pitchEnvDecay: 0.08,
    op1Ratio: 1,
    op1Index: 8,
    op1Feedback: 0.4,
    op2Ratio: 2,
    op2Index: 4,
    op2ToOp1: 0.8,
    ampAttack: 0.001,
    ampDecay: 0.1,
    noiseMix: 0,
    noiseDecay: 0.01,
  }
};

export class FMDrumVoice {
  private ctx: AudioContext;
  private output: GainNode;
  private params: FMDrumParams;

  constructor(ctx: AudioContext, destination?: AudioNode) {
    this.ctx = ctx;
    this.params = { ...DEFAULT_PARAMS };

    // Create output gain
    this.output = ctx.createGain();
    this.output.gain.value = this.params.gain;

    if (destination) {
      this.output.connect(destination);
    } else {
      this.output.connect(ctx.destination);
    }
  }

  /**
   * Trigger the drum at a specific time
   */
  trigger(time: number, velocity: number = 1, paramLocks?: Partial<FMDrumParams>): void {
    // Merge param locks with current params
    const p = paramLocks ? { ...this.params, ...paramLocks } : this.params;

    // Calculate frequencies
    const carrierFreq = p.pitch;
    const startPitch = carrierFreq * p.pitchEnvAmount;
    const op1Freq = carrierFreq * p.op1Ratio;
    const op2Freq = carrierFreq * p.op2Ratio;

    // Create oscillators
    const carrier = this.ctx.createOscillator();
    const op1 = this.ctx.createOscillator();
    const op2 = this.ctx.createOscillator();

    carrier.type = 'sine';
    op1.type = 'sine';
    op2.type = 'sine';

    // Create gains for modulation depths
    const op1Gain = this.ctx.createGain();
    const op2Gain = this.ctx.createGain();
    const op2ToOp1Gain = this.ctx.createGain();
    const feedbackGain = this.ctx.createGain();
    const ampEnv = this.ctx.createGain();

    // Set initial frequencies
    carrier.frequency.setValueAtTime(startPitch, time);
    op1.frequency.setValueAtTime(op1Freq * p.pitchEnvAmount, time);
    op2.frequency.setValueAtTime(op2Freq * p.pitchEnvAmount, time);

    // Apply pitch envelope to all oscillators
    applyPitchEnvelope(carrier.frequency, startPitch, carrierFreq, p.pitchEnvDecay, time);
    applyPitchEnvelope(op1.frequency, op1Freq * p.pitchEnvAmount, op1Freq, p.pitchEnvDecay, time);
    applyPitchEnvelope(op2.frequency, op2Freq * p.pitchEnvAmount, op2Freq, p.pitchEnvDecay, time);

    // FM routing
    // Op2 -> Op1 modulation
    op2Gain.gain.setValueAtTime(p.op2Index * op2Freq, time);
    op2ToOp1Gain.gain.setValueAtTime(p.op2ToOp1, time);

    // Op1 modulation depth (FM index)
    op1Gain.gain.setValueAtTime(p.op1Index * op1Freq, time);

    // Feedback for Op1 (creates grit/harmonics)
    feedbackGain.gain.setValueAtTime(p.op1Feedback * 500, time);

    // Connect FM chain
    // Op2 -> Op2Gain -> Op2ToOp1Gain -> Op1.frequency
    op2.connect(op2Gain);
    op2Gain.connect(op2ToOp1Gain);
    op2ToOp1Gain.connect(op1.frequency);

    // Op1 feedback (simplified - in reality needs delay node for true feedback)
    op1.connect(feedbackGain);
    feedbackGain.connect(op1.frequency);

    // Op1 -> Op1Gain -> Carrier.frequency
    op1.connect(op1Gain);
    op1Gain.connect(carrier.frequency);

    // Op2 also directly modulates carrier for more complexity
    op2.connect(op2Gain);
    const op2ToCarrierGain = this.ctx.createGain();
    op2ToCarrierGain.gain.setValueAtTime(p.op2Index * 0.3 * op2Freq, time);
    op2.connect(op2ToCarrierGain);
    op2ToCarrierGain.connect(carrier.frequency);

    // Carrier -> Amp Envelope -> Output
    carrier.connect(ampEnv);

    // Apply amplitude envelope
    applyOneShotEnvelope(
      ampEnv.gain,
      p.ampAttack,
      p.ampDecay,
      time,
      velocity,
      1,
      p.ampCurve
    );

    // Noise layer
    if (p.noiseMix > 0) {
      const noiseBuffer = this.createNoiseBuffer();
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.setValueAtTime(p.noiseFilterFreq, time);

      const noiseEnv = this.ctx.createGain();
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseEnv);

      // Apply noise envelope
      applyOneShotEnvelope(
        noiseEnv.gain,
        0.001,
        p.noiseDecay,
        time,
        velocity * p.noiseMix,
        1,
        'exponential'
      );

      noiseEnv.connect(ampEnv);

      noise.start(time);
      noise.stop(time + p.noiseDecay + 0.1);
    }

    // Connect to output
    ampEnv.connect(this.output);

    // Start and stop oscillators
    const duration = p.ampDecay + 0.1;
    carrier.start(time);
    op1.start(time);
    op2.start(time);

    carrier.stop(time + duration);
    op1.stop(time + duration);
    op2.stop(time + duration);
  }

  private createNoiseBuffer(): AudioBuffer {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 0.5; // 500ms of noise
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  // Parameter getters/setters
  get pitch(): number { return this.params.pitch; }
  set pitch(value: number) { this.params.pitch = Math.max(20, Math.min(2000, value)); }

  get pitchEnvAmount(): number { return this.params.pitchEnvAmount; }
  set pitchEnvAmount(value: number) { this.params.pitchEnvAmount = Math.max(1, Math.min(16, value)); }

  get pitchEnvDecay(): number { return this.params.pitchEnvDecay; }
  set pitchEnvDecay(value: number) { this.params.pitchEnvDecay = Math.max(0.001, Math.min(1, value)); }

  get op1Ratio(): number { return this.params.op1Ratio; }
  set op1Ratio(value: number) { this.params.op1Ratio = Math.max(0.1, Math.min(16, value)); }

  get op1Index(): number { return this.params.op1Index; }
  set op1Index(value: number) { this.params.op1Index = Math.max(0, Math.min(20, value)); }

  get op1Feedback(): number { return this.params.op1Feedback; }
  set op1Feedback(value: number) { this.params.op1Feedback = Math.max(0, Math.min(1, value)); }

  get op2Ratio(): number { return this.params.op2Ratio; }
  set op2Ratio(value: number) { this.params.op2Ratio = Math.max(0.1, Math.min(16, value)); }

  get op2Index(): number { return this.params.op2Index; }
  set op2Index(value: number) { this.params.op2Index = Math.max(0, Math.min(20, value)); }

  get op2ToOp1(): number { return this.params.op2ToOp1; }
  set op2ToOp1(value: number) { this.params.op2ToOp1 = Math.max(0, Math.min(1, value)); }

  get ampAttack(): number { return this.params.ampAttack; }
  set ampAttack(value: number) { this.params.ampAttack = Math.max(0.001, Math.min(0.5, value)); }

  get ampDecay(): number { return this.params.ampDecay; }
  set ampDecay(value: number) { this.params.ampDecay = Math.max(0.01, Math.min(5, value)); }

  get ampCurve(): CurveType { return this.params.ampCurve; }
  set ampCurve(value: CurveType) { this.params.ampCurve = value; }

  get noiseMix(): number { return this.params.noiseMix; }
  set noiseMix(value: number) { this.params.noiseMix = Math.max(0, Math.min(1, value)); }

  get noiseDecay(): number { return this.params.noiseDecay; }
  set noiseDecay(value: number) { this.params.noiseDecay = Math.max(0.01, Math.min(2, value)); }

  get noiseFilterFreq(): number { return this.params.noiseFilterFreq; }
  set noiseFilterFreq(value: number) { this.params.noiseFilterFreq = Math.max(100, Math.min(10000, value)); }

  get gain(): number { return this.params.gain; }
  set gain(value: number) {
    this.params.gain = Math.max(0, Math.min(1, value));
    this.output.gain.setValueAtTime(this.params.gain, this.ctx.currentTime);
  }

  /**
   * Get all current parameters
   */
  getParams(): FMDrumParams {
    return { ...this.params };
  }

  /**
   * Set multiple parameters at once
   */
  setParams(params: Partial<FMDrumParams>): void {
    Object.assign(this.params, params);
    if (params.gain !== undefined) {
      this.output.gain.setValueAtTime(this.params.gain, this.ctx.currentTime);
    }
  }

  /**
   * Load a preset
   */
  loadPreset(presetName: keyof typeof FM_DRUM_PRESETS): void {
    const preset = FM_DRUM_PRESETS[presetName];
    if (preset) {
      this.setParams(preset);
    }
  }

  /**
   * Connect output to a destination
   */
  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  /**
   * Disconnect output
   */
  disconnect(): void {
    this.output.disconnect();
  }

  /**
   * Get the output node for routing
   */
  getOutput(): GainNode {
    return this.output;
  }
}

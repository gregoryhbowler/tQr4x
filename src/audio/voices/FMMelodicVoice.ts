/**
 * FMMelodicVoice - Polyphonic FM melodic synthesizer
 *
 * Architecture:
 * - 2-3 operator FM design
 * - MIDI note input with glide/portamento
 * - ADSR amplitude envelope
 * - Optional filter with envelope
 * - 4-6 voice polyphony with voice stealing
 */

import { type CurveType } from './Envelope';

export interface FMMelodicParams {
  // Oscillators
  op1Ratio: number;           // Carrier ratio (usually 1)
  op2Ratio: number;           // Modulator ratio
  op3Ratio: number;           // Second modulator ratio
  op2Index: number;           // FM index for op2
  op3Index: number;           // FM index for op3
  op2Feedback: number;        // Self-feedback on op2
  op3ToOp2: number;           // Op3 modulates op2 amount

  // Amplitude envelope
  ampAttack: number;
  ampDecay: number;
  ampSustain: number;
  ampRelease: number;
  ampCurve: CurveType;

  // FM Index envelope
  indexEnvAmount: number;     // How much envelope affects FM index
  indexEnvDecay: number;      // Index envelope decay time

  // Filter (optional lowpass)
  filterEnabled: boolean;
  filterFreq: number;         // Base cutoff frequency
  filterQ: number;            // Resonance
  filterEnvAmount: number;    // Envelope to filter
  filterEnvDecay: number;     // Filter envelope decay

  // Performance
  glideTime: number;          // Portamento time in seconds
  glideEnabled: boolean;

  // Output
  gain: number;
}

interface PolyVoice {
  carrier: OscillatorNode;
  op2: OscillatorNode;
  op3: OscillatorNode;
  op2Gain: GainNode;
  op3Gain: GainNode;
  op3ToOp2Gain: GainNode;
  feedbackGain: GainNode;
  ampEnv: GainNode;
  filter?: BiquadFilterNode;
  note: number;
  startTime: number;
  released: boolean;
  releaseTime: number;
}

const DEFAULT_PARAMS: FMMelodicParams = {
  op1Ratio: 1,
  op2Ratio: 2,
  op3Ratio: 3,
  op2Index: 2,
  op3Index: 1,
  op2Feedback: 0,
  op3ToOp2: 0.3,

  ampAttack: 0.01,
  ampDecay: 0.2,
  ampSustain: 0.6,
  ampRelease: 0.3,
  ampCurve: 'exponential',

  indexEnvAmount: 0.5,
  indexEnvDecay: 0.3,

  filterEnabled: false,
  filterFreq: 2000,
  filterQ: 1,
  filterEnvAmount: 0,
  filterEnvDecay: 0.3,

  glideTime: 0.05,
  glideEnabled: false,

  gain: 0.7
};

export const FM_MELODIC_PRESETS: Record<string, Partial<FMMelodicParams>> = {
  bass: {
    op1Ratio: 1,
    op2Ratio: 1,
    op3Ratio: 2,
    op2Index: 3,
    op3Index: 1,
    op2Feedback: 0.1,
    ampAttack: 0.005,
    ampDecay: 0.1,
    ampSustain: 0.8,
    ampRelease: 0.1,
    filterEnabled: true,
    filterFreq: 800,
    filterQ: 2,
    filterEnvAmount: 2000,
    filterEnvDecay: 0.2,
  },

  // Acid bass presets - 303-inspired sounds
  acidSquelch: {
    op1Ratio: 1,
    op2Ratio: 1,
    op3Ratio: 2,
    op2Index: 2,
    op3Index: 0.5,
    op2Feedback: 0.15,
    ampAttack: 0.002,
    ampDecay: 0.15,
    ampSustain: 0.4,
    ampRelease: 0.08,
    filterEnabled: true,
    filterFreq: 300,
    filterQ: 12,          // High resonance for squelch
    filterEnvAmount: 4000,
    filterEnvDecay: 0.12,
    glideEnabled: true,
    glideTime: 0.04,
  },

  acidHard: {
    op1Ratio: 1,
    op2Ratio: 1,
    op3Ratio: 3,
    op2Index: 4,
    op3Index: 1,
    op2Feedback: 0.2,
    ampAttack: 0.001,
    ampDecay: 0.1,
    ampSustain: 0.5,
    ampRelease: 0.05,
    filterEnabled: true,
    filterFreq: 200,
    filterQ: 15,          // Very high resonance
    filterEnvAmount: 5000,
    filterEnvDecay: 0.08,
    glideEnabled: true,
    glideTime: 0.03,
  },

  acidSoft: {
    op1Ratio: 1,
    op2Ratio: 1,
    op3Ratio: 2,
    op2Index: 1.5,
    op3Index: 0.3,
    op2Feedback: 0.05,
    ampAttack: 0.01,
    ampDecay: 0.2,
    ampSustain: 0.6,
    ampRelease: 0.15,
    filterEnabled: true,
    filterFreq: 400,
    filterQ: 8,
    filterEnvAmount: 2500,
    filterEnvDecay: 0.18,
    glideEnabled: true,
    glideTime: 0.06,
  },

  acidBubble: {
    op1Ratio: 1,
    op2Ratio: 2,
    op3Ratio: 3,
    op2Index: 3,
    op3Index: 1.5,
    op2Feedback: 0.1,
    op3ToOp2: 0.4,
    ampAttack: 0.001,
    ampDecay: 0.08,
    ampSustain: 0.3,
    ampRelease: 0.1,
    filterEnabled: true,
    filterFreq: 250,
    filterQ: 18,          // Extreme resonance for bubbling
    filterEnvAmount: 6000,
    filterEnvDecay: 0.06,
    glideEnabled: true,
    glideTime: 0.02,
  },

  acidDeep: {
    op1Ratio: 0.5,        // Sub octave for deep bass
    op2Ratio: 1,
    op3Ratio: 2,
    op2Index: 2.5,
    op3Index: 0.8,
    op2Feedback: 0.1,
    ampAttack: 0.003,
    ampDecay: 0.25,
    ampSustain: 0.7,
    ampRelease: 0.12,
    filterEnabled: true,
    filterFreq: 180,
    filterQ: 10,
    filterEnvAmount: 3000,
    filterEnvDecay: 0.2,
    glideEnabled: true,
    glideTime: 0.05,
  },

  acidScream: {
    op1Ratio: 1,
    op2Ratio: 1.5,
    op3Ratio: 4,
    op2Index: 5,
    op3Index: 2,
    op2Feedback: 0.25,
    op3ToOp2: 0.5,
    ampAttack: 0.001,
    ampDecay: 0.05,
    ampSustain: 0.4,
    ampRelease: 0.08,
    filterEnabled: true,
    filterFreq: 400,
    filterQ: 20,          // Maximum squelch
    filterEnvAmount: 8000,
    filterEnvDecay: 0.04,
    glideEnabled: true,
    glideTime: 0.02,
  },

  pad: {
    op1Ratio: 1,
    op2Ratio: 2.01,    // Slight detune for movement
    op3Ratio: 3.99,
    op2Index: 1.5,
    op3Index: 0.8,
    ampAttack: 0.5,
    ampDecay: 0.5,
    ampSustain: 0.7,
    ampRelease: 1.0,
    indexEnvAmount: 0.2,
    indexEnvDecay: 1,
  },

  lead: {
    op1Ratio: 1,
    op2Ratio: 2,
    op3Ratio: 4,
    op2Index: 4,
    op3Index: 2,
    op2Feedback: 0.2,
    op3ToOp2: 0.5,
    ampAttack: 0.01,
    ampDecay: 0.1,
    ampSustain: 0.7,
    ampRelease: 0.2,
    glideEnabled: true,
    glideTime: 0.08,
  },

  bell: {
    op1Ratio: 1,
    op2Ratio: 1.414,   // Square root of 2 for inharmonic
    op3Ratio: 5.19,
    op2Index: 5,
    op3Index: 2,
    ampAttack: 0.001,
    ampDecay: 2,
    ampSustain: 0,
    ampRelease: 2,
    indexEnvAmount: 0.8,
    indexEnvDecay: 0.5,
  },

  pluck: {
    op1Ratio: 1,
    op2Ratio: 3,
    op3Ratio: 7,
    op2Index: 6,
    op3Index: 2,
    ampAttack: 0.001,
    ampDecay: 0.3,
    ampSustain: 0,
    ampRelease: 0.1,
    indexEnvAmount: 1,
    indexEnvDecay: 0.1,
    filterEnabled: true,
    filterFreq: 3000,
    filterEnvAmount: 4000,
    filterEnvDecay: 0.2,
  },

  brass: {
    op1Ratio: 1,
    op2Ratio: 1,
    op3Ratio: 3,
    op2Index: 2,
    op3Index: 1.5,
    op2Feedback: 0.3,
    ampAttack: 0.08,
    ampDecay: 0.1,
    ampSustain: 0.8,
    ampRelease: 0.15,
    indexEnvAmount: 0.6,
    indexEnvDecay: 0.15,
  }
};

export class FMMelodicVoice {
  private ctx: AudioContext;
  private output: GainNode;
  private params: FMMelodicParams;
  private voices: PolyVoice[] = [];
  private maxPolyphony: number = 6;
  private lastNote: number = 60;  // For glide

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
   * Convert MIDI note to frequency
   */
  private midiToFreq(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  /**
   * Find a voice to steal if at max polyphony
   */
  private findVoiceToSteal(): PolyVoice | null {
    // First try to find a released voice
    const releasedVoice = this.voices.find(v => v.released);
    if (releasedVoice) return releasedVoice;

    // Otherwise steal the oldest voice
    if (this.voices.length >= this.maxPolyphony) {
      return this.voices.reduce((oldest, v) =>
        v.startTime < oldest.startTime ? v : oldest
      );
    }

    return null;
  }

  /**
   * Clean up a voice and remove it
   */
  private cleanupVoice(voice: PolyVoice): void {
    try {
      voice.carrier.stop();
      voice.op2.stop();
      voice.op3.stop();
      voice.carrier.disconnect();
      voice.op2.disconnect();
      voice.op3.disconnect();
      voice.ampEnv.disconnect();
    } catch {
      // Ignore errors from already stopped oscillators
    }

    const index = this.voices.indexOf(voice);
    if (index > -1) {
      this.voices.splice(index, 1);
    }
  }

  /**
   * Trigger a note on
   */
  noteOn(
    note: number,
    velocity: number = 1,
    time?: number,
    paramLocks?: Partial<FMMelodicParams>
  ): void {
    const t = time ?? this.ctx.currentTime;
    const p = paramLocks ? { ...this.params, ...paramLocks } : this.params;

    // Voice stealing if needed
    const stealVoice = this.findVoiceToSteal();
    if (stealVoice) {
      this.cleanupVoice(stealVoice);
    }

    // Calculate frequencies
    const baseFreq = this.midiToFreq(note);
    const carrierFreq = baseFreq * p.op1Ratio;
    const op2Freq = baseFreq * p.op2Ratio;
    const op3Freq = baseFreq * p.op3Ratio;

    // For glide, calculate start frequency
    const startFreq = p.glideEnabled
      ? this.midiToFreq(this.lastNote) * p.op1Ratio
      : carrierFreq;

    // Create oscillators
    const carrier = this.ctx.createOscillator();
    const op2 = this.ctx.createOscillator();
    const op3 = this.ctx.createOscillator();

    carrier.type = 'sine';
    op2.type = 'sine';
    op3.type = 'sine';

    // Set frequencies
    carrier.frequency.setValueAtTime(startFreq, t);
    op2.frequency.setValueAtTime(op2Freq, t);
    op3.frequency.setValueAtTime(op3Freq, t);

    // Apply glide if enabled
    if (p.glideEnabled && startFreq !== carrierFreq) {
      carrier.frequency.linearRampToValueAtTime(carrierFreq, t + p.glideTime);
    }

    // Create gains for modulation
    const op2Gain = this.ctx.createGain();
    const op3Gain = this.ctx.createGain();
    const op3ToOp2Gain = this.ctx.createGain();
    const feedbackGain = this.ctx.createGain();
    const ampEnv = this.ctx.createGain();

    // FM index with envelope
    const baseOp2Index = p.op2Index * op2Freq;
    const indexEnvPeak = baseOp2Index * (1 + p.indexEnvAmount);

    op2Gain.gain.setValueAtTime(indexEnvPeak, t);
    op2Gain.gain.exponentialRampToValueAtTime(
      Math.max(baseOp2Index, 0.001),
      t + p.indexEnvDecay
    );

    op3Gain.gain.setValueAtTime(p.op3Index * op3Freq, t);
    op3ToOp2Gain.gain.setValueAtTime(p.op3ToOp2, t);
    feedbackGain.gain.setValueAtTime(p.op2Feedback * 500, t);

    // FM routing
    // Op3 -> Op2
    op3.connect(op3Gain);
    op3Gain.connect(op3ToOp2Gain);
    op3ToOp2Gain.connect(op2.frequency);

    // Op2 feedback
    op2.connect(feedbackGain);
    feedbackGain.connect(op2.frequency);

    // Op2 -> Carrier
    op2.connect(op2Gain);
    op2Gain.connect(carrier.frequency);

    // Optional filter
    let filter: BiquadFilterNode | undefined;
    if (p.filterEnabled) {
      filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(p.filterFreq + p.filterEnvAmount, t);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(p.filterFreq, 20),
        t + p.filterEnvDecay
      );
      filter.Q.value = p.filterQ;

      carrier.connect(filter);
      filter.connect(ampEnv);
    } else {
      carrier.connect(ampEnv);
    }

    // Apply amplitude envelope (ADSR)
    // Start attack/decay phase
    ampEnv.gain.setValueAtTime(0.001, t);
    ampEnv.gain.linearRampToValueAtTime(velocity, t + p.ampAttack);
    ampEnv.gain.exponentialRampToValueAtTime(
      Math.max(velocity * p.ampSustain, 0.001),
      t + p.ampAttack + p.ampDecay
    );

    // Connect to output
    ampEnv.connect(this.output);

    // Start oscillators
    carrier.start(t);
    op2.start(t);
    op3.start(t);

    // Store voice
    const voice: PolyVoice = {
      carrier,
      op2,
      op3,
      op2Gain,
      op3Gain,
      op3ToOp2Gain,
      feedbackGain,
      ampEnv,
      filter,
      note,
      startTime: t,
      released: false,
      releaseTime: 0
    };

    this.voices.push(voice);
    this.lastNote = note;
  }

  /**
   * Release a note
   */
  noteOff(note: number, time?: number): void {
    const t = time ?? this.ctx.currentTime;
    const p = this.params;

    // Find all voices playing this note
    const voicesToRelease = this.voices.filter(v => v.note === note && !v.released);

    for (const voice of voicesToRelease) {
      voice.released = true;
      voice.releaseTime = t;

      // Apply release envelope
      voice.ampEnv.gain.cancelScheduledValues(t);
      voice.ampEnv.gain.setValueAtTime(voice.ampEnv.gain.value, t);
      voice.ampEnv.gain.exponentialRampToValueAtTime(0.001, t + p.ampRelease);

      // Schedule cleanup
      const cleanupTime = t + p.ampRelease + 0.1;
      setTimeout(() => {
        this.cleanupVoice(voice);
      }, (cleanupTime - this.ctx.currentTime) * 1000);
    }
  }

  /**
   * Trigger and release (for sequencer use)
   */
  trigger(
    note: number,
    velocity: number = 1,
    time: number,
    duration: number,
    paramLocks?: Partial<FMMelodicParams>
  ): void {
    this.noteOn(note, velocity, time, paramLocks);

    // Schedule note off
    setTimeout(() => {
      this.noteOff(note);
    }, (time + duration - this.ctx.currentTime) * 1000);
  }

  /**
   * Release all notes
   */
  allNotesOff(time?: number): void {
    const t = time ?? this.ctx.currentTime;
    for (const voice of this.voices) {
      if (!voice.released) {
        this.noteOff(voice.note, t);
      }
    }
  }

  // Parameter getters/setters
  get op1Ratio(): number { return this.params.op1Ratio; }
  set op1Ratio(value: number) { this.params.op1Ratio = Math.max(0.1, Math.min(16, value)); }

  get op2Ratio(): number { return this.params.op2Ratio; }
  set op2Ratio(value: number) { this.params.op2Ratio = Math.max(0.1, Math.min(16, value)); }

  get op3Ratio(): number { return this.params.op3Ratio; }
  set op3Ratio(value: number) { this.params.op3Ratio = Math.max(0.1, Math.min(16, value)); }

  get op2Index(): number { return this.params.op2Index; }
  set op2Index(value: number) { this.params.op2Index = Math.max(0, Math.min(20, value)); }

  get op3Index(): number { return this.params.op3Index; }
  set op3Index(value: number) { this.params.op3Index = Math.max(0, Math.min(20, value)); }

  get op2Feedback(): number { return this.params.op2Feedback; }
  set op2Feedback(value: number) { this.params.op2Feedback = Math.max(0, Math.min(1, value)); }

  get op3ToOp2(): number { return this.params.op3ToOp2; }
  set op3ToOp2(value: number) { this.params.op3ToOp2 = Math.max(0, Math.min(1, value)); }

  get ampAttack(): number { return this.params.ampAttack; }
  set ampAttack(value: number) { this.params.ampAttack = Math.max(0.001, Math.min(5, value)); }

  get ampDecay(): number { return this.params.ampDecay; }
  set ampDecay(value: number) { this.params.ampDecay = Math.max(0.001, Math.min(5, value)); }

  get ampSustain(): number { return this.params.ampSustain; }
  set ampSustain(value: number) { this.params.ampSustain = Math.max(0, Math.min(1, value)); }

  get ampRelease(): number { return this.params.ampRelease; }
  set ampRelease(value: number) { this.params.ampRelease = Math.max(0.001, Math.min(10, value)); }

  get filterEnabled(): boolean { return this.params.filterEnabled; }
  set filterEnabled(value: boolean) { this.params.filterEnabled = value; }

  get filterFreq(): number { return this.params.filterFreq; }
  set filterFreq(value: number) { this.params.filterFreq = Math.max(20, Math.min(20000, value)); }

  get filterQ(): number { return this.params.filterQ; }
  set filterQ(value: number) { this.params.filterQ = Math.max(0.1, Math.min(20, value)); }

  get glideTime(): number { return this.params.glideTime; }
  set glideTime(value: number) { this.params.glideTime = Math.max(0, Math.min(2, value)); }

  get glideEnabled(): boolean { return this.params.glideEnabled; }
  set glideEnabled(value: boolean) { this.params.glideEnabled = value; }

  get gain(): number { return this.params.gain; }
  set gain(value: number) {
    this.params.gain = Math.max(0, Math.min(1, value));
    this.output.gain.setValueAtTime(this.params.gain, this.ctx.currentTime);
  }

  getParams(): FMMelodicParams {
    return { ...this.params };
  }

  setParams(params: Partial<FMMelodicParams>): void {
    Object.assign(this.params, params);
    if (params.gain !== undefined) {
      this.output.gain.setValueAtTime(this.params.gain, this.ctx.currentTime);
    }
  }

  loadPreset(presetName: keyof typeof FM_MELODIC_PRESETS): void {
    const preset = FM_MELODIC_PRESETS[presetName];
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

  get activeVoices(): number {
    return this.voices.length;
  }
}

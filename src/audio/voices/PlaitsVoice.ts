/**
 * PlaitsVoice - Base class for Mutable Instruments Plaits synthesis engines
 *
 * Uses @vectorsize/woscillators WebAssembly AudioWorklet implementation
 * of the Plaits module's 16 synthesis engines.
 *
 * Engines 0-7: Pitched/melodic sounds
 * Engines 8-15: Noise and percussion sounds
 */

// Type definition for wosc from global window.woscillators
interface WoscInterface {
  ctx: AudioContext | null;
  moduleUrl: null;
  moduleLoaded: boolean;
  loadOscillator(audioContext: AudioContext): Promise<void>;
  createOscillator(): any;
  teardown(): void;
}

// Store wosc reference from global
let wosc: WoscInterface | null = null;

// Plaits engine definitions
export const PLAITS_ENGINES = {
  // Pitched/Melodic engines (0-7)
  VIRTUAL_ANALOG: 0,
  WAVESHAPER: 1,
  FM: 2,
  FORMANT: 3,
  ADDITIVE: 4,
  WAVETABLE: 5,
  CHORDS: 6,
  SPEECH: 7,
  // Noise/Percussion engines (8-15)
  GRAIN_CLOUD: 8,
  FILTERED_NOISE: 9,
  PARTICLE_NOISE: 10,
  INHARMONIC_STRING: 11,
  MODAL_RESONATOR: 12,
  ANALOG_KICK: 13,
  ANALOG_SNARE: 14,
  ANALOG_HIHAT: 15,
} as const;

export type PlaitsEngine = typeof PLAITS_ENGINES[keyof typeof PLAITS_ENGINES];

// Engine metadata for UI/presets
export const PLAITS_ENGINE_INFO: Record<number, {
  name: string;
  description: string;
  harmonicsLabel: string;
  timbreLabel: string;
  morphLabel: string;
  isPitched: boolean;
}> = {
  [PLAITS_ENGINES.VIRTUAL_ANALOG]: {
    name: 'Virtual Analog',
    description: 'Detuned VA oscillators with variable waveforms',
    harmonicsLabel: 'Detune',
    timbreLabel: 'Square/Pulse',
    morphLabel: 'Saw/Triangle',
    isPitched: true,
  },
  [PLAITS_ENGINES.WAVESHAPER]: {
    name: 'Waveshaper',
    description: 'Triangle with waveshaper and folder',
    harmonicsLabel: 'Waveform',
    timbreLabel: 'Fold Amount',
    morphLabel: 'Asymmetry',
    isPitched: true,
  },
  [PLAITS_ENGINES.FM]: {
    name: 'FM',
    description: '2-operator FM with variable feedback',
    harmonicsLabel: 'Ratio',
    timbreLabel: 'FM Index',
    morphLabel: 'Feedback',
    isPitched: true,
  },
  [PLAITS_ENGINES.FORMANT]: {
    name: 'Formant',
    description: 'Two formants (VOSIM, Pulsar, Grainlet)',
    harmonicsLabel: 'Formant Ratio',
    timbreLabel: 'Formant Freq',
    morphLabel: 'Width/Shape',
    isPitched: true,
  },
  [PLAITS_ENGINES.ADDITIVE]: {
    name: 'Additive',
    description: '24-harmonic additive oscillator',
    harmonicsLabel: 'Num Bumps',
    timbreLabel: 'Peak Harmonic',
    morphLabel: 'Bump Shape',
    isPitched: true,
  },
  [PLAITS_ENGINES.WAVETABLE]: {
    name: 'Wavetable',
    description: '4 banks of 8x8 wavetables',
    harmonicsLabel: 'Bank',
    timbreLabel: 'Row (Bright)',
    morphLabel: 'Column',
    isPitched: true,
  },
  [PLAITS_ENGINES.CHORDS]: {
    name: 'Chords',
    description: 'Chord generator with string/organ emulation',
    harmonicsLabel: 'Chord Type',
    timbreLabel: 'Inversion',
    morphLabel: 'Waveform',
    isPitched: true,
  },
  [PLAITS_ENGINES.SPEECH]: {
    name: 'Speech',
    description: 'Speech synthesis (formant, SAM, LPC)',
    harmonicsLabel: 'Algorithm',
    timbreLabel: 'Species',
    morphLabel: 'Phoneme',
    isPitched: true,
  },
  [PLAITS_ENGINES.GRAIN_CLOUD]: {
    name: 'Grain Cloud',
    description: 'Granular with variable pitch randomization',
    harmonicsLabel: 'Pitch Random',
    timbreLabel: 'Grain Density',
    morphLabel: 'Grain Duration',
    isPitched: false,
  },
  [PLAITS_ENGINES.FILTERED_NOISE]: {
    name: 'Filtered Noise',
    description: 'Clocked noise with resonant filter',
    harmonicsLabel: 'Filter Type',
    timbreLabel: 'Clock Freq',
    morphLabel: 'Resonance',
    isPitched: false,
  },
  [PLAITS_ENGINES.PARTICLE_NOISE]: {
    name: 'Particle Noise',
    description: '8-layer dust with resonators',
    harmonicsLabel: 'Freq Random',
    timbreLabel: 'Density',
    morphLabel: 'Filter Type',
    isPitched: false,
  },
  [PLAITS_ENGINES.INHARMONIC_STRING]: {
    name: 'Inharmonic String',
    description: 'Karplus-Strong with burst excitation',
    harmonicsLabel: 'Inharmonicity',
    timbreLabel: 'Excitation',
    morphLabel: 'Decay',
    isPitched: false,
  },
  [PLAITS_ENGINES.MODAL_RESONATOR]: {
    name: 'Modal Resonator',
    description: 'Mallet/dust-excited modal synthesis',
    harmonicsLabel: 'Material',
    timbreLabel: 'Excitation',
    morphLabel: 'Decay',
    isPitched: false,
  },
  [PLAITS_ENGINES.ANALOG_KICK]: {
    name: 'Analog Kick',
    description: 'Analog kick drum emulation',
    harmonicsLabel: 'Pitch Env',
    timbreLabel: 'Brightness',
    morphLabel: 'Decay',
    isPitched: false,
  },
  [PLAITS_ENGINES.ANALOG_SNARE]: {
    name: 'Analog Snare',
    description: 'Analog snare drum emulation',
    harmonicsLabel: 'Noise Mix',
    timbreLabel: 'Snap',
    morphLabel: 'Decay',
    isPitched: false,
  },
  [PLAITS_ENGINES.ANALOG_HIHAT]: {
    name: 'Analog Hi-Hat',
    description: 'Analog hi-hat emulation',
    harmonicsLabel: 'Noise Balance',
    timbreLabel: 'HP Cutoff',
    morphLabel: 'Decay',
    isPitched: false,
  },
};

export interface PlaitsParams {
  engine: PlaitsEngine;
  note: number;           // MIDI note 0-127
  harmonics: number;      // 0-1, engine-dependent
  timbre: number;         // 0-1, engine-dependent
  morph: number;          // 0-1, engine-dependent
  fm: number;             // 0-10, frequency modulation amount (internal, not typically user-facing)
  decay: number;          // 0-1, internal LPG decay
  fade: number;           // 0-1, crossfade between outputs
  volume: number;         // 0-1
}

interface ActiveVoice {
  osc: any; // woscillators oscillator instance
  envGain: GainNode;
  stopTime: number;
}

const DEFAULT_PARAMS: PlaitsParams = {
  engine: PLAITS_ENGINES.VIRTUAL_ANALOG,
  note: 60,
  harmonics: 0.5,
  timbre: 0.5,
  morph: 0.5,
  fm: 0,
  decay: 0.5,
  fade: 0,
  volume: 0.8,
};

export class PlaitsVoice {
  protected ctx: AudioContext;
  protected output: GainNode;
  protected params: PlaitsParams;
  protected activeVoices: Map<string, ActiveVoice> = new Map();
  protected static woscLoaded = false;

  constructor(ctx: AudioContext, destination?: AudioNode) {
    this.ctx = ctx;
    this.params = { ...DEFAULT_PARAMS };

    this.output = ctx.createGain();
    this.output.gain.value = this.params.volume;

    if (destination) {
      this.output.connect(destination);
    } else {
      this.output.connect(ctx.destination);
    }
  }

  /**
   * Initialize woscillators - must be called before creating voices
   * Uses global window.woscillators loaded via script tag in index.html
   */
  static async loadWoscillators(ctx: AudioContext): Promise<void> {
    if (PlaitsVoice.woscLoaded) return;

    try {
      console.log('[Plaits] Getting woscillators from global...');

      // Access wosc from global window object (loaded via script tag)
      const globalWoscillators = (window as any).woscillators;

      if (!globalWoscillators) {
        throw new Error('window.woscillators not found - ensure woscillators.js is loaded via script tag');
      }

      wosc = globalWoscillators.wosc;

      if (!wosc) {
        console.error('[Plaits] wosc not found on window.woscillators. Available keys:', Object.keys(globalWoscillators));
        throw new Error('wosc not found on window.woscillators');
      }

      console.log('[Plaits] wosc object found, calling loadOscillator...');

      await wosc.loadOscillator(ctx);
      PlaitsVoice.woscLoaded = true;
      console.log('[Plaits] Woscillators loaded successfully');
    } catch (error) {
      console.error('[Plaits] Failed to load woscillators:', error);
      throw error;
    }
  }

  /**
   * Teardown woscillators - call when completely done with all Plaits voices
   */
  static teardown(): void {
    if (PlaitsVoice.woscLoaded && wosc) {
      wosc.teardown();
      PlaitsVoice.woscLoaded = false;
    }
  }

  /**
   * Check if woscillators is loaded
   */
  static isLoaded(): boolean {
    return PlaitsVoice.woscLoaded;
  }

  /**
   * Trigger a sound
   */
  trigger(
    time: number,
    velocity: number = 1,
    paramLocks?: Partial<PlaitsParams>
  ): void {
    if (!PlaitsVoice.woscLoaded || !wosc) {
      console.warn('Woscillators not loaded, cannot trigger');
      return;
    }

    const now = time || this.ctx.currentTime;
    const p = paramLocks ? { ...this.params, ...paramLocks } : this.params;

    // Voice duration based on LPG decay parameter
    const rawDecay = Number.isFinite(p.decay) ? p.decay : 0.5;
    const normalizedDecay = Math.min(Math.max(rawDecay, 0), 1);
    const voiceDuration = Math.max(normalizedDecay * 2, 0.02);

    try {
      // Create oscillator using woscillators
      // Note: createOscillator() uses the AudioContext passed to loadOscillator()
      const osc = wosc.createOscillator();

      // Set engine (0-15 for Plaits models)
      osc.engine = p.engine;

      // Set note (MIDI note 0-127)
      osc.note = p.note;

      // Set macro parameters (0-1 range)
      osc.harmonics = p.harmonics;
      osc.timbre = p.timbre;
      osc.morph = p.morph;
      osc.frequencyModulationAmount = p.fm;

      // Set envelope/LPG parameters
      osc.decay = normalizedDecay;
      osc.fade = p.fade;
      osc.volume = p.volume * velocity;

      // Trigger behavior
      osc.modTriggerPatched = true;
      osc.modTrigger = 1;

      // Level envelope behavior
      osc.modLevelPatched = true;
      osc.modLevel = 1;

      // Create envelope gain for smooth attack/release
      const envGain = this.ctx.createGain();
      envGain.gain.setValueAtTime(0, now);
      envGain.gain.linearRampToValueAtTime(1, now + 0.001);
      envGain.gain.setValueAtTime(1, now + voiceDuration * 0.7);
      envGain.gain.linearRampToValueAtTime(0, now + voiceDuration);

      osc.connect(envGain);
      envGain.connect(this.output);

      // Start the oscillator
      osc.start(now);

      // Store voice for cleanup
      const voiceId = `${Date.now()}-${Math.random()}`;
      this.activeVoices.set(voiceId, {
        osc,
        envGain,
        stopTime: now + voiceDuration + 0.1,
      });

      // Schedule cleanup
      setTimeout(() => {
        this.cleanupVoice(voiceId);
      }, (voiceDuration + 0.2) * 1000);
    } catch (error) {
      console.error('Failed to create Plaits voice:', error);
    }
  }

  /**
   * Clean up a voice
   */
  protected cleanupVoice(voiceId: string): void {
    const voice = this.activeVoices.get(voiceId);
    if (voice) {
      try {
        voice.osc.stop();
        voice.osc.dispose();
        voice.envGain.disconnect();
        this.activeVoices.delete(voiceId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  // Parameter getters/setters
  get engine(): PlaitsEngine {
    return this.params.engine;
  }
  set engine(value: PlaitsEngine) {
    this.params.engine = Math.max(0, Math.min(15, value)) as PlaitsEngine;
  }

  get note(): number {
    return this.params.note;
  }
  set note(value: number) {
    this.params.note = Math.max(0, Math.min(127, value));
  }

  get harmonics(): number {
    return this.params.harmonics;
  }
  set harmonics(value: number) {
    this.params.harmonics = Math.max(0, Math.min(1, value));
  }

  get timbre(): number {
    return this.params.timbre;
  }
  set timbre(value: number) {
    this.params.timbre = Math.max(0, Math.min(1, value));
  }

  get morph(): number {
    return this.params.morph;
  }
  set morph(value: number) {
    this.params.morph = Math.max(0, Math.min(1, value));
  }

  get fm(): number {
    return this.params.fm;
  }
  set fm(value: number) {
    this.params.fm = Math.max(0, Math.min(10, value));
  }

  get decay(): number {
    return this.params.decay;
  }
  set decay(value: number) {
    this.params.decay = Math.max(0, Math.min(1, value));
  }

  get fade(): number {
    return this.params.fade;
  }
  set fade(value: number) {
    this.params.fade = Math.max(0, Math.min(1, value));
  }

  get volume(): number {
    return this.params.volume;
  }
  set volume(value: number) {
    this.params.volume = Math.max(0, Math.min(1, value));
    this.output.gain.setValueAtTime(this.params.volume, this.ctx.currentTime);
  }

  getParams(): PlaitsParams {
    return { ...this.params };
  }

  setParams(params: Partial<PlaitsParams>): void {
    Object.assign(this.params, params);
    if (params.volume !== undefined) {
      this.output.gain.setValueAtTime(this.params.volume, this.ctx.currentTime);
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

  get activeVoiceCount(): number {
    return this.activeVoices.size;
  }

  dispose(): void {
    for (const voiceId of this.activeVoices.keys()) {
      this.cleanupVoice(voiceId);
    }
    this.output.disconnect();
  }
}

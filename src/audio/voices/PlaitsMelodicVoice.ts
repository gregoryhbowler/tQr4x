/**
 * PlaitsMelodicVoice - Pitched Plaits engines (0-7) with scale/mode/note support
 *
 * Engines 0-7 are for melodic/pitched sounds and should be treated
 * like the bass engine with root note, scale/mode, and note sliders
 * that are quantized to the selected scale.
 *
 * Engine 0: Virtual Analog - Detuned VA oscillators
 * Engine 1: Waveshaper - Triangle with waveshaper/folder
 * Engine 2: FM - 2-operator FM synthesis
 * Engine 3: Formant - Two formants (VOSIM, Pulsar)
 * Engine 4: Additive - 24-harmonic additive
 * Engine 5: Wavetable - 4 banks of 8x8 wavetables
 * Engine 6: Chords - Chord generator
 * Engine 7: Speech - Speech synthesis
 */

import { PlaitsVoice, PLAITS_ENGINES, PLAITS_ENGINE_INFO } from './PlaitsVoice';
import type { PlaitsParams } from './PlaitsVoice';

export interface PlaitsMelodicParams extends PlaitsParams {
  // Glide/portamento
  glideTime: number;      // 0-2 seconds
  glideEnabled: boolean;
}

const DEFAULT_MELODIC_PARAMS: Partial<PlaitsMelodicParams> = {
  glideTime: 0.05,
  glideEnabled: false,
};

// Presets for each melodic engine
export const PLAITS_MELODIC_PRESETS: Record<string, Partial<PlaitsMelodicParams>> = {
  // Virtual Analog presets
  vaBasic: {
    engine: PLAITS_ENGINES.VIRTUAL_ANALOG,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.5,
    note: 48,
  },
  vaSaw: {
    engine: PLAITS_ENGINES.VIRTUAL_ANALOG,
    harmonics: 0.3,
    timbre: 0.2,
    morph: 0.9,
    decay: 0.6,
    note: 36,
  },
  vaSquare: {
    engine: PLAITS_ENGINES.VIRTUAL_ANALOG,
    harmonics: 0.4,
    timbre: 0.9,
    morph: 0.3,
    decay: 0.5,
    note: 48,
  },
  vaSync: {
    engine: PLAITS_ENGINES.VIRTUAL_ANALOG,
    harmonics: 0.8,
    timbre: 0.7,
    morph: 0.4,
    decay: 0.4,
    note: 60,
  },

  // Waveshaper presets
  wsBasic: {
    engine: PLAITS_ENGINES.WAVESHAPER,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.5,
    note: 48,
  },
  wsFolded: {
    engine: PLAITS_ENGINES.WAVESHAPER,
    harmonics: 0.3,
    timbre: 0.8,
    morph: 0.6,
    decay: 0.6,
    note: 36,
  },
  wsAsym: {
    engine: PLAITS_ENGINES.WAVESHAPER,
    harmonics: 0.6,
    timbre: 0.4,
    morph: 0.9,
    decay: 0.5,
    note: 48,
  },

  // FM presets
  fmBasic: {
    engine: PLAITS_ENGINES.FM,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0,
    decay: 0.5,
    note: 48,
  },
  fmBass: {
    engine: PLAITS_ENGINES.FM,
    harmonics: 0.3,
    timbre: 0.6,
    morph: 0.2,
    decay: 0.7,
    note: 36,
  },
  fmBell: {
    engine: PLAITS_ENGINES.FM,
    harmonics: 0.7,
    timbre: 0.8,
    morph: 0.1,
    decay: 0.9,
    note: 72,
  },
  fmFeedback: {
    engine: PLAITS_ENGINES.FM,
    harmonics: 0.5,
    timbre: 0.6,
    morph: 0.7,
    decay: 0.5,
    note: 48,
  },

  // Formant presets
  formantBasic: {
    engine: PLAITS_ENGINES.FORMANT,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.5,
    note: 60,
  },
  formantVowelA: {
    engine: PLAITS_ENGINES.FORMANT,
    harmonics: 0.3,
    timbre: 0.2,
    morph: 0.4,
    decay: 0.6,
    note: 48,
  },
  formantVowelE: {
    engine: PLAITS_ENGINES.FORMANT,
    harmonics: 0.4,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.6,
    note: 48,
  },
  formantVowelO: {
    engine: PLAITS_ENGINES.FORMANT,
    harmonics: 0.5,
    timbre: 0.3,
    morph: 0.6,
    decay: 0.6,
    note: 48,
  },

  // Additive presets
  additiveBasic: {
    engine: PLAITS_ENGINES.ADDITIVE,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.5,
    note: 60,
  },
  additiveOrgan: {
    engine: PLAITS_ENGINES.ADDITIVE,
    harmonics: 0.3,
    timbre: 0.4,
    morph: 0.2,
    decay: 0.8,
    note: 48,
  },
  additiveBright: {
    engine: PLAITS_ENGINES.ADDITIVE,
    harmonics: 0.7,
    timbre: 0.8,
    morph: 0.6,
    decay: 0.5,
    note: 60,
  },

  // Wavetable presets
  wtBasic: {
    engine: PLAITS_ENGINES.WAVETABLE,
    harmonics: 0,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.5,
    note: 48,
  },
  wtSweep: {
    engine: PLAITS_ENGINES.WAVETABLE,
    harmonics: 0.25,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.6,
    note: 48,
  },
  wtDigital: {
    engine: PLAITS_ENGINES.WAVETABLE,
    harmonics: 0.5,
    timbre: 0.8,
    morph: 0.3,
    decay: 0.5,
    note: 60,
  },
  wtWarm: {
    engine: PLAITS_ENGINES.WAVETABLE,
    harmonics: 0.75,
    timbre: 0.3,
    morph: 0.6,
    decay: 0.7,
    note: 36,
  },

  // Chords presets
  chordBasic: {
    engine: PLAITS_ENGINES.CHORDS,
    harmonics: 0.3,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.5,
    note: 48,
  },
  chordMajor: {
    engine: PLAITS_ENGINES.CHORDS,
    harmonics: 0.2,
    timbre: 0.5,
    morph: 0.3,
    decay: 0.6,
    note: 48,
  },
  chordMinor: {
    engine: PLAITS_ENGINES.CHORDS,
    harmonics: 0.3,
    timbre: 0.5,
    morph: 0.3,
    decay: 0.6,
    note: 48,
  },
  chordOrgan: {
    engine: PLAITS_ENGINES.CHORDS,
    harmonics: 0.5,
    timbre: 0.7,
    morph: 0.8,
    decay: 0.8,
    note: 48,
  },

  // Speech presets
  speechBasic: {
    engine: PLAITS_ENGINES.SPEECH,
    harmonics: 0.3,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.5,
    note: 48,
  },
  speechRobot: {
    engine: PLAITS_ENGINES.SPEECH,
    harmonics: 0.1,
    timbre: 0.3,
    morph: 0.4,
    decay: 0.6,
    note: 36,
  },
  speechChipmunk: {
    engine: PLAITS_ENGINES.SPEECH,
    harmonics: 0.2,
    timbre: 0.9,
    morph: 0.5,
    decay: 0.5,
    note: 72,
  },
  speechVocoder: {
    engine: PLAITS_ENGINES.SPEECH,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.7,
    decay: 0.7,
    note: 48,
  },

  // Acid bass preset (like FM-Melodic bass)
  acidBass: {
    engine: PLAITS_ENGINES.VIRTUAL_ANALOG,
    harmonics: 0.4,
    timbre: 0.7,
    morph: 0.8,
    decay: 0.3,
    note: 36,
    glideEnabled: true,
    glideTime: 0.04,
  },
};

export class PlaitsMelodicVoice extends PlaitsVoice {
  private melodicParams: PlaitsMelodicParams;
  private lastNote: number = 60;

  constructor(ctx: AudioContext, destination?: AudioNode) {
    super(ctx, destination);
    this.melodicParams = {
      ...this.params,
      ...DEFAULT_MELODIC_PARAMS,
    } as PlaitsMelodicParams;
  }

  /**
   * Trigger a melodic note with optional glide
   */
  triggerNote(
    note: number,
    velocity: number = 1,
    time: number,
    _duration: number,
    paramLocks?: Partial<PlaitsMelodicParams>
  ): void {
    const p = paramLocks
      ? { ...this.melodicParams, ...paramLocks }
      : this.melodicParams;

    // For glide, we need to handle it differently
    // Plaits doesn't have built-in glide, so we simulate with note transition
    const effectiveNote = p.glideEnabled ? this.lastNote : note;

    // Trigger with the note
    this.trigger(time, velocity, {
      ...p,
      note: p.glideEnabled ? this.interpolateNote(effectiveNote, note, p.glideTime) : note,
    });

    this.lastNote = note;
  }

  /**
   * Simple note interpolation for glide effect
   * In a more complex implementation, this could use AudioWorklet
   */
  private interpolateNote(_from: number, to: number, _glideTime: number): number {
    // For now, just use the target note
    // A more sophisticated implementation would schedule multiple triggers
    return to;
  }

  /**
   * Override trigger to handle melodic-specific params
   */
  trigger(
    time: number,
    velocity: number = 1,
    paramLocks?: Partial<PlaitsMelodicParams>
  ): void {
    // Ensure we're using a melodic engine (0-7)
    const p = paramLocks
      ? { ...this.melodicParams, ...paramLocks }
      : this.melodicParams;

    if (p.engine > 7) {
      console.warn('PlaitsMelodicVoice should use engines 0-7');
    }

    super.trigger(time, velocity, p);
  }

  // Melodic-specific parameter getters/setters
  get glideTime(): number {
    return this.melodicParams.glideTime;
  }
  set glideTime(value: number) {
    this.melodicParams.glideTime = Math.max(0, Math.min(2, value));
  }

  get glideEnabled(): boolean {
    return this.melodicParams.glideEnabled;
  }
  set glideEnabled(value: boolean) {
    this.melodicParams.glideEnabled = value;
  }

  getParams(): PlaitsMelodicParams {
    return { ...this.melodicParams };
  }

  setParams(params: Partial<PlaitsMelodicParams>): void {
    Object.assign(this.melodicParams, params);
    // Also update base params
    super.setParams(params);
  }

  loadPreset(presetName: keyof typeof PLAITS_MELODIC_PRESETS): void {
    const preset = PLAITS_MELODIC_PRESETS[presetName];
    if (preset) {
      this.setParams(preset);
    }
  }

  /**
   * Get available presets for this voice type
   */
  static getPresetNames(): string[] {
    return Object.keys(PLAITS_MELODIC_PRESETS);
  }

  /**
   * Get presets filtered by engine
   */
  static getPresetsForEngine(engine: number): string[] {
    return Object.entries(PLAITS_MELODIC_PRESETS)
      .filter(([_, preset]) => preset.engine === engine)
      .map(([name]) => name);
  }

  /**
   * Get engine info
   */
  getEngineInfo(): typeof PLAITS_ENGINE_INFO[number] {
    return PLAITS_ENGINE_INFO[this.melodicParams.engine];
  }
}

// Export engine constants for convenience
export { PLAITS_ENGINES, PLAITS_ENGINE_INFO } from './PlaitsVoice';

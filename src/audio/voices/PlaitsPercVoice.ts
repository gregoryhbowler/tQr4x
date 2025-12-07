/**
 * PlaitsPercVoice - Noise/Percussion Plaits engines (8-15)
 *
 * Engines 8-15 are for noise and percussion sounds and should be treated
 * like drum voices - no scale/mode, just direct triggering with parameters.
 *
 * Engine 8:  Grain Cloud - Granular with pitch randomization
 * Engine 9:  Filtered Noise - Clocked noise with resonant filter
 * Engine 10: Particle Noise - 8-layer dust with resonators
 * Engine 11: Inharmonic String - Karplus-Strong
 * Engine 12: Modal Resonator - Modal synthesis
 * Engine 13: Analog Kick - Kick drum emulation
 * Engine 14: Analog Snare - Snare drum emulation
 * Engine 15: Analog Hi-Hat - Hi-hat emulation
 */

import { PlaitsVoice, PLAITS_ENGINES, PLAITS_ENGINE_INFO } from './PlaitsVoice';
import type { PlaitsParams } from './PlaitsVoice';

// Presets for each percussion engine
export const PLAITS_PERC_PRESETS: Record<string, Partial<PlaitsParams>> = {
  // Grain Cloud presets (Engine 8)
  grainBasic: {
    engine: PLAITS_ENGINES.GRAIN_CLOUD,
    note: 48,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.7,
  },
  grainDense: {
    engine: PLAITS_ENGINES.GRAIN_CLOUD,
    note: 60,
    harmonics: 0.8,
    timbre: 0.9,
    morph: 0.3,
    decay: 0.8,
  },
  grainSparse: {
    engine: PLAITS_ENGINES.GRAIN_CLOUD,
    note: 48,
    harmonics: 0.2,
    timbre: 0.3,
    morph: 0.7,
    decay: 0.6,
  },
  grainChaos: {
    engine: PLAITS_ENGINES.GRAIN_CLOUD,
    note: 60,
    harmonics: 0.9,
    timbre: 0.7,
    morph: 0.9,
    decay: 0.9,
  },

  // Filtered Noise presets (Engine 9)
  noiseBasic: {
    engine: PLAITS_ENGINES.FILTERED_NOISE,
    note: 60,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.3,
    decay: 0.2,
  },
  noiseHihat: {
    engine: PLAITS_ENGINES.FILTERED_NOISE,
    note: 80,
    harmonics: 0.8,
    timbre: 0.7,
    morph: 0.6,
    decay: 0.1,
  },
  noiseSnare: {
    engine: PLAITS_ENGINES.FILTERED_NOISE,
    note: 60,
    harmonics: 0.3,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.15,
  },
  noiseCymbal: {
    engine: PLAITS_ENGINES.FILTERED_NOISE,
    note: 72,
    harmonics: 0.7,
    timbre: 0.6,
    morph: 0.4,
    decay: 0.5,
  },

  // Particle Noise presets (Engine 10)
  particleBasic: {
    engine: PLAITS_ENGINES.PARTICLE_NOISE,
    note: 48,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.6,
  },
  particleDust: {
    engine: PLAITS_ENGINES.PARTICLE_NOISE,
    note: 60,
    harmonics: 0.8,
    timbre: 0.3,
    morph: 0.2,
    decay: 0.4,
  },
  particleRain: {
    engine: PLAITS_ENGINES.PARTICLE_NOISE,
    note: 72,
    harmonics: 0.6,
    timbre: 0.7,
    morph: 0.4,
    decay: 0.5,
  },
  particleCrackle: {
    engine: PLAITS_ENGINES.PARTICLE_NOISE,
    note: 48,
    harmonics: 0.9,
    timbre: 0.8,
    morph: 0.7,
    decay: 0.3,
  },

  // Inharmonic String presets (Engine 11)
  stringBasic: {
    engine: PLAITS_ENGINES.INHARMONIC_STRING,
    note: 36,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.8,
  },
  stringPluck: {
    engine: PLAITS_ENGINES.INHARMONIC_STRING,
    note: 48,
    harmonics: 0.3,
    timbre: 0.7,
    morph: 0.3,
    decay: 0.6,
  },
  stringBow: {
    engine: PLAITS_ENGINES.INHARMONIC_STRING,
    note: 36,
    harmonics: 0.6,
    timbre: 0.4,
    morph: 0.8,
    decay: 0.9,
  },
  stringInharmonic: {
    engine: PLAITS_ENGINES.INHARMONIC_STRING,
    note: 48,
    harmonics: 0.9,
    timbre: 0.6,
    morph: 0.5,
    decay: 0.7,
  },

  // Modal Resonator presets (Engine 12)
  modalBasic: {
    engine: PLAITS_ENGINES.MODAL_RESONATOR,
    note: 48,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.5,
    decay: 0.7,
  },
  modalMallet: {
    engine: PLAITS_ENGINES.MODAL_RESONATOR,
    note: 60,
    harmonics: 0.4,
    timbre: 0.6,
    morph: 0.3,
    decay: 0.6,
  },
  modalBell: {
    engine: PLAITS_ENGINES.MODAL_RESONATOR,
    note: 72,
    harmonics: 0.7,
    timbre: 0.5,
    morph: 0.4,
    decay: 0.9,
  },
  modalTom: {
    engine: PLAITS_ENGINES.MODAL_RESONATOR,
    note: 48,
    harmonics: 0.3,
    timbre: 0.4,
    morph: 0.6,
    decay: 0.5,
  },
  modalPlate: {
    engine: PLAITS_ENGINES.MODAL_RESONATOR,
    note: 60,
    harmonics: 0.8,
    timbre: 0.7,
    morph: 0.5,
    decay: 0.8,
  },

  // Analog Kick presets (Engine 13)
  kickBasic: {
    engine: PLAITS_ENGINES.ANALOG_KICK,
    note: 36,
    harmonics: 0.5,
    timbre: 0.3,
    morph: 0.5,
    decay: 0.5,
    volume: 0.9,
  },
  kickDeep: {
    engine: PLAITS_ENGINES.ANALOG_KICK,
    note: 30,
    harmonics: 0.3,
    timbre: 0.2,
    morph: 0.7,
    decay: 0.6,
    volume: 0.9,
  },
  kickPunchy: {
    engine: PLAITS_ENGINES.ANALOG_KICK,
    note: 40,
    harmonics: 0.7,
    timbre: 0.5,
    morph: 0.3,
    decay: 0.3,
    volume: 0.9,
  },
  kick808: {
    engine: PLAITS_ENGINES.ANALOG_KICK,
    note: 36,
    harmonics: 0.4,
    timbre: 0.4,
    morph: 0.6,
    decay: 0.7,
    volume: 0.9,
  },
  kick909: {
    engine: PLAITS_ENGINES.ANALOG_KICK,
    note: 42,
    harmonics: 0.6,
    timbre: 0.6,
    morph: 0.4,
    decay: 0.4,
    volume: 0.9,
  },
  kickElectro: {
    engine: PLAITS_ENGINES.ANALOG_KICK,
    note: 38,
    harmonics: 0.8,
    timbre: 0.7,
    morph: 0.5,
    decay: 0.35,
    volume: 0.9,
  },

  // Analog Snare presets (Engine 14)
  snareBasic: {
    engine: PLAITS_ENGINES.ANALOG_SNARE,
    note: 60,
    harmonics: 0.5,
    timbre: 0.6,
    morph: 0.7,
    decay: 0.15,
    volume: 0.9,
  },
  snareTight: {
    engine: PLAITS_ENGINES.ANALOG_SNARE,
    note: 65,
    harmonics: 0.4,
    timbre: 0.7,
    morph: 0.5,
    decay: 0.1,
    volume: 0.9,
  },
  snareLoose: {
    engine: PLAITS_ENGINES.ANALOG_SNARE,
    note: 55,
    harmonics: 0.6,
    timbre: 0.5,
    morph: 0.8,
    decay: 0.2,
    volume: 0.9,
  },
  snare808: {
    engine: PLAITS_ENGINES.ANALOG_SNARE,
    note: 60,
    harmonics: 0.5,
    timbre: 0.5,
    morph: 0.6,
    decay: 0.18,
    volume: 0.9,
  },
  snare909: {
    engine: PLAITS_ENGINES.ANALOG_SNARE,
    note: 62,
    harmonics: 0.6,
    timbre: 0.8,
    morph: 0.7,
    decay: 0.12,
    volume: 0.9,
  },
  snareRim: {
    engine: PLAITS_ENGINES.ANALOG_SNARE,
    note: 70,
    harmonics: 0.3,
    timbre: 0.9,
    morph: 0.3,
    decay: 0.08,
    volume: 0.8,
  },

  // Analog Hi-Hat presets (Engine 15)
  hihatBasic: {
    engine: PLAITS_ENGINES.ANALOG_HIHAT,
    note: 72,
    harmonics: 0.6,
    timbre: 0.5,
    morph: 0.8,
    decay: 0.08,
    volume: 0.8,
  },
  hihatClosed: {
    engine: PLAITS_ENGINES.ANALOG_HIHAT,
    note: 75,
    harmonics: 0.5,
    timbre: 0.6,
    morph: 0.7,
    decay: 0.05,
    volume: 0.8,
  },
  hihatOpen: {
    engine: PLAITS_ENGINES.ANALOG_HIHAT,
    note: 72,
    harmonics: 0.7,
    timbre: 0.5,
    morph: 0.9,
    decay: 0.25,
    volume: 0.8,
  },
  hihat808: {
    engine: PLAITS_ENGINES.ANALOG_HIHAT,
    note: 72,
    harmonics: 0.5,
    timbre: 0.4,
    morph: 0.6,
    decay: 0.1,
    volume: 0.8,
  },
  hihat909: {
    engine: PLAITS_ENGINES.ANALOG_HIHAT,
    note: 78,
    harmonics: 0.7,
    timbre: 0.7,
    morph: 0.8,
    decay: 0.06,
    volume: 0.8,
  },
  hihatMetallic: {
    engine: PLAITS_ENGINES.ANALOG_HIHAT,
    note: 80,
    harmonics: 0.8,
    timbre: 0.8,
    morph: 0.6,
    decay: 0.12,
    volume: 0.75,
  },
};

export class PlaitsPercVoice extends PlaitsVoice {
  constructor(ctx: AudioContext, destination?: AudioNode) {
    super(ctx, destination);
    // Default to kick drum engine
    this.params.engine = PLAITS_ENGINES.ANALOG_KICK;
  }

  /**
   * Override trigger to ensure percussion engine is used
   */
  trigger(
    time: number,
    velocity: number = 1,
    paramLocks?: Partial<PlaitsParams>
  ): void {
    const p = paramLocks ? { ...this.params, ...paramLocks } : this.params;

    // Warn if using melodic engine
    if (p.engine < 8) {
      console.warn('PlaitsPercVoice should use engines 8-15');
    }

    super.trigger(time, velocity, p);
  }

  loadPreset(presetName: keyof typeof PLAITS_PERC_PRESETS): void {
    const preset = PLAITS_PERC_PRESETS[presetName];
    if (preset) {
      this.setParams(preset);
    }
  }

  /**
   * Get available presets for this voice type
   */
  static getPresetNames(): string[] {
    return Object.keys(PLAITS_PERC_PRESETS);
  }

  /**
   * Get presets filtered by engine
   */
  static getPresetsForEngine(engine: number): string[] {
    return Object.entries(PLAITS_PERC_PRESETS)
      .filter(([_, preset]) => preset.engine === engine)
      .map(([name]) => name);
  }

  /**
   * Get engine info
   */
  getEngineInfo(): typeof PLAITS_ENGINE_INFO[number] {
    return PLAITS_ENGINE_INFO[this.params.engine];
  }
}

// Export engine constants for convenience
export { PLAITS_ENGINES, PLAITS_ENGINE_INFO } from './PlaitsVoice';

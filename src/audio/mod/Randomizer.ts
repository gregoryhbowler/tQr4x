/**
 * Randomizer - Musically-bounded randomization system
 *
 * Features:
 * - Micro jitter: Subtle continuous variation for organic feel
 * - Voice-level mutate(): Apply random variations with intensity control
 * - Global randomizeScene(): Randomize all parameters with conservative/extreme modes
 * - Seeded randomness for reproducibility
 * - Musically-bounded ranges to prevent harsh/unusable sounds
 */

import type { FMDrumParams } from '../voices/FMDrumVoice';
import type { FMMelodicParams } from '../voices/FMMelodicVoice';
import type { NoiseVoiceParams } from '../voices/NoiseVoice';

/**
 * Seeded random number generator for reproducibility
 * Uses mulberry32 algorithm
 */
export class SeededRandom {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 2147483647);
  }

  /**
   * Get the current seed
   */
  getSeed(): number {
    return this.seed;
  }

  /**
   * Set a new seed
   */
  setSeed(seed: number): void {
    this.seed = seed;
  }

  /**
   * Generate a random float between 0 and 1
   */
  random(): number {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  /**
   * Generate a random float in range [min, max]
   */
  range(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  /**
   * Generate a random integer in range [min, max] (inclusive)
   */
  rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Generate a random value with gaussian distribution
   * Uses Box-Muller transform
   */
  gaussian(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.random();
    const u2 = this.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /**
   * Pick a random item from an array
   */
  pick<T>(array: T[]): T {
    return array[this.rangeInt(0, array.length - 1)];
  }

  /**
   * Shuffle an array (Fisher-Yates)
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.rangeInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

/**
 * Randomization intensity levels
 */
export type RandomIntensity = 'subtle' | 'moderate' | 'extreme';

/**
 * Parameter range definitions for musically-bounded randomization
 * Each parameter has: [min, max, musicalMin, musicalMax]
 * musicalMin/Max represent "safe" ranges for that intensity
 */
interface ParamRange {
  min: number;
  max: number;
  subtle: [number, number];    // Very small variations
  moderate: [number, number];  // Noticeable but musical
  extreme: [number, number];   // Full range exploration
}

/**
 * FM Drum parameter ranges
 */
const FM_DRUM_RANGES: Record<keyof FMDrumParams, ParamRange> = {
  pitch: { min: 20, max: 2000, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0.3, 3] },
  pitchEnvAmount: { min: 1, max: 16, subtle: [0.9, 1.1], moderate: [0.5, 2], extreme: [0.25, 4] },
  pitchEnvDecay: { min: 0.001, max: 1, subtle: [0.9, 1.1], moderate: [0.5, 2], extreme: [0.2, 5] },
  op1Ratio: { min: 0.1, max: 16, subtle: [0.98, 1.02], moderate: [0.8, 1.25], extreme: [0.5, 2] },
  op1Index: { min: 0, max: 20, subtle: [0.9, 1.1], moderate: [0.6, 1.5], extreme: [0.2, 3] },
  op1Feedback: { min: 0, max: 1, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0, 2] },
  op2Ratio: { min: 0.1, max: 16, subtle: [0.98, 1.02], moderate: [0.8, 1.25], extreme: [0.5, 2] },
  op2Index: { min: 0, max: 20, subtle: [0.9, 1.1], moderate: [0.6, 1.5], extreme: [0.2, 3] },
  op2ToOp1: { min: 0, max: 1, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0, 2] },
  ampAttack: { min: 0.001, max: 0.5, subtle: [0.9, 1.1], moderate: [0.5, 2], extreme: [0.2, 5] },
  ampDecay: { min: 0.01, max: 5, subtle: [0.9, 1.1], moderate: [0.6, 1.6], extreme: [0.3, 3] },
  ampCurve: { min: 0, max: 2, subtle: [1, 1], moderate: [1, 1], extreme: [0, 3] }, // Discrete
  noiseMix: { min: 0, max: 1, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0, 2] },
  noiseDecay: { min: 0.01, max: 2, subtle: [0.9, 1.1], moderate: [0.6, 1.6], extreme: [0.3, 3] },
  noiseFilterFreq: { min: 100, max: 10000, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0.3, 3] },
  gain: { min: 0, max: 1, subtle: [0.95, 1.05], moderate: [0.8, 1.2], extreme: [0.5, 1.5] }
};

/**
 * FM Melodic parameter ranges
 */
const FM_MELODIC_RANGES: Partial<Record<keyof FMMelodicParams, ParamRange>> = {
  op1Ratio: { min: 0.1, max: 16, subtle: [0.98, 1.02], moderate: [0.8, 1.25], extreme: [0.5, 2] },
  op2Ratio: { min: 0.1, max: 16, subtle: [0.98, 1.02], moderate: [0.8, 1.25], extreme: [0.5, 2] },
  op3Ratio: { min: 0.1, max: 16, subtle: [0.98, 1.02], moderate: [0.8, 1.25], extreme: [0.5, 2] },
  op2Index: { min: 0, max: 20, subtle: [0.9, 1.1], moderate: [0.6, 1.5], extreme: [0.2, 3] },
  op3Index: { min: 0, max: 20, subtle: [0.9, 1.1], moderate: [0.6, 1.5], extreme: [0.2, 3] },
  ampAttack: { min: 0.001, max: 2, subtle: [0.9, 1.1], moderate: [0.5, 2], extreme: [0.2, 5] },
  ampDecay: { min: 0.01, max: 3, subtle: [0.9, 1.1], moderate: [0.6, 1.6], extreme: [0.3, 3] },
  ampSustain: { min: 0, max: 1, subtle: [0.95, 1.05], moderate: [0.8, 1.2], extreme: [0.5, 1.5] },
  ampRelease: { min: 0.01, max: 5, subtle: [0.9, 1.1], moderate: [0.6, 1.6], extreme: [0.3, 3] },
  filterFreq: { min: 20, max: 20000, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0.3, 3] },
  filterQ: { min: 0.1, max: 30, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0.3, 3] },
  filterEnvAmount: { min: 0, max: 1, subtle: [0.9, 1.1], moderate: [0.6, 1.5], extreme: [0, 2] },
  indexEnvAmount: { min: 0, max: 1, subtle: [0.9, 1.1], moderate: [0.6, 1.5], extreme: [0, 2] },
  glideTime: { min: 0, max: 1, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0, 2] },
  gain: { min: 0, max: 1, subtle: [0.95, 1.05], moderate: [0.8, 1.2], extreme: [0.5, 1.5] }
};

/**
 * Noise Voice parameter ranges
 */
const NOISE_VOICE_RANGES: Partial<Record<keyof NoiseVoiceParams, ParamRange>> = {
  attack: { min: 0.001, max: 0.1, subtle: [0.9, 1.1], moderate: [0.5, 2], extreme: [0.2, 5] },
  decay: { min: 0.001, max: 2, subtle: [0.9, 1.1], moderate: [0.6, 1.6], extreme: [0.3, 3] },
  filterFreq: { min: 100, max: 15000, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0.3, 3] },
  filterQ: { min: 0.1, max: 20, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0.3, 3] },
  metallicRatio1: { min: 0.5, max: 5, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0.3, 3] },
  metallicRatio2: { min: 0.5, max: 5, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0.3, 3] },
  metallicIndex: { min: 0, max: 10, subtle: [0.9, 1.1], moderate: [0.6, 1.5], extreme: [0.2, 3] },
  metallicGain: { min: 0, max: 1, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0, 2] },
  clickFreq: { min: 100, max: 5000, subtle: [0.95, 1.05], moderate: [0.7, 1.4], extreme: [0.3, 3] },
  clickDecay: { min: 0.001, max: 0.02, subtle: [0.9, 1.1], moderate: [0.6, 1.6], extreme: [0.3, 3] },
  gain: { min: 0, max: 1, subtle: [0.95, 1.05], moderate: [0.8, 1.2], extreme: [0.5, 1.5] }
};

/**
 * Micro jitter configuration
 */
export interface MicroJitterConfig {
  enabled: boolean;
  amount: number;       // 0-1, overall jitter intensity
  rateHz: number;       // How often to update (updates per second)
  parameters: string[]; // Which parameters to apply jitter to
}

const DEFAULT_MICRO_JITTER: MicroJitterConfig = {
  enabled: false,
  amount: 0.02,
  rateHz: 20,
  parameters: ['pitch', 'op1Index', 'op2Index', 'filterCutoff']
};

/**
 * Randomizer class
 */
export class Randomizer {
  private rng: SeededRandom;
  private microJitter: MicroJitterConfig;
  private jitterValues: Map<string, number> = new Map();
  private lastJitterUpdate: number = 0;

  constructor(seed?: number) {
    this.rng = new SeededRandom(seed);
    this.microJitter = { ...DEFAULT_MICRO_JITTER };
  }

  /**
   * Get/set the random seed
   */
  get seed(): number {
    return this.rng.getSeed();
  }

  set seed(value: number) {
    this.rng.setSeed(value);
  }

  /**
   * Generate a new random seed
   */
  newSeed(): number {
    const seed = Math.floor(Math.random() * 2147483647);
    this.rng.setSeed(seed);
    return seed;
  }

  /**
   * Configure micro jitter
   */
  setMicroJitter(config: Partial<MicroJitterConfig>): void {
    this.microJitter = { ...this.microJitter, ...config };
  }

  /**
   * Get micro jitter config
   */
  getMicroJitter(): MicroJitterConfig {
    return { ...this.microJitter };
  }

  /**
   * Update micro jitter values (call this each frame/tick)
   */
  updateJitter(time: number): void {
    if (!this.microJitter.enabled) return;

    const updateInterval = 1 / this.microJitter.rateHz;
    if (time - this.lastJitterUpdate < updateInterval) return;

    this.lastJitterUpdate = time;

    // Update jitter values for each parameter
    for (const param of this.microJitter.parameters) {
      // Use gaussian distribution for natural-feeling jitter
      const jitter = this.rng.gaussian(0, this.microJitter.amount);
      this.jitterValues.set(param, jitter);
    }
  }

  /**
   * Get current jitter value for a parameter
   */
  getJitter(parameter: string): number {
    if (!this.microJitter.enabled) return 0;
    return this.jitterValues.get(parameter) ?? 0;
  }

  /**
   * Apply jitter to a value
   */
  applyJitter(parameter: string, value: number): number {
    const jitter = this.getJitter(parameter);
    // Jitter is multiplicative for natural scaling
    return value * (1 + jitter);
  }

  /**
   * Mutate FM Drum parameters
   */
  mutateFMDrum(
    params: FMDrumParams,
    intensity: RandomIntensity = 'moderate',
    exclude: (keyof FMDrumParams)[] = []
  ): FMDrumParams {
    const result = { ...params };

    for (const [key, range] of Object.entries(FM_DRUM_RANGES)) {
      if (exclude.includes(key as keyof FMDrumParams)) continue;

      const paramKey = key as keyof FMDrumParams;
      const currentValue = params[paramKey];

      if (typeof currentValue !== 'number') continue;

      // Get intensity range
      const [minMult, maxMult] = range[intensity];

      // Apply random multiplier within intensity range
      const multiplier = this.rng.range(minMult, maxMult);
      let newValue = currentValue * multiplier;

      // Clamp to valid range
      newValue = Math.max(range.min, Math.min(range.max, newValue));

      (result as Record<string, unknown>)[paramKey] = newValue;
    }

    return result;
  }

  /**
   * Mutate FM Melodic parameters
   */
  mutateFMMelodic(
    params: FMMelodicParams,
    intensity: RandomIntensity = 'moderate',
    exclude: (keyof FMMelodicParams)[] = []
  ): FMMelodicParams {
    const result = { ...params };

    for (const [key, range] of Object.entries(FM_MELODIC_RANGES)) {
      if (!range) continue;
      if (exclude.includes(key as keyof FMMelodicParams)) continue;

      const paramKey = key as keyof FMMelodicParams;
      const currentValue = params[paramKey];

      if (typeof currentValue !== 'number') continue;

      const [minMult, maxMult] = range[intensity];
      const multiplier = this.rng.range(minMult, maxMult);
      let newValue = currentValue * multiplier;

      newValue = Math.max(range.min, Math.min(range.max, newValue));
      (result as Record<string, unknown>)[paramKey] = newValue;
    }

    return result;
  }

  /**
   * Mutate Noise Voice parameters
   */
  mutateNoiseVoice(
    params: NoiseVoiceParams,
    intensity: RandomIntensity = 'moderate',
    exclude: (keyof NoiseVoiceParams)[] = []
  ): NoiseVoiceParams {
    const result = { ...params };

    for (const [key, range] of Object.entries(NOISE_VOICE_RANGES)) {
      if (!range) continue;
      if (exclude.includes(key as keyof NoiseVoiceParams)) continue;

      const paramKey = key as keyof NoiseVoiceParams;
      const currentValue = params[paramKey];

      if (typeof currentValue !== 'number') continue;

      const [minMult, maxMult] = range[intensity];
      const multiplier = this.rng.range(minMult, maxMult);
      let newValue = currentValue * multiplier;

      newValue = Math.max(range.min, Math.min(range.max, newValue));
      (result as Record<string, unknown>)[paramKey] = newValue;
    }

    return result;
  }

  /**
   * Generate completely random FM Drum parameters
   */
  randomFMDrum(intensity: RandomIntensity = 'moderate'): Partial<FMDrumParams> {
    const result: Partial<FMDrumParams> = {};

    for (const [key, range] of Object.entries(FM_DRUM_RANGES)) {
      const [minMult, maxMult] = range[intensity];

      // For random generation, use the center of the range scaled by intensity
      const center = (range.min + range.max) / 2;
      const scaledMin = center * minMult;
      const scaledMax = center * maxMult;

      let value = this.rng.range(scaledMin, scaledMax);
      value = Math.max(range.min, Math.min(range.max, value));

      (result as Record<string, number>)[key] = value;
    }

    return result;
  }

  /**
   * Randomize scene - applies random variations to multiple tracks
   * Returns a map of trackId -> mutated parameters
   */
  randomizeScene<T extends Record<string, unknown>>(
    trackParams: Map<string, T>,
    voiceTypes: Map<string, 'fm-drum' | 'fm-melodic' | 'noise'>,
    intensity: RandomIntensity = 'moderate'
  ): Map<string, T> {
    const result = new Map<string, T>();

    for (const [trackId, params] of trackParams) {
      const voiceType = voiceTypes.get(trackId);

      let mutated: T;
      switch (voiceType) {
        case 'fm-drum':
          mutated = this.mutateFMDrum(params as unknown as FMDrumParams, intensity) as unknown as T;
          break;
        case 'fm-melodic':
          mutated = this.mutateFMMelodic(params as unknown as FMMelodicParams, intensity) as unknown as T;
          break;
        case 'noise':
          mutated = this.mutateNoiseVoice(params as unknown as NoiseVoiceParams, intensity) as unknown as T;
          break;
        default:
          mutated = params;
      }

      result.set(trackId, mutated);
    }

    return result;
  }

  /**
   * Randomize pattern step probabilities
   */
  randomizeStepProbabilities(
    length: number,
    baseProbability: number = 0.5,
    variation: number = 0.3
  ): number[] {
    const probabilities: number[] = [];

    for (let i = 0; i < length; i++) {
      let prob = baseProbability + this.rng.gaussian(0, variation);
      prob = Math.max(0, Math.min(1, prob));
      probabilities.push(prob);
    }

    return probabilities;
  }

  /**
   * Randomize pattern with musical constraints
   */
  randomizePattern(
    length: number,
    density: number = 0.5,  // 0-1, probability of a step being active
    options: {
      emphasizeDownbeats?: boolean;
      maxConsecutive?: number;
      minGap?: number;
    } = {}
  ): boolean[] {
    const pattern: boolean[] = [];
    const { emphasizeDownbeats = true, maxConsecutive = 4, minGap = 0 } = options;

    let consecutiveCount = 0;
    let gapCount = minGap; // Start with enough gap to allow first hit

    for (let i = 0; i < length; i++) {
      let prob = density;

      // Emphasize downbeats (steps 0, 4, 8, 12)
      if (emphasizeDownbeats && i % 4 === 0) {
        prob *= 1.5;
      }

      // Reduce probability if we've hit max consecutive
      if (consecutiveCount >= maxConsecutive) {
        prob *= 0.2;
      }

      // Force gap if needed
      if (gapCount < minGap) {
        prob = 0;
        gapCount++;
      }

      // Generate trigger
      const trigger = this.rng.random() < prob;

      if (trigger) {
        consecutiveCount++;
        gapCount = 0;
      } else {
        consecutiveCount = 0;
        gapCount++;
      }

      pattern.push(trigger);
    }

    return pattern;
  }

  /**
   * Get state for serialization
   */
  getState(): { seed: number; microJitter: MicroJitterConfig } {
    return {
      seed: this.rng.getSeed(),
      microJitter: { ...this.microJitter }
    };
  }

  /**
   * Restore state
   */
  setState(state: { seed: number; microJitter: MicroJitterConfig }): void {
    this.rng.setSeed(state.seed);
    this.microJitter = { ...state.microJitter };
  }
}

// Export singleton for convenience
export const randomizer = new Randomizer();

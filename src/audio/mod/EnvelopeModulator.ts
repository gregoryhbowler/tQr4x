/**
 * EnvelopeModulator - Envelope-based modulation source using preset shapes
 *
 * Uses the envelope presets from EnvelopePresets.ts as modulation shapes.
 * Supports tempo sync (musical divisions like LFOs) or free-running (ms/seconds).
 *
 * Features:
 * - 75+ preset envelope shapes from Zadar-inspired library
 * - Tempo sync with same musical divisions as LFOs
 * - Free-running mode with time in seconds
 * - Looping (cycle) or one-shot modes
 * - Phase offset control
 * - Depth and bipolar output control
 */

import { ENVELOPE_PRESET_MAP, type EnvelopePreset } from '../voices/EnvelopePresets';
import type { LFOSync } from './LFO';

export type EnvelopeLoopMode = 'cycle' | 'oneshot' | 'oneshot-hold';

export interface EnvelopeModulatorParams {
  presetId: string;           // ID of the envelope preset to use
  period: number;             // Period in seconds (when not synced)
  sync: LFOSync;              // Tempo sync division
  tempoSync: boolean;         // Whether to use tempo sync
  phase: number;              // Phase offset 0-1
  depth: number;              // Output depth 0-1
  bipolar: boolean;           // true = -1 to +1, false = 0 to +1
  loopMode: EnvelopeLoopMode; // How envelope cycles
  retrigger: boolean;         // Whether to retrigger on each note
}

const DEFAULT_PARAMS: EnvelopeModulatorParams = {
  presetId: 'attack-decay',
  period: 1,
  sync: '1bar',
  tempoSync: false,
  phase: 0,
  depth: 1,
  bipolar: true,
  loopMode: 'cycle',
  retrigger: false
};

// Sync value to beats (same as LFO)
const SYNC_VALUES: Record<LFOSync, number> = {
  'free': 0,
  '8bars': 32,
  '4bars': 16,
  '2bars': 8,
  '1bar': 4,
  '1/2': 2,
  '1/4': 1,
  '1/8': 0.5,
  '1/16': 0.25,
  '1/32': 0.125,
  '1/2d': 3,
  '1/4d': 1.5,
  '1/8d': 0.75,
  '1/16d': 0.375,
  '1/2t': 4/3,
  '1/4t': 2/3,
  '1/8t': 1/3,
  '1/16t': 1/6
};

/**
 * Curve interpolation functions
 */
function interpolateCurve(
  startValue: number,
  endValue: number,
  t: number,
  curveType: string
): number {
  const delta = endValue - startValue;

  switch (curveType) {
    case 'linear':
      return startValue + delta * t;

    case 'exp':
      // Exponential curve (slow start, fast end for rising; fast start, slow end for falling)
      if (delta >= 0) {
        return startValue + delta * (1 - Math.pow(1 - t, 3));
      } else {
        return startValue + delta * Math.pow(t, 3);
      }

    case 'sharp':
      // Sharp curve (fast initial movement)
      return startValue + delta * (1 - Math.pow(1 - t, 0.5));

    case 'punch':
      // Punch curve (aggressive attack)
      return startValue + delta * (1 - Math.pow(1 - t, 4));

    case 'swell':
      // Swell curve (slow, gradual movement)
      return startValue + delta * Math.pow(t, 2);

    case 'step':
      // Step (instant jump at the end)
      return t >= 1 ? endValue : startValue;

    default:
      return startValue + delta * t;
  }
}

/**
 * Single Envelope Modulator instance
 */
export class EnvelopeModulator {
  private params: EnvelopeModulatorParams;
  private currentPreset: EnvelopePreset | null = null;
  private bpm: number = 120;
  private startTime: number = 0;
  private hasCompleted: boolean = false;

  constructor(params?: Partial<EnvelopeModulatorParams>) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.loadPreset(this.params.presetId);
  }

  /**
   * Load a preset by ID
   */
  loadPreset(presetId: string): boolean {
    const preset = ENVELOPE_PRESET_MAP.get(presetId);
    if (preset) {
      this.currentPreset = preset;
      this.params.presetId = presetId;
      return true;
    }
    return false;
  }

  /**
   * Get the current envelope value
   * @param time - Current time in seconds
   */
  getValue(time: number): number {
    if (!this.currentPreset) return 0;

    const period = this.getPeriod();
    const elapsedTime = time - this.startTime;

    // Calculate normalized phase (0-1)
    let phase: number;

    if (this.params.loopMode === 'cycle') {
      // Continuous cycling
      phase = ((elapsedTime / period) + this.params.phase) % 1;
    } else {
      // One-shot modes
      const rawPhase = (elapsedTime / period) + this.params.phase;

      if (rawPhase >= 1) {
        this.hasCompleted = true;
        if (this.params.loopMode === 'oneshot-hold') {
          // Hold at final value
          phase = 0.9999; // Just before end
        } else {
          // Return to start value
          return this.getUnipolarValue(this.currentPreset.breakpoints[0].value);
        }
      } else {
        phase = rawPhase;
      }
    }

    // Evaluate envelope at this phase
    const rawValue = this.evaluateEnvelope(phase);

    // Apply depth and bipolar conversion
    return this.getUnipolarValue(rawValue);
  }

  /**
   * Evaluate the envelope at a given phase (0-1)
   */
  private evaluateEnvelope(phase: number): number {
    if (!this.currentPreset) return 0.5;

    const breakpoints = this.currentPreset.breakpoints;
    if (breakpoints.length === 0) return 0.5;
    if (breakpoints.length === 1) return breakpoints[0].value;

    // Find the surrounding breakpoints
    let prevBp = breakpoints[0];
    let nextBp = breakpoints[breakpoints.length - 1];

    for (let i = 0; i < breakpoints.length - 1; i++) {
      if (phase >= breakpoints[i].time && phase < breakpoints[i + 1].time) {
        prevBp = breakpoints[i];
        nextBp = breakpoints[i + 1];
        break;
      }
    }

    // Handle edge case where phase is exactly at or past the last breakpoint
    if (phase >= breakpoints[breakpoints.length - 1].time) {
      return breakpoints[breakpoints.length - 1].value;
    }

    // Calculate local phase between breakpoints
    const segmentDuration = nextBp.time - prevBp.time;
    if (segmentDuration <= 0) return prevBp.value;

    const localPhase = (phase - prevBp.time) / segmentDuration;

    // Interpolate using the curve type of the NEXT breakpoint
    // (curve defines how we approach that point)
    return interpolateCurve(prevBp.value, nextBp.value, localPhase, nextBp.curve);
  }

  /**
   * Convert raw envelope value (0-1) to output value with depth and bipolar
   */
  private getUnipolarValue(rawValue: number): number {
    // Raw value is 0-1, need to apply depth and potentially make bipolar
    let value = rawValue;

    if (this.params.bipolar) {
      // Convert 0-1 to -1 to +1
      value = (value * 2) - 1;
    }

    // Apply depth
    value *= this.params.depth;

    return value;
  }

  /**
   * Get the effective period based on tempo sync
   */
  getPeriod(): number {
    if (!this.params.tempoSync || this.params.sync === 'free') {
      return this.params.period;
    }

    // Calculate period from sync value
    const syncBeats = SYNC_VALUES[this.params.sync];
    const beatsPerSecond = this.bpm / 60;
    const frequency = beatsPerSecond / syncBeats;
    return 1 / frequency;
  }

  /**
   * Get the current frequency (for display)
   */
  getFrequency(): number {
    return 1 / this.getPeriod();
  }

  /**
   * Set the tempo for sync calculations
   */
  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  /**
   * Reset/retrigger the envelope
   */
  reset(time: number = 0): void {
    this.startTime = time;
    this.hasCompleted = false;
  }

  /**
   * Trigger the envelope (for one-shot modes)
   */
  trigger(time: number): void {
    this.reset(time);
  }

  /**
   * Check if envelope has completed (for one-shot modes)
   */
  isComplete(): boolean {
    return this.hasCompleted;
  }

  /**
   * Get parameters
   */
  getParams(): EnvelopeModulatorParams {
    return { ...this.params };
  }

  /**
   * Set parameters
   */
  setParams(params: Partial<EnvelopeModulatorParams>): void {
    if (params.presetId && params.presetId !== this.params.presetId) {
      this.loadPreset(params.presetId);
    }
    this.params = { ...this.params, ...params };
  }

  /**
   * Get the current preset
   */
  getPreset(): EnvelopePreset | null {
    return this.currentPreset;
  }

  // Individual parameter accessors
  get presetId(): string { return this.params.presetId; }
  set presetId(value: string) { this.loadPreset(value); }

  get period(): number { return this.params.period; }
  set period(value: number) { this.params.period = Math.max(0.01, Math.min(60, value)); }

  get sync(): LFOSync { return this.params.sync; }
  set sync(value: LFOSync) { this.params.sync = value; }

  get tempoSync(): boolean { return this.params.tempoSync; }
  set tempoSync(value: boolean) { this.params.tempoSync = value; }

  get phase(): number { return this.params.phase; }
  set phase(value: number) { this.params.phase = value % 1; }

  get depth(): number { return this.params.depth; }
  set depth(value: number) { this.params.depth = Math.max(0, Math.min(1, value)); }

  get bipolar(): boolean { return this.params.bipolar; }
  set bipolar(value: boolean) { this.params.bipolar = value; }

  get loopMode(): EnvelopeLoopMode { return this.params.loopMode; }
  set loopMode(value: EnvelopeLoopMode) { this.params.loopMode = value; }

  get retrigger(): boolean { return this.params.retrigger; }
  set retrigger(value: boolean) { this.params.retrigger = value; }
}

/**
 * EnvelopeModulatorManager - Manages 6 envelope modulators
 */
export interface EnvelopeModulatorManagerState {
  envelopes: EnvelopeModulatorParams[];
}

export class EnvelopeModulatorManager {
  private envelopes: EnvelopeModulator[] = [];
  private _bpm: number = 120;

  constructor() {
    // Create 6 envelope modulators with different default presets
    const defaultPresets = [
      'attack-decay',
      'swell',
      'bounce',
      'sine',
      'breath',
      'complex-a'
    ];

    for (let i = 0; i < 6; i++) {
      this.envelopes.push(new EnvelopeModulator({
        presetId: defaultPresets[i],
        period: 1,
        tempoSync: false,
        depth: 1,
        bipolar: true,
        loopMode: 'cycle'
      }));
    }
  }

  /**
   * Get envelope modulator by index (0-5)
   */
  getEnvelope(index: number): EnvelopeModulator | null {
    return this.envelopes[index] ?? null;
  }

  /**
   * Get value from specific envelope modulator
   */
  getValue(index: number, time: number): number {
    const env = this.envelopes[index];
    return env ? env.getValue(time) : 0;
  }

  /**
   * Get all envelope values at a given time
   */
  getAllValues(time: number): {
    env1: number;
    env2: number;
    env3: number;
    env4: number;
    env5: number;
    env6: number;
  } {
    return {
      env1: this.envelopes[0].getValue(time),
      env2: this.envelopes[1].getValue(time),
      env3: this.envelopes[2].getValue(time),
      env4: this.envelopes[3].getValue(time),
      env5: this.envelopes[4].getValue(time),
      env6: this.envelopes[5].getValue(time)
    };
  }

  /**
   * Set tempo for all envelope modulators
   */
  setBpm(bpm: number): void {
    this._bpm = bpm;
    for (const env of this.envelopes) {
      env.setBpm(bpm);
    }
  }

  /**
   * Get current BPM
   */
  getBpm(): number {
    return this._bpm;
  }

  /**
   * Reset all envelope modulators
   */
  reset(time: number = 0): void {
    for (const env of this.envelopes) {
      env.reset(time);
    }
  }

  /**
   * Trigger all envelope modulators (for one-shot modes)
   */
  trigger(time: number): void {
    for (const env of this.envelopes) {
      if (env.retrigger || env.loopMode !== 'cycle') {
        env.trigger(time);
      }
    }
  }

  /**
   * Get parameters for all envelope modulators
   */
  getState(): EnvelopeModulatorManagerState {
    return {
      envelopes: this.envelopes.map(env => env.getParams())
    };
  }

  /**
   * Restore state
   */
  setState(state: EnvelopeModulatorManagerState): void {
    state.envelopes.forEach((params, index) => {
      if (this.envelopes[index]) {
        this.envelopes[index].setParams(params);
      }
    });
  }

  /**
   * Set parameters for a specific envelope modulator
   */
  setEnvelopeParams(index: number, params: Partial<EnvelopeModulatorParams>): void {
    const env = this.envelopes[index];
    if (env) {
      env.setParams(params);
    }
  }
}

// Common envelope modulator presets (combinations of settings)
export const ENVELOPE_MOD_PRESETS: Record<string, Partial<EnvelopeModulatorParams>> = {
  percussive: {
    presetId: 'kick',
    period: 0.3,
    tempoSync: false,
    loopMode: 'oneshot',
    bipolar: false
  },

  slowSwell: {
    presetId: 'swell',
    sync: '2bars',
    tempoSync: true,
    loopMode: 'cycle',
    bipolar: true
  },

  rhythmicGate: {
    presetId: 'square',
    sync: '1/8',
    tempoSync: true,
    loopMode: 'cycle',
    bipolar: false
  },

  organicBreath: {
    presetId: 'breath',
    period: 3,
    tempoSync: false,
    loopMode: 'cycle',
    bipolar: true
  },

  glitchy: {
    presetId: 'glitch-random',
    sync: '1/4',
    tempoSync: true,
    loopMode: 'cycle',
    bipolar: true
  },

  complexMorph: {
    presetId: 'complex-a',
    sync: '1bar',
    tempoSync: true,
    loopMode: 'cycle',
    bipolar: true
  },

  bounce: {
    presetId: 'bounce',
    period: 0.8,
    tempoSync: false,
    loopMode: 'cycle',
    bipolar: false
  },

  ratchet: {
    presetId: 'ratchet',
    sync: '1/4',
    tempoSync: true,
    loopMode: 'cycle',
    bipolar: false
  }
};

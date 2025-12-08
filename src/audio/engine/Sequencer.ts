/**
 * Sequencer - Pattern-based sequencer with polymeter support
 *
 * Handles tracks, patterns, step parameters, and trigger scheduling.
 * Includes drift (note variation) and fill (trigger density) controls.
 */

import { type TickEvent, MasterClock } from './MasterClock';
import { applyNoteDrift, applyFillControl, type ScaleConfig } from '../music/Scale';
import { paramLockManager } from './ParamLockManager';

// Deep clone helper for ensuring pattern copies are fully independent
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Number of patterns in the pattern bank (Elektron-style)
export const PATTERN_BANK_SIZE = 16;

// Conditional trig: triggers on the Ath repetition of every B pattern cycles
// e.g., 1:2 = first of every 2 cycles, 3:4 = third of every 4 cycles
// null/undefined = always trigger (equivalent to 1:1)
export interface ConditionalTrig {
  a: number;  // Which cycle to trigger on (1-indexed)
  b: number;  // Total cycles in the condition
}

// Clock division ratios relative to global clock
// Values < 1 mean track runs slower, > 1 means faster
export type ClockDivisionRatio = '1/8' | '1/4' | '1/2' | '1/1' | '2/1' | '4/1' | '8/1';

export const CLOCK_DIVISION_VALUES: Record<ClockDivisionRatio, number> = {
  '1/8': 0.125,  // 8x slower
  '1/4': 0.25,   // 4x slower
  '1/2': 0.5,    // 2x slower
  '1/1': 1,      // Normal speed
  '2/1': 2,      // 2x faster
  '4/1': 4,      // 4x faster
  '8/1': 8,      // 8x faster
};

export interface TrackClockConfig {
  useGlobalClock: boolean;      // If true, track follows global clock (ignores division)
  division: ClockDivisionRatio; // Clock division when not using global clock
}

export interface StepParams {
  trigger: boolean;
  velocity: number;       // 0-1
  microTime: number;      // -0.5 to +0.5 (fraction of step)
  probability: number;    // 0-1
  ratchets: number;       // 0 = none, 1-4 = subdivisions
  note?: number;          // MIDI note (for melodic tracks)
  paramLocks?: Record<string, number>; // Per-step parameter overrides (Elektron-style p-locks)
  hasParamLocks?: boolean; // True if this step has any parameter locks
  condition?: ConditionalTrig;  // Elektron-style conditional trig (A:B)
}

export interface Pattern {
  id: string;
  name: string;
  length: number;         // Number of steps
  division: number;       // Step division (1 = 16th, 2 = 8th, 0.5 = 32nd)
  steps: StepParams[];
}

/**
 * Snapshot of a pattern bank slot for copy/paste operations
 * Can contain either just "engines" (track structure without trigs) or "all" data
 */
export interface PatternBankSnapshot {
  /** Copy mode: 'engines' = track config only, 'all' = full pattern with trigs */
  mode: 'engines' | 'all';
  /** Track voice configs (voiceType, preset, params, note) */
  trackConfigs: Array<{
    trackId: string;
    voiceType: string;
    preset?: string;
    params?: Record<string, unknown>;
    note?: number;
  }>;
  /** Channel configs (filter, sends, saturation, volume, pan) */
  channelConfigs: Array<{
    trackId: string;
    filter: unknown;
    saturation: unknown;
    delaySend: number;
    delaySend2: number;
    delaySend3: number;
    delaySend4: number;
    reverbSend: number;
    volume: number;
    pan: number;
  }>;
  /** Pattern data per track (only present if mode === 'all') */
  patterns?: Array<{
    trackId: string;
    pattern: Pattern;
  }>;
  /** Track performance settings (drift, fill, clock config) */
  trackPerformance: Array<{
    trackId: string;
    performance: TrackPerformance;
    clockConfig: TrackClockConfig;
  }>;
}

export interface TrackPerformance {
  drift: number;          // 0-1: note variation (0 = exact, 1 = fully random from scale)
  fill: number;           // -1 to 1: trigger density (-1 = none, 0 = as sequenced, 1 = all)
  octaveRange?: number;   // Base octave for melodic tracks (default: uses global scale octave)
}

/**
 * Voice configuration for a track within a pattern slot
 */
export interface SlotVoiceConfig {
  voiceType: string;
  preset?: string;
  params?: Record<string, unknown>;
  note?: number;
}

/**
 * Channel configuration for a track within a pattern slot
 */
export interface SlotChannelConfig {
  filter: unknown;
  saturation: unknown;
  delaySend: number;
  delaySend2: number;
  delaySend3: number;
  delaySend4: number;
  reverbSend: number;
  volume: number;
  pan: number;
}

/**
 * Performance configuration for a track within a pattern slot
 */
export interface SlotPerformanceConfig {
  performance: TrackPerformance;
  clockConfig: TrackClockConfig;
}

/**
 * Global FX configuration for a pattern slot
 * Stores Mimeophon, Reverb, Master bus, and cross-send settings
 */
export interface SlotFXConfig {
  mimeophon1: {
    zone: number;
    rate: number;
    microRate: number;
    microRateFreq: number;
    skew: number;
    repeats: number;
    color: number;
    halo: number;
    mix: number;
    hold: boolean;
    flip: boolean;
    pingPong: boolean;
    swap: boolean;
  };
  mimeophon2: {
    zone: number;
    rate: number;
    microRate: number;
    microRateFreq: number;
    skew: number;
    repeats: number;
    color: number;
    halo: number;
    mix: number;
    hold: boolean;
    flip: boolean;
    pingPong: boolean;
    swap: boolean;
  };
  mimeophon3: {
    zone: number;
    rate: number;
    microRate: number;
    microRateFreq: number;
    skew: number;
    repeats: number;
    color: number;
    halo: number;
    mix: number;
    hold: boolean;
    flip: boolean;
    pingPong: boolean;
    swap: boolean;
  };
  mimeophon4: {
    zone: number;
    rate: number;
    microRate: number;
    microRateFreq: number;
    skew: number;
    repeats: number;
    color: number;
    halo: number;
    mix: number;
    hold: boolean;
    flip: boolean;
    pingPong: boolean;
    swap: boolean;
  };
  reverb: {
    size: number;
    decay: number;
    wetLevel: number;
    dryLevel: number;
  };
  master: {
    inputGain: number;
    outputGain: number;
    saturationAmount: number;
    saturationDrive: number;
    highShelf: number;
    highShelfFreq: number;
    limiterEnabled: boolean;
    limiterThreshold: number;
  };
  returnLevels: {
    mimeophon1: number;
    mimeophon2: number;
    mimeophon3: number;
    mimeophon4: number;
    reverb: number;
  };
  crossSends: {
    mim1ToMim2: number;
    mim1ToMim3: number;
    mim1ToMim4: number;
    mim1ToReverb: number;
    mim2ToMim1: number;
    mim2ToMim3: number;
    mim2ToMim4: number;
    mim2ToReverb: number;
    mim3ToMim1: number;
    mim3ToMim2: number;
    mim3ToMim4: number;
    mim3ToReverb: number;
    mim4ToMim1: number;
    mim4ToMim2: number;
    mim4ToMim3: number;
    mim4ToReverb: number;
    reverbToMim1: number;
    reverbToMim2: number;
    reverbToMim3: number;
    reverbToMim4: number;
  };
}

/**
 * Complete configuration for a pattern slot
 * Each slot stores independent voice, channel, performance, and FX settings
 */
export interface PatternSlotConfig {
  trackConfigs: Map<string, SlotVoiceConfig>;
  channelConfigs: Map<string, SlotChannelConfig>;
  trackPerformance: Map<string, SlotPerformanceConfig>;
  fxConfig?: SlotFXConfig;
}

/**
 * Serialized version of a single slot config for JSON export
 */
export interface SerializedSlotConfig {
  trackConfigs: Array<{ trackId: string; config: SlotVoiceConfig }>;
  channelConfigs: Array<{ trackId: string; config: SlotChannelConfig }>;
  performanceConfigs: Array<{ trackId: string; config: SlotPerformanceConfig }>;
  fxConfig?: SlotFXConfig;
}

/**
 * Serialized pattern slot configs indexed by slot number
 */
export type SerializedSlotConfigs = Record<number, SerializedSlotConfig>;

export interface Track {
  id: string;
  name: string;
  muted: boolean;
  solo: boolean;
  currentPatternId: string;
  patterns: Map<string, Pattern>;
  // Performance controls
  performance: TrackPerformance;
  // Scale settings for melodic tracks
  scale?: ScaleConfig;
  // Per-track clock division
  clockConfig: TrackClockConfig;
}

export interface TriggerEvent {
  trackId: string;
  time: number;           // AudioContext time to trigger
  velocity: number;
  step: number;
  isRatchet: boolean;
  ratchetIndex: number;
  note?: number;          // Resolved note (after drift applied)
  paramLocks?: Record<string, number>;  // Step's p-locks (if any)
  latchedParams?: Record<string, number>; // Latched params from p-lock system (persists between trigs)
}

export type TriggerCallback = (event: TriggerEvent) => void;

// Pattern Sequencer (arranger) cell
export interface PatternSequencerCell {
  patternSlot: number | null;  // Which pattern (1-16) or null if empty
  cycles: number;              // How many times to repeat before advancing (1-16)
}

// Pattern Sequencer state for UI updates
export interface PatternSequencerState {
  enabled: boolean;
  cells: PatternSequencerCell[];
  currentCell: number;         // Which cell is currently playing (0-15)
  cyclesRemaining: number;     // How many cycles left in current cell
}

export class Sequencer {
  private clock: MasterClock;
  private tracks: Map<string, Track> = new Map();
  private triggerCallbacks: Map<string, Set<TriggerCallback>> = new Map();
  private trackStepPositions: Map<string, number> = new Map();
  private trackCycleCounts: Map<string, number> = new Map();  // Counts pattern repetitions per track
  private trackTickAccumulators: Map<string, number> = new Map();  // Fractional tick accumulator for clock division
  private unsubscribeClock: (() => void) | null = null;
  private lastGlobalTick: number = 0;

  // Global scale config (shared across all melodic tracks)
  private globalScale: ScaleConfig = { root: 0, scale: 'minor', octave: 3 };

  // Pattern bank system (Elektron-style 16 patterns)
  private activePatternSlot: number = 1;  // Currently active pattern slot (1-16)
  private patternBankClipboard: PatternBankSnapshot | null = null;  // For copy/paste operations
  private patternSlotListeners: Set<(slot: number) => void> = new Set();

  // Per-slot voice, channel, and performance storage (enables per-pattern voice types)
  private patternSlotConfigs: Map<number, PatternSlotConfig> = new Map();

  // Pattern Sequencer (arranger) - for sequencing patterns
  private patternSequencerEnabled: boolean = false;
  private patternSequencerCells: PatternSequencerCell[] = Array(16).fill(null).map(() => ({ patternSlot: null, cycles: 1 }));
  private patternSequencerCurrentCell: number = 0;  // Current cell being played (0-15)
  private patternSequencerCycleCount: number = 0;  // How many cycles of the current pattern have played
  private patternSequencerListeners: Set<(state: PatternSequencerState) => void> = new Set();
  private lastTrack1CycleCount: number = 0;  // Track last observed cycle count for track1

  constructor(clock: MasterClock) {
    this.clock = clock;
  }

  start(): void {
    // Reset all track positions, cycle counts, and tick accumulators
    for (const trackId of this.tracks.keys()) {
      this.trackStepPositions.set(trackId, 0);
      this.trackCycleCounts.set(trackId, 1);  // Start at cycle 1
      this.trackTickAccumulators.set(trackId, 0);
    }
    this.lastGlobalTick = 0;
    // Reset arranger cycle tracking to match the initial track1 cycle count
    this.lastTrack1CycleCount = 1;
    this.patternSequencerCycleCount = 0;

    // Subscribe to clock ticks
    this.unsubscribeClock = this.clock.onTick((event) => {
      this.handleTick(event);
    });
  }

  stop(): void {
    if (this.unsubscribeClock) {
      this.unsubscribeClock();
      this.unsubscribeClock = null;
    }
  }

  /**
   * Resync a single track's phase to align with the master clock.
   *
   * When a track has a different clock division, this calculates where the track
   * WOULD be if it had been running in sync with the master from the beginning,
   * then sets the track to that position.
   *
   * For example, if the master clock is at step 5 and the track is running at 2x speed,
   * the track would be at step 10 (5 * 2). If running at 1/2 speed, it would be at step 2.
   */
  resyncTrack(trackId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;

    const pattern = track.patterns.get(track.currentPatternId);
    if (!pattern) {
      // No pattern, just reset to 0
      this.trackStepPositions.set(trackId, 0);
      this.trackCycleCounts.set(trackId, 1);
      this.trackTickAccumulators.set(trackId, 0);
      return;
    }

    // Calculate the clock multiplier for this track
    let clockMultiplier = 1;
    if (!track.clockConfig.useGlobalClock) {
      clockMultiplier = CLOCK_DIVISION_VALUES[track.clockConfig.division];
    }

    // Calculate how many ticks per step for the master clock (at 1x)
    const masterTicksPerStep = this.clock.ppqn / 4; // 16th notes

    // Calculate total ticks since start from the perspective of a 1x clock
    // This gives us the "master step position"
    const masterStepFloat = this.lastGlobalTick / masterTicksPerStep;

    // Apply the track's clock multiplier and pattern division
    // Higher multiplier = more steps have passed
    // Higher pattern division = fewer steps have passed
    const trackStepFloat = (masterStepFloat * clockMultiplier) / pattern.division;

    // Get the step position within the pattern
    const patternLength = pattern.length;
    const absoluteStep = Math.floor(trackStepFloat);
    const stepInPattern = absoluteStep % patternLength;

    // Calculate cycle count (how many times the pattern has repeated)
    const cycleCount = Math.floor(absoluteStep / patternLength) + 1;

    // Calculate the fractional accumulator (how far we are into the next step)
    const fractionalStep = trackStepFloat - absoluteStep;
    const trackTicksPerStep = (masterTicksPerStep * pattern.division) / clockMultiplier;
    const accumulator = fractionalStep * trackTicksPerStep;

    this.trackStepPositions.set(trackId, stepInPattern);
    this.trackCycleCounts.set(trackId, cycleCount);
    this.trackTickAccumulators.set(trackId, accumulator);
  }

  /**
   * Hard reset all tracks to step 0 (restart from the beginning).
   *
   * This resets both track positions AND the lastGlobalTick reference,
   * effectively restarting the entire sequencer from the downbeat.
   * All tracks will be in sync at step 0.
   */
  resyncAllTracks(): void {
    for (const trackId of this.tracks.keys()) {
      this.trackStepPositions.set(trackId, 0);
      this.trackCycleCounts.set(trackId, 1);
      this.trackTickAccumulators.set(trackId, 0);
    }
    // Reset lastGlobalTick to effectively restart from 0
    // The next tick will have a small delta based on the new tick value
    // We set it to the current tick count so there's no accumulated time
    // This is safe because we've reset all accumulators
    this.lastGlobalTick = 0;
    this.pendingResetToCurrentTick = true;
  }

  // Flag to handle resetting lastGlobalTick to current tick on next handleTick
  private pendingResetToCurrentTick: boolean = false;

  private handleTick(event: TickEvent): void {
    // Handle pending reset - sync lastGlobalTick to current tick to avoid large delta
    if (this.pendingResetToCurrentTick) {
      this.lastGlobalTick = event.tick;
      this.pendingResetToCurrentTick = false;
      // Return early - we've just reset, don't process this tick
      // The next tick will have a normal small delta
      return;
    }

    const ticksPerStep = this.clock.ppqn / 4; // 16th note steps (4 per quarter note)
    const tickDelta = event.tick - this.lastGlobalTick;
    this.lastGlobalTick = event.tick;

    for (const [trackId, track] of this.tracks) {
      if (track.muted) continue;

      const pattern = track.patterns.get(track.currentPatternId);
      if (!pattern) continue;

      // Calculate effective clock multiplier based on track's clock config
      let clockMultiplier = 1;
      if (!track.clockConfig.useGlobalClock) {
        clockMultiplier = CLOCK_DIVISION_VALUES[track.clockConfig.division];
      }

      // Calculate ticks per step for this track (pattern division * clock division)
      // Higher clockMultiplier = faster playback = fewer ticks needed per step
      const trackTicksPerStep = (ticksPerStep * pattern.division) / clockMultiplier;

      // Accumulate ticks for this track
      let accumulator = this.trackTickAccumulators.get(trackId) || 0;
      accumulator += tickDelta;

      // Process steps while we have enough accumulated ticks
      while (accumulator >= trackTicksPerStep) {
        accumulator -= trackTicksPerStep;

        // Get current step position for this track
        let stepPos = this.trackStepPositions.get(trackId) || 0;
        const step = pattern.steps[stepPos % pattern.length];

        // Get current cycle count for conditional trigs
        const cycleCount = this.trackCycleCounts.get(trackId) || 1;

        // Process the step with cycle information
        this.processStep(trackId, track, pattern, step, stepPos, event, cycleCount);

        // Advance step position
        const prevStepPos = stepPos;
        stepPos = (stepPos + 1) % pattern.length;
        this.trackStepPositions.set(trackId, stepPos);

        // Increment cycle count when pattern wraps around
        if (stepPos === 0 && prevStepPos === pattern.length - 1) {
          this.trackCycleCounts.set(trackId, cycleCount + 1);

          // Check pattern sequencer advance when track1 completes a cycle
          if (trackId === 'track1') {
            this.checkPatternSequencerAdvance();
          }
        }
      }

      this.trackTickAccumulators.set(trackId, accumulator);
    }
  }

  private processStep(
    trackId: string,
    track: Track,
    pattern: Pattern,
    step: StepParams,
    stepIndex: number,
    tickEvent: TickEvent,
    cycleCount: number
  ): void {
    // Apply fill control to determine if we should trigger
    const shouldTrigger = applyFillControl(step.trigger, track.performance.fill);
    if (!shouldTrigger) return;

    // Check conditional trig (A:B) - only trigger on Ath repetition of every B cycles
    if (step.condition) {
      const { a, b } = step.condition;
      // Calculate which cycle we're on within the B-cycle window (1-indexed)
      const cycleInWindow = ((cycleCount - 1) % b) + 1;
      if (cycleInWindow !== a) {
        return;  // Skip - not the right cycle
      }
    }

    // Check probability (only if step was originally triggered)
    if (step.trigger && step.probability < 1 && Math.random() > step.probability) {
      return;
    }

    // Calculate base time with microtime offset
    const stepDuration = this.clock.secondsPerStep * pattern.division;
    const microTimeOffset = step.microTime * stepDuration;
    const baseTime = tickEvent.time + microTimeOffset;

    // Get callbacks for this track
    const callbacks = this.triggerCallbacks.get(trackId);
    if (!callbacks || callbacks.size === 0) return;

    // Resolve note with drift (for melodic tracks)
    // Use global scale for drift since scale is now global, not per-track
    let resolvedNote = step.note;
    if (resolvedNote !== undefined && this.globalScale && track.performance.drift > 0) {
      resolvedNote = applyNoteDrift(resolvedNote, track.performance.drift, this.globalScale);
    }

    // Elektron-style parameter lock latching:
    // When a trig fires, update latched params based on this step's p-locks
    // These latched params persist until the next trig on this track
    const hasParamLocks = step.hasParamLocks === true && step.paramLocks !== undefined;
    const latchedParams = paramLockManager.updateLatchedParams(
      trackId,
      stepIndex,
      step.paramLocks,
      hasParamLocks
    );

    // Handle ratchets (subdivisions)
    const numTriggers = step.ratchets > 0 ? step.ratchets + 1 : 1;
    const ratchetInterval = stepDuration / numTriggers;

    for (let i = 0; i < numTriggers; i++) {
      const triggerTime = baseTime + (i * ratchetInterval);

      // Velocity decay for ratchets
      const velocityDecay = i > 0 ? Math.pow(0.7, i) : 1;
      // Use default velocity for fill-added steps
      const baseVelocity = step.trigger ? step.velocity : 0.6;
      const velocity = baseVelocity * velocityDecay;

      const triggerEvent: TriggerEvent = {
        trackId,
        time: triggerTime,
        velocity,
        step: stepIndex,
        isRatchet: i > 0,
        ratchetIndex: i,
        note: resolvedNote,
        paramLocks: step.paramLocks,
        latchedParams, // Include latched params for voice to use
      };

      // Notify all callbacks
      for (const callback of callbacks) {
        callback(triggerEvent);
      }
    }
  }

  // Track management

  createTrack(id: string, name: string): Track {
    // Create 16 patterns per track (pattern bank)
    const patterns = new Map<string, Pattern>();
    for (let i = 1; i <= PATTERN_BANK_SIZE; i++) {
      const pattern = this.createDefaultPattern(`${id}-pattern-${i}`, `Pattern ${i}`, 16);
      patterns.set(pattern.id, pattern);
    }

    const track: Track = {
      id,
      name,
      muted: false,
      solo: false,
      currentPatternId: `${id}-pattern-1`,  // Start with pattern 1
      patterns,
      performance: {
        drift: 0,
        fill: 0,
      },
      clockConfig: {
        useGlobalClock: true,
        division: '1/1',
      },
    };

    this.tracks.set(id, track);
    this.trackStepPositions.set(id, 0);
    this.trackCycleCounts.set(id, 1);
    this.trackTickAccumulators.set(id, 0);
    return track;
  }

  // Performance controls

  setTrackDrift(trackId: string, drift: number): void {
    const track = this.tracks.get(trackId);
    if (track) {
      track.performance.drift = Math.max(0, Math.min(1, drift));
    }
  }

  setTrackFill(trackId: string, fill: number): void {
    const track = this.tracks.get(trackId);
    if (track) {
      track.performance.fill = Math.max(-1, Math.min(1, fill));
    }
  }

  setTrackOctave(trackId: string, octave: number): void {
    const track = this.tracks.get(trackId);
    if (track) {
      track.performance.octaveRange = Math.max(0, Math.min(6, octave));
    }
  }

  getTrackOctave(trackId: string): number | undefined {
    const track = this.tracks.get(trackId);
    return track?.performance.octaveRange;
  }

  // Legacy per-track scale setter - now sets global scale
  setTrackScale(_trackId: string, scale: ScaleConfig): void {
    this.globalScale = scale;
  }

  // Set global scale (preferred method)
  setGlobalScale(scale: ScaleConfig): void {
    this.globalScale = scale;
  }

  getTrackPerformance(trackId: string): TrackPerformance | null {
    const track = this.tracks.get(trackId);
    return track?.performance ?? null;
  }

  // Clock division controls

  setTrackClockConfig(trackId: string, config: Partial<TrackClockConfig>): void {
    const track = this.tracks.get(trackId);
    if (track) {
      if (config.useGlobalClock !== undefined) {
        track.clockConfig.useGlobalClock = config.useGlobalClock;
      }
      if (config.division !== undefined) {
        track.clockConfig.division = config.division;
      }
    }
  }

  getTrackClockConfig(trackId: string): TrackClockConfig | null {
    const track = this.tracks.get(trackId);
    return track?.clockConfig ?? null;
  }

  // Legacy per-track scale getter - now returns global scale
  getTrackScale(_trackId: string): ScaleConfig {
    return this.globalScale;
  }

  // Get global scale (preferred method)
  getGlobalScale(): ScaleConfig {
    return this.globalScale;
  }

  getTrack(id: string): Track | undefined {
    return this.tracks.get(id);
  }

  getAllTracks(): Track[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Get the current step position for a specific track
   * This is the actual sequencer position, independent of global clock steps
   */
  getTrackStepPosition(trackId: string): number {
    return this.trackStepPositions.get(trackId) ?? 0;
  }

  deleteTrack(id: string): void {
    this.tracks.delete(id);
    this.trackStepPositions.delete(id);
    this.trackCycleCounts.delete(id);
    this.trackTickAccumulators.delete(id);
    this.triggerCallbacks.delete(id);
  }

  // Pattern management

  private createDefaultPattern(id: string, name: string, length: number): Pattern {
    const steps: StepParams[] = [];
    for (let i = 0; i < length; i++) {
      steps.push({
        trigger: false,
        velocity: 0.8,
        microTime: 0,
        probability: 1,
        ratchets: 0,
      });
    }

    return { id, name, length, division: 1, steps };
  }

  createPattern(trackId: string, patternId: string, name: string, length: number): Pattern | null {
    const track = this.tracks.get(trackId);
    if (!track) return null;

    const pattern = this.createDefaultPattern(patternId, name, length);
    track.patterns.set(patternId, pattern);
    return pattern;
  }

  getCurrentPattern(trackId: string): Pattern | null {
    const track = this.tracks.get(trackId);
    if (!track) return null;
    return track.patterns.get(track.currentPatternId) || null;
  }

  setCurrentPattern(trackId: string, patternId: string): boolean {
    const track = this.tracks.get(trackId);
    if (!track || !track.patterns.has(patternId)) return false;
    track.currentPatternId = patternId;
    return true;
  }

  // Step manipulation

  setStep(trackId: string, stepIndex: number, params: Partial<StepParams>): boolean {
    const pattern = this.getCurrentPattern(trackId);
    if (!pattern || stepIndex < 0 || stepIndex >= pattern.length) return false;

    Object.assign(pattern.steps[stepIndex], params);
    return true;
  }

  getStep(trackId: string, stepIndex: number): StepParams | null {
    const pattern = this.getCurrentPattern(trackId);
    if (!pattern || stepIndex < 0 || stepIndex >= pattern.length) return null;
    return pattern.steps[stepIndex];
  }

  toggleStep(trackId: string, stepIndex: number): boolean {
    const step = this.getStep(trackId, stepIndex);
    if (!step) return false;
    step.trigger = !step.trigger;
    return step.trigger;
  }

  // Pattern length

  setPatternLength(trackId: string, length: number): boolean {
    const pattern = this.getCurrentPattern(trackId);
    if (!pattern) return false;

    const oldLength = pattern.length;
    pattern.length = length;

    // Extend or truncate steps array
    if (length > oldLength) {
      for (let i = oldLength; i < length; i++) {
        pattern.steps.push({
          trigger: false,
          velocity: 0.8,
          microTime: 0,
          probability: 1,
          ratchets: 0,
        });
      }
    } else {
      pattern.steps.length = length;
    }

    return true;
  }

  setPatternDivision(trackId: string, division: number): boolean {
    const pattern = this.getCurrentPattern(trackId);
    if (!pattern) return false;
    pattern.division = division;
    return true;
  }

  // Trigger callbacks

  onTrigger(trackId: string, callback: TriggerCallback): () => void {
    if (!this.triggerCallbacks.has(trackId)) {
      this.triggerCallbacks.set(trackId, new Set());
    }
    this.triggerCallbacks.get(trackId)!.add(callback);

    return () => {
      this.triggerCallbacks.get(trackId)?.delete(callback);
    };
  }

  // Mute/Solo

  setMuted(trackId: string, muted: boolean): void {
    const track = this.tracks.get(trackId);
    if (track) track.muted = muted;
  }

  setSolo(trackId: string, solo: boolean): void {
    const track = this.tracks.get(trackId);
    if (track) track.solo = solo;
  }

  // State serialization

  getState(): {
    tracks: Array<{
      id: string;
      name: string;
      muted: boolean;
      solo: boolean;
      currentPatternId: string;
      patterns: Array<Pattern>;
      performance: TrackPerformance;
      scale?: ScaleConfig;
      clockConfig: TrackClockConfig;
    }>;
  } {
    const tracks = [];
    for (const track of this.tracks.values()) {
      tracks.push({
        id: track.id,
        name: track.name,
        muted: track.muted,
        solo: track.solo,
        currentPatternId: track.currentPatternId,
        patterns: Array.from(track.patterns.values()),
        performance: { ...track.performance },
        scale: track.scale,
        clockConfig: { ...track.clockConfig },
      });
    }
    return { tracks };
  }

  setState(state: ReturnType<typeof this.getState>): void {
    this.tracks.clear();
    for (const trackData of state.tracks) {
      const track: Track = {
        id: trackData.id,
        name: trackData.name,
        muted: trackData.muted,
        solo: trackData.solo,
        currentPatternId: trackData.currentPatternId,
        patterns: new Map(trackData.patterns.map(p => [p.id, p])),
        performance: trackData.performance ?? { drift: 0, fill: 0 },
        scale: trackData.scale,
        clockConfig: trackData.clockConfig ?? { useGlobalClock: true, division: '1/1' },
      };
      this.tracks.set(track.id, track);
      this.trackStepPositions.set(track.id, 0);
      this.trackCycleCounts.set(track.id, 1);
      this.trackTickAccumulators.set(track.id, 0);
    }
  }

  // ============================================
  // Pattern Bank System (Elektron-style 16 patterns)
  // ============================================

  /**
   * Get the currently active pattern bank slot (1-16)
   */
  getActivePatternSlot(): number {
    return this.activePatternSlot;
  }

  /**
   * Set the active pattern bank slot and switch all tracks to that pattern
   * @param slot Pattern slot number (1-16)
   */
  setActivePatternSlot(slot: number): boolean {
    if (slot < 1 || slot > PATTERN_BANK_SIZE) return false;

    this.activePatternSlot = slot;

    // Switch all tracks to the new pattern slot
    for (const track of this.tracks.values()) {
      const patternId = `${track.id}-pattern-${slot}`;
      if (track.patterns.has(patternId)) {
        track.currentPatternId = patternId;
      }
    }

    // Notify listeners
    for (const listener of this.patternSlotListeners) {
      listener(slot);
    }

    return true;
  }

  /**
   * Subscribe to pattern slot changes
   */
  onPatternSlotChange(callback: (slot: number) => void): () => void {
    this.patternSlotListeners.add(callback);
    return () => this.patternSlotListeners.delete(callback);
  }

  // ============================================
  // Per-Slot Voice/Channel/Performance Storage
  // ============================================

  /**
   * Ensure a pattern slot has initialized storage
   * If the slot hasn't been used yet, creates empty maps
   */
  private ensureSlotInitialized(slot: number): PatternSlotConfig {
    if (!this.patternSlotConfigs.has(slot)) {
      this.patternSlotConfigs.set(slot, {
        trackConfigs: new Map(),
        channelConfigs: new Map(),
        trackPerformance: new Map(),
      });
    }
    return this.patternSlotConfigs.get(slot)!;
  }

  /**
   * Check if a slot has any stored configuration
   */
  hasSlotConfig(slot: number): boolean {
    return this.patternSlotConfigs.has(slot);
  }

  /**
   * Get voice config for a track in a specific slot
   */
  getSlotVoiceConfig(slot: number, trackId: string): SlotVoiceConfig | undefined {
    const slotConfig = this.patternSlotConfigs.get(slot);
    return slotConfig?.trackConfigs.get(trackId);
  }

  /**
   * Set voice config for a track in a specific slot
   */
  setSlotVoiceConfig(slot: number, trackId: string, config: SlotVoiceConfig): void {
    const slotConfig = this.ensureSlotInitialized(slot);
    slotConfig.trackConfigs.set(trackId, deepClone(config));
  }

  /**
   * Get channel config for a track in a specific slot
   */
  getSlotChannelConfig(slot: number, trackId: string): SlotChannelConfig | undefined {
    const slotConfig = this.patternSlotConfigs.get(slot);
    return slotConfig?.channelConfigs.get(trackId);
  }

  /**
   * Set channel config for a track in a specific slot
   */
  setSlotChannelConfig(slot: number, trackId: string, config: SlotChannelConfig): void {
    const slotConfig = this.ensureSlotInitialized(slot);
    slotConfig.channelConfigs.set(trackId, deepClone(config));
  }

  /**
   * Get performance config for a track in a specific slot
   */
  getSlotPerformanceConfig(slot: number, trackId: string): SlotPerformanceConfig | undefined {
    const slotConfig = this.patternSlotConfigs.get(slot);
    return slotConfig?.trackPerformance.get(trackId);
  }

  /**
   * Set performance config for a track in a specific slot
   */
  setSlotPerformanceConfig(slot: number, trackId: string, config: SlotPerformanceConfig): void {
    const slotConfig = this.ensureSlotInitialized(slot);
    slotConfig.trackPerformance.set(trackId, deepClone(config));
  }

  /**
   * Get all track IDs that have voice configs in a slot
   */
  getSlotTrackIds(slot: number): string[] {
    const slotConfig = this.patternSlotConfigs.get(slot);
    if (!slotConfig) return [];
    return Array.from(slotConfig.trackConfigs.keys());
  }

  /**
   * Check if a slot has voice config for a specific track
   */
  hasSlotVoiceConfig(slot: number, trackId: string): boolean {
    const slotConfig = this.patternSlotConfigs.get(slot);
    return slotConfig?.trackConfigs.has(trackId) ?? false;
  }

  /**
   * Check if a slot has channel config for a specific track
   */
  hasSlotChannelConfig(slot: number, trackId: string): boolean {
    const slotConfig = this.patternSlotConfigs.get(slot);
    return slotConfig?.channelConfigs.has(trackId) ?? false;
  }

  /**
   * Check if a slot has any voice configs stored
   */
  slotHasVoiceConfigs(slot: number): boolean {
    const slotConfig = this.patternSlotConfigs.get(slot);
    return slotConfig !== undefined && slotConfig.trackConfigs.size > 0;
  }

  /**
   * Check if a slot has any channel configs stored
   */
  slotHasChannelConfigs(slot: number): boolean {
    const slotConfig = this.patternSlotConfigs.get(slot);
    return slotConfig !== undefined && slotConfig.channelConfigs.size > 0;
  }

  /**
   * Check if a slot has any performance configs stored
   */
  slotHasPerformanceConfigs(slot: number): boolean {
    const slotConfig = this.patternSlotConfigs.get(slot);
    return slotConfig !== undefined && slotConfig.trackPerformance.size > 0;
  }

  /**
   * Get FX config for a specific slot
   */
  getSlotFXConfig(slot: number): SlotFXConfig | undefined {
    const slotConfig = this.patternSlotConfigs.get(slot);
    return slotConfig?.fxConfig;
  }

  /**
   * Set FX config for a specific slot
   */
  setSlotFXConfig(slot: number, config: SlotFXConfig): void {
    const slotConfig = this.ensureSlotInitialized(slot);
    slotConfig.fxConfig = deepClone(config);
  }

  /**
   * Check if a slot has FX config stored
   */
  slotHasFXConfig(slot: number): boolean {
    const slotConfig = this.patternSlotConfigs.get(slot);
    return slotConfig?.fxConfig !== undefined;
  }

  /**
   * Export all pattern slot configs for serialization
   */
  exportSlotConfigs(): SerializedSlotConfigs {
    const result: SerializedSlotConfigs = {};

    this.patternSlotConfigs.forEach((config, slot) => {
      const trackConfigs: Array<{ trackId: string; config: SlotVoiceConfig }> = [];
      config.trackConfigs.forEach((voiceConfig, trackId) => {
        trackConfigs.push({ trackId, config: deepClone(voiceConfig) });
      });

      const channelConfigs: Array<{ trackId: string; config: SlotChannelConfig }> = [];
      config.channelConfigs.forEach((channelConfig, trackId) => {
        channelConfigs.push({ trackId, config: deepClone(channelConfig) });
      });

      const performanceConfigs: Array<{ trackId: string; config: SlotPerformanceConfig }> = [];
      config.trackPerformance.forEach((perfConfig, trackId) => {
        performanceConfigs.push({ trackId, config: deepClone(perfConfig) });
      });

      result[slot] = {
        trackConfigs,
        channelConfigs,
        performanceConfigs,
        fxConfig: config.fxConfig ? deepClone(config.fxConfig) : undefined,
      };
    });

    return result;
  }

  /**
   * Import pattern slot configs from serialized data
   */
  importSlotConfigs(data: SerializedSlotConfigs): void {
    // Clear existing configs
    this.patternSlotConfigs.clear();

    for (const [slotStr, slotData] of Object.entries(data)) {
      const slot = parseInt(slotStr, 10);
      if (isNaN(slot)) continue;

      const config: PatternSlotConfig = {
        trackConfigs: new Map(),
        channelConfigs: new Map(),
        trackPerformance: new Map(),
      };

      // Restore track voice configs
      for (const { trackId, config: voiceConfig } of slotData.trackConfigs) {
        config.trackConfigs.set(trackId, deepClone(voiceConfig));
      }

      // Restore channel configs
      for (const { trackId, config: channelConfig } of slotData.channelConfigs) {
        config.channelConfigs.set(trackId, deepClone(channelConfig));
      }

      // Restore performance configs
      for (const { trackId, config: perfConfig } of slotData.performanceConfigs) {
        config.trackPerformance.set(trackId, deepClone(perfConfig));
      }

      // Restore FX config
      if (slotData.fxConfig) {
        config.fxConfig = deepClone(slotData.fxConfig);
      }

      this.patternSlotConfigs.set(slot, config);
    }
  }

  /**
   * Check if a pattern slot has any data at all (triggers, voice configs, channel configs)
   */
  isPatternSlotEmpty(slot: number): boolean {
    for (const track of this.tracks.values()) {
      const patternId = `${track.id}-pattern-${slot}`;
      const pattern = track.patterns.get(patternId);
      if (pattern) {
        // Check if any step has a trigger
        for (const step of pattern.steps) {
          if (step.trigger || step.hasParamLocks) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Clear a pattern slot (reset all tracks' patterns in that slot to empty)
   */
  clearPatternSlot(slot: number): boolean {
    if (slot < 1 || slot > PATTERN_BANK_SIZE) return false;

    for (const track of this.tracks.values()) {
      const patternId = `${track.id}-pattern-${slot}`;
      const pattern = track.patterns.get(patternId);
      if (pattern) {
        // Reset all steps to default (empty)
        for (let i = 0; i < pattern.steps.length; i++) {
          pattern.steps[i] = {
            trigger: false,
            velocity: 0.8,
            microTime: 0,
            probability: 1,
            ratchets: 0,
          };
        }
      }
    }

    return true;
  }

  /**
   * Copy pattern data to clipboard
   * @param slot Source pattern slot (1-16)
   * @param mode 'engines' = copy track config only, 'all' = copy everything including trigs
   * @param getVoiceConfig Callback to get voice config for a track
   * @param getChannelParams Callback to get channel params for a track
   */
  copyPatternSlot(
    slot: number,
    mode: 'engines' | 'all',
    getVoiceConfig: (trackId: string) => { voiceType: string; preset?: string; params?: Record<string, unknown>; note?: number } | null,
    getChannelParams: (trackId: string) => { filter: unknown; saturation: unknown; delaySend: number; delaySend2: number; delaySend3: number; delaySend4: number; reverbSend: number; volume: number; pan: number } | null
  ): boolean {
    if (slot < 1 || slot > PATTERN_BANK_SIZE) return false;

    const snapshot: PatternBankSnapshot = {
      mode,
      trackConfigs: [],
      channelConfigs: [],
      trackPerformance: [],
    };

    // Collect data from all tracks
    for (const track of this.tracks.values()) {
      // Voice config
      const voiceConfig = getVoiceConfig(track.id);
      if (voiceConfig) {
        snapshot.trackConfigs.push({
          trackId: track.id,
          voiceType: voiceConfig.voiceType,
          preset: voiceConfig.preset,
          params: voiceConfig.params ? deepClone(voiceConfig.params) : undefined,
          note: voiceConfig.note,
        });
      }

      // Channel config
      const channelParams = getChannelParams(track.id);
      if (channelParams) {
        snapshot.channelConfigs.push({
          trackId: track.id,
          filter: deepClone(channelParams.filter),
          saturation: deepClone(channelParams.saturation),
          delaySend: channelParams.delaySend,
          delaySend2: channelParams.delaySend2,
          delaySend3: channelParams.delaySend3,
          delaySend4: channelParams.delaySend4,
          reverbSend: channelParams.reverbSend,
          volume: channelParams.volume,
          pan: channelParams.pan,
        });
      }

      // Performance settings
      snapshot.trackPerformance.push({
        trackId: track.id,
        performance: { ...track.performance },
        clockConfig: { ...track.clockConfig },
      });
    }

    // If copying all, include pattern data
    if (mode === 'all') {
      snapshot.patterns = [];
      for (const track of this.tracks.values()) {
        const patternId = `${track.id}-pattern-${slot}`;
        const pattern = track.patterns.get(patternId);
        if (pattern) {
          // Deep copy the pattern
          snapshot.patterns.push({
            trackId: track.id,
            pattern: {
              id: pattern.id,
              name: pattern.name,
              length: pattern.length,
              division: pattern.division,
              steps: pattern.steps.map(step => ({
                ...step,
                paramLocks: step.paramLocks ? { ...step.paramLocks } : undefined,
                condition: step.condition ? { ...step.condition } : undefined,
              })),
            },
          });
        }
      }
    }

    this.patternBankClipboard = snapshot;
    return true;
  }

  /**
   * Paste pattern data from clipboard to a slot
   * @param slot Target pattern slot (1-16)
   * @param setVoiceConfig Callback to set voice config for a track
   * @param setChannelParams Callback to set channel params for a track
   */
  pastePatternSlot(
    slot: number,
    setVoiceConfig: (trackId: string, config: { voiceType: string; preset?: string; params?: Record<string, unknown>; note?: number }) => void,
    setChannelParams: (trackId: string, params: { filter: unknown; saturation: unknown; delaySend: number; delaySend2: number; delaySend3: number; delaySend4: number; reverbSend: number; volume: number; pan: number }) => void
  ): boolean {
    if (slot < 1 || slot > PATTERN_BANK_SIZE) return false;
    if (!this.patternBankClipboard) return false;

    const snapshot = this.patternBankClipboard;

    // Restore voice configs
    for (const config of snapshot.trackConfigs) {
      setVoiceConfig(config.trackId, {
        voiceType: config.voiceType,
        preset: config.preset,
        params: config.params ? deepClone(config.params) : undefined,
        note: config.note,
      });
    }

    // Restore channel configs
    for (const config of snapshot.channelConfigs) {
      setChannelParams(config.trackId, {
        filter: deepClone(config.filter),
        saturation: deepClone(config.saturation),
        delaySend: config.delaySend,
        delaySend2: config.delaySend2,
        delaySend3: config.delaySend3,
        delaySend4: config.delaySend4,
        reverbSend: config.reverbSend,
        volume: config.volume,
        pan: config.pan,
      });
    }

    // Restore performance settings
    for (const perf of snapshot.trackPerformance) {
      const track = this.tracks.get(perf.trackId);
      if (track) {
        track.performance = { ...perf.performance };
        track.clockConfig = { ...perf.clockConfig };
      }
    }

    // Restore pattern data if present (mode === 'all')
    if (snapshot.patterns) {
      for (const patternData of snapshot.patterns) {
        const track = this.tracks.get(patternData.trackId);
        if (track) {
          const targetPatternId = `${patternData.trackId}-pattern-${slot}`;
          const targetPattern = track.patterns.get(targetPatternId);
          if (targetPattern) {
            // Copy pattern properties
            targetPattern.length = patternData.pattern.length;
            targetPattern.division = patternData.pattern.division;

            // Deep copy steps
            targetPattern.steps = patternData.pattern.steps.map(step => ({
              ...step,
              paramLocks: step.paramLocks ? { ...step.paramLocks } : undefined,
              condition: step.condition ? { ...step.condition } : undefined,
            }));
          }
        }
      }
    }

    return true;
  }

  /**
   * Check if there's pattern data in the clipboard
   */
  hasPatternClipboard(): boolean {
    return this.patternBankClipboard !== null;
  }

  /**
   * Get the clipboard copy mode
   */
  getPatternClipboardMode(): 'engines' | 'all' | null {
    return this.patternBankClipboard?.mode ?? null;
  }

  /**
   * Clear the pattern clipboard
   */
  clearPatternClipboard(): void {
    this.patternBankClipboard = null;
  }

  /**
   * Get pattern for a specific slot and track
   */
  getPatternForSlot(trackId: string, slot: number): Pattern | null {
    if (slot < 1 || slot > PATTERN_BANK_SIZE) return null;
    const track = this.tracks.get(trackId);
    if (!track) return null;
    return track.patterns.get(`${trackId}-pattern-${slot}`) ?? null;
  }

  // ============================================
  // Pattern Sequencer (Arranger) System
  // ============================================

  /**
   * Check track1's cycle count and advance pattern sequencer if needed.
   * Called from handleTick when track1's pattern wraps.
   */
  private checkPatternSequencerAdvance(): void {
    if (!this.patternSequencerEnabled) return;

    const track1CycleCount = this.trackCycleCounts.get('track1') || 1;

    // Check if track1 just completed a cycle (cycle count increased)
    if (track1CycleCount > this.lastTrack1CycleCount) {
      this.lastTrack1CycleCount = track1CycleCount;
      this.patternSequencerCycleCount++;

      const currentCell = this.patternSequencerCells[this.patternSequencerCurrentCell];

      // Check if we've completed the required cycles for this cell
      if (currentCell && currentCell.patternSlot !== null && this.patternSequencerCycleCount >= currentCell.cycles) {
        // Advance to next non-empty cell
        this.advanceToNextCell();
      }

      // Notify listeners
      this.notifyPatternSequencerListeners();
    }
  }

  /**
   * Find and advance to the next non-empty cell in the pattern sequencer
   */
  private advanceToNextCell(): void {
    const startCell = this.patternSequencerCurrentCell;
    let nextCell = (startCell + 1) % 16;
    let loopCount = 0;

    // Find next non-empty cell (loop through all 16 cells max)
    while (loopCount < 16) {
      const cell = this.patternSequencerCells[nextCell];
      if (cell && cell.patternSlot !== null) {
        this.patternSequencerCurrentCell = nextCell;
        this.patternSequencerCycleCount = 0;
        this.setActivePatternSlot(cell.patternSlot);
        return;
      }
      nextCell = (nextCell + 1) % 16;
      loopCount++;
    }

    // No non-empty cells found - disable sequencer
    this.patternSequencerEnabled = false;
    this.notifyPatternSequencerListeners();
  }

  /**
   * Enable or disable the pattern sequencer
   */
  setPatternSequencerEnabled(enabled: boolean): void {
    this.patternSequencerEnabled = enabled;

    if (enabled) {
      // Reset to first non-empty cell
      this.patternSequencerCurrentCell = -1;
      this.patternSequencerCycleCount = 0;
      this.lastTrack1CycleCount = this.trackCycleCounts.get('track1') || 1;

      // Find first non-empty cell
      for (let i = 0; i < 16; i++) {
        const cell = this.patternSequencerCells[i];
        if (cell && cell.patternSlot !== null) {
          this.patternSequencerCurrentCell = i;
          this.setActivePatternSlot(cell.patternSlot);
          break;
        }
      }
    }

    this.notifyPatternSequencerListeners();
  }

  /**
   * Get pattern sequencer enabled state
   */
  isPatternSequencerEnabled(): boolean {
    return this.patternSequencerEnabled;
  }

  /**
   * Set a pattern sequencer cell
   */
  setPatternSequencerCell(cellIndex: number, patternSlot: number | null, cycles: number = 1): boolean {
    if (cellIndex < 0 || cellIndex >= 16) return false;
    if (patternSlot !== null && (patternSlot < 1 || patternSlot > PATTERN_BANK_SIZE)) return false;
    if (cycles < 1 || cycles > 16) return false;

    this.patternSequencerCells[cellIndex] = { patternSlot, cycles };
    this.notifyPatternSequencerListeners();
    return true;
  }

  /**
   * Clear a pattern sequencer cell
   */
  clearPatternSequencerCell(cellIndex: number): boolean {
    if (cellIndex < 0 || cellIndex >= 16) return false;
    this.patternSequencerCells[cellIndex] = { patternSlot: null, cycles: 1 };
    this.notifyPatternSequencerListeners();
    return true;
  }

  /**
   * Get pattern sequencer cell
   */
  getPatternSequencerCell(cellIndex: number): PatternSequencerCell | null {
    if (cellIndex < 0 || cellIndex >= 16) return null;
    return this.patternSequencerCells[cellIndex];
  }

  /**
   * Get all pattern sequencer cells
   */
  getPatternSequencerCells(): PatternSequencerCell[] {
    return [...this.patternSequencerCells];
  }

  /**
   * Get current pattern sequencer state
   */
  getPatternSequencerState(): PatternSequencerState {
    const currentCell = this.patternSequencerCells[this.patternSequencerCurrentCell];
    const totalCycles = currentCell?.cycles ?? 1;

    return {
      enabled: this.patternSequencerEnabled,
      cells: [...this.patternSequencerCells],
      currentCell: this.patternSequencerCurrentCell,
      cyclesRemaining: Math.max(0, totalCycles - this.patternSequencerCycleCount),
    };
  }

  /**
   * Subscribe to pattern sequencer state changes
   */
  onPatternSequencerChange(callback: (state: PatternSequencerState) => void): () => void {
    this.patternSequencerListeners.add(callback);
    return () => this.patternSequencerListeners.delete(callback);
  }

  /**
   * Notify all pattern sequencer listeners
   */
  private notifyPatternSequencerListeners(): void {
    const state = this.getPatternSequencerState();
    for (const listener of this.patternSequencerListeners) {
      listener(state);
    }
  }

  /**
   * Reset pattern sequencer to beginning
   */
  resetPatternSequencer(): void {
    this.patternSequencerCurrentCell = 0;
    this.patternSequencerCycleCount = 0;
    this.lastTrack1CycleCount = this.trackCycleCounts.get('track1') || 1;

    // Switch to first cell's pattern if it has one
    const firstCell = this.patternSequencerCells[0];
    if (firstCell && firstCell.patternSlot !== null) {
      this.setActivePatternSlot(firstCell.patternSlot);
    }

    this.notifyPatternSequencerListeners();
  }

  /**
   * Clear all pattern sequencer cells
   */
  clearPatternSequencer(): void {
    this.patternSequencerCells = Array(16).fill(null).map(() => ({ patternSlot: null, cycles: 1 }));
    this.patternSequencerCurrentCell = 0;
    this.patternSequencerCycleCount = 0;
    this.notifyPatternSequencerListeners();
  }
}

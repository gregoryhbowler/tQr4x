/**
 * ParamLockManager - Elektron-style parameter lock management
 *
 * Handles:
 * - P-lock edit mode state (which step is being edited)
 * - Routing parameter changes to either baseParams or step paramLocks
 * - Managing latched parameter state per track (persists between trigs)
 * - Audition support during p-lock editing
 */

// All lockable parameter IDs
export type LockableParamId =
  // Voice parameters (common across voice types)
  | 'pitch'
  | 'pitchEnvAmount'
  | 'pitchEnvDecay'
  | 'op1Ratio'
  | 'op1Index'
  | 'op1Feedback'
  | 'op2Ratio'
  | 'op2Index'
  | 'op2ToOp1'
  | 'ampAttack'
  | 'ampDecay'
  | 'noiseMix'
  | 'noiseDecay'
  | 'noiseFilterFreq'
  | 'noiseFilterQ'
  // Sample voice parameters
  | 'samplePitch'
  | 'sampleStartPoint'
  | 'sampleLpCutoff'
  | 'sampleLpResonance'
  | 'sampleHpCutoff'
  | 'sampleHpResonance'
  | 'sampleSustain'
  | 'sampleRelease'
  | 'sampleScanSpeed'
  | 'grainDensity'
  | 'grainLength'
  | 'grainSpread'
  | 'grainPan'
  // Ocean voice parameters
  | 'oceanPitch'
  | 'oceanGrainSize'
  | 'oceanDensity'
  | 'oceanPosition'
  | 'oceanSpread'
  | 'oceanHpfFreq'
  | 'oceanLpfFreq'
  | 'oceanVolume'
  // Complex Morph parameters
  | 'complexCarrierFreq'
  | 'complexNotchFreq'
  | 'complexNotchQ'
  | 'complexOutputLevel'
  // Complex Morph envelope parameters (period and amount for each cycling envelope)
  | 'complexCarrierPitchPeriod'
  | 'complexCarrierPitchAmount'
  | 'complexCarrierPitchRange'
  | 'complexOpAPitchPeriod'
  | 'complexOpAPitchAmount'
  | 'complexOpAPitchRange'
  | 'complexOpAIndexPeriod'
  | 'complexOpAIndexAmount'
  | 'complexOpAIndexMin'
  | 'complexOpAIndexMax'
  | 'complexOpALevelPeriod'
  | 'complexOpALevelAmount'
  | 'complexOpALevelMax'
  | 'complexOpBPitchPeriod'
  | 'complexOpBPitchAmount'
  | 'complexOpBPitchRange'
  | 'complexOpBIndexPeriod'
  | 'complexOpBIndexAmount'
  | 'complexOpBIndexMin'
  | 'complexOpBIndexMax'
  | 'complexOpBLevelPeriod'
  | 'complexOpBLevelAmount'
  | 'complexOpBLevelMax'
  | 'complexOpCPitchPeriod'
  | 'complexOpCPitchAmount'
  | 'complexOpCPitchRange'
  | 'complexOpCIndexPeriod'
  | 'complexOpCIndexAmount'
  | 'complexOpCIndexMin'
  | 'complexOpCIndexMax'
  | 'complexOpCLevelPeriod'
  | 'complexOpCLevelAmount'
  | 'complexOpCLevelMax'
  | 'complexAmpPeriod'
  | 'complexAmpAmount'
  | 'complexNotchEnvPeriod'
  | 'complexNotchEnvAmount'
  | 'complexNotchRange'
  // Filter parameters (channel level)
  | 'filterType'  // Filter type (bypass, wasp, sem, moog, threeSisters)
  | 'filterCutoff'
  | 'filterResonance'
  | 'filterMode'
  | 'filterEnvAmount'
  | 'filterSpan'  // Three Sisters span parameter
  // Saturation parameters
  | 'saturationDrive'
  | 'saturationBias'
  | 'saturationMix'
  // Send levels
  | 'sendDelay1'
  | 'sendDelay2'
  | 'sendDelay3'
  | 'sendDelay4'
  | 'sendReverb'
  // Channel parameters
  | 'volume'
  | 'pan'
  // Plaits parameters
  | 'plaitsHarmonics'
  | 'plaitsTimbre'
  | 'plaitsMorph'
  | 'plaitsFM'
  | 'plaitsDecay'
  | 'plaitsFade'
  // Other
  | 'glideTime';

// Parameter locks stored per step
export interface ParamLocks {
  [paramId: string]: number;
}

// State for the current p-lock editing session
export interface ParamLockEditState {
  isActive: boolean;
  trackId: string;
  stepIndex: number;
}

// Per-track latched parameters (set by last triggered step, persist until next trig)
export interface TrackLatchedState {
  latchedParams: ParamLocks;
  lastTrigStep: number;
}

// Callback for when p-lock edit state changes
export type ParamLockEditCallback = (state: ParamLockEditState) => void;

// Callback for audition triggers during p-lock editing
export type AuditionCallback = (trackId: string, stepIndex: number) => void;

export class ParamLockManager {
  // Current edit state - only one step can be edited at a time
  private editState: ParamLockEditState = {
    isActive: false,
    trackId: '',
    stepIndex: -1,
  };

  // Per-track latched state (populated at runtime during playback)
  private trackLatchedStates: Map<string, TrackLatchedState> = new Map();

  // Listeners for edit state changes
  private editStateListeners: Set<ParamLockEditCallback> = new Set();

  // Audition callback
  private auditionCallback: AuditionCallback | null = null;

  /**
   * Enter p-lock edit mode for a specific step
   */
  enterEditMode(trackId: string, stepIndex: number): void {
    // If already editing a different step, exit first
    if (this.editState.isActive &&
        (this.editState.trackId !== trackId || this.editState.stepIndex !== stepIndex)) {
      this.exitEditMode();
    }

    this.editState = {
      isActive: true,
      trackId,
      stepIndex,
    };

    this.notifyEditStateListeners();
  }

  /**
   * Exit p-lock edit mode
   */
  exitEditMode(): void {
    if (!this.editState.isActive) return;

    this.editState = {
      isActive: false,
      trackId: '',
      stepIndex: -1,
    };

    this.notifyEditStateListeners();
  }

  /**
   * Toggle p-lock edit mode for a step
   */
  toggleEditMode(trackId: string, stepIndex: number): boolean {
    if (this.editState.isActive &&
        this.editState.trackId === trackId &&
        this.editState.stepIndex === stepIndex) {
      this.exitEditMode();
      return false;
    } else {
      this.enterEditMode(trackId, stepIndex);
      return true;
    }
  }

  /**
   * Get current edit state
   */
  getEditState(): ParamLockEditState {
    return { ...this.editState };
  }

  /**
   * Check if a specific track/step is in edit mode
   */
  isEditing(trackId: string, stepIndex: number): boolean {
    return (
      this.editState.isActive &&
      this.editState.trackId === trackId &&
      this.editState.stepIndex === stepIndex
    );
  }

  /**
   * Check if any step on a track is being edited
   */
  isEditingTrack(trackId: string): boolean {
    return this.editState.isActive && this.editState.trackId === trackId;
  }

  /**
   * Subscribe to edit state changes
   */
  onEditStateChange(callback: ParamLockEditCallback): () => void {
    this.editStateListeners.add(callback);
    return () => this.editStateListeners.delete(callback);
  }

  private notifyEditStateListeners(): void {
    const state = this.getEditState();
    for (const listener of this.editStateListeners) {
      listener(state);
    }
  }

  /**
   * Set audition callback for triggering sounds during p-lock editing
   */
  setAuditionCallback(callback: AuditionCallback | null): void {
    this.auditionCallback = callback;
  }

  /**
   * Trigger audition for the currently edited step
   */
  triggerAudition(): void {
    if (this.editState.isActive && this.auditionCallback) {
      this.auditionCallback(this.editState.trackId, this.editState.stepIndex);
    }
  }

  // ============================================
  // Latched State Management (used during playback)
  // ============================================

  /**
   * Initialize latched state for a track
   */
  initTrackLatchedState(trackId: string): void {
    if (!this.trackLatchedStates.has(trackId)) {
      this.trackLatchedStates.set(trackId, {
        latchedParams: {},
        lastTrigStep: -1,
      });
    }
  }

  /**
   * Get latched state for a track
   */
  getTrackLatchedState(trackId: string): TrackLatchedState | null {
    return this.trackLatchedStates.get(trackId) ?? null;
  }

  /**
   * Update latched params when a step triggers
   * This implements the Elektron-style "latch until next trig" behavior
   *
   * @param trackId - The track that triggered
   * @param stepIndex - The step that triggered
   * @param stepParamLocks - P-locks on this step (if any)
   * @param hasParamLocks - Whether this step has any p-locks
   */
  updateLatchedParams(
    trackId: string,
    stepIndex: number,
    stepParamLocks: ParamLocks | undefined,
    hasParamLocks: boolean
  ): ParamLocks {
    this.initTrackLatchedState(trackId);
    const latchedState = this.trackLatchedStates.get(trackId)!;

    if (hasParamLocks && stepParamLocks) {
      // Step has p-locks: REPLACE latched state with this step's p-locks
      // Each trig's p-locks are independent - they don't carry over from previous trigs
      // This matches Elektron behavior where each step defines its own sound
      latchedState.latchedParams = { ...stepParamLocks };
    } else {
      // Step has no p-locks: clear latched params
      // This returns the voice to "normal" (base + modulation) behavior
      latchedState.latchedParams = {};
    }

    latchedState.lastTrigStep = stepIndex;
    return { ...latchedState.latchedParams };
  }

  /**
   * Get current latched params for a track (for use between trigs)
   */
  getLatchedParams(trackId: string): ParamLocks {
    return { ...(this.trackLatchedStates.get(trackId)?.latchedParams ?? {}) };
  }

  /**
   * Clear latched params for a track (e.g., on stop)
   */
  clearLatchedParams(trackId: string): void {
    const latchedState = this.trackLatchedStates.get(trackId);
    if (latchedState) {
      latchedState.latchedParams = {};
      latchedState.lastTrigStep = -1;
    }
  }

  /**
   * Clear all latched params (e.g., on stop)
   */
  clearAllLatchedParams(): void {
    for (const trackId of this.trackLatchedStates.keys()) {
      this.clearLatchedParams(trackId);
    }
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.exitEditMode();
    this.clearAllLatchedParams();
  }

  // ============================================
  // Parameter Routing Helpers
  // ============================================

  /**
   * Check if a parameter change should go to step p-locks or base params
   * Returns the step index if should go to p-locks, or -1 if should go to base params
   */
  shouldRouteToStepLocks(trackId: string): number {
    if (this.editState.isActive && this.editState.trackId === trackId) {
      return this.editState.stepIndex;
    }
    return -1;
  }
}

// Export singleton instance
export const paramLockManager = new ParamLockManager();

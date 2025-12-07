/**
 * GrooveboxEngine - Main audio engine controller
 *
 * Provides the public API for the groovebox, coordinating the clock,
 * sequencer, voices, and effects.
 */

import { MasterClock, type TickEvent } from './MasterClock';
import { Sequencer, type Track, type StepParams, type TriggerEvent, type Pattern, type TrackPerformance, type TrackClockConfig, type SlotFXConfig } from './Sequencer';
import { VoiceManager, type VoiceType, type TrackVoiceConfig } from '../voices/VoiceManager';
import { Mixer, type ChannelParams, type MixerState } from '../fx/Mixer';
import type { MimeophonParams } from '../fx/Mimeophon';
import type { ReverbParams } from '../fx/Reverb';
import type { MasterBusParams } from '../fx/MasterBus';
import type { FMDrumParams } from '../voices/FMDrumVoice';
import type { FMMelodicParams } from '../voices/FMMelodicVoice';
import type { NoiseVoiceParams } from '../voices/NoiseVoice';
import type { SampleVoiceParams } from '../voices/SampleVoice';
import type { OceanVoiceParams } from '../voices/OceanVoice';
import { PlaitsVoice } from '../voices/PlaitsVoice';
import type { ScaleConfig } from '../music/Scale';
import {
  generateBassline,
  getBasslineStyles,
  type BasslineStyle,
  type BasslineConfig,
  type GeneratedBassline
} from '../music/BasslineGenerator';
import {
  LFOManager,
  ModMatrix,
  Randomizer,
  EnvelopeModulatorManager,
  MOD_PRESETS,
  type LFOParams,
  type LFOManagerState,
  type ModRoute,
  type ModMatrixState,
  type RandomIntensity,
  type MicroJitterConfig,
  type EnvelopeModulatorParams
} from '../mod';
import {
  paramLockManager,
  type ParamLockEditState,
  type ParamLocks,
  type ParamLockEditCallback
} from './ParamLockManager';
import { WAVRecorder, type RecorderState } from '../recording/WAVRecorder';
import {
  PRESET_VERSION,
  generatePresetName,
  type PresetState,
  type SerializedTrack,
  type SerializedPattern,
  type SerializedVoiceConfig,
  type SerializedChannelParams,
  type SlowRandomParams,
  type FXCrossSends,
  createDefaultFXCrossSends,
  createDefaultSlowRandomParams,
} from '../preset';

export type EngineState = 'uninitialized' | 'initializing' | 'ready' | 'running' | 'stopped';

export interface EngineConfig {
  bpm: number;
  swing: number;
  ppqn: number;
}

export class GrooveboxEngine {
  private audioContext: AudioContext | null = null;
  private clock: MasterClock | null = null;
  private sequencer: Sequencer | null = null;
  private voiceManager: VoiceManager | null = null;
  private mixer: Mixer | null = null;
  private _state: EngineState = 'uninitialized';
  private _bpm = 120;
  private _swing = 0;
  private _ppqn = 96;

  // Simple click oscillator for testing
  private clickGain: GainNode | null = null;

  // Modulation system
  private lfoManager: LFOManager | null = null;
  private envelopeManager: EnvelopeModulatorManager | null = null;
  private modMatrix: ModMatrix | null = null;
  private randomizer: Randomizer | null = null;

  // Recording
  private recorder: WAVRecorder | null = null;
  private recorderListeners: Set<(state: RecorderState) => void> = new Set();

  // Step clipboard for copy/paste functionality
  private stepClipboard: StepParams | null = null;
  private clipboardListeners: Set<(hasData: boolean) => void> = new Set();

  // State change listeners
  private stateListeners: Set<(state: EngineState) => void> = new Set();
  private tickListeners: Set<(event: TickEvent) => void> = new Set();

  get state(): EngineState {
    return this._state;
  }

  get bpm(): number {
    return this._bpm;
  }

  set bpm(value: number) {
    this._bpm = Math.max(20, Math.min(300, value));
    if (this.clock) {
      this.clock.bpm = this._bpm;
    }
    if (this.mixer) {
      this.mixer.setBpm(this._bpm);
    }
    if (this.lfoManager) {
      this.lfoManager.setBpm(this._bpm);
    }
    if (this.envelopeManager) {
      this.envelopeManager.setBpm(this._bpm);
    }
  }

  get swing(): number {
    return this._swing;
  }

  set swing(value: number) {
    this._swing = Math.max(0, Math.min(1, value));
    if (this.clock) {
      this.clock.swing = this._swing;
    }
  }

  get currentTime(): number {
    return this.audioContext?.currentTime ?? 0;
  }

  async init(): Promise<void> {
    // If already initialized or running, just return
    if (this._state === 'ready' || this._state === 'running' || this._state === 'stopped') {
      return;
    }

    // If currently initializing, wait a bit
    if (this._state === 'initializing') {
      return;
    }

    this.setEngineState('initializing');

    try {
      // Create audio context
      this.audioContext = new AudioContext();

      // Create click gain node for testing
      this.clickGain = this.audioContext.createGain();
      this.clickGain.gain.value = 0.3;
      this.clickGain.connect(this.audioContext.destination);

      // Create and initialize clock
      this.clock = new MasterClock(this.audioContext);
      await this.clock.init();
      this.clock.bpm = this._bpm;
      this.clock.swing = this._swing;

      // Forward tick events
      this.clock.onTick((event) => {
        for (const listener of this.tickListeners) {
          listener(event);
        }
      });

      // Create sequencer
      this.sequencer = new Sequencer(this.clock);

      // Create mixer (handles FX routing to destination)
      this.mixer = new Mixer(this.audioContext);
      this.mixer.setBpm(this._bpm);

      // Register filter worklet processors
      const base = import.meta.env.BASE_URL || '/';
      try {
        await this.audioContext.audioWorklet.addModule(`${base}filter-processors.js`);
        console.log('[Engine] Filter worklet processors registered');
        // Initialize filter worklets for existing channels
        await this.mixer.initFilterWorklets();
      } catch (error) {
        console.error('[Engine] Failed to register filter worklet processors:', error);
      }

      // Create voice manager (routes through mixer)
      this.voiceManager = new VoiceManager(
        this.audioContext,
        (trackId, callback) => this.onTrigger(trackId, callback),
        this.audioContext.destination
      );

      // Connect voice manager to mixer for FX routing
      this.voiceManager.setMixer(this.mixer);

      // Create modulation system
      this.lfoManager = new LFOManager();
      this.lfoManager.setBpm(this._bpm);
      this.envelopeManager = new EnvelopeModulatorManager();
      this.envelopeManager.setBpm(this._bpm);
      this.modMatrix = new ModMatrix(this.lfoManager, this.envelopeManager);
      this.randomizer = new Randomizer();

      // Connect mod matrix to voice manager for per-trigger modulation
      this.voiceManager.setModMatrix(this.modMatrix);

      // Initialize Plaits/woscillators (Mutable Instruments synthesis)
      try {
        await PlaitsVoice.loadWoscillators(this.audioContext);
        console.log('[Engine] Plaits woscillators initialized');
      } catch (error) {
        console.warn('[Engine] Failed to initialize Plaits woscillators:', error);
        // Non-fatal - Plaits voices will show warning when triggered
      }

      this.setEngineState('ready');
    } catch (error) {
      this.setEngineState('uninitialized');
      throw error;
    }
  }

  private setEngineState(state: EngineState): void {
    this._state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  onStateChange(callback: (state: EngineState) => void): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  onTick(callback: (event: TickEvent) => void): () => void {
    this.tickListeners.add(callback);
    return () => this.tickListeners.delete(callback);
  }

  async start(): Promise<void> {
    if (this._state === 'uninitialized') {
      await this.init();
    }

    if (this._state !== 'ready' && this._state !== 'stopped') {
      throw new Error(`Cannot start from state: ${this._state}`);
    }

    // Resume audio context if suspended (required by browsers)
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.sequencer?.start();
    this.clock?.start();
    this.setEngineState('running');
  }

  stop(): void {
    if (this._state !== 'running') return;

    this.clock?.stop();
    this.sequencer?.stop();
    // Clear latched p-lock params on stop
    paramLockManager.clearAllLatchedParams();
    this.setEngineState('stopped');
  }

  pause(): void {
    if (this._state !== 'running') return;

    this.clock?.pause();
    this.setEngineState('stopped');
  }

  resume(): void {
    if (this._state !== 'stopped') return;

    this.clock?.resume();
    this.setEngineState('running');
  }

  // Track management

  createTrack(id: string, name: string): Track | null {
    return this.sequencer?.createTrack(id, name) ?? null;
  }

  getTrack(id: string): Track | undefined {
    return this.sequencer?.getTrack(id);
  }

  getAllTracks(): Track[] {
    return this.sequencer?.getAllTracks() ?? [];
  }

  deleteTrack(id: string): void {
    this.sequencer?.deleteTrack(id);
  }

  // Step manipulation

  setTrackStep(trackId: string, stepIndex: number, params: Partial<StepParams>): boolean {
    return this.sequencer?.setStep(trackId, stepIndex, params) ?? false;
  }

  getTrackStep(trackId: string, stepIndex: number): StepParams | null {
    return this.sequencer?.getStep(trackId, stepIndex) ?? null;
  }

  toggleTrackStep(trackId: string, stepIndex: number): boolean {
    return this.sequencer?.toggleStep(trackId, stepIndex) ?? false;
  }

  // Parameter Lock (P-Lock) System - Elektron-style parameter locking

  /**
   * Enter p-lock edit mode for a specific step
   * While in this mode, parameter changes will be stored as step p-locks
   */
  enterParamLockEditMode(trackId: string, stepIndex: number): void {
    paramLockManager.enterEditMode(trackId, stepIndex);
    // Initialize the step's paramLocks if needed
    const step = this.getTrackStep(trackId, stepIndex);
    if (step && !step.paramLocks) {
      this.setTrackStep(trackId, stepIndex, { paramLocks: {}, hasParamLocks: false });
    }
  }

  /**
   * Exit p-lock edit mode
   */
  exitParamLockEditMode(): void {
    paramLockManager.exitEditMode();
  }

  /**
   * Toggle p-lock edit mode for a step
   * Returns true if now in edit mode, false if exited
   */
  toggleParamLockEditMode(trackId: string, stepIndex: number): boolean {
    return paramLockManager.toggleEditMode(trackId, stepIndex);
  }

  /**
   * Get current p-lock edit state
   */
  getParamLockEditState(): ParamLockEditState {
    return paramLockManager.getEditState();
  }

  /**
   * Check if a specific step is in p-lock edit mode
   */
  isStepInParamLockEditMode(trackId: string, stepIndex: number): boolean {
    return paramLockManager.isEditing(trackId, stepIndex);
  }

  /**
   * Subscribe to p-lock edit state changes
   */
  onParamLockEditStateChange(callback: ParamLockEditCallback): () => void {
    return paramLockManager.onEditStateChange(callback);
  }

  /**
   * Set a parameter lock on a step
   * This stores the parameter value as a p-lock that will be applied when the step triggers
   */
  setStepParamLock(trackId: string, stepIndex: number, paramId: string, value: number): boolean {
    const step = this.getTrackStep(trackId, stepIndex);
    if (!step) return false;

    const paramLocks = { ...(step.paramLocks ?? {}), [paramId]: value };
    const hasParamLocks = Object.keys(paramLocks).length > 0;

    return this.setTrackStep(trackId, stepIndex, { paramLocks, hasParamLocks });
  }

  /**
   * Remove a parameter lock from a step
   */
  removeStepParamLock(trackId: string, stepIndex: number, paramId: string): boolean {
    const step = this.getTrackStep(trackId, stepIndex);
    if (!step || !step.paramLocks) return false;

    const paramLocks = { ...step.paramLocks };
    delete paramLocks[paramId];
    const hasParamLocks = Object.keys(paramLocks).length > 0;

    return this.setTrackStep(trackId, stepIndex, {
      paramLocks: hasParamLocks ? paramLocks : undefined,
      hasParamLocks
    });
  }

  /**
   * Clear all parameter locks from a step
   */
  clearStepParamLocks(trackId: string, stepIndex: number): boolean {
    return this.setTrackStep(trackId, stepIndex, { paramLocks: undefined, hasParamLocks: false });
  }

  /**
   * Get all parameter locks for a step
   */
  getStepParamLocks(trackId: string, stepIndex: number): ParamLocks | null {
    const step = this.getTrackStep(trackId, stepIndex);
    return step?.paramLocks ?? null;
  }

  /**
   * Check if a step has any parameter locks
   */
  stepHasParamLocks(trackId: string, stepIndex: number): boolean {
    const step = this.getTrackStep(trackId, stepIndex);
    return step?.hasParamLocks === true;
  }

  /**
   * Update a parameter, routing to either base params or step p-locks
   * based on whether p-lock edit mode is active
   *
   * This is the main entry point for parameter changes from the UI
   * when the p-lock system is being used
   */
  updateParameterWithPLockRouting(
    trackId: string,
    paramId: string,
    value: number,
    updateBaseParam: () => void
  ): void {
    const editState = paramLockManager.getEditState();

    if (editState.isActive && editState.trackId === trackId) {
      // In p-lock edit mode for this track - store as step p-lock
      this.setStepParamLock(trackId, editState.stepIndex, paramId, value);
    } else {
      // Not in p-lock edit mode - update base parameter
      updateBaseParam();
    }
  }

  /**
   * Trigger audition for the step currently in p-lock edit mode
   * This allows hearing changes while editing p-locks
   */
  triggerParamLockAudition(): void {
    const editState = paramLockManager.getEditState();
    if (!editState.isActive) return;

    const step = this.getTrackStep(editState.trackId, editState.stepIndex);
    if (!step) return;

    // Trigger the voice with the step's current p-locks
    const time = this.currentTime + 0.01; // Small offset to avoid scheduling issues
    const event: TriggerEvent = {
      trackId: editState.trackId,
      time,
      velocity: step.velocity,
      step: editState.stepIndex,
      isRatchet: false,
      ratchetIndex: 0,
      note: step.note,
      paramLocks: step.paramLocks,
      latchedParams: step.paramLocks, // Use step p-locks as latched for audition
    };

    // Get the trigger callbacks for this track and call them
    const callbacks = this.sequencer?.['triggerCallbacks']?.get(editState.trackId);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(event);
      }
    }
  }

  // Step Copy/Paste - copies step with all data including p-locks as independent copy

  /**
   * Copy a step to the clipboard (deep copy - creates independent data)
   * The copied step can be pasted to any step in any track
   */
  copyStep(trackId: string, stepIndex: number): boolean {
    const step = this.getTrackStep(trackId, stepIndex);
    if (!step) return false;

    // Deep copy the step - ensure paramLocks is a new object to avoid reference sharing
    this.stepClipboard = {
      ...step,
      paramLocks: step.paramLocks ? { ...step.paramLocks } : undefined,
      condition: step.condition ? { ...step.condition } : undefined,
    };

    // Notify listeners
    for (const listener of this.clipboardListeners) {
      listener(true);
    }

    return true;
  }

  /**
   * Paste the clipboard step to a target step
   * Creates an independent copy - modifying the pasted step won't affect the source
   */
  pasteStep(trackId: string, stepIndex: number): boolean {
    if (!this.stepClipboard) return false;

    // Deep copy from clipboard to ensure independence
    const pasteData: Partial<StepParams> = {
      trigger: this.stepClipboard.trigger,
      velocity: this.stepClipboard.velocity,
      microTime: this.stepClipboard.microTime,
      probability: this.stepClipboard.probability,
      ratchets: this.stepClipboard.ratchets,
      note: this.stepClipboard.note,
      condition: this.stepClipboard.condition ? { ...this.stepClipboard.condition } : undefined,
      paramLocks: this.stepClipboard.paramLocks ? { ...this.stepClipboard.paramLocks } : undefined,
      hasParamLocks: this.stepClipboard.hasParamLocks,
    };

    return this.setTrackStep(trackId, stepIndex, pasteData);
  }

  /**
   * Check if there's data in the clipboard
   */
  hasStepInClipboard(): boolean {
    return this.stepClipboard !== null;
  }

  /**
   * Get the current clipboard content (for preview purposes)
   * Returns a copy to prevent modification
   */
  getClipboardStep(): StepParams | null {
    if (!this.stepClipboard) return null;
    return {
      ...this.stepClipboard,
      paramLocks: this.stepClipboard.paramLocks ? { ...this.stepClipboard.paramLocks } : undefined,
      condition: this.stepClipboard.condition ? { ...this.stepClipboard.condition } : undefined,
    };
  }

  /**
   * Clear the clipboard
   */
  clearClipboard(): void {
    this.stepClipboard = null;
    for (const listener of this.clipboardListeners) {
      listener(false);
    }
  }

  /**
   * Subscribe to clipboard state changes
   */
  onClipboardChange(callback: (hasData: boolean) => void): () => void {
    this.clipboardListeners.add(callback);
    // Immediately notify of current state
    callback(this.stepClipboard !== null);
    return () => this.clipboardListeners.delete(callback);
  }

  // Pattern management

  getCurrentPattern(trackId: string): Pattern | null {
    return this.sequencer?.getCurrentPattern(trackId) ?? null;
  }

  setPatternLength(trackId: string, length: number): boolean {
    return this.sequencer?.setPatternLength(trackId, length) ?? false;
  }

  setPatternDivision(trackId: string, division: number): boolean {
    return this.sequencer?.setPatternDivision(trackId, division) ?? false;
  }

  /**
   * Get the current step position for a specific track
   * This is the actual sequencer position, accounting for track-specific divisions
   */
  getTrackStepPosition(trackId: string): number {
    return this.sequencer?.getTrackStepPosition(trackId) ?? 0;
  }

  // ============================================
  // Pattern Bank System (16 patterns)
  // ============================================

  /**
   * Get the currently active pattern bank slot (1-16)
   */
  getActivePatternSlot(): number {
    return this.sequencer?.getActivePatternSlot() ?? 1;
  }

  /**
   * Set the active pattern bank slot and switch all tracks to that pattern
   * This also saves current voice/channel/performance state to the current slot
   * and applies the state from the new slot
   */
  setActivePatternSlot(slot: number): boolean {
    if (!this.sequencer) return false;

    const currentSlot = this.sequencer.getActivePatternSlot();
    if (slot === currentSlot) return true; // Already on this slot

    // 1. Capture current state to the current slot before switching
    this.captureCurrentSlotState();

    // 2. Switch the pattern slot in the sequencer
    const success = this.sequencer.setActivePatternSlot(slot);
    if (!success) return false;

    // 3. Apply state from the new slot (if it has stored configs)
    this.applySlotState(slot);

    return true;
  }

  /**
   * Capture current voice, channel, and performance state to the current slot
   * Called before switching patterns to preserve the current state
   */
  private captureCurrentSlotState(): void {
    if (!this.sequencer || !this.voiceManager || !this.mixer) return;

    const currentSlot = this.sequencer.getActivePatternSlot();
    const tracks = this.sequencer.getAllTracks();

    for (const track of tracks) {
      // Capture voice config
      const voiceConfig = this.voiceManager.getVoiceConfig(track.id);
      if (voiceConfig) {
        this.sequencer.setSlotVoiceConfig(currentSlot, track.id, {
          voiceType: voiceConfig.voiceType,
          preset: voiceConfig.preset,
          params: voiceConfig.params as Record<string, unknown> | undefined,
          note: voiceConfig.note,
        });
      }

      // Capture channel config
      const channelParams = this.mixer.getChannelParams(track.id);
      if (channelParams) {
        this.sequencer.setSlotChannelConfig(currentSlot, track.id, {
          filter: channelParams.filter,
          saturation: channelParams.saturation,
          delaySend: channelParams.delaySend,
          delaySend2: channelParams.delaySend2,
          delaySend3: channelParams.delaySend3,
          delaySend4: channelParams.delaySend4,
          reverbSend: channelParams.reverbSend,
          volume: channelParams.volume,
          pan: channelParams.pan,
        });
      }

      // Capture performance config
      this.sequencer.setSlotPerformanceConfig(currentSlot, track.id, {
        performance: { ...track.performance },
        clockConfig: { ...track.clockConfig },
      });
    }

    // Capture FX config
    this.captureSlotFXConfig(currentSlot);
  }

  /**
   * Apply voice, channel, and performance state from a slot
   * Called after switching patterns to restore the slot's state
   * If the slot has no stored configs, inherit from current state (first visit)
   */
  private applySlotState(slot: number): void {
    if (!this.sequencer || !this.voiceManager || !this.mixer) return;

    const tracks = this.sequencer.getAllTracks();

    // Check if this slot has any stored configs
    // If not, this is the first visit - the current state becomes this slot's state
    if (!this.sequencer.slotHasVoiceConfigs(slot)) {
      // First visit to this slot - capture current state as this slot's initial state
      this.captureSlotStateFromCurrent(slot);
      return; // No need to apply - we just inherited current state
    }

    // Apply stored configs from the slot
    for (const track of tracks) {
      // Apply voice config
      const voiceConfig = this.sequencer.getSlotVoiceConfig(slot, track.id);
      if (voiceConfig) {
        this.voiceManager.assignVoice({
          trackId: track.id,
          voiceType: voiceConfig.voiceType as VoiceType,
          preset: voiceConfig.preset,
          params: voiceConfig.params,
        });
        if (voiceConfig.note !== undefined) {
          this.voiceManager.setTrackNote(track.id, voiceConfig.note);
        }
      }

      // Apply channel config
      const channelConfig = this.sequencer.getSlotChannelConfig(slot, track.id);
      if (channelConfig) {
        this.mixer.updateChannel(track.id, {
          filter: channelConfig.filter as ChannelParams['filter'],
          saturation: channelConfig.saturation as ChannelParams['saturation'],
          delaySend: channelConfig.delaySend,
          delaySend2: channelConfig.delaySend2,
          delaySend3: channelConfig.delaySend3,
          delaySend4: channelConfig.delaySend4,
          reverbSend: channelConfig.reverbSend,
          volume: channelConfig.volume,
          pan: channelConfig.pan,
        });
      }

      // Apply performance config
      const perfConfig = this.sequencer.getSlotPerformanceConfig(slot, track.id);
      if (perfConfig) {
        this.sequencer.setTrackDrift(track.id, perfConfig.performance.drift);
        this.sequencer.setTrackFill(track.id, perfConfig.performance.fill);
        if (perfConfig.performance.octaveRange !== undefined) {
          this.sequencer.setTrackOctave(track.id, perfConfig.performance.octaveRange);
        }
        this.sequencer.setTrackClockConfig(track.id, perfConfig.clockConfig);
      }
    }

    // Apply FX config
    this.applySlotFXConfig(slot);
  }

  /**
   * Apply FX state from a slot
   */
  private applySlotFXConfig(slot: number): void {
    if (!this.sequencer || !this.mixer) return;

    const fxConfig = this.sequencer.getSlotFXConfig(slot);
    if (!fxConfig) return;

    // Apply Mimeophon 1
    this.mixer.setMimeophonParams(fxConfig.mimeophon1);

    // Apply Mimeophon 2
    this.mixer.setMimeophonParams2(fxConfig.mimeophon2);

    // Apply Mimeophon 3
    this.mixer.setMimeophonParams3(fxConfig.mimeophon3);

    // Apply Mimeophon 4
    this.mixer.setMimeophonParams4(fxConfig.mimeophon4);

    // Apply Reverb
    this.mixer.setReverbParams(fxConfig.reverb);

    // Apply Master
    this.mixer.setMasterParams(fxConfig.master);

    // Apply return levels
    this.mixer.setMimeophonReturnLevel(fxConfig.returnLevels.mimeophon1);
    this.mixer.setMimeophonReturnLevel2(fxConfig.returnLevels.mimeophon2);
    this.mixer.setMimeophonReturnLevel3(fxConfig.returnLevels.mimeophon3);
    this.mixer.setMimeophonReturnLevel4(fxConfig.returnLevels.mimeophon4);
    this.mixer.setReverbReturnLevel(fxConfig.returnLevels.reverb);

    // Apply cross-sends
    this.mixer.setFXCrossSends(fxConfig.crossSends);
  }

  /**
   * Capture current state as a slot's initial state (for first-time slot visits)
   */
  private captureSlotStateFromCurrent(slot: number): void {
    if (!this.sequencer || !this.voiceManager || !this.mixer) return;

    const tracks = this.sequencer.getAllTracks();

    for (const track of tracks) {
      // Capture voice config
      const voiceConfig = this.voiceManager.getVoiceConfig(track.id);
      if (voiceConfig) {
        this.sequencer.setSlotVoiceConfig(slot, track.id, {
          voiceType: voiceConfig.voiceType,
          preset: voiceConfig.preset,
          params: voiceConfig.params as Record<string, unknown> | undefined,
          note: voiceConfig.note,
        });
      }

      // Capture channel config
      const channelParams = this.mixer.getChannelParams(track.id);
      if (channelParams) {
        this.sequencer.setSlotChannelConfig(slot, track.id, {
          filter: channelParams.filter,
          saturation: channelParams.saturation,
          delaySend: channelParams.delaySend,
          delaySend2: channelParams.delaySend2,
          delaySend3: channelParams.delaySend3,
          delaySend4: channelParams.delaySend4,
          reverbSend: channelParams.reverbSend,
          volume: channelParams.volume,
          pan: channelParams.pan,
        });
      }

      // Capture performance config
      this.sequencer.setSlotPerformanceConfig(slot, track.id, {
        performance: { ...track.performance },
        clockConfig: { ...track.clockConfig },
      });
    }

    // Capture FX config
    this.captureSlotFXConfig(slot);
  }

  /**
   * Capture current FX state to a slot
   */
  private captureSlotFXConfig(slot: number): void {
    if (!this.sequencer || !this.mixer) return;

    const mim1 = this.mixer.getMimeophon().getParams();
    const mim2 = this.mixer.getMimeophon2().getParams();
    const mim3 = this.mixer.getMimeophon3().getParams();
    const mim4 = this.mixer.getMimeophon4().getParams();
    const reverb = this.mixer.getReverb().getParams();
    const master = this.mixer.getMasterBus().getParams();
    const crossSends = this.mixer.getFXCrossSends();

    const fxConfig: SlotFXConfig = {
      mimeophon1: { ...mim1 },
      mimeophon2: { ...mim2 },
      mimeophon3: { ...mim3 },
      mimeophon4: { ...mim4 },
      reverb: { ...reverb },
      master: { ...master },
      returnLevels: {
        mimeophon1: this.mixer.getMimeophonReturnLevel(),
        mimeophon2: this.mixer.getMimeophonReturnLevel2(),
        mimeophon3: this.mixer.getMimeophonReturnLevel3(),
        mimeophon4: this.mixer.getMimeophonReturnLevel4(),
        reverb: this.mixer.getReverbReturnLevel(),
      },
      crossSends: { ...crossSends },
    };

    this.sequencer.setSlotFXConfig(slot, fxConfig);
  }

  /**
   * Subscribe to pattern slot changes
   */
  onPatternSlotChange(callback: (slot: number) => void): () => void {
    return this.sequencer?.onPatternSlotChange(callback) ?? (() => {});
  }

  /**
   * Check if a pattern slot is empty (no tracks have triggers)
   */
  isPatternSlotEmpty(slot: number): boolean {
    return this.sequencer?.isPatternSlotEmpty(slot) ?? true;
  }

  /**
   * Clear a pattern slot (reset all track patterns to empty)
   */
  clearPatternSlot(slot: number): boolean {
    return this.sequencer?.clearPatternSlot(slot) ?? false;
  }

  /**
   * Copy pattern slot to clipboard
   * @param slot Source pattern slot (1-16)
   * @param mode 'engines' = copy track config only, 'all' = copy everything including trigs
   */
  copyPatternSlot(slot: number, mode: 'engines' | 'all'): boolean {
    if (!this.sequencer) return false;

    const currentSlot = this.sequencer.getActivePatternSlot();

    // If copying from the current slot, use live state
    // If copying from a different slot, use stored slot configs
    const getVoiceConfig = (trackId: string) => {
      if (slot === currentSlot) {
        // Use live state
        const config = this.voiceManager?.getVoiceConfig(trackId);
        if (!config) return null;
        return {
          voiceType: config.voiceType,
          preset: config.preset,
          params: config.params as Record<string, unknown> | undefined,
          note: config.note,
        };
      } else {
        // Use stored slot config
        const slotConfig = this.sequencer!.getSlotVoiceConfig(slot, trackId);
        if (!slotConfig) {
          // Fall back to live state if no stored config
          const config = this.voiceManager?.getVoiceConfig(trackId);
          if (!config) return null;
          return {
            voiceType: config.voiceType,
            preset: config.preset,
            params: config.params as Record<string, unknown> | undefined,
            note: config.note,
          };
        }
        return slotConfig;
      }
    };

    const getChannelConfig = (trackId: string) => {
      if (slot === currentSlot) {
        // Use live state
        const params = this.mixer?.getChannelParams(trackId);
        if (!params) return null;
        return {
          filter: params.filter,
          saturation: params.saturation,
          delaySend: params.delaySend,
          delaySend2: params.delaySend2,
          delaySend3: params.delaySend3,
          delaySend4: params.delaySend4,
          reverbSend: params.reverbSend,
          volume: params.volume,
          pan: params.pan,
        };
      } else {
        // Use stored slot config
        const slotConfig = this.sequencer!.getSlotChannelConfig(slot, trackId);
        if (!slotConfig) {
          // Fall back to live state if no stored config
          const params = this.mixer?.getChannelParams(trackId);
          if (!params) return null;
          return {
            filter: params.filter,
            saturation: params.saturation,
            delaySend: params.delaySend,
            delaySend2: params.delaySend2,
            delaySend3: params.delaySend3,
            delaySend4: params.delaySend4,
            reverbSend: params.reverbSend,
            volume: params.volume,
            pan: params.pan,
          };
        }
        return slotConfig;
      }
    };

    return this.sequencer.copyPatternSlot(slot, mode, getVoiceConfig, getChannelConfig);
  }

  /**
   * Paste pattern data from clipboard to a slot
   */
  pastePatternSlot(slot: number): boolean {
    if (!this.sequencer) return false;

    const currentSlot = this.sequencer.getActivePatternSlot();
    const isActiveSlot = slot === currentSlot;

    const success = this.sequencer.pastePatternSlot(
      slot,
      (trackId, config) => {
        // Save to target slot's storage
        this.sequencer!.setSlotVoiceConfig(slot, trackId, {
          voiceType: config.voiceType,
          preset: config.preset,
          params: config.params,
          note: config.note,
        });

        // If pasting to active slot, also apply to live state
        if (isActiveSlot) {
          this.voiceManager?.assignVoice({
            trackId,
            voiceType: config.voiceType as VoiceType,
            preset: config.preset,
            params: config.params,
          });
          if (config.note !== undefined) {
            this.voiceManager?.setTrackNote(trackId, config.note);
          }
        }
      },
      (trackId, params) => {
        // Save to target slot's storage
        this.sequencer!.setSlotChannelConfig(slot, trackId, {
          filter: params.filter,
          saturation: params.saturation,
          delaySend: params.delaySend,
          delaySend2: params.delaySend2,
          delaySend3: params.delaySend3,
          delaySend4: params.delaySend4,
          reverbSend: params.reverbSend,
          volume: params.volume,
          pan: params.pan,
        });

        // If pasting to active slot, also apply to live state
        if (isActiveSlot) {
          this.mixer?.updateChannel(trackId, {
            filter: params.filter as ChannelParams['filter'],
            saturation: params.saturation as ChannelParams['saturation'],
            delaySend: params.delaySend,
            delaySend2: params.delaySend2,
            delaySend3: params.delaySend3,
            delaySend4: params.delaySend4,
            reverbSend: params.reverbSend,
            volume: params.volume,
            pan: params.pan,
          });
        }
      }
    );

    return success;
  }

  /**
   * Check if there's pattern data in the clipboard
   */
  hasPatternClipboard(): boolean {
    return this.sequencer?.hasPatternClipboard() ?? false;
  }

  /**
   * Get the clipboard copy mode
   */
  getPatternClipboardMode(): 'engines' | 'all' | null {
    return this.sequencer?.getPatternClipboardMode() ?? null;
  }

  /**
   * Clear the pattern clipboard
   */
  clearPatternClipboard(): void {
    this.sequencer?.clearPatternClipboard();
  }

  /**
   * Get pattern for a specific slot and track
   */
  getPatternForSlot(trackId: string, slot: number): Pattern | null {
    return this.sequencer?.getPatternForSlot(trackId, slot) ?? null;
  }

  // ============================================
  // Pattern Sequencer (Arranger) System
  // ============================================

  /**
   * Enable or disable the pattern sequencer
   */
  setPatternSequencerEnabled(enabled: boolean): void {
    this.sequencer?.setPatternSequencerEnabled(enabled);
  }

  /**
   * Check if pattern sequencer is enabled
   */
  isPatternSequencerEnabled(): boolean {
    return this.sequencer?.isPatternSequencerEnabled() ?? false;
  }

  /**
   * Set a pattern sequencer cell
   * @param cellIndex Cell index (0-15)
   * @param patternSlot Pattern slot (1-16) or null to clear
   * @param cycles Number of cycles before advancing (1-16)
   */
  setPatternSequencerCell(cellIndex: number, patternSlot: number | null, cycles: number = 1): boolean {
    return this.sequencer?.setPatternSequencerCell(cellIndex, patternSlot, cycles) ?? false;
  }

  /**
   * Clear a pattern sequencer cell
   */
  clearPatternSequencerCell(cellIndex: number): boolean {
    return this.sequencer?.clearPatternSequencerCell(cellIndex) ?? false;
  }

  /**
   * Get a pattern sequencer cell
   */
  getPatternSequencerCell(cellIndex: number): import('./Sequencer').PatternSequencerCell | null {
    return this.sequencer?.getPatternSequencerCell(cellIndex) ?? null;
  }

  /**
   * Get all pattern sequencer cells
   */
  getPatternSequencerCells(): import('./Sequencer').PatternSequencerCell[] {
    return this.sequencer?.getPatternSequencerCells() ?? [];
  }

  /**
   * Get current pattern sequencer state
   */
  getPatternSequencerState(): import('./Sequencer').PatternSequencerState {
    return this.sequencer?.getPatternSequencerState() ?? {
      enabled: false,
      cells: Array(16).fill(null).map(() => ({ patternSlot: null, cycles: 1 })),
      currentCell: 0,
      cyclesRemaining: 0,
    };
  }

  /**
   * Subscribe to pattern sequencer state changes
   */
  onPatternSequencerChange(callback: (state: import('./Sequencer').PatternSequencerState) => void): () => void {
    return this.sequencer?.onPatternSequencerChange(callback) ?? (() => {});
  }

  /**
   * Reset pattern sequencer to beginning
   */
  resetPatternSequencer(): void {
    this.sequencer?.resetPatternSequencer();
  }

  /**
   * Clear all pattern sequencer cells
   */
  clearPatternSequencer(): void {
    this.sequencer?.clearPatternSequencer();
  }

  // Trigger callbacks (for connecting voices)

  onTrigger(trackId: string, callback: (event: TriggerEvent) => void): () => void {
    return this.sequencer?.onTrigger(trackId, callback) ?? (() => {});
  }

  // Voice management

  assignVoice(config: TrackVoiceConfig): void {
    this.voiceManager?.assignVoice(config);
    // Save to current slot
    this.saveVoiceConfigToCurrentSlot(config.trackId);
  }

  removeVoice(trackId: string): void {
    this.voiceManager?.removeVoice(trackId);
  }

  getVoiceConfig(trackId: string): TrackVoiceConfig | null {
    return this.voiceManager?.getVoiceConfig(trackId) ?? null;
  }

  /**
   * Get the voice instance for a track
   */
  getVoice(trackId: string) {
    return this.voiceManager?.getVoice(trackId) ?? null;
  }

  updateVoiceParams(
    trackId: string,
    params: Partial<FMDrumParams | FMMelodicParams | NoiseVoiceParams | SampleVoiceParams | OceanVoiceParams>
  ): void {
    this.voiceManager?.updateVoiceParams(trackId, params);
    // Save to current slot
    this.saveVoiceConfigToCurrentSlot(trackId);
  }

  loadVoicePreset(trackId: string, presetName: string): void {
    this.voiceManager?.loadPreset(trackId, presetName);
    // Save to current slot
    this.saveVoiceConfigToCurrentSlot(trackId);
  }

  setTrackNote(trackId: string, note: number): void {
    this.voiceManager?.setTrackNote(trackId, note);
    // Save to current slot
    this.saveVoiceConfigToCurrentSlot(trackId);
  }

  getVoicePresets(voiceType: VoiceType): string[] {
    return this.voiceManager?.getPresetsForType(voiceType) ?? [];
  }

  /**
   * Save the current voice config for a track to the current pattern slot
   */
  private saveVoiceConfigToCurrentSlot(trackId: string): void {
    if (!this.sequencer || !this.voiceManager) return;

    const currentSlot = this.sequencer.getActivePatternSlot();
    const voiceConfig = this.voiceManager.getVoiceConfig(trackId);

    if (voiceConfig) {
      this.sequencer.setSlotVoiceConfig(currentSlot, trackId, {
        voiceType: voiceConfig.voiceType,
        preset: voiceConfig.preset,
        params: voiceConfig.params as Record<string, unknown> | undefined,
        note: voiceConfig.note,
      });
    }
  }

  // Performance controls (drift, fill)

  setTrackDrift(trackId: string, drift: number): void {
    this.sequencer?.setTrackDrift(trackId, drift);
  }

  setTrackFill(trackId: string, fill: number): void {
    this.sequencer?.setTrackFill(trackId, fill);
  }

  setTrackOctave(trackId: string, octave: number): void {
    this.sequencer?.setTrackOctave(trackId, octave);
  }

  getTrackOctave(trackId: string): number | undefined {
    return this.sequencer?.getTrackOctave(trackId);
  }

  // Legacy per-track scale setter - now sets global scale
  setTrackScale(trackId: string, scale: ScaleConfig): void {
    this.sequencer?.setTrackScale(trackId, scale);
  }

  // Set global scale (preferred method)
  setGlobalScale(scale: ScaleConfig): void {
    this.sequencer?.setGlobalScale(scale);
  }

  getTrackPerformance(trackId: string): TrackPerformance | null {
    return this.sequencer?.getTrackPerformance(trackId) ?? null;
  }

  // Legacy per-track scale getter - now returns global scale
  getTrackScale(trackId: string): ScaleConfig | undefined {
    return this.sequencer?.getTrackScale(trackId);
  }

  // Get global scale (preferred method)
  getGlobalScale(): ScaleConfig | undefined {
    return this.sequencer?.getGlobalScale();
  }

  // Clock Division Controls

  /**
   * Set clock division config for a track
   */
  setTrackClockConfig(trackId: string, config: Partial<TrackClockConfig>): void {
    this.sequencer?.setTrackClockConfig(trackId, config);
  }

  /**
   * Get clock division config for a track
   */
  getTrackClockConfig(trackId: string): TrackClockConfig | null {
    return this.sequencer?.getTrackClockConfig(trackId) ?? null;
  }

  /**
   * Resync a single track's phase to the global clock (reset to step 0)
   */
  resyncTrack(trackId: string): void {
    this.sequencer?.resyncTrack(trackId);
  }

  /**
   * Resync all tracks to the global clock (hard reset to downbeat)
   */
  resyncAllTracks(): void {
    this.sequencer?.resyncAllTracks();
  }

  // FX & Mixing

  /**
   * Get channel parameters for a track
   */
  getChannelParams(trackId: string): ChannelParams | null {
    return this.mixer?.getChannelParams(trackId) ?? null;
  }

  /**
   * Update channel parameters for a track
   */
  updateChannelParams(trackId: string, params: Partial<ChannelParams>): void {
    this.mixer?.updateChannel(trackId, params);
    // Save to current slot
    this.saveChannelConfigToCurrentSlot(trackId);
    // Update base state so p-lock restoration uses the new values
    this.voiceManager?.captureBaseChannelState(trackId);
  }

  /**
   * Save the current channel config for a track to the current pattern slot
   */
  private saveChannelConfigToCurrentSlot(trackId: string): void {
    if (!this.sequencer || !this.mixer) return;

    const currentSlot = this.sequencer.getActivePatternSlot();
    const channelParams = this.mixer.getChannelParams(trackId);

    if (channelParams) {
      this.sequencer.setSlotChannelConfig(currentSlot, trackId, {
        filter: channelParams.filter,
        saturation: channelParams.saturation,
        delaySend: channelParams.delaySend,
        delaySend2: channelParams.delaySend2,
        delaySend3: channelParams.delaySend3,
        delaySend4: channelParams.delaySend4,
        reverbSend: channelParams.reverbSend,
        volume: channelParams.volume,
        pan: channelParams.pan,
      });
    }
  }

  /**
   * Capture base channel state for p-lock restoration
   * Should be called when channel params are modified outside of p-lock edit mode
   */
  captureBaseChannelState(trackId: string): void {
    this.voiceManager?.captureBaseChannelState(trackId);
  }

  /**
   * Restore mixer to base channel state for a track
   * Used when entering p-lock edit mode to reset the mixer to the base state
   */
  restoreToBaseChannelState(trackId: string): void {
    this.voiceManager?.restoreToBaseState(trackId);
  }

  /**
   * Get the base filter type for a track (what the filter should be when no p-locks are active)
   */
  getBaseFilterType(trackId: string): string {
    const baseState = this.voiceManager?.getBaseChannelState(trackId);
    return baseState?.filterType ?? 'bypass';
  }

  /**
   * Get mimeophon effect parameters
   */
  getMimeophonParams(): MimeophonParams | null {
    return this.mixer?.getMimeophon().getParams() ?? null;
  }

  /**
   * Get mimeophon 2 effect parameters
   */
  getMimeophonParams2(): MimeophonParams | null {
    return this.mixer?.getMimeophon2().getParams() ?? null;
  }

  /**
   * Get mimeophon 3 effect parameters
   */
  getMimeophonParams3(): MimeophonParams | null {
    return this.mixer?.getMimeophon3().getParams() ?? null;
  }

  /**
   * Get mimeophon 4 effect parameters
   */
  getMimeophonParams4(): MimeophonParams | null {
    return this.mixer?.getMimeophon4().getParams() ?? null;
  }

  /**
   * Update mimeophon effect parameters
   */
  setMimeophonParams(params: Partial<MimeophonParams>): void {
    this.mixer?.setMimeophonParams(params);
  }

  /**
   * Update mimeophon 2 effect parameters
   */
  setMimeophonParams2(params: Partial<MimeophonParams>): void {
    this.mixer?.setMimeophonParams2(params);
  }

  /**
   * Update mimeophon 3 effect parameters
   */
  setMimeophonParams3(params: Partial<MimeophonParams>): void {
    this.mixer?.setMimeophonParams3(params);
  }

  /**
   * Update mimeophon 4 effect parameters
   */
  setMimeophonParams4(params: Partial<MimeophonParams>): void {
    this.mixer?.setMimeophonParams4(params);
  }

  /**
   * Get reverb effect parameters
   */
  getReverbParams(): ReverbParams | null {
    return this.mixer?.getReverb().getParams() ?? null;
  }

  /**
   * Update reverb effect parameters
   */
  setReverbParams(params: Partial<ReverbParams>): void {
    this.mixer?.setReverbParams(params);
  }

  /**
   * Get master bus parameters
   */
  getMasterParams(): MasterBusParams | null {
    return this.mixer?.getMasterBus().getParams() ?? null;
  }

  /**
   * Update master bus parameters
   */
  setMasterParams(params: Partial<MasterBusParams>): void {
    this.mixer?.setMasterParams(params);
  }

  /**
   * Get mimeophon return level
   */
  getMimeophonReturnLevel(): number {
    return this.mixer?.getMimeophonReturnLevel() ?? 1;
  }

  /**
   * Get mimeophon 2 return level
   */
  getMimeophonReturnLevel2(): number {
    return this.mixer?.getMimeophonReturnLevel2() ?? 1;
  }

  /**
   * Get mimeophon 3 return level
   */
  getMimeophonReturnLevel3(): number {
    return this.mixer?.getMimeophonReturnLevel3() ?? 1;
  }

  /**
   * Get mimeophon 4 return level
   */
  getMimeophonReturnLevel4(): number {
    return this.mixer?.getMimeophonReturnLevel4() ?? 1;
  }

  /**
   * Set mimeophon return level
   */
  setMimeophonReturnLevel(level: number): void {
    this.mixer?.setMimeophonReturnLevel(level);
  }

  /**
   * Set mimeophon 2 return level
   */
  setMimeophonReturnLevel2(level: number): void {
    this.mixer?.setMimeophonReturnLevel2(level);
  }

  /**
   * Set mimeophon 3 return level
   */
  setMimeophonReturnLevel3(level: number): void {
    this.mixer?.setMimeophonReturnLevel3(level);
  }

  /**
   * Set mimeophon 4 return level
   */
  setMimeophonReturnLevel4(level: number): void {
    this.mixer?.setMimeophonReturnLevel4(level);
  }

  /**
   * Get reverb return level
   */
  getReverbReturnLevel(): number {
    return this.mixer?.getReverbReturnLevel() ?? 1;
  }

  /**
   * Set reverb return level
   */
  setReverbReturnLevel(level: number): void {
    this.mixer?.setReverbReturnLevel(level);
  }

  /**
   * Get FX cross-send levels
   */
  getFXCrossSends(): import('../fx/Mixer').FXCrossSends {
    return this.mixer?.getFXCrossSends() ?? {
      mim1ToMim2: 0, mim1ToMim3: 0, mim1ToMim4: 0, mim1ToReverb: 0,
      mim2ToMim1: 0, mim2ToMim3: 0, mim2ToMim4: 0, mim2ToReverb: 0,
      mim3ToMim1: 0, mim3ToMim2: 0, mim3ToMim4: 0, mim3ToReverb: 0,
      mim4ToMim1: 0, mim4ToMim2: 0, mim4ToMim3: 0, mim4ToReverb: 0,
      reverbToMim1: 0, reverbToMim2: 0, reverbToMim3: 0, reverbToMim4: 0,
    };
  }

  /**
   * Set FX cross-send levels
   */
  setFXCrossSends(params: Partial<import('../fx/Mixer').FXCrossSends>): void {
    this.mixer?.setFXCrossSends(params);
  }

  /**
   * Get limiter gain reduction for metering
   */
  getLimiterGainReduction(): number {
    return this.mixer?.getLimiterGainReduction() ?? 0;
  }

  // Modulation System

  /**
   * Get LFO parameters for all 4 LFOs
   */
  getLFOParams(): LFOParams[] {
    if (!this.lfoManager) return [];
    const state = this.lfoManager.getState();
    return state.lfos;
  }

  /**
   * Get parameters for a specific LFO (0-3)
   */
  getLFOParam(index: number): LFOParams | null {
    const lfo = this.lfoManager?.getLFO(index);
    return lfo?.getParams() ?? null;
  }

  /**
   * Set parameters for a specific LFO
   */
  setLFOParams(index: number, params: Partial<LFOParams>): void {
    this.lfoManager?.setLFOParams(index, params);
  }

  /**
   * Get slow random modulator parameters
   */
  getSlowRandomParams(): { rate1: number; rate2: number; smoothing1: number; smoothing2: number } {
    if (!this.lfoManager) {
      return { rate1: 0.1, rate2: 0.07, smoothing1: 0.8, smoothing2: 0.9 };
    }
    const state = this.lfoManager.getState();
    return state.slowRandom;
  }

  /**
   * Set slow random modulator parameters
   */
  setSlowRandomParams(index: 1 | 2, rate: number, smoothing: number): void {
    this.lfoManager?.setSlowRandomParams(index, rate, smoothing);
  }

  /**
   * Get envelope modulator parameters for all 6 envelopes
   */
  getEnvModParams(): EnvelopeModulatorParams[] {
    if (!this.envelopeManager) return [];
    const state = this.envelopeManager.getState();
    return state.envelopes;
  }

  /**
   * Get parameters for a specific envelope modulator (0-5)
   */
  getEnvModParam(index: number): EnvelopeModulatorParams | null {
    const env = this.envelopeManager?.getEnvelope(index);
    return env?.getParams() ?? null;
  }

  /**
   * Set parameters for a specific envelope modulator
   */
  setEnvModParams(index: number, params: Partial<EnvelopeModulatorParams>): void {
    this.envelopeManager?.setEnvelopeParams(index, params);
  }

  /**
   * Get all modulation routes
   */
  getModRoutes(): ModRoute[] {
    return this.modMatrix?.getAllRoutes() ?? [];
  }

  /**
   * Add a new modulation route
   */
  addModRoute(route: Omit<ModRoute, 'id'>): string {
    return this.modMatrix?.addRoute(route) ?? '';
  }

  /**
   * Update a modulation route
   */
  updateModRoute(id: string, updates: Partial<Omit<ModRoute, 'id'>>): boolean {
    return this.modMatrix?.updateRoute(id, updates) ?? false;
  }

  /**
   * Remove a modulation route
   */
  removeModRoute(id: string): boolean {
    return this.modMatrix?.removeRoute(id) ?? false;
  }

  /**
   * Load a mod matrix preset
   */
  loadModPreset(presetName: string): void {
    const preset = MOD_PRESETS[presetName];
    if (!preset || !this.modMatrix) return;

    // Clear existing routes and add preset routes
    this.modMatrix.clearAllRoutes();
    for (const route of preset) {
      this.modMatrix.addRoute(route);
    }
  }

  /**
   * Get global modulation depth
   */
  getGlobalModDepth(): number {
    return this.modMatrix?.getGlobalDepth() ?? 1;
  }

  /**
   * Set global modulation depth
   */
  setGlobalModDepth(depth: number): void {
    this.modMatrix?.setGlobalDepth(depth);
  }

  /**
   * Check if modulation is enabled
   */
  isModEnabled(): boolean {
    return this.modMatrix?.isEnabled() ?? false;
  }

  /**
   * Enable/disable modulation
   */
  setModEnabled(enabled: boolean): void {
    this.modMatrix?.setEnabled(enabled);
  }

  /**
   * Get modulation state for serialization
   */
  getModState(): { lfos: LFOManagerState; matrix: ModMatrixState } | null {
    if (!this.lfoManager || !this.modMatrix) return null;
    return {
      lfos: this.lfoManager.getState(),
      matrix: this.modMatrix.getState()
    };
  }

  /**
   * Restore modulation state
   */
  setModState(state: { lfos: LFOManagerState; matrix: ModMatrixState }): void {
    this.lfoManager?.setState(state.lfos);
    this.modMatrix?.setState(state.matrix);
  }

  /**
   * Get current LFO values (for visualization)
   */
  getLFOValues(): { lfo1: number; lfo2: number; lfo3: number; lfo4: number; random1: number; random2: number } {
    if (!this.lfoManager || !this.audioContext) {
      return { lfo1: 0, lfo2: 0, lfo3: 0, lfo4: 0, random1: 0, random2: 0 };
    }
    return this.lfoManager.getAllValues(this.audioContext.currentTime);
  }

  // Randomizer

  /**
   * Mutate voice parameters for a track
   */
  mutateTrack(trackId: string, intensity: RandomIntensity): void {
    if (!this.randomizer || !this.voiceManager) return;

    const config = this.voiceManager.getVoiceConfig(trackId);
    if (!config || !config.params) return;

    let mutated: Partial<FMDrumParams | FMMelodicParams | NoiseVoiceParams>;

    switch (config.voiceType) {
      case 'fm-drum':
        mutated = this.randomizer.mutateFMDrum(config.params as FMDrumParams, intensity);
        break;
      case 'fm-melodic':
        mutated = this.randomizer.mutateFMMelodic(config.params as FMMelodicParams, intensity);
        break;
      case 'noise':
        mutated = this.randomizer.mutateNoiseVoice(config.params as NoiseVoiceParams, intensity);
        break;
      default:
        return;
    }

    this.voiceManager.updateVoiceParams(trackId, mutated);
  }

  /**
   * Randomize all tracks
   */
  randomizeScene(intensity: RandomIntensity): void {
    if (!this.randomizer || !this.voiceManager) return;

    const tracks = this.getAllTracks();
    for (const track of tracks) {
      this.mutateTrack(track.id, intensity);
    }
  }

  /**
   * Get micro jitter config
   */
  getMicroJitter(): MicroJitterConfig {
    return this.randomizer?.getMicroJitter() ?? {
      enabled: false,
      amount: 0.02,
      rateHz: 20,
      parameters: ['pitch', 'op1Index', 'op2Index', 'filterCutoff']
    };
  }

  /**
   * Set micro jitter config
   */
  setMicroJitter(config: Partial<MicroJitterConfig>): void {
    this.randomizer?.setMicroJitter(config);
  }

  /**
   * Get/set randomizer seed
   */
  getRandomSeed(): number {
    return this.randomizer?.seed ?? 0;
  }

  setRandomSeed(seed: number): void {
    if (this.randomizer) {
      this.randomizer.seed = seed;
    }
  }

  newRandomSeed(): number {
    return this.randomizer?.newSeed() ?? Math.floor(Math.random() * 2147483647);
  }

  // Bassline Generation

  /**
   * Generate a bassline for a melodic track
   */
  generateTrackBassline(trackId: string, style: BasslineStyle): GeneratedBassline | null {
    if (!this.sequencer) return null;

    const pattern = this.getCurrentPattern(trackId);
    if (!pattern) return null;

    const scale = this.getTrackScale(trackId);
    if (!scale) return null;

    const config: BasslineConfig = {
      style,
      scaleConfig: scale,
      patternLength: pattern.length,
    };

    const bassline = generateBassline(config);

    // Apply the generated bassline to the pattern
    for (let i = 0; i < bassline.steps.length; i++) {
      this.setTrackStep(trackId, i, bassline.steps[i]);
    }

    return bassline;
  }

  /**
   * Get available bassline styles
   */
  getBasslineStyles(): Array<{ style: BasslineStyle; label: string; description: string }> {
    return getBasslineStyles();
  }

  // Test click sound

  playClick(time?: number): void {
    if (!this.audioContext || !this.clickGain) return;

    const t = time ?? this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const env = this.audioContext.createGain();

    osc.frequency.value = 1000;
    osc.type = 'sine';

    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(env);
    env.connect(this.clickGain);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  // Create a test track with click sound

  createClickTrack(): void {
    const track = this.createTrack('click', 'Click');
    if (!track) return;

    // Set up a simple pattern - kick on 1, 5, 9, 13
    this.setTrackStep('click', 0, { trigger: true, velocity: 1.0 });
    this.setTrackStep('click', 4, { trigger: true, velocity: 0.8 });
    this.setTrackStep('click', 8, { trigger: true, velocity: 0.8 });
    this.setTrackStep('click', 12, { trigger: true, velocity: 0.8 });

    // Connect trigger to click sound
    this.onTrigger('click', (event) => {
      this.playClick(event.time);
    });
  }

  // Mute/Solo

  setTrackMuted(trackId: string, muted: boolean): void {
    this.sequencer?.setMuted(trackId, muted);
  }

  setTrackSolo(trackId: string, solo: boolean): void {
    this.sequencer?.setSolo(trackId, solo);
  }

  // State serialization

  getState(): {
    config: EngineConfig;
    sequencer: ReturnType<Sequencer['getState']>;
    voices: ReturnType<VoiceManager['getState']>;
    mixer: MixerState;
    modulation?: { lfos: LFOManagerState; matrix: ModMatrixState };
  } {
    return {
      config: {
        bpm: this._bpm,
        swing: this._swing,
        ppqn: this._ppqn,
      },
      sequencer: this.sequencer?.getState() ?? { tracks: [] },
      voices: this.voiceManager?.getState() ?? { voices: [] },
      mixer: this.mixer?.getState() ?? {
        channels: {},
        mimeophon: {} as MimeophonParams,
        mimeophon2: {} as MimeophonParams,
        mimeophon3: {} as MimeophonParams,
        mimeophon4: {} as MimeophonParams,
        reverb: {} as ReverbParams,
        master: {} as MasterBusParams,
        mimeophonReturnLevel: 1,
        mimeophonReturnLevel2: 1,
        mimeophonReturnLevel3: 1,
        mimeophonReturnLevel4: 1,
        reverbReturnLevel: 1,
        fxCrossSends: {
          mim1ToMim2: 0, mim1ToMim3: 0, mim1ToMim4: 0, mim1ToReverb: 0,
          mim2ToMim1: 0, mim2ToMim3: 0, mim2ToMim4: 0, mim2ToReverb: 0,
          mim3ToMim1: 0, mim3ToMim2: 0, mim3ToMim4: 0, mim3ToReverb: 0,
          mim4ToMim1: 0, mim4ToMim2: 0, mim4ToMim3: 0, mim4ToReverb: 0,
          reverbToMim1: 0, reverbToMim2: 0, reverbToMim3: 0, reverbToMim4: 0,
        }
      },
      modulation: this.getModState() ?? undefined,
    };
  }

  setState(state: ReturnType<typeof this.getState>): void {
    this._bpm = state.config.bpm;
    this._swing = state.config.swing;
    this._ppqn = state.config.ppqn;

    if (this.clock) {
      this.clock.bpm = this._bpm;
      this.clock.swing = this._swing;
    }

    if (this.mixer) {
      this.mixer.setBpm(this._bpm);
    }

    if (this.lfoManager) {
      this.lfoManager.setBpm(this._bpm);
    }

    this.sequencer?.setState(state.sequencer);

    if (state.voices) {
      this.voiceManager?.setState(state.voices);
    }

    if (state.mixer) {
      this.mixer?.setState(state.mixer);
    }

    if (state.modulation) {
      this.setModState(state.modulation);
    }
  }

  // Recording

  /**
   * Start recording audio output
   */
  startRecording(): boolean {
    if (!this.audioContext || !this.mixer) {
      console.warn('[Engine] Cannot start recording: engine not initialized');
      return false;
    }

    if (this.recorder?.isRecording) {
      console.warn('[Engine] Recording already in progress');
      return false;
    }

    // Create recorder connected to the recording tap point
    const recordingTap = this.mixer.getRecordingTap();
    this.recorder = new WAVRecorder(this.audioContext, recordingTap);

    // Forward state changes to listeners
    this.recorder.onStateChange((state) => {
      for (const listener of this.recorderListeners) {
        listener(state);
      }
    });

    this.recorder.start();
    console.log('[Engine] Recording started');
    return true;
  }

  /**
   * Stop recording and return the WAV blob
   */
  stopRecording(): Blob | null {
    if (!this.recorder) {
      console.warn('[Engine] No active recording');
      return null;
    }

    const blob = this.recorder.stop();
    console.log('[Engine] Recording stopped, blob size:', blob?.size ?? 0);
    return blob;
  }

  /**
   * Cancel recording without saving
   */
  cancelRecording(): void {
    if (this.recorder) {
      this.recorder.cancel();
      console.log('[Engine] Recording cancelled');
    }
  }

  /**
   * Check if currently recording
   */
  get isRecording(): boolean {
    return this.recorder?.isRecording ?? false;
  }

  /**
   * Get current recording duration in seconds
   */
  get recordingDuration(): number {
    return this.recorder?.duration ?? 0;
  }

  /**
   * Subscribe to recording state changes
   */
  onRecordingStateChange(callback: (state: RecorderState) => void): () => void {
    this.recorderListeners.add(callback);
    return () => this.recorderListeners.delete(callback);
  }

  /**
   * Download a WAV blob
   */
  downloadRecording(blob: Blob, filename?: string): void {
    WAVRecorder.downloadWAV(blob, filename);
  }

  // ============================================================
  // PRESET SAVE/LOAD
  // ============================================================

  /**
   * Export the complete state as a preset
   */
  exportPreset(
    voiceConfigs: Map<string, TrackVoiceConfig>,
    channelParams: Map<string, ChannelParams>,
    mimeophonParams: MimeophonParams | null,
    mimeophonParams2: MimeophonParams | null,
    mimeophonParams3: MimeophonParams | null,
    mimeophonParams4: MimeophonParams | null,
    reverbParams: ReverbParams | null,
    masterParams: MasterBusParams | null,
    mimeophonReturnLevel: number,
    mimeophonReturnLevel2: number,
    mimeophonReturnLevel3: number,
    mimeophonReturnLevel4: number,
    reverbReturnLevel: number,
    fxCrossSends: FXCrossSends,
    lfoParams: LFOParams[],
    envModParams: EnvelopeModulatorParams[],
    slowRandomParams: SlowRandomParams,
    modRoutes: ModRoute[],
    globalModDepth: number,
    modEnabled: boolean,
    microJitterEnabled: boolean,
    microJitterAmount: number
  ): PresetState {
    const scale = this.getGlobalScale() ?? { root: 0, scale: 'minor' as const, octave: 3 };

    // Serialize tracks
    const tracks = this.getAllTracks();
    const serializedTracks: SerializedTrack[] = tracks.map(track => {
      // Convert patterns Map to array
      const patterns: SerializedPattern[] = [];
      track.patterns.forEach((pattern, _id) => {
        patterns.push({
          id: pattern.id,
          name: pattern.name,
          length: pattern.length,
          division: pattern.division,
          steps: pattern.steps.map(step => ({ ...step })),
        });
      });

      return {
        id: track.id,
        name: track.name,
        muted: track.muted,
        solo: track.solo,
        currentPatternId: track.currentPatternId,
        patterns,
        performance: { ...track.performance },
        clockConfig: { ...track.clockConfig },
        scale: track.scale ? { ...track.scale } : undefined,
      };
    });

    // Serialize voice configs
    const serializedVoiceConfigs: SerializedVoiceConfig[] = [];
    voiceConfigs.forEach((config, trackId) => {
      serializedVoiceConfigs.push({
        trackId,
        voiceType: config.voiceType,
        preset: config.preset,
        params: config.params ? { ...config.params } : undefined,
        note: config.note,
      });
    });

    // Serialize channel params
    const serializedChannelParams: SerializedChannelParams[] = [];
    channelParams.forEach((params, trackId) => {
      serializedChannelParams.push({
        trackId,
        params: JSON.parse(JSON.stringify(params)), // Deep clone
      });
    });

    const presetName = generatePresetName(scale, this._bpm);

    return {
      version: PRESET_VERSION,
      name: presetName,
      createdAt: new Date().toISOString(),
      description: '',

      // Transport
      bpm: this._bpm,
      swing: this._swing,
      scale,

      // Tracks and sequences
      tracks: serializedTracks,
      voiceConfigs: serializedVoiceConfigs,
      channelParams: serializedChannelParams,

      // FX
      mimeophonParams: mimeophonParams ? { ...mimeophonParams } : null,
      mimeophonParams2: mimeophonParams2 ? { ...mimeophonParams2 } : null,
      mimeophonParams3: mimeophonParams3 ? { ...mimeophonParams3 } : null,
      mimeophonParams4: mimeophonParams4 ? { ...mimeophonParams4 } : null,
      reverbParams: reverbParams ? { ...reverbParams } : null,
      masterParams: masterParams ? { ...masterParams } : null,
      mimeophonReturnLevel,
      mimeophonReturnLevel2,
      mimeophonReturnLevel3,
      mimeophonReturnLevel4,
      reverbReturnLevel,
      fxCrossSends: { ...fxCrossSends },

      // Modulation
      lfoParams: lfoParams.map(lfo => ({ ...lfo })),
      envModParams: envModParams.map(env => ({ ...env })),
      slowRandomParams: { ...slowRandomParams },
      modRoutes: modRoutes.map(route => ({ ...route })),
      globalModDepth,
      modEnabled,
      microJitterEnabled,
      microJitterAmount,

      // Pattern bank
      activePatternSlot: this.getActivePatternSlot(),

      // Per-pattern slot configurations
      slotConfigs: this.sequencer?.exportSlotConfigs(),
    };
  }

  /**
   * Import a preset and restore all state
   * Returns callbacks that the App should use to update React state
   */
  importPreset(preset: PresetState): {
    voiceConfigs: Map<string, TrackVoiceConfig>;
    channelParams: Map<string, ChannelParams>;
    mimeophonParams: MimeophonParams | null;
    mimeophonParams2: MimeophonParams | null;
    mimeophonParams3: MimeophonParams | null;
    mimeophonParams4: MimeophonParams | null;
    reverbParams: ReverbParams | null;
    masterParams: MasterBusParams | null;
    mimeophonReturnLevel: number;
    mimeophonReturnLevel2: number;
    mimeophonReturnLevel3: number;
    mimeophonReturnLevel4: number;
    reverbReturnLevel: number;
    fxCrossSends: FXCrossSends;
    lfoParams: LFOParams[];
    envModParams: EnvelopeModulatorParams[];
    slowRandomParams: SlowRandomParams;
    modRoutes: ModRoute[];
    globalModDepth: number;
    modEnabled: boolean;
    microJitterEnabled: boolean;
    microJitterAmount: number;
  } {
    // Restore transport settings
    this.bpm = preset.bpm;
    this.swing = preset.swing;
    if (preset.scale) {
      this.setGlobalScale(preset.scale);
    }

    // Restore tracks and patterns
    if (this.sequencer) {
      for (const trackData of preset.tracks) {
        const track = this.sequencer.getTrack(trackData.id);
        if (track) {
          // Update track properties
          track.muted = trackData.muted;
          track.solo = trackData.solo;
          track.currentPatternId = trackData.currentPatternId;
          track.performance = { ...trackData.performance };
          track.clockConfig = { ...trackData.clockConfig };
          if (trackData.scale) {
            track.scale = { ...trackData.scale };
          }

          // Clear existing patterns and add new ones
          track.patterns.clear();
          for (const patternData of trackData.patterns) {
            const pattern: Pattern = {
              id: patternData.id,
              name: patternData.name,
              length: patternData.length,
              division: patternData.division,
              steps: patternData.steps.map(step => ({ ...step })),
            };
            track.patterns.set(pattern.id, pattern);
          }
        }
      }
    }

    // Restore voice configs
    const voiceConfigs = new Map<string, TrackVoiceConfig>();
    for (const config of preset.voiceConfigs) {
      const voiceConfig: TrackVoiceConfig = {
        trackId: config.trackId,
        voiceType: config.voiceType,
        preset: config.preset,
        params: config.params as TrackVoiceConfig['params'],
        note: config.note,
      };
      voiceConfigs.set(config.trackId, voiceConfig);

      // Actually set the voice on the engine
      this.assignVoice(voiceConfig);
      if (config.params) {
        this.updateVoiceParams(config.trackId, config.params as Record<string, unknown>);
      }
      if (config.note !== undefined) {
        this.setTrackNote(config.trackId, config.note);
      }
    }

    // Restore channel params
    const channelParams = new Map<string, ChannelParams>();
    for (const channel of preset.channelParams) {
      channelParams.set(channel.trackId, channel.params);
      // Apply to mixer
      if (this.mixer) {
        this.mixer.updateChannel(channel.trackId, channel.params);
      }
    }

    // Restore FX
    if (preset.mimeophonParams && this.mixer) {
      this.mixer.setMimeophonParams(preset.mimeophonParams);
    }
    if (preset.mimeophonParams2 && this.mixer) {
      this.mixer.setMimeophonParams2(preset.mimeophonParams2);
    }
    if (preset.mimeophonParams3 && this.mixer) {
      this.mixer.setMimeophonParams3(preset.mimeophonParams3);
    }
    if (preset.mimeophonParams4 && this.mixer) {
      this.mixer.setMimeophonParams4(preset.mimeophonParams4);
    }
    if (preset.reverbParams && this.mixer) {
      this.mixer.setReverbParams(preset.reverbParams);
    }
    if (preset.masterParams && this.mixer) {
      this.mixer.setMasterParams(preset.masterParams);
    }
    if (this.mixer) {
      this.mixer.setMimeophonReturnLevel(preset.mimeophonReturnLevel);
      this.mixer.setMimeophonReturnLevel2(preset.mimeophonReturnLevel2);
      this.mixer.setMimeophonReturnLevel3(preset.mimeophonReturnLevel3);
      this.mixer.setMimeophonReturnLevel4(preset.mimeophonReturnLevel4);
      this.mixer.setReverbReturnLevel(preset.reverbReturnLevel);
    }

    // Restore modulation
    if (this.lfoManager) {
      for (let i = 0; i < preset.lfoParams.length && i < 4; i++) {
        this.lfoManager.setLFOParams(i, preset.lfoParams[i]);
      }
    }
    if (this.envelopeManager) {
      for (let i = 0; i < preset.envModParams.length && i < 6; i++) {
        this.envelopeManager.setEnvelopeParams(i, preset.envModParams[i]);
      }
    }
    if (this.lfoManager && preset.slowRandomParams) {
      this.lfoManager.setSlowRandomParams(1, preset.slowRandomParams.rate1, preset.slowRandomParams.smoothing1);
      this.lfoManager.setSlowRandomParams(2, preset.slowRandomParams.rate2, preset.slowRandomParams.smoothing2);
    }
    if (this.modMatrix) {
      this.modMatrix.clearAllRoutes();
      for (const route of preset.modRoutes) {
        this.modMatrix.addRoute(route);
      }
      this.modMatrix.setGlobalDepth(preset.globalModDepth);
      this.modMatrix.setEnabled(preset.modEnabled);
    }
    if (this.randomizer) {
      this.randomizer.setMicroJitter({
        enabled: preset.microJitterEnabled,
        amount: preset.microJitterAmount,
      });
    }

    // Restore pattern slot configs (per-pattern voice/channel/FX settings)
    if (preset.slotConfigs && this.sequencer) {
      this.sequencer.importSlotConfigs(preset.slotConfigs);
    }

    // Restore active pattern slot and apply its state
    if (preset.activePatternSlot && this.sequencer) {
      // First set the active slot in the sequencer
      this.sequencer.setActivePatternSlot(preset.activePatternSlot);
      // Then apply the slot's stored state (voice/channel/FX configs)
      this.applySlotState(preset.activePatternSlot);
    }

    // Return state for React
    return {
      voiceConfigs,
      channelParams,
      mimeophonParams: preset.mimeophonParams,
      mimeophonParams2: preset.mimeophonParams2,
      mimeophonParams3: preset.mimeophonParams3,
      mimeophonParams4: preset.mimeophonParams4,
      reverbParams: preset.reverbParams,
      masterParams: preset.masterParams,
      mimeophonReturnLevel: preset.mimeophonReturnLevel,
      mimeophonReturnLevel2: preset.mimeophonReturnLevel2,
      mimeophonReturnLevel3: preset.mimeophonReturnLevel3,
      mimeophonReturnLevel4: preset.mimeophonReturnLevel4,
      reverbReturnLevel: preset.reverbReturnLevel,
      fxCrossSends: preset.fxCrossSends ?? createDefaultFXCrossSends(),
      lfoParams: preset.lfoParams,
      envModParams: preset.envModParams,
      slowRandomParams: preset.slowRandomParams ?? createDefaultSlowRandomParams(),
      modRoutes: preset.modRoutes,
      globalModDepth: preset.globalModDepth,
      modEnabled: preset.modEnabled,
      microJitterEnabled: preset.microJitterEnabled,
      microJitterAmount: preset.microJitterAmount,
    };
  }

  // Cleanup

  dispose(): void {
    this.stop();
    this.recorder?.dispose();
    this.voiceManager?.dispose();
    this.mixer?.dispose();
    this.clock?.dispose();
    this.audioContext?.close();
    this.clock = null;
    this.audioContext = null;
    this.sequencer = null;
    this.voiceManager = null;
    this.mixer = null;
    this.lfoManager = null;
    this.modMatrix = null;
    this.randomizer = null;
    this.recorder = null;
    this.setEngineState('uninitialized');
  }
}

// Export a singleton for easy access
export const engine = new GrooveboxEngine();

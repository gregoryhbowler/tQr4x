export { MasterClock, type TickEvent, type TickCallback } from './MasterClock';
export { Sequencer, type StepParams, type Pattern, type Track, type TriggerEvent, type TriggerCallback, type TrackPerformance, type ConditionalTrig, type ClockDivisionRatio, type TrackClockConfig, type PatternBankSnapshot, type PatternSequencerCell, type PatternSequencerState, CLOCK_DIVISION_VALUES, PATTERN_BANK_SIZE } from './Sequencer';
export { GrooveboxEngine, engine, type EngineState, type EngineConfig } from './GrooveboxEngine';
export { paramLockManager, type ParamLockEditState, type ParamLocks, type LockableParamId, type ParamLockEditCallback } from './ParamLockManager';
export { type RecorderState } from '../recording/WAVRecorder';

// Re-export voice types for convenience
export type { VoiceType, TrackVoiceConfig } from '../voices/VoiceManager';
export type { FMDrumParams } from '../voices/FMDrumVoice';
export type { FMMelodicParams } from '../voices/FMMelodicVoice';
export type { NoiseVoiceParams } from '../voices/NoiseVoice';
export type { SampleVoiceParams, SampleMode, PlayDirection } from '../voices/SampleVoice';

// Re-export scale types
export type { ScaleConfig, ScaleName } from '../music/Scale';
export { SCALE_INTERVALS, NOTE_NAMES } from '../music/Scale';

// Re-export bassline generator types
export type { BasslineStyle, BasslineConfig, GeneratedBassline } from '../music/BasslineGenerator';
export { getBasslineStyles } from '../music/BasslineGenerator';

// Re-export preset types
export type {
  PresetState,
  SerializedTrack,
  SerializedPattern,
  SerializedVoiceConfig,
  SerializedChannelParams,
  SlowRandomParams,
  FXCrossSends,
} from '../preset';
export {
  PRESET_VERSION,
  generatePresetName,
  validatePreset,
  downloadPreset,
  loadPresetFromFile,
  createDefaultFXCrossSends,
  createDefaultSlowRandomParams,
} from '../preset';

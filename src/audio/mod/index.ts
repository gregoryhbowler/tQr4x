/**
 * Modulation Module - LFOs, Envelope Modulators, Mod Matrix, and Randomization
 */

// LFO exports
export {
  LFO,
  LFOManager,
  LFO_PRESETS,
  SYNC_VALUES,
  type LFOShape,
  type LFOSync,
  type LFOParams,
  type LFOManagerState,
  type ModulationSource
} from './LFO';

// Envelope Modulator exports
export {
  EnvelopeModulator,
  EnvelopeModulatorManager,
  ENVELOPE_MOD_PRESETS,
  type EnvelopeLoopMode,
  type EnvelopeModulatorParams,
  type EnvelopeModulatorManagerState
} from './EnvelopeModulator';

// Mod Matrix exports
export {
  ModMatrix,
  DESTINATION_CATEGORIES,
  DESTINATION_RANGES,
  MOD_PRESETS,
  VOICE_TYPE_DESTINATIONS,
  voiceSupportsNoteModulation,
  getTrackIdsForTarget,
  routeAppliesToTrack,
  type VoiceDestination,
  type ChannelDestination,
  type NoteDestination,
  type FXDestination,
  type ModSourceDestination,
  type MixerDestination,
  type ModulationDestination,
  type ModTrackTarget,
  type ModRoute,
  type ModMatrixState
} from './ModMatrix';

// Randomizer exports
export {
  Randomizer,
  SeededRandom,
  randomizer,
  type RandomIntensity,
  type MicroJitterConfig
} from './Randomizer';

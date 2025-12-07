/**
 * Voice module exports
 */

export * from './Envelope';
export * from './FMDrumVoice';
export * from './FMMelodicVoice';
export * from './NoiseVoice';
// ComplexMorphVoice has its own CurveType, re-export with alias
export {
  ComplexMorphVoice,
  COMPLEX_MORPH_PRESETS,
  createFlatEnvelope,
  createSineEnvelope,
  createRampEnvelope,
  type CurveType as ComplexMorphCurveType,
  type LoopMode,
  type EnvBreakpoint,
  type CyclingEnvelope,
  type OperatorEnvelopes,
  type ComplexMorphOperator,
  type ComplexMorphParams
} from './ComplexMorphVoice';
export * from './VoiceManager';
export * from './EnvelopePresets';
export * from './SampleVoice';
export * from './OceanVoice';

// Plaits voices (Mutable Instruments Plaits emulation via @vectorsize/woscillators)
export * from './PlaitsVoice';
export * from './PlaitsMelodicVoice';
export * from './PlaitsPercVoice';

/**
 * ModMatrix - Modulation routing matrix
 *
 * Routes modulation sources to destinations with depth control.
 * Supports per-track routing and global routing.
 *
 * Features:
 * - Source → Destination → Depth routing
 * - Multiple routings per destination (additive)
 * - Per-track override capability ("all tracks" or tracks 1-12)
 * - Depth can be positive or negative (inverted modulation)
 * - P-locks take priority over modulation (modulation does not override p-locked values)
 * - Dynamic destinations based on track voice type
 * - Modulation sources can target other modulation source parameters
 */

import type { ModulationSource, LFOManager } from './LFO';
import type { EnvelopeModulatorManager } from './EnvelopeModulator';

/**
 * Track targeting for mod routes
 * 'all' applies to all tracks, or specify track 1-12
 */
export type ModTrackTarget = 'all' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Voice-specific modulation destinations
 * These are available based on the track's assigned voice type
 */
export type VoiceDestination =
  // FM Drum voice parameters
  | 'pitch' | 'pitchEnvAmount' | 'pitchEnvDecay'
  | 'op1Ratio' | 'op1Index' | 'op1Feedback'
  | 'op2Ratio' | 'op2Index' | 'op2ToOp1'
  | 'ampAttack' | 'ampDecay'
  | 'noiseMix' | 'noiseDecay' | 'noiseFilterFreq'
  // FM Melodic voice parameters
  | 'fmIndex' | 'fmIndexEnvAmount'
  | 'glideTime'
  // Noise voice parameters
  | 'decay' | 'metalAmount' | 'clickAmount'
  | 'noiseFilterQ'
  // Sample voice parameters
  | 'samplePitch' | 'sampleStartPoint'
  | 'sampleLpCutoff' | 'sampleLpResonance'
  | 'sampleHpCutoff' | 'sampleHpResonance'
  | 'sampleSustain' | 'sampleRelease'
  | 'grainDensity' | 'grainLength' | 'grainSpread' | 'grainPan'
  | 'sampleScanSpeed'
  // Ocean voice parameters (granular synthesis)
  | 'oceanPitch' | 'oceanGrainSize' | 'oceanDensity'
  | 'oceanPosition' | 'oceanSpread'
  | 'oceanHpfFreq' | 'oceanLpfFreq' | 'oceanVolume'
  // Complex Morph voice parameters
  | 'complexCarrierFreq' | 'complexNotchFreq' | 'complexNotchQ' | 'complexOutputLevel'
  // Complex Morph envelope parameters (period, amount, and range for each cycling envelope)
  | 'complexCarrierPitchPeriod' | 'complexCarrierPitchAmount' | 'complexCarrierPitchRange'
  | 'complexOpAPitchPeriod' | 'complexOpAPitchAmount' | 'complexOpAPitchRange'
  | 'complexOpAIndexPeriod' | 'complexOpAIndexAmount' | 'complexOpAIndexMin' | 'complexOpAIndexMax'
  | 'complexOpALevelPeriod' | 'complexOpALevelAmount' | 'complexOpALevelMax'
  | 'complexOpBPitchPeriod' | 'complexOpBPitchAmount' | 'complexOpBPitchRange'
  | 'complexOpBIndexPeriod' | 'complexOpBIndexAmount' | 'complexOpBIndexMin' | 'complexOpBIndexMax'
  | 'complexOpBLevelPeriod' | 'complexOpBLevelAmount' | 'complexOpBLevelMax'
  | 'complexOpCPitchPeriod' | 'complexOpCPitchAmount' | 'complexOpCPitchRange'
  | 'complexOpCIndexPeriod' | 'complexOpCIndexAmount' | 'complexOpCIndexMin' | 'complexOpCIndexMax'
  | 'complexOpCLevelPeriod' | 'complexOpCLevelAmount' | 'complexOpCLevelMax'
  | 'complexAmpPeriod' | 'complexAmpAmount'
  | 'complexNotchEnvPeriod' | 'complexNotchEnvAmount' | 'complexNotchRange'
  // Plaits voice parameters (engines 0-15)
  | 'plaitsHarmonics' | 'plaitsTimbre' | 'plaitsMorph'
  | 'plaitsFM' | 'plaitsDecay' | 'plaitsFade';

/**
 * Per-track channel/mixer destinations
 * Filter cutoff/resonance, saturation, sends
 */
export type ChannelDestination =
  // Filter (type-agnostic - maps to active filter's cutoff/resonance)
  | 'filterCutoff' | 'filterResonance' | 'filterSpan'
  // Filter type-specific (for advanced control)
  | 'filterDrive' | 'filterMorph' | 'filterChaos' | 'filterWarmth'
  // Saturation
  | 'saturationDrive' | 'saturationBias' | 'saturationMix'
  // Sends (4 Mimeophon delays + reverb)
  | 'delaySend1' | 'delaySend2' | 'delaySend3' | 'delaySend4' | 'reverbSend'
  // Mix
  | 'volume' | 'pan';

/**
 * Note slider destination (for melodic tracks)
 * Allows modulating step notes
 */
export type NoteDestination = 'note';

/**
 * Global FX destinations (not per-track)
 */
export type FXDestination =
  // Mimeophon 1 parameters
  | 'mim1Time' | 'mim1Feedback' | 'mim1Mix' | 'mim1Color' | 'mim1Halo'
  // Mimeophon 2 parameters
  | 'mim2Time' | 'mim2Feedback' | 'mim2Mix' | 'mim2Color' | 'mim2Halo'
  // Mimeophon 3 parameters
  | 'mim3Time' | 'mim3Feedback' | 'mim3Mix' | 'mim3Color' | 'mim3Halo'
  // Mimeophon 4 parameters
  | 'mim4Time' | 'mim4Feedback' | 'mim4Mix' | 'mim4Color' | 'mim4Halo'
  // Reverb parameters
  | 'reverbSize' | 'reverbDamping' | 'reverbWidth' | 'reverbWetLevel'
  // Master parameters
  | 'masterSaturation' | 'masterTone';

/**
 * Modulation source parameter destinations
 * Allows modulating the parameters of other mod sources
 */
export type ModSourceDestination =
  // LFO parameters (1-4)
  | 'lfo1Rate' | 'lfo1Depth' | 'lfo1Phase'
  | 'lfo2Rate' | 'lfo2Depth' | 'lfo2Phase'
  | 'lfo3Rate' | 'lfo3Depth' | 'lfo3Phase'
  | 'lfo4Rate' | 'lfo4Depth' | 'lfo4Phase'
  // Random modulator parameters (1-2)
  | 'random1Rate' | 'random1Smoothing'
  | 'random2Rate' | 'random2Smoothing'
  // Envelope modulator parameters (1-6)
  | 'env1Period' | 'env1Depth' | 'env1Phase'
  | 'env2Period' | 'env2Depth' | 'env2Phase'
  | 'env3Period' | 'env3Depth' | 'env3Phase'
  | 'env4Period' | 'env4Depth' | 'env4Phase'
  | 'env5Period' | 'env5Depth' | 'env5Phase'
  | 'env6Period' | 'env6Depth' | 'env6Phase';

/**
 * All modulation destinations
 */
export type ModulationDestination =
  | VoiceDestination
  | ChannelDestination
  | NoteDestination
  | FXDestination
  | ModSourceDestination;

/**
 * Legacy destinations for backwards compatibility
 * @deprecated Use specific destination types instead
 */
export type MixerDestination = 'volume' | 'pan' | 'delaySend' | 'reverbSend';

// Legacy alias
export type LegacyDestination =
  | 'filterQ' | 'filterEnvAmount' | 'filterFreq'
  | 'delayFeedback' | 'delayFilterFreq' | 'delayModDepth' | 'delayWetLevel';

/**
 * Categories for UI organization
 * Organized by destination type for clear hierarchy
 */
export const DESTINATION_CATEGORIES: Record<string, ModulationDestination[]> = {
  // Voice parameters (per-track, based on voice type)
  'Voice - Pitch/Tune': ['pitch', 'pitchEnvAmount', 'pitchEnvDecay'],
  'Voice - FM': ['op1Ratio', 'op1Index', 'op1Feedback', 'op2Ratio', 'op2Index', 'op2ToOp1', 'fmIndex', 'fmIndexEnvAmount'],
  'Voice - Amp': ['ampAttack', 'ampDecay'],
  'Voice - Noise': ['noiseMix', 'noiseDecay', 'noiseFilterFreq', 'noiseFilterQ', 'decay', 'metalAmount', 'clickAmount'],
  'Voice - Sample': ['samplePitch', 'sampleStartPoint', 'sampleLpCutoff', 'sampleLpResonance', 'sampleHpCutoff', 'sampleHpResonance', 'sampleSustain', 'sampleRelease', 'sampleScanSpeed'],
  'Voice - Granular': ['grainDensity', 'grainLength', 'grainSpread', 'grainPan'],
  'Voice - Ocean': ['oceanPitch', 'oceanGrainSize', 'oceanDensity', 'oceanPosition', 'oceanSpread', 'oceanHpfFreq', 'oceanLpfFreq', 'oceanVolume'],
  'Voice - Complex Morph': ['complexCarrierFreq', 'complexNotchFreq', 'complexNotchQ', 'complexOutputLevel'],
  'Voice - Complex Morph Envelopes': [
    'complexCarrierPitchPeriod', 'complexCarrierPitchAmount', 'complexCarrierPitchRange',
    'complexOpAPitchPeriod', 'complexOpAPitchAmount', 'complexOpAPitchRange',
    'complexOpAIndexPeriod', 'complexOpAIndexAmount', 'complexOpAIndexMin', 'complexOpAIndexMax',
    'complexOpALevelPeriod', 'complexOpALevelAmount', 'complexOpALevelMax',
    'complexOpBPitchPeriod', 'complexOpBPitchAmount', 'complexOpBPitchRange',
    'complexOpBIndexPeriod', 'complexOpBIndexAmount', 'complexOpBIndexMin', 'complexOpBIndexMax',
    'complexOpBLevelPeriod', 'complexOpBLevelAmount', 'complexOpBLevelMax',
    'complexOpCPitchPeriod', 'complexOpCPitchAmount', 'complexOpCPitchRange',
    'complexOpCIndexPeriod', 'complexOpCIndexAmount', 'complexOpCIndexMin', 'complexOpCIndexMax',
    'complexOpCLevelPeriod', 'complexOpCLevelAmount', 'complexOpCLevelMax',
    'complexAmpPeriod', 'complexAmpAmount',
    'complexNotchEnvPeriod', 'complexNotchEnvAmount', 'complexNotchRange'
  ],
  'Voice - Other': ['glideTime'],
  'Voice - Plaits': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade'],

  // Channel parameters (per-track mixer/fx)
  'Channel - Filter': ['filterCutoff', 'filterResonance', 'filterSpan', 'filterDrive', 'filterMorph', 'filterChaos', 'filterWarmth'],
  'Channel - Saturation': ['saturationDrive', 'saturationBias', 'saturationMix'],
  'Channel - Sends': ['delaySend1', 'delaySend2', 'delaySend3', 'delaySend4', 'reverbSend'],
  'Channel - Mix': ['volume', 'pan'],

  // Note (for melodic tracks)
  'Note': ['note'],

  // Global FX parameters
  'FX - Mimeophon 1': ['mim1Time', 'mim1Feedback', 'mim1Mix', 'mim1Color', 'mim1Halo'],
  'FX - Mimeophon 2': ['mim2Time', 'mim2Feedback', 'mim2Mix', 'mim2Color', 'mim2Halo'],
  'FX - Mimeophon 3': ['mim3Time', 'mim3Feedback', 'mim3Mix', 'mim3Color', 'mim3Halo'],
  'FX - Mimeophon 4': ['mim4Time', 'mim4Feedback', 'mim4Mix', 'mim4Color', 'mim4Halo'],
  'FX - Reverb': ['reverbSize', 'reverbDamping', 'reverbWidth', 'reverbWetLevel'],
  'FX - Master': ['masterSaturation', 'masterTone'],

  // Modulation source parameters (modulate the modulators!)
  'Mod - LFO 1': ['lfo1Rate', 'lfo1Depth', 'lfo1Phase'],
  'Mod - LFO 2': ['lfo2Rate', 'lfo2Depth', 'lfo2Phase'],
  'Mod - LFO 3': ['lfo3Rate', 'lfo3Depth', 'lfo3Phase'],
  'Mod - LFO 4': ['lfo4Rate', 'lfo4Depth', 'lfo4Phase'],
  'Mod - Random': ['random1Rate', 'random1Smoothing', 'random2Rate', 'random2Smoothing'],
  'Mod - Env 1': ['env1Period', 'env1Depth', 'env1Phase'],
  'Mod - Env 2': ['env2Period', 'env2Depth', 'env2Phase'],
  'Mod - Env 3': ['env3Period', 'env3Depth', 'env3Phase'],
  'Mod - Env 4': ['env4Period', 'env4Depth', 'env4Phase'],
  'Mod - Env 5': ['env5Period', 'env5Depth', 'env5Phase'],
  'Mod - Env 6': ['env6Period', 'env6Depth', 'env6Phase'],
};

/**
 * Voice type to available destinations mapping
 * Used by UI to show only relevant destinations for each track's voice
 */
export const VOICE_TYPE_DESTINATIONS: Record<string, VoiceDestination[]> = {
  'fm-drum': ['pitch', 'pitchEnvAmount', 'pitchEnvDecay', 'op1Ratio', 'op1Index', 'op1Feedback', 'op2Ratio', 'op2Index', 'op2ToOp1', 'ampAttack', 'ampDecay', 'noiseMix', 'noiseDecay', 'noiseFilterFreq'],
  'fm-melodic': ['fmIndex', 'fmIndexEnvAmount', 'ampAttack', 'ampDecay', 'glideTime'],
  'noise': ['decay', 'metalAmount', 'clickAmount', 'noiseFilterQ'],
  'complex-morph': [
    'complexCarrierFreq', 'complexNotchFreq', 'complexNotchQ', 'complexOutputLevel',
    // Envelope parameters
    'complexCarrierPitchPeriod', 'complexCarrierPitchAmount', 'complexCarrierPitchRange',
    'complexOpAPitchPeriod', 'complexOpAPitchAmount', 'complexOpAPitchRange',
    'complexOpAIndexPeriod', 'complexOpAIndexAmount', 'complexOpAIndexMin', 'complexOpAIndexMax',
    'complexOpALevelPeriod', 'complexOpALevelAmount', 'complexOpALevelMax',
    'complexOpBPitchPeriod', 'complexOpBPitchAmount', 'complexOpBPitchRange',
    'complexOpBIndexPeriod', 'complexOpBIndexAmount', 'complexOpBIndexMin', 'complexOpBIndexMax',
    'complexOpBLevelPeriod', 'complexOpBLevelAmount', 'complexOpBLevelMax',
    'complexOpCPitchPeriod', 'complexOpCPitchAmount', 'complexOpCPitchRange',
    'complexOpCIndexPeriod', 'complexOpCIndexAmount', 'complexOpCIndexMin', 'complexOpCIndexMax',
    'complexOpCLevelPeriod', 'complexOpCLevelAmount', 'complexOpCLevelMax',
    'complexAmpPeriod', 'complexAmpAmount',
    'complexNotchEnvPeriod', 'complexNotchEnvAmount', 'complexNotchRange'
  ],
  'sample': ['samplePitch', 'sampleStartPoint', 'sampleLpCutoff', 'sampleLpResonance', 'sampleHpCutoff', 'sampleHpResonance', 'ampAttack', 'ampDecay', 'sampleSustain', 'sampleRelease', 'sampleScanSpeed', 'grainDensity', 'grainLength', 'grainSpread', 'grainPan'],
  'ocean': ['oceanPitch', 'oceanGrainSize', 'oceanDensity', 'oceanPosition', 'oceanSpread', 'oceanHpfFreq', 'oceanLpfFreq', 'oceanVolume'],
  // Plaits melodic engines (0-7)
  'plaits-va': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade', 'glideTime'],
  'plaits-waveshaper': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade', 'glideTime'],
  'plaits-fm': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade', 'glideTime'],
  'plaits-formant': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade', 'glideTime'],
  'plaits-additive': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade', 'glideTime'],
  'plaits-wavetable': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade', 'glideTime'],
  'plaits-chords': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade', 'glideTime'],
  'plaits-speech': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade', 'glideTime'],
  // Plaits percussion engines (8-15)
  'plaits-grain': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade'],
  'plaits-noise': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade'],
  'plaits-particle': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade'],
  'plaits-string': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade'],
  'plaits-modal': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade'],
  'plaits-kick': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade'],
  'plaits-snare': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade'],
  'plaits-hihat': ['plaitsHarmonics', 'plaitsTimbre', 'plaitsMorph', 'plaitsFM', 'plaitsDecay', 'plaitsFade'],
};

/**
 * Check if a voice type supports note sequencing (melodic tracks)
 */
export function voiceSupportsNoteModulation(voiceType: string): boolean {
  const melodicVoices = [
    'fm-melodic',
    'plaits-va', 'plaits-waveshaper', 'plaits-fm', 'plaits-formant',
    'plaits-additive', 'plaits-wavetable', 'plaits-chords', 'plaits-speech',
    'plaits-string', 'plaits-modal' // Pitched percussion
  ];
  return melodicVoices.includes(voiceType);
}

/**
 * Default ranges for destinations (used when applying modulation)
 * Format: [min, max, center]
 */
export const DESTINATION_RANGES: Record<ModulationDestination, [number, number, number?]> = {
  // Voice - Pitch
  pitch: [20, 2000, 100],
  pitchEnvAmount: [1, 16, 4],
  pitchEnvDecay: [0.001, 1, 0.05],

  // Voice - FM
  op1Ratio: [0.1, 16, 1],
  op1Index: [0, 20, 3],
  op1Feedback: [0, 1, 0],
  op2Ratio: [0.1, 16, 1],
  op2Index: [0, 20, 1],
  op2ToOp1: [0, 1, 0.5],
  fmIndex: [0, 20, 3],
  fmIndexEnvAmount: [0, 1, 0.5],

  // Voice - Amp
  ampAttack: [0.001, 0.5, 0.001],
  ampDecay: [0.01, 5, 0.3],

  // Voice - Noise
  noiseMix: [0, 1, 0],
  noiseDecay: [0.01, 2, 0.1],
  noiseFilterFreq: [100, 10000, 2000],
  noiseFilterQ: [0.1, 10, 1],
  decay: [0.001, 2, 0.1],
  metalAmount: [0, 1, 0],
  clickAmount: [0, 1, 0],

  // Voice - Other
  glideTime: [0, 1, 0],

  // Voice - Sample
  samplePitch: [-24, 24, 0],           // Semitones
  sampleStartPoint: [0, 1, 0],         // Normalized position
  sampleLpCutoff: [20, 20000, 20000],  // Hz
  sampleLpResonance: [0, 20, 0],       // Q
  sampleHpCutoff: [20, 20000, 20],     // Hz
  sampleHpResonance: [0, 20, 0],       // Q
  sampleSustain: [0, 1, 1],            // Level
  sampleRelease: [0.001, 5, 0.1],      // Seconds
  sampleScanSpeed: [0, 8, 1],          // Multiplier

  // Voice - Granular (Sample granular mode)
  grainDensity: [1, 100, 20],          // Grains per second
  grainLength: [0.001, 1, 0.05],       // Seconds
  grainSpread: [0, 1, 0],              // Normalized
  grainPan: [-1, 1, 0],                // Stereo position

  // Voice - Complex Morph
  complexCarrierFreq: [20, 2000, 100], // Hz
  complexNotchFreq: [20, 15000, 1000], // Hz
  complexNotchQ: [0.1, 20, 1],         // Q
  complexOutputLevel: [0, 1, 0.8],     // Level

  // Voice - Complex Morph Envelope parameters
  // Carrier pitch envelope
  complexCarrierPitchPeriod: [0.01, 10, 1],  // Seconds
  complexCarrierPitchAmount: [-1, 1, 1],     // Bipolar depth
  complexCarrierPitchRange: [0, 500, 50],    // Hz

  // Operator A envelopes
  complexOpAPitchPeriod: [0.01, 10, 1],
  complexOpAPitchAmount: [-1, 1, 1],
  complexOpAPitchRange: [0, 500, 100],
  complexOpAIndexPeriod: [0.01, 10, 1],
  complexOpAIndexAmount: [-1, 1, 1],
  complexOpAIndexMin: [0, 20, 0],
  complexOpAIndexMax: [0, 30, 10],
  complexOpALevelPeriod: [0.01, 10, 1],
  complexOpALevelAmount: [-1, 1, 1],
  complexOpALevelMax: [0, 2, 1],

  // Operator B envelopes
  complexOpBPitchPeriod: [0.01, 10, 1],
  complexOpBPitchAmount: [-1, 1, 1],
  complexOpBPitchRange: [0, 500, 100],
  complexOpBIndexPeriod: [0.01, 10, 1],
  complexOpBIndexAmount: [-1, 1, 1],
  complexOpBIndexMin: [0, 20, 0],
  complexOpBIndexMax: [0, 30, 10],
  complexOpBLevelPeriod: [0.01, 10, 1],
  complexOpBLevelAmount: [-1, 1, 1],
  complexOpBLevelMax: [0, 2, 1],

  // Operator C envelopes
  complexOpCPitchPeriod: [0.01, 10, 1],
  complexOpCPitchAmount: [-1, 1, 1],
  complexOpCPitchRange: [0, 500, 100],
  complexOpCIndexPeriod: [0.01, 10, 1],
  complexOpCIndexAmount: [-1, 1, 1],
  complexOpCIndexMin: [0, 20, 0],
  complexOpCIndexMax: [0, 30, 10],
  complexOpCLevelPeriod: [0.01, 10, 1],
  complexOpCLevelAmount: [-1, 1, 1],
  complexOpCLevelMax: [0, 2, 1],

  // Amp envelope
  complexAmpPeriod: [0.01, 10, 1],
  complexAmpAmount: [-1, 1, 1],

  // Notch filter envelope
  complexNotchEnvPeriod: [0.01, 10, 1],
  complexNotchEnvAmount: [-1, 1, 1],
  complexNotchRange: [0, 2000, 600],        // Hz

  // Voice - Ocean (granular synthesis)
  oceanPitch: [-24, 24, 0],           // Semitones
  oceanGrainSize: [10, 4000, 100],    // Milliseconds
  oceanDensity: [0, 200, 100],        // Grains per second as percentage
  oceanPosition: [0, 100, 50],        // Position in sample %
  oceanSpread: [0, 100, 10],          // Random spread %
  oceanHpfFreq: [20, 20000, 20],      // High-pass filter Hz
  oceanLpfFreq: [20, 20000, 20000],   // Low-pass filter Hz
  oceanVolume: [0, 100, 80],          // Volume %

  // Voice - Plaits (all normalized 0-1 except FM)
  plaitsHarmonics: [0, 1, 0.5],
  plaitsTimbre: [0, 1, 0.5],
  plaitsMorph: [0, 1, 0.5],
  plaitsFM: [0, 10, 0],
  plaitsDecay: [0, 1, 0.5],
  plaitsFade: [0, 1, 0],

  // Channel - Filter (type-agnostic, maps to active filter)
  filterCutoff: [20, 20000, 1000],
  filterResonance: [0, 1, 0.5],
  filterSpan: [0, 1, 0.5],
  filterDrive: [0, 1, 0.5],
  filterMorph: [-1, 1, 0],
  filterChaos: [0, 1, 0.3],
  filterWarmth: [0, 1, 0.5],

  // Channel - Saturation
  saturationDrive: [0, 1, 0],
  saturationBias: [-1, 1, 0],
  saturationMix: [0, 1, 0],

  // Channel - Sends
  delaySend1: [0, 1, 0],
  delaySend2: [0, 1, 0],
  delaySend3: [0, 1, 0],
  delaySend4: [0, 1, 0],
  reverbSend: [0, 1, 0],

  // Channel - Mix
  volume: [0, 1, 0.8],
  pan: [-1, 1, 0],

  // Note (for melodic tracks - semitone offset from base note)
  note: [-24, 24, 0],

  // FX - Mimeophon 1
  mim1Time: [0, 1, 0.5],
  mim1Feedback: [0, 1, 0.4],
  mim1Mix: [0, 1, 1],
  mim1Color: [0, 1, 0.5],
  mim1Halo: [0, 1, 0],

  // FX - Mimeophon 2
  mim2Time: [0, 1, 0.5],
  mim2Feedback: [0, 1, 0.4],
  mim2Mix: [0, 1, 1],
  mim2Color: [0, 1, 0.5],
  mim2Halo: [0, 1, 0],

  // FX - Mimeophon 3
  mim3Time: [0, 1, 0.5],
  mim3Feedback: [0, 1, 0.4],
  mim3Mix: [0, 1, 1],
  mim3Color: [0, 1, 0.5],
  mim3Halo: [0, 1, 0],

  // FX - Mimeophon 4
  mim4Time: [0, 1, 0.5],
  mim4Feedback: [0, 1, 0.4],
  mim4Mix: [0, 1, 1],
  mim4Color: [0, 1, 0.5],
  mim4Halo: [0, 1, 0],

  // FX - Reverb
  reverbSize: [0, 1, 0.5],
  reverbDamping: [0, 1, 0.5],
  reverbWidth: [0, 1, 1],
  reverbWetLevel: [0, 1, 0.3],

  // FX - Master
  masterSaturation: [0, 1, 0],
  masterTone: [-10, 10, 0],

  // Mod Source - LFO parameters
  lfo1Rate: [0.01, 30, 1],
  lfo1Depth: [0, 1, 1],
  lfo1Phase: [0, 1, 0],
  lfo2Rate: [0.01, 30, 0.5],
  lfo2Depth: [0, 1, 1],
  lfo2Phase: [0, 1, 0],
  lfo3Rate: [0.01, 30, 2],
  lfo3Depth: [0, 1, 1],
  lfo3Phase: [0, 1, 0],
  lfo4Rate: [0.01, 30, 4],
  lfo4Depth: [0, 1, 1],
  lfo4Phase: [0, 1, 0],

  // Mod Source - Random parameters
  random1Rate: [0.01, 1, 0.1],
  random1Smoothing: [0, 1, 0.8],
  random2Rate: [0.01, 1, 0.07],
  random2Smoothing: [0, 1, 0.9],

  // Mod Source - Envelope parameters
  env1Period: [0.01, 60, 1],
  env1Depth: [0, 1, 1],
  env1Phase: [0, 1, 0],
  env2Period: [0.01, 60, 1],
  env2Depth: [0, 1, 1],
  env2Phase: [0, 1, 0],
  env3Period: [0.01, 60, 1],
  env3Depth: [0, 1, 1],
  env3Phase: [0, 1, 0],
  env4Period: [0.01, 60, 1],
  env4Depth: [0, 1, 1],
  env4Phase: [0, 1, 0],
  env5Period: [0.01, 60, 1],
  env5Depth: [0, 1, 1],
  env5Phase: [0, 1, 0],
  env6Period: [0, 60, 1],
  env6Depth: [0, 1, 1],
  env6Phase: [0, 1, 0],
};

/**
 * Single modulation routing
 */
export interface ModRoute {
  id: string;               // Unique ID for the route
  source: ModulationSource; // Where modulation comes from
  destination: ModulationDestination; // What parameter to modulate
  depth: number;            // Amount of modulation (-1 to +1)
  trackTarget?: ModTrackTarget; // 'all' for all tracks, or 1-12 for specific track
  trackId?: string;         // Legacy: string track ID (for backwards compatibility)
}

/**
 * Helper to convert track target to track IDs
 */
export function getTrackIdsForTarget(target: ModTrackTarget | undefined): string[] {
  if (!target || target === 'all') {
    // Return all track IDs (track-1 through track-12)
    return Array.from({ length: 12 }, (_, i) => `track-${i + 1}`);
  }
  // Single track
  return [`track-${target}`];
}

/**
 * Check if a route applies to a specific track
 */
export function routeAppliesToTrack(route: ModRoute, trackId: string): boolean {
  // If no target specified, applies to all
  if (!route.trackTarget && !route.trackId) return true;

  // Legacy trackId support
  if (route.trackId) {
    return route.trackId === trackId;
  }

  // New trackTarget support
  if (route.trackTarget === 'all') return true;

  // Check specific track number
  // Handle both "track1" and "track-1" formats
  const trackNum = parseInt(trackId.replace(/^track-?/, ''), 10);
  const matches = route.trackTarget === trackNum;

  return matches;
}

/**
 * State for serialization
 */
export interface ModMatrixState {
  routes: ModRoute[];
  globalDepth: number;      // Master depth multiplier
  enabled: boolean;
}

/**
 * ModMatrix class - manages all modulation routing
 */
export class ModMatrix {
  private routes: Map<string, ModRoute> = new Map();
  private globalDepth: number = 1;
  private enabled: boolean = true;
  private nextRouteId: number = 1;
  private lfoManager: LFOManager | null = null;
  private envelopeManager: EnvelopeModulatorManager | null = null;

  constructor(lfoManager?: LFOManager, envelopeManager?: EnvelopeModulatorManager) {
    this.lfoManager = lfoManager ?? null;
    this.envelopeManager = envelopeManager ?? null;
  }

  /**
   * Set the LFO manager for source value lookups
   */
  setLFOManager(lfoManager: LFOManager): void {
    this.lfoManager = lfoManager;
  }

  /**
   * Set the envelope modulator manager for source value lookups
   */
  setEnvelopeManager(envelopeManager: EnvelopeModulatorManager): void {
    this.envelopeManager = envelopeManager;
  }

  /**
   * Add a new modulation route
   */
  addRoute(route: Omit<ModRoute, 'id'>): string {
    const id = `route_${this.nextRouteId++}`;
    this.routes.set(id, { ...route, id });
    return id;
  }

  /**
   * Remove a modulation route
   */
  removeRoute(id: string): boolean {
    return this.routes.delete(id);
  }

  /**
   * Update a route's parameters
   */
  updateRoute(id: string, updates: Partial<Omit<ModRoute, 'id'>>): boolean {
    const route = this.routes.get(id);
    if (!route) return false;

    Object.assign(route, updates);
    return true;
  }

  /**
   * Get all routes
   */
  getAllRoutes(): ModRoute[] {
    return Array.from(this.routes.values());
  }

  /**
   * Get routes for a specific destination
   */
  getRoutesForDestination(destination: ModulationDestination, trackId?: string): ModRoute[] {
    return this.getAllRoutes().filter(route => {
      if (route.destination !== destination) return false;
      // Check if route applies to this track using new helper
      if (trackId && !routeAppliesToTrack(route, trackId)) return false;
      return true;
    });
  }

  /**
   * Get routes from a specific source
   */
  getRoutesFromSource(source: ModulationSource): ModRoute[] {
    return this.getAllRoutes().filter(route => route.source === source);
  }

  /**
   * Get the current value of a modulation source
   */
  getSourceValue(source: ModulationSource, time: number): number {
    let value = 0;
    switch (source) {
      case 'lfo1':
        value = this.lfoManager?.getValue(0, time) ?? 0;
        break;
      case 'lfo2':
        value = this.lfoManager?.getValue(1, time) ?? 0;
        break;
      case 'lfo3':
        value = this.lfoManager?.getValue(2, time) ?? 0;
        break;
      case 'lfo4':
        value = this.lfoManager?.getValue(3, time) ?? 0;
        break;
      case 'random1':
        value = this.lfoManager?.getSlowRandomValue(1, time) ?? 0;
        break;
      case 'random2':
        value = this.lfoManager?.getSlowRandomValue(2, time) ?? 0;
        break;
      case 'env1':
        value = this.envelopeManager?.getValue(0, time) ?? 0;
        if (!this.envelopeManager) console.log('[ModMatrix] No envelope manager!');
        break;
      case 'env2':
        value = this.envelopeManager?.getValue(1, time) ?? 0;
        break;
      case 'env3':
        value = this.envelopeManager?.getValue(2, time) ?? 0;
        break;
      case 'env4':
        value = this.envelopeManager?.getValue(3, time) ?? 0;
        break;
      case 'env5':
        value = this.envelopeManager?.getValue(4, time) ?? 0;
        break;
      case 'env6':
        value = this.envelopeManager?.getValue(5, time) ?? 0;
        break;
      case 'velocity':
      case 'aftertouch':
      case 'modWheel':
        // These would be set externally - return 0 for now
        value = 0;
        break;
      default:
        value = 0;
    }
    return value;
  }

  /**
   * Calculate total modulation for a destination
   * Returns the summed modulation value to add to the base parameter
   */
  getModulationValue(
    destination: ModulationDestination,
    time: number,
    trackId?: string,
    _baseValue?: number
  ): number {
    if (!this.enabled) return 0;

    const routes = this.getRoutesForDestination(destination, trackId);
    if (routes.length === 0) return 0;

    const range = DESTINATION_RANGES[destination];
    // If no range is defined for this destination, return 0 (no modulation)
    if (!range) return 0;

    const [min, max] = range;
    const rangeSize = max - min;

    let totalMod = 0;

    for (const route of routes) {
      const sourceValue = this.getSourceValue(route.source, time);
      // Modulation depth is -1 to +1, source value is typically -1 to +1
      // Result should scale the parameter within its range
      const contribution = sourceValue * route.depth * this.globalDepth;
      totalMod += contribution;

      // Debug log for envelope sources targeting ocean position
      if (route.source.startsWith('env') && destination === 'oceanPosition') {
        console.log(`[ModMatrix] ${route.source} -> ${destination}: sourceValue=${sourceValue.toFixed(3)}, depth=${route.depth}, contribution=${contribution.toFixed(3)}`);
      }
    }

    // Scale to parameter range (baseValue reserved for future relative modulation)
    return totalMod * rangeSize * 0.5;
  }

  /**
   * Apply modulation to a base value and clamp to valid range
   */
  applyModulation(
    destination: ModulationDestination,
    baseValue: number,
    time: number,
    trackId?: string
  ): number {
    const range = DESTINATION_RANGES[destination];
    // If no range is defined for this destination, return the base value unchanged
    if (!range) {
      return baseValue;
    }

    const modValue = this.getModulationValue(destination, time, trackId, baseValue);
    const [min, max] = range;

    return Math.max(min, Math.min(max, baseValue + modValue));
  }

  /**
   * Get multiple modulated values at once (more efficient for per-frame updates)
   */
  getModulatedParams<T extends Record<string, number>>(
    params: T,
    time: number,
    trackId?: string
  ): T {
    const result = { ...params };

    for (const key of Object.keys(params)) {
      const dest = key as ModulationDestination;
      if (DESTINATION_RANGES[dest]) {
        const routes = this.getRoutesForDestination(dest, trackId);
        if (routes.length > 0) {
          result[key as keyof T] = this.applyModulation(
            dest,
            params[key as keyof T] as number,
            time,
            trackId
          ) as T[keyof T];
        }
      }
    }

    return result;
  }

  /**
   * Set global depth multiplier
   */
  setGlobalDepth(depth: number): void {
    this.globalDepth = Math.max(0, Math.min(2, depth));
  }

  /**
   * Get global depth
   */
  getGlobalDepth(): number {
    return this.globalDepth;
  }

  /**
   * Enable/disable all modulation
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if modulation is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Clear all routes
   */
  clearAllRoutes(): void {
    this.routes.clear();
    this.nextRouteId = 1;
  }

  /**
   * Clear routes for a specific track
   */
  clearTrackRoutes(trackId: string): void {
    for (const [id, route] of this.routes) {
      if (route.trackId === trackId) {
        this.routes.delete(id);
      }
    }
  }

  /**
   * Get state for serialization
   */
  getState(): ModMatrixState {
    return {
      routes: this.getAllRoutes(),
      globalDepth: this.globalDepth,
      enabled: this.enabled
    };
  }

  /**
   * Restore state
   */
  setState(state: ModMatrixState): void {
    this.routes.clear();
    this.nextRouteId = 1;

    for (const route of state.routes) {
      this.routes.set(route.id, route);
      // Update nextRouteId to avoid collisions
      const idNum = parseInt(route.id.replace('route_', ''), 10);
      if (!isNaN(idNum) && idNum >= this.nextRouteId) {
        this.nextRouteId = idNum + 1;
      }
    }

    this.globalDepth = state.globalDepth;
    this.enabled = state.enabled;
  }
}

// Preset mod routings for common effects
export const MOD_PRESETS: Record<string, Array<Omit<ModRoute, 'id'>>> = {
  subtleWobble: [
    { source: 'lfo1', destination: 'pitch', depth: 0.02 },
    { source: 'lfo2', destination: 'filterCutoff', depth: 0.1 }
  ],

  tremoloFilter: [
    { source: 'lfo1', destination: 'filterCutoff', depth: 0.3 },
    { source: 'random1', destination: 'filterCutoff', depth: 0.1 }
  ],

  fmSweep: [
    { source: 'lfo1', destination: 'op1Index', depth: 0.4 },
    { source: 'lfo2', destination: 'op2Index', depth: 0.3 }
  ],

  chaosFilter: [
    { source: 'lfo3', destination: 'filterCutoff', depth: 0.5 },
    { source: 'random1', destination: 'filterResonance', depth: 0.3 },
    { source: 'random2', destination: 'filterCutoff', depth: 0.2 }
  ],

  spaceDrift: [
    { source: 'random1', destination: 'reverbSize', depth: 0.2 },
    { source: 'random2', destination: 'mim1Feedback', depth: 0.15 },
    { source: 'lfo1', destination: 'pan', depth: 0.3 }
  ],

  rhythmicGate: [
    { source: 'lfo4', destination: 'volume', depth: 0.8 }
  ],

  organicMovement: [
    { source: 'random1', destination: 'pitch', depth: 0.01 },
    { source: 'random2', destination: 'op1Index', depth: 0.15 },
    { source: 'lfo1', destination: 'filterCutoff', depth: 0.2 }
  ],

  // New presets showcasing modulation of modulators
  metaModulation: [
    { source: 'env1', destination: 'lfo1Rate', depth: 0.5 },
    { source: 'random1', destination: 'lfo2Depth', depth: 0.3 }
  ],

  sendSweep: [
    { source: 'lfo1', destination: 'delaySend1', depth: 0.4 },
    { source: 'lfo2', destination: 'delaySend2', depth: 0.3 },
    { source: 'env1', destination: 'reverbSend', depth: 0.5 }
  ],

  saturationPulse: [
    { source: 'lfo3', destination: 'saturationDrive', depth: 0.6 },
    { source: 'random1', destination: 'saturationBias', depth: 0.2 }
  ],

  mimeophonDrift: [
    { source: 'random1', destination: 'mim1Time', depth: 0.1 },
    { source: 'random2', destination: 'mim1Color', depth: 0.2 },
    { source: 'lfo1', destination: 'mim1Halo', depth: 0.3 }
  ]
};

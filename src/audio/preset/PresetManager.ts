/**
 * PresetManager - Save and load complete application state
 *
 * Handles serialization and deserialization of all app state including:
 * - Transport settings (BPM, swing, scale)
 * - All track configurations (voice type, params, presets)
 * - Channel parameters (filter, saturation, sends)
 * - Sequences and patterns with parameter locks
 * - FX settings (Mimeophon 1-4, Reverb, Master)
 * - Modulation system (LFOs, Envelopes, Routes)
 * - Arrangement and pattern bank
 */

import type { VoiceType } from '../voices/VoiceManager';
import type { ChannelParams, FXCrossSends } from '../fx/Mixer';
import { DEFAULT_FX_CROSS_SENDS } from '../fx/Mixer';
import type { MimeophonParams } from '../fx/Mimeophon';
import type { ReverbParams } from '../fx/Reverb';
import type { MasterBusParams } from '../fx/MasterBus';
import type { LFOParams, ModRoute, EnvelopeModulatorParams } from '../mod';
import type { StepParams, TrackPerformance, TrackClockConfig } from '../engine/Sequencer';
import type { ScaleConfig } from '../music/Scale';
import { NOTE_NAMES } from '../music/Scale';

// Re-export FXCrossSends from Mixer
export type { FXCrossSends } from '../fx/Mixer';

/**
 * Version for preset format compatibility
 */
export const PRESET_VERSION = '1.0.0';

/**
 * Serialized pattern data
 */
export interface SerializedPattern {
  id: string;
  name: string;
  length: number;
  division: number;
  steps: StepParams[];
}

/**
 * Serialized track data
 */
export interface SerializedTrack {
  id: string;
  name: string;
  muted: boolean;
  solo: boolean;
  currentPatternId: string;
  patterns: SerializedPattern[];
  performance: TrackPerformance;
  clockConfig: TrackClockConfig;
  scale?: ScaleConfig;
}

/**
 * Serialized voice configuration
 */
export interface SerializedVoiceConfig {
  trackId: string;
  voiceType: VoiceType;
  preset?: string;
  params?: Record<string, unknown>;
  note?: number;
}

/**
 * Serialized channel parameters
 */
export interface SerializedChannelParams {
  trackId: string;
  params: ChannelParams;
}

/**
 * Slow random modulator params
 */
export interface SlowRandomParams {
  rate1: number;
  rate2: number;
  smoothing1: number;
  smoothing2: number;
}


/**
 * Complete preset state
 */
export interface PresetState {
  // Metadata
  version: string;
  name: string;
  createdAt: string;
  description?: string;

  // Transport
  bpm: number;
  swing: number;
  scale: ScaleConfig;

  // Tracks and sequences
  tracks: SerializedTrack[];
  voiceConfigs: SerializedVoiceConfig[];
  channelParams: SerializedChannelParams[];

  // FX
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

  // Modulation
  lfoParams: LFOParams[];
  envModParams: EnvelopeModulatorParams[];
  slowRandomParams: SlowRandomParams;
  modRoutes: ModRoute[];
  globalModDepth: number;
  modEnabled: boolean;
  microJitterEnabled: boolean;
  microJitterAmount: number;

  // Pattern bank (which slot is active)
  activePatternSlot: number;

  // Per-pattern slot configurations (voice/channel/FX per pattern)
  slotConfigs?: import('../engine/Sequencer').SerializedSlotConfigs;
}

/**
 * Generate a preset name from scale and tempo
 */
export function generatePresetName(scale: ScaleConfig, bpm: number): string {
  const rootName = NOTE_NAMES[scale.root];
  const scaleName = scale.scale;
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `${rootName}_${scaleName}_${bpm}bpm_${timestamp}`;
}

/**
 * Validate preset data structure
 */
export function validatePreset(data: unknown): data is PresetState {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const preset = data as Record<string, unknown>;

  // Check required fields
  if (typeof preset.version !== 'string') return false;
  if (typeof preset.name !== 'string') return false;
  if (typeof preset.bpm !== 'number') return false;
  if (typeof preset.swing !== 'number') return false;
  if (!Array.isArray(preset.tracks)) return false;
  if (!Array.isArray(preset.voiceConfigs)) return false;
  if (!Array.isArray(preset.channelParams)) return false;
  if (!Array.isArray(preset.lfoParams)) return false;
  if (!Array.isArray(preset.modRoutes)) return false;

  return true;
}

/**
 * Download preset as JSON file
 */
export function downloadPreset(preset: PresetState): void {
  const json = JSON.stringify(preset, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${preset.name}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Load preset from file
 */
export function loadPresetFromFile(file: File): Promise<PresetState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);

        if (!validatePreset(data)) {
          reject(new Error('Invalid preset file format'));
          return;
        }

        resolve(data);
      } catch (error) {
        reject(new Error(`Failed to parse preset file: ${error}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read preset file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Create default FX cross sends
 */
export function createDefaultFXCrossSends(): FXCrossSends {
  return { ...DEFAULT_FX_CROSS_SENDS };
}

/**
 * Create default slow random params
 */
export function createDefaultSlowRandomParams(): SlowRandomParams {
  return {
    rate1: 0.1,
    rate2: 0.07,
    smoothing1: 0.8,
    smoothing2: 0.9,
  };
}

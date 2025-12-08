/**
 * VoiceManager - Connects voices to tracks and handles trigger events
 *
 * Responsibilities:
 * - Create and manage voice instances
 * - Route track triggers to appropriate voices
 * - Handle parameter management per track
 * - Serialize/deserialize voice state
 */

import { FMDrumVoice, type FMDrumParams, FM_DRUM_PRESETS } from './FMDrumVoice';
import { FMMelodicVoice, type FMMelodicParams, FM_MELODIC_PRESETS } from './FMMelodicVoice';
import { NoiseVoice, type NoiseVoiceParams, NOISE_PRESETS } from './NoiseVoice';
import { ComplexMorphVoice, type ComplexMorphParams, COMPLEX_MORPH_PRESETS } from './ComplexMorphVoice';
import { SampleVoice, type SampleVoiceParams, SAMPLE_PRESETS } from './SampleVoice';
import { OceanVoice, type OceanVoiceParams } from './OceanVoice';
import type { PlaitsParams } from './PlaitsVoice';
import { PlaitsMelodicVoice, type PlaitsMelodicParams, PLAITS_MELODIC_PRESETS } from './PlaitsMelodicVoice';
import { PlaitsPercVoice, PLAITS_PERC_PRESETS } from './PlaitsPercVoice';
import type { TriggerEvent } from '../engine/Sequencer';
import type { Mixer } from '../fx/Mixer';
import type { ModMatrix } from '../mod/ModMatrix';

// Original voice types + individual Plaits engines (0-15)
export type VoiceType =
  | 'fm-drum' | 'fm-melodic' | 'noise' | 'complex-morph' | 'sample' | 'ocean'
  // Plaits melodic engines (0-7)
  | 'plaits-va'           // 0: Virtual Analog
  | 'plaits-waveshaper'   // 1: Waveshaper
  | 'plaits-fm'           // 2: FM
  | 'plaits-formant'      // 3: Formant
  | 'plaits-additive'     // 4: Additive
  | 'plaits-wavetable'    // 5: Wavetable
  | 'plaits-chords'       // 6: Chords
  | 'plaits-speech'       // 7: Speech
  // Plaits percussion engines (8-15)
  | 'plaits-grain'        // 8: Grain Cloud
  | 'plaits-noise'        // 9: Filtered Noise
  | 'plaits-particle'     // 10: Particle Noise
  | 'plaits-string'       // 11: Inharmonic String
  | 'plaits-modal'        // 12: Modal Resonator
  | 'plaits-kick'         // 13: Analog Kick
  | 'plaits-snare'        // 14: Analog Snare
  | 'plaits-hihat';       // 15: Analog Hi-Hat

// Helper to check if a voice type is a Plaits engine
export function isPlaitsVoice(voiceType: VoiceType): boolean {
  return voiceType.startsWith('plaits-');
}

// Helper to check if a Plaits engine is melodic (0-7)
export function isPlaitsmelodicEngine(voiceType: VoiceType): boolean {
  const melodicEngines: VoiceType[] = [
    'plaits-va', 'plaits-waveshaper', 'plaits-fm', 'plaits-formant',
    'plaits-additive', 'plaits-wavetable', 'plaits-chords', 'plaits-speech'
  ];
  return melodicEngines.includes(voiceType);
}

// Helper to check if a Plaits percussion engine is pitched (string, modal)
// These need per-step note sequencing like melodic engines
export function isPlaitsPitchedPercEngine(voiceType: VoiceType): boolean {
  return voiceType === 'plaits-string' || voiceType === 'plaits-modal';
}

// Helper to check if a voice type needs per-step note sequencing
export function needsNoteSequencing(voiceType: VoiceType): boolean {
  return voiceType === 'fm-melodic' ||
         isPlaitsmelodicEngine(voiceType) ||
         isPlaitsPitchedPercEngine(voiceType);
}

// Map voice type to Plaits engine number
export function getPlaitsEngineNumber(voiceType: VoiceType): number {
  const engineMap: Record<string, number> = {
    'plaits-va': 0,
    'plaits-waveshaper': 1,
    'plaits-fm': 2,
    'plaits-formant': 3,
    'plaits-additive': 4,
    'plaits-wavetable': 5,
    'plaits-chords': 6,
    'plaits-speech': 7,
    'plaits-grain': 8,
    'plaits-noise': 9,
    'plaits-particle': 10,
    'plaits-string': 11,
    'plaits-modal': 12,
    'plaits-kick': 13,
    'plaits-snare': 14,
    'plaits-hihat': 15,
  };
  return engineMap[voiceType] ?? 0;
}

export interface TrackVoiceConfig {
  trackId: string;
  voiceType: VoiceType;
  preset?: string;
  params?: Partial<FMDrumParams | FMMelodicParams | NoiseVoiceParams | ComplexMorphParams | SampleVoiceParams | OceanVoiceParams | PlaitsMelodicParams | PlaitsParams>;
  note?: number;  // For melodic voices - which note to trigger
}

interface TrackVoice {
  config: TrackVoiceConfig;
  voice: FMDrumVoice | FMMelodicVoice | NoiseVoice | ComplexMorphVoice | SampleVoice | OceanVoice | PlaitsMelodicVoice | PlaitsPercVoice;
  unsubscribe: () => void;
}

// Channel params that can be p-locked
interface BaseChannelState {
  filterType?: string;  // Filter type (bypass, wasp, sem, moog, threeSisters)
  filterCutoff?: number;
  filterResonance?: number;
  filterSpan?: number;  // Three Sisters span parameter
  saturationDrive?: number;
  saturationBias?: number;
  saturationMix?: number;
  sendDelay1?: number;
  sendDelay2?: number;
  sendDelay3?: number;
  sendDelay4?: number;
  sendReverb?: number;
  volume?: number;
  pan?: number;
}

export class VoiceManager {
  private ctx: AudioContext;
  private masterOutput: GainNode;
  private trackVoices: Map<string, TrackVoice> = new Map();
  private mixer: Mixer | null = null;
  private modMatrix: ModMatrix | null = null;

  // Base channel state per track - used to restore after p-locks
  private baseChannelState: Map<string, BaseChannelState> = new Map();

  // Reference to engine's onTrigger function
  private onTriggerFn: (trackId: string, callback: (event: TriggerEvent) => void) => () => void;

  constructor(
    ctx: AudioContext,
    onTrigger: (trackId: string, callback: (event: TriggerEvent) => void) => () => void,
    destination?: AudioNode
  ) {
    this.ctx = ctx;
    this.onTriggerFn = onTrigger;

    // Create master output (used as fallback if no mixer)
    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.8;

    if (destination) {
      this.masterOutput.connect(destination);
    } else {
      this.masterOutput.connect(ctx.destination);
    }
  }

  /**
   * Set the mixer for FX routing
   * When a mixer is set, voices will route through mixer channels
   */
  setMixer(mixer: Mixer): void {
    this.mixer = mixer;

    // Re-route existing voices through mixer
    for (const [trackId, trackVoice] of this.trackVoices) {
      trackVoice.voice.disconnect();
      const channelInput = mixer.createChannel(trackId);
      trackVoice.voice.connect(channelInput);
    }
  }

  /**
   * Set the modulation matrix for per-trigger modulation
   */
  setModMatrix(modMatrix: ModMatrix): void {
    this.modMatrix = modMatrix;
  }

  /**
   * Capture the base channel state for a track
   * This should be called when the user changes channel params outside of p-lock edit mode
   */
  captureBaseChannelState(trackId: string): void {
    if (!this.mixer) return;

    const params = this.mixer.getChannelParams(trackId);
    if (!params) return;

    // Extract the p-lockable values from current mixer state
    const filterType = params.filter?.type;
    const base: BaseChannelState = {
      filterType: filterType ?? 'bypass',  // Capture filter type for p-lock restoration
      saturationDrive: params.saturation?.drive,
      saturationBias: params.saturation?.bias,
      saturationMix: params.saturation?.mix,
      sendDelay1: params.delaySend,
      sendDelay2: params.delaySend2,
      sendDelay3: params.delaySend3,
      sendDelay4: params.delaySend4,
      sendReverb: params.reverbSend,
      volume: params.volume,
      pan: params.pan,
    };

    // Capture filter params based on active type
    if (filterType && filterType !== 'bypass') {
      switch (filterType) {
        case 'wasp':
          base.filterCutoff = params.filter?.wasp?.cutoff;
          base.filterResonance = params.filter?.wasp?.resonance;
          break;
        case 'sem':
          base.filterCutoff = params.filter?.sem?.cutoff;
          base.filterResonance = params.filter?.sem?.resonance;
          break;
        case 'moog':
          base.filterCutoff = params.filter?.moog?.cutoff;
          base.filterResonance = params.filter?.moog?.resonance;
          break;
        case 'threeSisters':
          base.filterCutoff = params.filter?.threeSisters?.freq;
          base.filterResonance = params.filter?.threeSisters?.quality;
          base.filterSpan = params.filter?.threeSisters?.span;
          break;
      }
    }

    this.baseChannelState.set(trackId, base);
  }

  /**
   * Get the base channel state for a track
   * Returns the state that was captured when the user last changed params outside of p-lock edit mode
   */
  getBaseChannelState(trackId: string): BaseChannelState | null {
    return this.baseChannelState.get(trackId) ?? null;
  }

  /**
   * Restore the mixer to base channel state for a track
   * Used when entering p-lock edit mode to reset the UI to the base state
   */
  restoreToBaseState(trackId: string): void {
    if (!this.mixer) return;

    const baseState = this.baseChannelState.get(trackId);
    if (!baseState) return;

    const currentParams = this.mixer.getChannelParams(trackId);
    if (!currentParams) return;

    this.restoreBaseChannelState(trackId, baseState, currentParams);
  }

  /**
   * Get the destination for a track's voice
   */
  private getDestinationForTrack(trackId: string): AudioNode {
    if (this.mixer) {
      // Get or create mixer channel for this track
      let channelInput = this.mixer.getChannelInput(trackId);
      if (!channelInput) {
        channelInput = this.mixer.createChannel(trackId);
      }
      return channelInput;
    }
    return this.masterOutput;
  }

  /**
   * Assign a voice to a track
   */
  assignVoice(config: TrackVoiceConfig): void {
    // Remove existing voice for this track if any
    this.removeVoice(config.trackId);

    // Get the appropriate destination (mixer channel or master output)
    const destination = this.getDestinationForTrack(config.trackId);

    // Create the voice
    let voice: FMDrumVoice | FMMelodicVoice | NoiseVoice | ComplexMorphVoice | SampleVoice | OceanVoice | PlaitsMelodicVoice | PlaitsPercVoice;

    switch (config.voiceType) {
      case 'fm-drum':
        voice = new FMDrumVoice(this.ctx, destination);
        if (config.preset && config.preset in FM_DRUM_PRESETS) {
          (voice as FMDrumVoice).loadPreset(config.preset as keyof typeof FM_DRUM_PRESETS);
        }
        if (config.params) {
          (voice as FMDrumVoice).setParams(config.params as Partial<FMDrumParams>);
        }
        break;

      case 'fm-melodic':
        voice = new FMMelodicVoice(this.ctx, destination);
        if (config.preset && config.preset in FM_MELODIC_PRESETS) {
          (voice as FMMelodicVoice).loadPreset(config.preset as keyof typeof FM_MELODIC_PRESETS);
        }
        if (config.params) {
          (voice as FMMelodicVoice).setParams(config.params as Partial<FMMelodicParams>);
        }
        break;

      case 'noise':
        voice = new NoiseVoice(this.ctx, destination);
        if (config.preset && config.preset in NOISE_PRESETS) {
          (voice as NoiseVoice).loadPreset(config.preset as keyof typeof NOISE_PRESETS);
        }
        if (config.params) {
          (voice as NoiseVoice).setParams(config.params as Partial<NoiseVoiceParams>);
        }
        break;

      case 'complex-morph':
        voice = new ComplexMorphVoice(this.ctx, destination);
        if (config.preset && config.preset in COMPLEX_MORPH_PRESETS) {
          (voice as ComplexMorphVoice).loadPreset(config.preset as keyof typeof COMPLEX_MORPH_PRESETS);
        }
        if (config.params) {
          (voice as ComplexMorphVoice).setParams(config.params as Partial<ComplexMorphParams>);
        }
        break;

      case 'sample': {
        voice = new SampleVoice(this.ctx, destination);
        if (config.preset && config.preset in SAMPLE_PRESETS) {
          (voice as SampleVoice).loadPreset(config.preset as keyof typeof SAMPLE_PRESETS);
        }
        if (config.params) {
          (voice as SampleVoice).setParams(config.params as Partial<SampleVoiceParams>);
          // Reload sample from URL if present (for pattern copy/paste)
          const sampleParams = config.params as Partial<SampleVoiceParams>;
          if (sampleParams.sampleUrl) {
            (voice as SampleVoice).loadSampleFromUrl(sampleParams.sampleUrl).catch(err => {
              console.error('[VoiceManager] Failed to reload sample from URL:', err);
            });
          }
        }
        break;
      }

      case 'ocean': {
        voice = new OceanVoice(this.ctx, destination);
        if (config.params) {
          (voice as OceanVoice).setParams(config.params as Partial<OceanVoiceParams>);
          // Reload sample from URL if present (for pattern copy/paste)
          const oceanParams = config.params as Partial<OceanVoiceParams>;
          if (oceanParams.sampleUrl) {
            (voice as OceanVoice).loadSampleFromUrl(oceanParams.sampleUrl).catch(err => {
              console.error('[VoiceManager] Failed to reload ocean sample from URL:', err);
            });
          }
        }
        break;
      }

      // Plaits melodic engines (0-7)
      case 'plaits-va':
      case 'plaits-waveshaper':
      case 'plaits-fm':
      case 'plaits-formant':
      case 'plaits-additive':
      case 'plaits-wavetable':
      case 'plaits-chords':
      case 'plaits-speech': {
        const engineNum = getPlaitsEngineNumber(config.voiceType);
        voice = new PlaitsMelodicVoice(this.ctx, destination);
        // Set the engine via setParams to ensure it propagates to internal params
        (voice as PlaitsMelodicVoice).setParams({ engine: engineNum as any, fm: 0 });
        if (config.preset && config.preset in PLAITS_MELODIC_PRESETS) {
          (voice as PlaitsMelodicVoice).loadPreset(config.preset as keyof typeof PLAITS_MELODIC_PRESETS);
        }
        if (config.params) {
          (voice as PlaitsMelodicVoice).setParams(config.params as Partial<PlaitsMelodicParams>);
        }
        break;
      }

      // Plaits percussion engines (8-15)
      case 'plaits-grain':
      case 'plaits-noise':
      case 'plaits-particle':
      case 'plaits-string':
      case 'plaits-modal':
      case 'plaits-kick':
      case 'plaits-snare':
      case 'plaits-hihat': {
        const engineNum = getPlaitsEngineNumber(config.voiceType);
        voice = new PlaitsPercVoice(this.ctx, destination);
        // Set the engine via setParams to ensure it propagates to internal params
        (voice as PlaitsPercVoice).setParams({ engine: engineNum as any, fm: 0 });
        if (config.preset && config.preset in PLAITS_PERC_PRESETS) {
          (voice as PlaitsPercVoice).loadPreset(config.preset as keyof typeof PLAITS_PERC_PRESETS);
        }
        if (config.params) {
          (voice as PlaitsPercVoice).setParams(config.params as Partial<PlaitsParams>);
        }
        break;
      }
    }

    // Subscribe to track triggers
    const unsubscribe = this.onTriggerFn(config.trackId, (event: TriggerEvent) => {
      this.handleTrigger(config.trackId, event);
    });

    // Store the voice
    this.trackVoices.set(config.trackId, {
      config,
      voice,
      unsubscribe
    });
  }

  /**
   * Handle a trigger event for a track
   */
  private handleTrigger(trackId: string, event: TriggerEvent): void {
    const trackVoice = this.trackVoices.get(trackId);
    if (!trackVoice) return;

    const { voice, config } = trackVoice;

    // Apply modulation from mod matrix as param locks
    const modParamLocks = this.getModulatedParams(trackId, config.voiceType, event.time);

    // Elektron-style p-lock merging priority:
    // 1. latchedParams (from p-lock system, persists between trigs) - lowest priority
    // 2. modParamLocks (from modulation matrix) - middle priority
    // 3. step paramLocks (direct step overrides) - highest priority
    // This allows modulation to still affect non-locked parameters while
    // latched p-locks take precedence over modulation for locked params
    const mergedParamLocks = {
      ...modParamLocks,           // Modulation (can be overridden)
      ...event.latchedParams,     // Latched p-locks (override modulation)
      ...event.paramLocks,        // Direct step p-locks (highest priority)
    };

    // Apply channel p-locks (filter, saturation, sends) to mixer
    this.applyChannelPLocks(trackId, mergedParamLocks);

    switch (config.voiceType) {
      case 'fm-drum':
        (voice as FMDrumVoice).trigger(event.time, event.velocity, mergedParamLocks as Partial<FMDrumParams>);
        break;

      case 'fm-melodic': {
        const melodicVoice = voice as FMMelodicVoice;
        // Use per-step note if available, otherwise fall back to track default
        const note = event.note ?? config.note ?? 60;
        // For sequencer use, we trigger with a fixed duration based on step
        const duration = 0.2;  // TODO: Get from step or pattern
        melodicVoice.trigger(note, event.velocity, event.time, duration, mergedParamLocks as Partial<FMMelodicParams>);
        break;
      }

      case 'noise':
        (voice as NoiseVoice).trigger(event.time, event.velocity, mergedParamLocks as Partial<NoiseVoiceParams>);
        break;

      case 'complex-morph':
        (voice as ComplexMorphVoice).trigger(event.time, event.velocity, mergedParamLocks as Partial<ComplexMorphParams>);
        break;

      case 'sample':
        (voice as SampleVoice).trigger(event.time, event.velocity, mergedParamLocks as Partial<SampleVoiceParams>);
        break;

      case 'ocean':
        (voice as OceanVoice).trigger(event.time, event.velocity, mergedParamLocks as Partial<OceanVoiceParams>);
        break;

      // Plaits melodic engines (0-7)
      case 'plaits-va':
      case 'plaits-waveshaper':
      case 'plaits-fm':
      case 'plaits-formant':
      case 'plaits-additive':
      case 'plaits-wavetable':
      case 'plaits-chords':
      case 'plaits-speech': {
        const plaitsMelodicVoice = voice as PlaitsMelodicVoice;
        // Use per-step note if available, otherwise fall back to track default
        const note = event.note ?? config.note ?? 60;
        const duration = 0.2;  // TODO: Get from step or pattern
        plaitsMelodicVoice.triggerNote(note, event.velocity, event.time, duration, mergedParamLocks as Partial<PlaitsMelodicParams>);
        break;
      }

      // Plaits pitched percussion engines (string, modal) - support note sequencing
      case 'plaits-string':
      case 'plaits-modal': {
        const note = event.note ?? config.note ?? 48;
        (voice as PlaitsPercVoice).trigger(event.time, event.velocity, { ...mergedParamLocks as Partial<PlaitsParams>, note });
        break;
      }

      // Plaits non-pitched percussion engines
      case 'plaits-grain':
      case 'plaits-noise':
      case 'plaits-particle':
      case 'plaits-kick':
      case 'plaits-snare':
      case 'plaits-hihat':
        (voice as PlaitsPercVoice).trigger(event.time, event.velocity, mergedParamLocks as Partial<PlaitsParams>);
        break;
    }
  }

  /**
   * Apply channel p-locks (filter, saturation, sends) to the mixer
   * This handles p-locks that affect the mixer channel rather than the voice itself
   *
   * When a step has channel p-locks, they are applied to the mixer.
   * When a step has NO channel p-locks, we restore base values.
   */
  private applyChannelPLocks(trackId: string, pLocks: Record<string, number | string>): void {
    if (!this.mixer) return;

    const channelPLockKeys = [
      'filterType', 'filterCutoff', 'filterResonance', 'filterSpan',
      'saturationDrive', 'saturationBias', 'saturationMix',
      'sendDelay1', 'sendDelay2', 'sendDelay3', 'sendDelay4', 'sendReverb',
      'volume', 'pan'
    ];

    // Check if any channel-related p-locks are present
    const hasChannelPLocks = channelPLockKeys.some(key => key in pLocks);

    // Debug logging
    const channelPLocksInEvent = channelPLockKeys.filter(key => key in pLocks);
    if (channelPLocksInEvent.length > 0) {
      console.log(`[VoiceManager] Channel p-locks for ${trackId}:`, channelPLocksInEvent.map(k => `${k}=${pLocks[k]}`));
    }

    // Get current channel params
    const currentParams = this.mixer.getChannelParams(trackId);
    if (!currentParams) return;

    // Get base channel state (if we have it)
    const baseState = this.baseChannelState.get(trackId);

    // If no channel p-locks, restore base values (if we have them captured)
    if (!hasChannelPLocks) {
      if (baseState) {
        this.restoreBaseChannelState(trackId, baseState, currentParams);
      }
      return;
    }

    // Build partial update with p-locked values
    const updates: Partial<{
      filter: Partial<{
        type: string;
        wasp: { cutoff?: number; resonance?: number };
        sem: { cutoff?: number; resonance?: number };
        moog: { cutoff?: number; resonance?: number };
        threeSisters: { freq?: number; quality?: number; span?: number };
      }>;
      saturation: { drive?: number; bias?: number; mix?: number };
      delaySend: number;
      delaySend2: number;
      delaySend3: number;
      delaySend4: number;
      reverbSend: number;
      volume: number;
      pan: number;
    }> = {};

    // Filter p-locks - use p-locked filter type if available, otherwise use current type
    const hasFilterPLocks = pLocks.filterType !== undefined ||
                            pLocks.filterCutoff !== undefined ||
                            pLocks.filterResonance !== undefined ||
                            pLocks.filterSpan !== undefined;

    if (hasFilterPLocks) {
      // Map numeric filter type p-lock back to string
      const filterTypeReverseMap: Record<number, string> = {
        0: 'bypass', 1: 'wasp', 2: 'sem', 3: 'moog', 4: 'threeSisters'
      };

      // Use p-locked filter type if available, otherwise use current mixer filter type
      const filterType = pLocks.filterType !== undefined
        ? filterTypeReverseMap[pLocks.filterType as number] ?? 'bypass'
        : currentParams.filter?.type;

      console.log(`[VoiceManager] Filter type for ${trackId}: ${filterType} (p-locked: ${pLocks.filterType !== undefined}), p-locks:`, {
        type: pLocks.filterType,
        cutoff: pLocks.filterCutoff,
        resonance: pLocks.filterResonance,
        span: pLocks.filterSpan
      });

      if (filterType && filterType !== 'bypass') {
        updates.filter = { ...currentParams.filter, type: filterType };

        // Apply cutoff/resonance to the active filter type
        // IMPORTANT: Different filter types use different value ranges:
        // - Three Sisters: freq is 0-1 normalized
        // - Wasp/SEM/Moog: cutoff is 20-20000 Hz
        // Only apply values if they're in the expected range for the filter type
        const cutoff = pLocks.filterCutoff as number | undefined;
        const resonance = pLocks.filterResonance as number | undefined;

        switch (filterType) {
          case 'wasp':
            if (!updates.filter.wasp) updates.filter.wasp = { ...currentParams.filter?.wasp };
            // Wasp cutoff is in Hz (20-20000), skip if value looks like normalized 0-1
            if (cutoff !== undefined && cutoff >= 20) updates.filter.wasp.cutoff = cutoff;
            if (resonance !== undefined) updates.filter.wasp.resonance = resonance;
            break;
          case 'sem':
            if (!updates.filter.sem) updates.filter.sem = { ...currentParams.filter?.sem };
            // SEM cutoff is in Hz (20-20000), skip if value looks like normalized 0-1
            if (cutoff !== undefined && cutoff >= 20) updates.filter.sem.cutoff = cutoff;
            if (resonance !== undefined) updates.filter.sem.resonance = resonance;
            break;
          case 'moog':
            if (!updates.filter.moog) updates.filter.moog = { ...currentParams.filter?.moog };
            // Moog cutoff is in Hz (20-20000), skip if value looks like normalized 0-1
            if (cutoff !== undefined && cutoff >= 20) updates.filter.moog.cutoff = cutoff;
            if (resonance !== undefined) updates.filter.moog.resonance = resonance;
            break;
          case 'threeSisters':
            if (!updates.filter.threeSisters) updates.filter.threeSisters = { ...currentParams.filter?.threeSisters };
            // Three Sisters uses normalized 0-1, skip if value looks like Hz
            if (cutoff !== undefined && cutoff <= 1) updates.filter.threeSisters.freq = cutoff;
            if (resonance !== undefined) updates.filter.threeSisters.quality = resonance;
            if (pLocks.filterSpan !== undefined) updates.filter.threeSisters.span = pLocks.filterSpan as number;
            break;
        }
      } else if (filterType === 'bypass') {
        // P-locked filter type is bypass - ensure filter is set to bypass
        updates.filter = { ...currentParams.filter, type: 'bypass' };
      }
    }

    // Saturation p-locks
    if (pLocks.saturationDrive !== undefined || pLocks.saturationBias !== undefined || pLocks.saturationMix !== undefined) {
      updates.saturation = { ...currentParams.saturation };
      if (pLocks.saturationDrive !== undefined) updates.saturation.drive = pLocks.saturationDrive as number;
      if (pLocks.saturationBias !== undefined) updates.saturation.bias = pLocks.saturationBias as number;
      if (pLocks.saturationMix !== undefined) updates.saturation.mix = pLocks.saturationMix as number;
    }

    // Send p-locks
    if (pLocks.sendDelay1 !== undefined) updates.delaySend = pLocks.sendDelay1 as number;
    if (pLocks.sendDelay2 !== undefined) updates.delaySend2 = pLocks.sendDelay2 as number;
    if (pLocks.sendDelay3 !== undefined) updates.delaySend3 = pLocks.sendDelay3 as number;
    if (pLocks.sendDelay4 !== undefined) updates.delaySend4 = pLocks.sendDelay4 as number;
    if (pLocks.sendReverb !== undefined) updates.reverbSend = pLocks.sendReverb as number;

    // Volume and pan p-locks
    if (pLocks.volume !== undefined) updates.volume = pLocks.volume as number;
    if (pLocks.pan !== undefined) updates.pan = pLocks.pan as number;

    // Apply updates to mixer
    if (Object.keys(updates).length > 0) {
      console.log(`[VoiceManager] Applying channel updates for ${trackId}:`, updates);
      this.mixer.updateChannel(trackId, updates as any);
    }
  }

  /**
   * Restore base channel state for a track
   * Called when a step without p-locks triggers
   */
  private restoreBaseChannelState(
    trackId: string,
    baseState: BaseChannelState,
    currentParams: ReturnType<Mixer['getChannelParams']>
  ): void {
    if (!this.mixer || !currentParams) return;

    const updates: Partial<{
      filter: Partial<{
        type: string;
        wasp: { cutoff?: number; resonance?: number };
        sem: { cutoff?: number; resonance?: number };
        moog: { cutoff?: number; resonance?: number };
        threeSisters: { freq?: number; quality?: number; span?: number };
      }>;
      saturation: { drive?: number; bias?: number; mix?: number };
      delaySend: number;
      delaySend2: number;
      delaySend3: number;
      delaySend4: number;
      reverbSend: number;
      volume: number;
      pan: number;
    }> = {};

    // Restore filter type and params
    // IMPORTANT: Always restore the base filter type - this allows p-locks to temporarily enable a filter
    // that reverts to bypass (or another filter type) when the p-locked step is over
    if (baseState.filterType !== undefined) {
      updates.filter = { ...currentParams.filter, type: baseState.filterType };

      // Only restore filter params if the base type is not bypass
      if (baseState.filterType !== 'bypass') {
        switch (baseState.filterType) {
          case 'wasp':
            updates.filter.wasp = { ...currentParams.filter?.wasp };
            if (baseState.filterCutoff !== undefined) updates.filter.wasp.cutoff = baseState.filterCutoff;
            if (baseState.filterResonance !== undefined) updates.filter.wasp.resonance = baseState.filterResonance;
            break;
          case 'sem':
            updates.filter.sem = { ...currentParams.filter?.sem };
            if (baseState.filterCutoff !== undefined) updates.filter.sem.cutoff = baseState.filterCutoff;
            if (baseState.filterResonance !== undefined) updates.filter.sem.resonance = baseState.filterResonance;
            break;
          case 'moog':
            updates.filter.moog = { ...currentParams.filter?.moog };
            if (baseState.filterCutoff !== undefined) updates.filter.moog.cutoff = baseState.filterCutoff;
            if (baseState.filterResonance !== undefined) updates.filter.moog.resonance = baseState.filterResonance;
            break;
          case 'threeSisters':
            updates.filter.threeSisters = { ...currentParams.filter?.threeSisters };
            if (baseState.filterCutoff !== undefined) updates.filter.threeSisters.freq = baseState.filterCutoff;
            if (baseState.filterResonance !== undefined) updates.filter.threeSisters.quality = baseState.filterResonance;
            if (baseState.filterSpan !== undefined) updates.filter.threeSisters.span = baseState.filterSpan;
            break;
        }
      }
    }

    // Restore saturation
    if (baseState.saturationDrive !== undefined || baseState.saturationBias !== undefined || baseState.saturationMix !== undefined) {
      updates.saturation = { ...currentParams.saturation };
      if (baseState.saturationDrive !== undefined) updates.saturation.drive = baseState.saturationDrive;
      if (baseState.saturationBias !== undefined) updates.saturation.bias = baseState.saturationBias;
      if (baseState.saturationMix !== undefined) updates.saturation.mix = baseState.saturationMix;
    }

    // Restore sends
    if (baseState.sendDelay1 !== undefined) updates.delaySend = baseState.sendDelay1;
    if (baseState.sendDelay2 !== undefined) updates.delaySend2 = baseState.sendDelay2;
    if (baseState.sendDelay3 !== undefined) updates.delaySend3 = baseState.sendDelay3;
    if (baseState.sendDelay4 !== undefined) updates.delaySend4 = baseState.sendDelay4;
    if (baseState.sendReverb !== undefined) updates.reverbSend = baseState.sendReverb;

    // Restore volume and pan
    if (baseState.volume !== undefined) updates.volume = baseState.volume;
    if (baseState.pan !== undefined) updates.pan = baseState.pan;

    if (Object.keys(updates).length > 0) {
      this.mixer.updateChannel(trackId, updates as any);
    }
  }

  /**
   * Get modulated parameters from mod matrix for a trigger
   * Maps mod destinations to voice-specific parameter names AND channel parameters
   */
  private getModulatedParams(
    trackId: string,
    voiceType: VoiceType,
    time: number
  ): Record<string, number> {
    if (!this.modMatrix) {
      console.log('[VoiceManager] No modMatrix set');
      return {};
    }

    const result: Record<string, number> = {};

    // Get base params from voice to modulate
    const trackVoice = this.trackVoices.get(trackId);
    if (!trackVoice) return result;

    const baseParams = this.getVoiceBaseParams(trackVoice.voice, voiceType);

    // Map mod destinations to voice parameter names based on voice type
    const destToParam = this.getDestinationMapping(voiceType);

    // Debug: Log all routes for this track
    const allRoutes = this.modMatrix.getAllRoutes();
    const routesForTrack = allRoutes.filter(r => {
      const target = r.trackTarget ?? 'all';
      if (target === 'all') return true;
      const trackNum = parseInt(trackId.replace('track-', ''), 10);
      return target === trackNum;
    });

    if (routesForTrack.length > 0) {
      console.log(`[VoiceManager] Found ${routesForTrack.length} routes for ${trackId}:`,
        routesForTrack.map(r => `${r.source} -> ${r.destination} (depth: ${r.depth})`));
    }

    for (const [dest, paramName] of Object.entries(destToParam)) {
      const baseValue = baseParams[paramName];
      if (baseValue !== undefined) {
        const modulated = this.modMatrix.applyModulation(
          dest as any,
          baseValue,
          time,
          trackId
        );
        // Only include if modulation changed the value
        if (Math.abs(modulated - baseValue) > 0.0001) {
          console.log(`[VoiceManager] Modulation applied: ${dest} -> ${paramName}: ${baseValue} -> ${modulated}`);
          result[paramName] = modulated;
        }
      }
    }

    // Also apply channel modulation (filter, saturation, sends)
    // These use the channel p-lock names to integrate with applyChannelPLocks
    this.applyChannelModulation(trackId, time, result);

    return result;
  }

  /**
   * Apply channel-level modulation (filter, saturation, sends)
   * Adds modulated values to the result object using p-lock parameter names
   */
  private applyChannelModulation(
    trackId: string,
    time: number,
    result: Record<string, number>
  ): void {
    if (!this.modMatrix || !this.mixer) return;

    const currentParams = this.mixer.getChannelParams(trackId);
    if (!currentParams) return;

    // Channel destination to p-lock parameter mapping
    const channelDestinations: Array<{
      dest: string;
      pLockName: string;
      getBase: () => number | undefined;
    }> = [
      // Filter parameters (map to active filter type)
      {
        dest: 'filterCutoff',
        pLockName: 'filterCutoff',
        getBase: () => {
          const type = currentParams.filter?.type;
          if (!type || type === 'bypass') return undefined;
          switch (type) {
            case 'wasp': return currentParams.filter?.wasp?.cutoff;
            case 'sem': return currentParams.filter?.sem?.cutoff;
            case 'moog': return currentParams.filter?.moog?.cutoff;
            case 'threeSisters': return currentParams.filter?.threeSisters?.freq;
            default: return undefined;
          }
        }
      },
      {
        dest: 'filterResonance',
        pLockName: 'filterResonance',
        getBase: () => {
          const type = currentParams.filter?.type;
          if (!type || type === 'bypass') return undefined;
          switch (type) {
            case 'wasp': return currentParams.filter?.wasp?.resonance;
            case 'sem': return currentParams.filter?.sem?.resonance;
            case 'moog': return currentParams.filter?.moog?.resonance;
            case 'threeSisters': return currentParams.filter?.threeSisters?.quality;
            default: return undefined;
          }
        }
      },
      {
        dest: 'filterSpan',
        pLockName: 'filterSpan',
        getBase: () => currentParams.filter?.threeSisters?.span
      },
      {
        dest: 'filterDrive',
        pLockName: 'filterDrive',
        getBase: () => {
          const type = currentParams.filter?.type;
          switch (type) {
            case 'wasp': return currentParams.filter?.wasp?.drive;
            case 'sem': return currentParams.filter?.sem?.drive;
            case 'moog': return currentParams.filter?.moog?.drive;
            default: return undefined;
          }
        }
      },
      // Saturation
      { dest: 'saturationDrive', pLockName: 'saturationDrive', getBase: () => currentParams.saturation?.drive },
      { dest: 'saturationBias', pLockName: 'saturationBias', getBase: () => currentParams.saturation?.bias },
      { dest: 'saturationMix', pLockName: 'saturationMix', getBase: () => currentParams.saturation?.mix },
      // Sends
      { dest: 'delaySend1', pLockName: 'sendDelay1', getBase: () => currentParams.delaySend },
      { dest: 'delaySend2', pLockName: 'sendDelay2', getBase: () => currentParams.delaySend2 },
      { dest: 'delaySend3', pLockName: 'sendDelay3', getBase: () => currentParams.delaySend3 },
      { dest: 'delaySend4', pLockName: 'sendDelay4', getBase: () => currentParams.delaySend4 },
      { dest: 'reverbSend', pLockName: 'sendReverb', getBase: () => currentParams.reverbSend },
      // Mix
      { dest: 'volume', pLockName: 'volume', getBase: () => currentParams.volume },
      { dest: 'pan', pLockName: 'pan', getBase: () => currentParams.pan },
    ];

    for (const { dest, pLockName, getBase } of channelDestinations) {
      const baseValue = getBase();
      if (baseValue !== undefined) {
        const modulated = this.modMatrix.applyModulation(
          dest as any,
          baseValue,
          time,
          trackId
        );
        // Only include if modulation changed the value
        if (Math.abs(modulated - baseValue) > 0.0001) {
          result[pLockName] = modulated;
        }
      }
    }
  }

  /**
   * Get base parameters from a voice
   */
  private getVoiceBaseParams(
    voice: FMDrumVoice | FMMelodicVoice | NoiseVoice | ComplexMorphVoice | SampleVoice | OceanVoice | PlaitsMelodicVoice | PlaitsPercVoice,
    voiceType: VoiceType
  ): Record<string, number> {
    switch (voiceType) {
      case 'fm-drum':
        return (voice as FMDrumVoice).getParams() as unknown as Record<string, number>;
      case 'fm-melodic':
        return (voice as FMMelodicVoice).getParams() as unknown as Record<string, number>;
      case 'noise':
        return (voice as NoiseVoice).getParams() as unknown as Record<string, number>;
      case 'complex-morph':
        return (voice as ComplexMorphVoice).getParams() as unknown as Record<string, number>;
      case 'sample':
        return (voice as SampleVoice).getParams() as unknown as Record<string, number>;
      case 'ocean':
        return (voice as OceanVoice).getParams() as unknown as Record<string, number>;
      // Plaits melodic engines (0-7)
      case 'plaits-va':
      case 'plaits-waveshaper':
      case 'plaits-fm':
      case 'plaits-formant':
      case 'plaits-additive':
      case 'plaits-wavetable':
      case 'plaits-chords':
      case 'plaits-speech':
        return (voice as PlaitsMelodicVoice).getParams() as unknown as Record<string, number>;
      // Plaits percussion engines (8-15)
      case 'plaits-grain':
      case 'plaits-noise':
      case 'plaits-particle':
      case 'plaits-string':
      case 'plaits-modal':
      case 'plaits-kick':
      case 'plaits-snare':
      case 'plaits-hihat':
        return (voice as PlaitsPercVoice).getParams() as unknown as Record<string, number>;
    }
  }

  /**
   * Map mod matrix destinations to voice parameter names
   */
  private getDestinationMapping(voiceType: VoiceType): Record<string, string> {
    switch (voiceType) {
      case 'fm-drum':
        return {
          pitch: 'pitch',
          pitchEnvAmount: 'pitchEnvAmount',
          pitchEnvDecay: 'pitchEnvDecay',
          op1Ratio: 'op1Ratio',
          op1Index: 'op1Index',
          op1Feedback: 'op1Feedback',
          op2Ratio: 'op2Ratio',
          op2Index: 'op2Index',
          op2ToOp1: 'op2ToOp1',
          ampAttack: 'ampAttack',
          ampDecay: 'ampDecay',
          noiseMix: 'noiseMix',
          noiseDecay: 'noiseDecay',
          noiseFilterFreq: 'noiseFilterFreq'
        };
      case 'fm-melodic':
        return {
          filterCutoff: 'filterFreq',
          filterQ: 'filterQ',
          filterEnvAmount: 'filterEnvAmount',
          fmIndex: 'op2Index',  // Map to main FM index
          fmIndexEnvAmount: 'indexEnvAmount',
          ampAttack: 'ampAttack',
          ampDecay: 'ampDecay',
          glideTime: 'glideTime'
        };
      case 'noise':
        return {
          decay: 'decay',
          filterFreq: 'filterFreq',
          filterQ: 'filterQ',
          noiseFilterQ: 'filterQ',
          metalAmount: 'metallicGain',
          clickAmount: 'clickGain'
        };
      case 'complex-morph':
        return {
          // Carrier
          pitch: 'carrierFreq',
          complexCarrierFreq: 'carrierFreq',
          // Notch filter
          filterFreq: 'notchFreq',
          filterQ: 'notchQ',
          complexNotchFreq: 'notchFreq',
          complexNotchQ: 'notchQ',
          // Output
          complexOutputLevel: 'outputLevel',
          // Carrier pitch envelope
          complexCarrierPitchPeriod: 'carrierPitchEnv.period',
          complexCarrierPitchAmount: 'carrierPitchEnv.amount',
          complexCarrierPitchRange: 'carrierPitchRange',
          // Operator A envelopes
          complexOpAPitchPeriod: 'opA.envelopes.pitch.period',
          complexOpAPitchAmount: 'opA.envelopes.pitch.amount',
          complexOpAPitchRange: 'opA.envelopes.pitchRange',
          complexOpAIndexPeriod: 'opA.envelopes.index.period',
          complexOpAIndexAmount: 'opA.envelopes.index.amount',
          complexOpAIndexMin: 'opA.envelopes.indexMin',
          complexOpAIndexMax: 'opA.envelopes.indexMax',
          complexOpALevelPeriod: 'opA.envelopes.level.period',
          complexOpALevelAmount: 'opA.envelopes.level.amount',
          complexOpALevelMax: 'opA.envelopes.levelMax',
          // Operator B envelopes
          complexOpBPitchPeriod: 'opB.envelopes.pitch.period',
          complexOpBPitchAmount: 'opB.envelopes.pitch.amount',
          complexOpBPitchRange: 'opB.envelopes.pitchRange',
          complexOpBIndexPeriod: 'opB.envelopes.index.period',
          complexOpBIndexAmount: 'opB.envelopes.index.amount',
          complexOpBIndexMin: 'opB.envelopes.indexMin',
          complexOpBIndexMax: 'opB.envelopes.indexMax',
          complexOpBLevelPeriod: 'opB.envelopes.level.period',
          complexOpBLevelAmount: 'opB.envelopes.level.amount',
          complexOpBLevelMax: 'opB.envelopes.levelMax',
          // Operator C envelopes
          complexOpCPitchPeriod: 'opC.envelopes.pitch.period',
          complexOpCPitchAmount: 'opC.envelopes.pitch.amount',
          complexOpCPitchRange: 'opC.envelopes.pitchRange',
          complexOpCIndexPeriod: 'opC.envelopes.index.period',
          complexOpCIndexAmount: 'opC.envelopes.index.amount',
          complexOpCIndexMin: 'opC.envelopes.indexMin',
          complexOpCIndexMax: 'opC.envelopes.indexMax',
          complexOpCLevelPeriod: 'opC.envelopes.level.period',
          complexOpCLevelAmount: 'opC.envelopes.level.amount',
          complexOpCLevelMax: 'opC.envelopes.levelMax',
          // Amp envelope
          complexAmpPeriod: 'ampEnv.period',
          complexAmpAmount: 'ampEnv.amount',
          // Notch filter envelope
          complexNotchEnvPeriod: 'notchEnv.period',
          complexNotchEnvAmount: 'notchEnv.amount',
          complexNotchRange: 'notchRange'
        };
      case 'sample':
        return {
          // Pitch (semitones)
          samplePitch: 'pitch',
          // Start position
          sampleStartPoint: 'startPoint',
          // Lowpass filter
          filterCutoff: 'lpCutoff',
          filterQ: 'lpResonance',
          sampleLpCutoff: 'lpCutoff',
          sampleLpResonance: 'lpResonance',
          // Highpass filter
          sampleHpCutoff: 'hpCutoff',
          sampleHpResonance: 'hpResonance',
          // Envelope
          ampAttack: 'attack',
          ampDecay: 'decay',
          sampleSustain: 'sustain',
          sampleRelease: 'release',
          // Granular mode
          grainDensity: 'grainDensity',
          grainLength: 'grainLength',
          grainSpread: 'spread',
          grainPan: 'grainPan',
          sampleScanSpeed: 'scanSpeed'
        };
      case 'ocean':
        // Ocean voice has dedicated mod destinations with matching scales
        return {
          oceanPitch: 'pitch',           // Semitones (-24 to +24)
          oceanGrainSize: 'grainSize',   // Milliseconds (10-4000)
          oceanDensity: 'density',       // Percentage (0-200)
          oceanPosition: 'position',     // Percentage (0-100)
          oceanSpread: 'spread',         // Percentage (0-100)
          oceanHpfFreq: 'hpfFreq',       // Hz (20-20000)
          oceanLpfFreq: 'lpfFreq',       // Hz (20-20000)
          oceanVolume: 'volume',         // Percentage (0-100)
        };
      // Plaits melodic engines (0-7)
      case 'plaits-va':
      case 'plaits-waveshaper':
      case 'plaits-fm':
      case 'plaits-formant':
      case 'plaits-additive':
      case 'plaits-wavetable':
      case 'plaits-chords':
      case 'plaits-speech':
      // Plaits percussion engines (8-15)
      case 'plaits-grain':
      case 'plaits-noise':
      case 'plaits-particle':
      case 'plaits-string':
      case 'plaits-modal':
      case 'plaits-kick':
      case 'plaits-snare':
      case 'plaits-hihat':
        // Plaits voices use normalized 0-1 parameters
        return {
          plaitsHarmonics: 'harmonics',
          plaitsTimbre: 'timbre',
          plaitsMorph: 'morph',
          plaitsFM: 'fm',
          plaitsDecay: 'decay',
          plaitsFade: 'fade',
          glideTime: 'glideTime'
        };
    }
  }

  /**
   * Remove a voice from a track
   */
  removeVoice(trackId: string): void {
    const trackVoice = this.trackVoices.get(trackId);
    if (trackVoice) {
      trackVoice.unsubscribe();
      trackVoice.voice.disconnect();
      this.trackVoices.delete(trackId);
    }
  }

  /**
   * Get the voice for a track
   */
  getVoice(trackId: string): FMDrumVoice | FMMelodicVoice | NoiseVoice | ComplexMorphVoice | SampleVoice | OceanVoice | PlaitsMelodicVoice | PlaitsPercVoice | null {
    const trackVoice = this.trackVoices.get(trackId);
    return trackVoice?.voice ?? null;
  }

  /**
   * Get the voice configuration for a track
   * Returns full params from the actual voice, not just what was initially set
   */
  getVoiceConfig(trackId: string): TrackVoiceConfig | null {
    const trackVoice = this.trackVoices.get(trackId);
    if (!trackVoice) return null;

    // Get actual current params from the voice
    let params: Partial<FMDrumParams | FMMelodicParams | NoiseVoiceParams | ComplexMorphParams | SampleVoiceParams | OceanVoiceParams | PlaitsMelodicParams | PlaitsParams>;
    switch (trackVoice.config.voiceType) {
      case 'fm-drum':
        params = (trackVoice.voice as FMDrumVoice).getParams();
        break;
      case 'fm-melodic':
        params = (trackVoice.voice as FMMelodicVoice).getParams();
        break;
      case 'noise':
        params = (trackVoice.voice as NoiseVoice).getParams();
        break;
      case 'complex-morph':
        params = (trackVoice.voice as ComplexMorphVoice).getParams();
        break;
      case 'sample':
        params = (trackVoice.voice as SampleVoice).getParams();
        break;
      case 'ocean':
        params = (trackVoice.voice as OceanVoice).getParams();
        break;
      // Plaits melodic engines (0-7)
      case 'plaits-va':
      case 'plaits-waveshaper':
      case 'plaits-fm':
      case 'plaits-formant':
      case 'plaits-additive':
      case 'plaits-wavetable':
      case 'plaits-chords':
      case 'plaits-speech':
        params = (trackVoice.voice as PlaitsMelodicVoice).getParams();
        break;
      // Plaits percussion engines (8-15)
      case 'plaits-grain':
      case 'plaits-noise':
      case 'plaits-particle':
      case 'plaits-string':
      case 'plaits-modal':
      case 'plaits-kick':
      case 'plaits-snare':
      case 'plaits-hihat':
        params = (trackVoice.voice as PlaitsPercVoice).getParams();
        break;
    }

    return {
      ...trackVoice.config,
      params
    };
  }

  /**
   * Update voice parameters for a track
   */
  updateVoiceParams(
    trackId: string,
    params: Partial<FMDrumParams | FMMelodicParams | NoiseVoiceParams | ComplexMorphParams | SampleVoiceParams | OceanVoiceParams | PlaitsMelodicParams | PlaitsParams>
  ): void {
    const trackVoice = this.trackVoices.get(trackId);
    if (!trackVoice) return;

    switch (trackVoice.config.voiceType) {
      case 'fm-drum':
        (trackVoice.voice as FMDrumVoice).setParams(params as Partial<FMDrumParams>);
        break;
      case 'fm-melodic':
        (trackVoice.voice as FMMelodicVoice).setParams(params as Partial<FMMelodicParams>);
        break;
      case 'noise':
        (trackVoice.voice as NoiseVoice).setParams(params as Partial<NoiseVoiceParams>);
        break;
      case 'complex-morph':
        (trackVoice.voice as ComplexMorphVoice).setParams(params as Partial<ComplexMorphParams>);
        break;
      case 'sample':
        (trackVoice.voice as SampleVoice).setParams(params as Partial<SampleVoiceParams>);
        break;
      case 'ocean':
        (trackVoice.voice as OceanVoice).setParams(params as Partial<OceanVoiceParams>);
        break;
      // Plaits melodic engines (0-7)
      case 'plaits-va':
      case 'plaits-waveshaper':
      case 'plaits-fm':
      case 'plaits-formant':
      case 'plaits-additive':
      case 'plaits-wavetable':
      case 'plaits-chords':
      case 'plaits-speech':
        (trackVoice.voice as PlaitsMelodicVoice).setParams(params as Partial<PlaitsMelodicParams>);
        break;
      // Plaits percussion engines (8-15)
      case 'plaits-grain':
      case 'plaits-noise':
      case 'plaits-particle':
      case 'plaits-string':
      case 'plaits-modal':
      case 'plaits-kick':
      case 'plaits-snare':
      case 'plaits-hihat':
        (trackVoice.voice as PlaitsPercVoice).setParams(params as Partial<PlaitsParams>);
        break;
    }

    // Update stored config
    trackVoice.config.params = { ...trackVoice.config.params, ...params };
  }

  /**
   * Load a preset for a track's voice
   */
  loadPreset(trackId: string, presetName: string): void {
    const trackVoice = this.trackVoices.get(trackId);
    if (!trackVoice) return;

    switch (trackVoice.config.voiceType) {
      case 'fm-drum':
        if (presetName in FM_DRUM_PRESETS) {
          (trackVoice.voice as FMDrumVoice).loadPreset(presetName as keyof typeof FM_DRUM_PRESETS);
        }
        break;
      case 'fm-melodic':
        if (presetName in FM_MELODIC_PRESETS) {
          (trackVoice.voice as FMMelodicVoice).loadPreset(presetName as keyof typeof FM_MELODIC_PRESETS);
        }
        break;
      case 'noise':
        if (presetName in NOISE_PRESETS) {
          (trackVoice.voice as NoiseVoice).loadPreset(presetName as keyof typeof NOISE_PRESETS);
        }
        break;
      case 'complex-morph':
        if (presetName in COMPLEX_MORPH_PRESETS) {
          (trackVoice.voice as ComplexMorphVoice).loadPreset(presetName as keyof typeof COMPLEX_MORPH_PRESETS);
        }
        break;
      case 'sample':
        if (presetName in SAMPLE_PRESETS) {
          (trackVoice.voice as SampleVoice).loadPreset(presetName as keyof typeof SAMPLE_PRESETS);
        }
        break;
      case 'ocean':
        // Ocean voice has no presets
        break;
      // Plaits melodic engines (0-7)
      case 'plaits-va':
      case 'plaits-waveshaper':
      case 'plaits-fm':
      case 'plaits-formant':
      case 'plaits-additive':
      case 'plaits-wavetable':
      case 'plaits-chords':
      case 'plaits-speech':
        if (presetName in PLAITS_MELODIC_PRESETS) {
          (trackVoice.voice as PlaitsMelodicVoice).loadPreset(presetName as keyof typeof PLAITS_MELODIC_PRESETS);
        }
        break;
      // Plaits percussion engines (8-15)
      case 'plaits-grain':
      case 'plaits-noise':
      case 'plaits-particle':
      case 'plaits-string':
      case 'plaits-modal':
      case 'plaits-kick':
      case 'plaits-snare':
      case 'plaits-hihat':
        if (presetName in PLAITS_PERC_PRESETS) {
          (trackVoice.voice as PlaitsPercVoice).loadPreset(presetName as keyof typeof PLAITS_PERC_PRESETS);
        }
        break;
    }

    trackVoice.config.preset = presetName;
  }

  /**
   * Set the note for a melodic voice track or pitched percussion
   */
  setTrackNote(trackId: string, note: number): void {
    const trackVoice = this.trackVoices.get(trackId);
    if (!trackVoice) return;

    const vt = trackVoice.config.voiceType;
    // Melodic voices and pitched percussion engines (string, modal)
    const isPitchedPerc = vt === 'plaits-string' || vt === 'plaits-modal';
    if (vt === 'fm-melodic' || isPlaitsmelodicEngine(vt) || isPitchedPerc) {
      trackVoice.config.note = note;
      // For pitched percussion, also update the voice params directly
      if (isPitchedPerc) {
        (trackVoice.voice as PlaitsPercVoice).setParams({ note });
      }
    }
  }

  /**
   * Get all track voice configurations
   */
  getAllConfigs(): TrackVoiceConfig[] {
    return Array.from(this.trackVoices.values()).map(tv => tv.config);
  }

  /**
   * Get available presets for a voice type
   */
  getPresetsForType(voiceType: VoiceType): string[] {
    switch (voiceType) {
      case 'fm-drum':
        return Object.keys(FM_DRUM_PRESETS);
      case 'fm-melodic':
        return Object.keys(FM_MELODIC_PRESETS);
      case 'noise':
        return Object.keys(NOISE_PRESETS);
      case 'complex-morph':
        return Object.keys(COMPLEX_MORPH_PRESETS);
      case 'sample':
        return Object.keys(SAMPLE_PRESETS);
      case 'ocean':
        return [];
      // Plaits melodic engines (0-7)
      case 'plaits-va':
      case 'plaits-waveshaper':
      case 'plaits-fm':
      case 'plaits-formant':
      case 'plaits-additive':
      case 'plaits-wavetable':
      case 'plaits-chords':
      case 'plaits-speech':
        return Object.keys(PLAITS_MELODIC_PRESETS);
      // Plaits percussion engines (8-15)
      case 'plaits-grain':
      case 'plaits-noise':
      case 'plaits-particle':
      case 'plaits-string':
      case 'plaits-modal':
      case 'plaits-kick':
      case 'plaits-snare':
      case 'plaits-hihat':
        return Object.keys(PLAITS_PERC_PRESETS);
    }
  }

  /**
   * Serialize voice manager state
   */
  getState(): { voices: TrackVoiceConfig[] } {
    const voices: TrackVoiceConfig[] = [];

    for (const [, trackVoice] of this.trackVoices) {
      const config = { ...trackVoice.config };

      // Include current params from the voice
      switch (config.voiceType) {
        case 'fm-drum':
          config.params = (trackVoice.voice as FMDrumVoice).getParams();
          break;
        case 'fm-melodic':
          config.params = (trackVoice.voice as FMMelodicVoice).getParams();
          break;
        case 'noise':
          config.params = (trackVoice.voice as NoiseVoice).getParams();
          break;
        case 'complex-morph':
          config.params = (trackVoice.voice as ComplexMorphVoice).getParams();
          break;
        case 'sample':
          config.params = (trackVoice.voice as SampleVoice).getParams();
          break;
        case 'ocean':
          config.params = (trackVoice.voice as OceanVoice).getParams();
          break;
        // Plaits melodic engines (0-7)
        case 'plaits-va':
        case 'plaits-waveshaper':
        case 'plaits-fm':
        case 'plaits-formant':
        case 'plaits-additive':
        case 'plaits-wavetable':
        case 'plaits-chords':
        case 'plaits-speech':
          config.params = (trackVoice.voice as PlaitsMelodicVoice).getParams();
          break;
        // Plaits percussion engines (8-15)
        case 'plaits-grain':
        case 'plaits-noise':
        case 'plaits-particle':
        case 'plaits-string':
        case 'plaits-modal':
        case 'plaits-kick':
        case 'plaits-snare':
        case 'plaits-hihat':
          config.params = (trackVoice.voice as PlaitsPercVoice).getParams();
          break;
      }

      voices.push(config);
    }

    return { voices };
  }

  /**
   * Restore voice manager state
   */
  setState(state: { voices: TrackVoiceConfig[] }): void {
    // Remove all existing voices
    for (const trackId of this.trackVoices.keys()) {
      this.removeVoice(trackId);
    }

    // Recreate voices from state
    for (const config of state.voices) {
      this.assignVoice(config);
    }
  }

  /**
   * Set master output gain
   */
  set masterGain(value: number) {
    this.masterOutput.gain.setValueAtTime(
      Math.max(0, Math.min(1, value)),
      this.ctx.currentTime
    );
  }

  get masterGain(): number {
    return this.masterOutput.gain.value;
  }

  /**
   * Get the master output node for routing
   */
  getMasterOutput(): GainNode {
    return this.masterOutput;
  }

  /**
   * Clean up all voices
   */
  dispose(): void {
    for (const trackId of this.trackVoices.keys()) {
      this.removeVoice(trackId);
    }
    this.masterOutput.disconnect();
  }
}

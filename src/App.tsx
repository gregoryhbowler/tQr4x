import { useEffect, useState, useCallback } from 'react';
import { engine, type VoiceType, type TrackVoiceConfig, type ParamLockEditState, type PresetState } from './audio/engine';
import { needsNoteSequencing } from './audio/voices/VoiceManager';
import type { FMDrumParams } from './audio/voices/FMDrumVoice';
import type { FMMelodicParams } from './audio/voices/FMMelodicVoice';
import type { NoiseVoiceParams } from './audio/voices/NoiseVoice';
import type { ComplexMorphParams } from './audio/voices/ComplexMorphVoice';
import type { SampleVoiceParams } from './audio/voices/SampleVoice';
import type { OceanVoiceParams } from './audio/voices/OceanVoice';
import type { MimeophonParams } from './audio/fx/Mimeophon';
import type { ReverbParams } from './audio/fx/Reverb';
import type { MasterBusParams } from './audio/fx/MasterBus';
import type { ChannelParams, FXCrossSends } from './audio/fx/Mixer';
import { DEFAULT_FX_CROSS_SENDS } from './audio/fx/Mixer';
import type { LFOParams, ModRoute, RandomIntensity, EnvelopeModulatorParams } from './audio/mod';
import { Transport, PatternGrid, PatternBank, PatternSequencer, VoicePanel, TrackControls, FXPanel, ModulationPanel, ComplexMorphPanel, SamplePanel, OceanPanel, MixerView } from './ui';
import './App.css';

console.log('[App] Module loaded, engine:', engine);

interface TrackInfo {
  id: string;
  name: string;
}

const DEFAULT_TRACKS: TrackInfo[] = [
  { id: 'track1', name: 'Track 1' },
  { id: 'track2', name: 'Track 2' },
  { id: 'track3', name: 'Track 3' },
  { id: 'track4', name: 'Track 4' },
  { id: 'track5', name: 'Track 5' },
  { id: 'track6', name: 'Track 6' },
  { id: 'track7', name: 'Track 7' },
  { id: 'track8', name: 'Track 8' },
  { id: 'track9', name: 'Track 9' },
  { id: 'track10', name: 'Track 10' },
  { id: 'track11', name: 'Track 11' },
  { id: 'track12', name: 'Track 12' },
];

function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [voiceConfigs, setVoiceConfigs] = useState<Map<string, TrackVoiceConfig>>(new Map());

  // FX state
  const [channelParams, setChannelParams] = useState<Map<string, ChannelParams>>(new Map());
  const [mimeophonParams, setMimeophonParams] = useState<MimeophonParams | null>(null);
  const [mimeophonParams2, setMimeophonParams2] = useState<MimeophonParams | null>(null);
  const [mimeophonParams3, setMimeophonParams3] = useState<MimeophonParams | null>(null);
  const [mimeophonParams4, setMimeophonParams4] = useState<MimeophonParams | null>(null);
  const [reverbParams, setReverbParams] = useState<ReverbParams | null>(null);
  const [masterParams, setMasterParams] = useState<MasterBusParams | null>(null);
  const [mimeophonReturnLevel, setMimeophonReturnLevel] = useState(1);
  const [mimeophonReturnLevel2, setMimeophonReturnLevel2] = useState(1);
  const [mimeophonReturnLevel3, setMimeophonReturnLevel3] = useState(1);
  const [mimeophonReturnLevel4, setMimeophonReturnLevel4] = useState(1);
  const [reverbReturnLevel, setReverbReturnLevel] = useState(1);
  const [fxCrossSends, setFxCrossSends] = useState<FXCrossSends>({ ...DEFAULT_FX_CROSS_SENDS });

  // Modulation state
  const [lfoParams, setLfoParams] = useState<LFOParams[]>([]);
  const [envModParams, setEnvModParams] = useState<EnvelopeModulatorParams[]>([]);
  const [slowRandomParams, setSlowRandomParams] = useState({
    rate1: 0.1, rate2: 0.07, smoothing1: 0.8, smoothing2: 0.9
  });
  const [modRoutes, setModRoutes] = useState<ModRoute[]>([]);
  const [globalModDepth, setGlobalModDepth] = useState(1);
  const [modEnabled, setModEnabled] = useState(true);
  const [microJitterEnabled, setMicroJitterEnabled] = useState(false);
  const [microJitterAmount, setMicroJitterAmount] = useState(0.02);

  // P-lock edit mode state - used to trigger re-renders when edit mode changes
  const [, setPLockEditState] = useState<ParamLockEditState>({ isActive: false, trackId: '', stepIndex: -1 });

  // Mixer view state
  const [mixerOpen, setMixerOpen] = useState(false);
  const [mixerRefreshKey, setMixerRefreshKey] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        console.log('[App] Starting engine initialization...');
        await engine.init();
        console.log('[App] Engine initialized successfully');

        // Create default tracks with voices
        for (const track of DEFAULT_TRACKS) {
          console.log(`[App] Creating track: ${track.id}`);
          engine.createTrack(track.id, track.name);

          // All tracks start with fm-drum voice - user can change to any voice type
          const voiceType: VoiceType = 'fm-drum';
          const preset = 'kick';

          console.log(`[App] Assigning voice ${voiceType} with preset ${preset} to track ${track.id}`);
          engine.assignVoice({
            trackId: track.id,
            voiceType,
            preset,
          });
          console.log(`[App] Voice assigned successfully for track ${track.id}`);
        }

        // All patterns initialize empty - user programs steps themselves

        // Get initial voice configs
        const configs = new Map<string, TrackVoiceConfig>();
        for (const track of DEFAULT_TRACKS) {
          const config = engine.getVoiceConfig(track.id);
          if (config) {
            configs.set(track.id, config);
          }
        }

        // Get initial channel params and capture as base state for p-lock restoration
        const channels = new Map<string, ChannelParams>();
        for (const track of DEFAULT_TRACKS) {
          const params = engine.getChannelParams(track.id);
          if (params) {
            channels.set(track.id, params);
          }
          // Capture initial state as base for p-lock restoration
          engine.captureBaseChannelState(track.id);
        }

        // Get initial FX params
        setChannelParams(channels);
        setMimeophonParams(engine.getMimeophonParams());
        setMimeophonParams2(engine.getMimeophonParams2());
        setMimeophonParams3(engine.getMimeophonParams3());
        setMimeophonParams4(engine.getMimeophonParams4());
        setReverbParams(engine.getReverbParams());
        setMasterParams(engine.getMasterParams());
        setMimeophonReturnLevel(engine.getMimeophonReturnLevel());
        setMimeophonReturnLevel2(engine.getMimeophonReturnLevel2());
        setMimeophonReturnLevel3(engine.getMimeophonReturnLevel3());
        setMimeophonReturnLevel4(engine.getMimeophonReturnLevel4());
        setReverbReturnLevel(engine.getReverbReturnLevel());

        // Get initial modulation params
        setLfoParams(engine.getLFOParams());
        setEnvModParams(engine.getEnvModParams());
        setSlowRandomParams(engine.getSlowRandomParams());
        setModRoutes(engine.getModRoutes());
        setGlobalModDepth(engine.getGlobalModDepth());
        setModEnabled(engine.isModEnabled());
        const jitter = engine.getMicroJitter();
        setMicroJitterEnabled(jitter.enabled);
        setMicroJitterAmount(jitter.amount);

        setVoiceConfigs(configs);
        setTracks(DEFAULT_TRACKS);
        setSelectedTrack('track1');
        setIsInitialized(true);
        console.log('[App] Initialization complete, setting isInitialized to true');
      } catch (error) {
        console.error('[App] Failed to initialize engine:', error);
      }
    };

    init();

    // Subscribe to p-lock edit state changes
    const unsubPLock = engine.onParamLockEditStateChange((state) => {
      setPLockEditState(state);

      // When entering p-lock edit mode, update UI to show p-locked values
      // When exiting, restore base voice and channel params
      if (state.isActive) {
        // Entering edit mode - first restore to base state, then overlay step p-locks
        const baseConfig = engine.getVoiceConfig(state.trackId);
        const stepPLocks = engine.getStepParamLocks(state.trackId, state.stepIndex);

        // Voice config display
        if (baseConfig) {
          const displayConfig = {
            ...baseConfig,
            params: { ...baseConfig.params, ...(stepPLocks ?? {}) }
          };
          setVoiceConfigs(prev => new Map(prev).set(state.trackId, displayConfig));
        }

        // IMPORTANT: Reset mixer to base state before showing step's p-locked filter
        // This prevents the filter from a previous step's edit session from persisting
        engine.restoreToBaseChannelState(state.trackId);

        // Now get the restored base channel params for UI
        const baseChannelParams = engine.getChannelParams(state.trackId);
        if (baseChannelParams) {
          // If this step has filter p-locks, we need to show them in UI
          // Check if step has filterType p-lock and update mixer temporarily for UI display
          if (stepPLocks && stepPLocks.filterType !== undefined) {
            const filterTypeMap: Record<number, string> = {
              0: 'bypass', 1: 'wasp', 2: 'sem', 3: 'moog', 4: 'threeSisters'
            };
            const filterType = filterTypeMap[stepPLocks.filterType as number] ?? 'bypass';

            // Update mixer to show the p-locked filter type (for UI display)
            engine.updateChannelParams(state.trackId, {
              filter: { ...baseChannelParams.filter, type: filterType as any }
            });
          }

          // Update local state to reflect the current mixer state
          const updatedParams = engine.getChannelParams(state.trackId);
          if (updatedParams) {
            setChannelParams(prev => new Map(prev).set(state.trackId, updatedParams));
          }
        }
      } else {
        // Exiting edit mode - restore base voice and channel params for all tracks
        const tracks = engine.getAllTracks();
        for (const track of tracks) {
          // Restore voice config
          const config = engine.getVoiceConfig(track.id);
          if (config) {
            setVoiceConfigs(prev => new Map(prev).set(track.id, config));
          }
          // Restore mixer to base state and update UI
          engine.restoreToBaseChannelState(track.id);
          const channelConfig = engine.getChannelParams(track.id);
          if (channelConfig) {
            setChannelParams(prev => new Map(prev).set(track.id, channelConfig));
          }
        }
      }
    });

    // Don't dispose on unmount - the engine is a singleton and React Strict Mode
    // will cause double-mount which would break the engine
    return () => {
      // Only stop playback, don't dispose
      engine.stop();
      unsubPLock();
    };
  }, []);

  const handleVoiceChange = useCallback((trackId: string, voiceType: VoiceType, preset?: string) => {
    engine.assignVoice({ trackId, voiceType, preset });
    const config = engine.getVoiceConfig(trackId);
    if (config) {
      setVoiceConfigs(prev => new Map(prev).set(trackId, config));
    }
  }, []);

  const handleParamChange = useCallback((
    trackId: string,
    params: Partial<FMDrumParams | FMMelodicParams | NoiseVoiceParams | ComplexMorphParams | SampleVoiceParams | OceanVoiceParams>
  ) => {
    // Check if we're in p-lock edit mode for this track
    const editState = engine.getParamLockEditState();

    if (editState.isActive && editState.trackId === trackId) {
      // In p-lock edit mode - store params as step p-locks
      // Do NOT update base voice params - that would affect all trigs
      for (const [paramId, value] of Object.entries(params)) {
        if (typeof value === 'number') {
          engine.setStepParamLock(trackId, editState.stepIndex, paramId, value);
        }
      }
      // Update UI state to show p-locked values for continued editing
      // Merge current p-locks with base config so sliders reflect the locked values
      const baseConfig = engine.getVoiceConfig(trackId);
      const stepPLocks = engine.getStepParamLocks(trackId, editState.stepIndex);
      if (baseConfig && stepPLocks) {
        // Create a display config that shows p-locked values
        const displayConfig = {
          ...baseConfig,
          params: { ...baseConfig.params, ...stepPLocks }
        };
        setVoiceConfigs(prev => new Map(prev).set(trackId, displayConfig));
      }
    } else {
      // Not in p-lock edit mode - update base voice params normally
      engine.updateVoiceParams(trackId, params);
      const config = engine.getVoiceConfig(trackId);
      if (config) {
        setVoiceConfigs(prev => new Map(prev).set(trackId, config));
      }
    }
  }, []);

  const handlePresetChange = useCallback((trackId: string, preset: string) => {
    engine.loadVoicePreset(trackId, preset);
    const config = engine.getVoiceConfig(trackId);
    if (config) {
      setVoiceConfigs(prev => new Map(prev).set(trackId, config));
    }
  }, []);

  const handleNoteChange = useCallback((trackId: string, note: number) => {
    engine.setTrackNote(trackId, note);
    const config = engine.getVoiceConfig(trackId);
    if (config) {
      setVoiceConfigs(prev => new Map(prev).set(trackId, config));
    }
  }, []);

  // FX handlers
  const handleChannelChange = useCallback((trackId: string, params: Partial<ChannelParams>) => {
    // Check if we're in p-lock edit mode for this track
    const editState = engine.getParamLockEditState();

    if (editState.isActive && editState.trackId === trackId) {
      // In p-lock edit mode - store channel params as step p-locks
      // Map channel params to p-lock param IDs
      if (params.filter) {
        const filter = params.filter;

        // Store filter TYPE as a p-lock so it can be temporarily enabled just for this step
        // When other steps trigger, the filter will revert to the base state (likely bypass)
        if (filter.type !== undefined) {
          // Store filter type as a p-lock (using a string index for the type)
          const filterTypeMap: Record<string, number> = {
            'bypass': 0, 'wasp': 1, 'sem': 2, 'moog': 3, 'threeSisters': 4
          };
          engine.setStepParamLock(trackId, editState.stepIndex, 'filterType', filterTypeMap[filter.type] ?? 0);

          // IMPORTANT: When changing filter type, clear old filter p-locks
          // This prevents stale values from one filter type being applied to another
          // (e.g., Three Sisters normalized 0-1 values being applied to Wasp Hz cutoff)
          engine.removeStepParamLock(trackId, editState.stepIndex, 'filterCutoff');
          engine.removeStepParamLock(trackId, editState.stepIndex, 'filterResonance');
          engine.removeStepParamLock(trackId, editState.stepIndex, 'filterSpan');

          // Also temporarily update the mixer so the UI shows the filter controls
          // But DON'T capture this as base state - we want it to revert on other steps
          engine.updateChannelParams(trackId, { filter: params.filter });
        }

        // Handle different filter types - each has cutoff/resonance in different places
        if (filter.wasp?.cutoff !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'filterCutoff', filter.wasp.cutoff);
        }
        if (filter.wasp?.resonance !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'filterResonance', filter.wasp.resonance);
        }
        if (filter.sem?.cutoff !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'filterCutoff', filter.sem.cutoff);
        }
        if (filter.sem?.resonance !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'filterResonance', filter.sem.resonance);
        }
        if (filter.moog?.cutoff !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'filterCutoff', filter.moog.cutoff);
        }
        if (filter.moog?.resonance !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'filterResonance', filter.moog.resonance);
        }
        if (filter.threeSisters?.freq !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'filterCutoff', filter.threeSisters.freq);
        }
        if (filter.threeSisters?.quality !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'filterResonance', filter.threeSisters.quality);
        }
        // Also handle Three Sisters span parameter
        if (filter.threeSisters?.span !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'filterSpan', filter.threeSisters.span);
        }
      }
      if (params.saturation) {
        const sat = params.saturation;
        if (sat.drive !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'saturationDrive', sat.drive);
        }
        if (sat.bias !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'saturationBias', sat.bias);
        }
        if (sat.mix !== undefined) {
          engine.setStepParamLock(trackId, editState.stepIndex, 'saturationMix', sat.mix);
        }
      }
      if (params.delaySend !== undefined) {
        engine.setStepParamLock(trackId, editState.stepIndex, 'sendDelay1', params.delaySend);
      }
      if (params.delaySend2 !== undefined) {
        engine.setStepParamLock(trackId, editState.stepIndex, 'sendDelay2', params.delaySend2);
      }
      if (params.delaySend3 !== undefined) {
        engine.setStepParamLock(trackId, editState.stepIndex, 'sendDelay3', params.delaySend3);
      }
      if (params.delaySend4 !== undefined) {
        engine.setStepParamLock(trackId, editState.stepIndex, 'sendDelay4', params.delaySend4);
      }
      if (params.reverbSend !== undefined) {
        engine.setStepParamLock(trackId, editState.stepIndex, 'sendReverb', params.reverbSend);
      }
      if (params.volume !== undefined) {
        engine.setStepParamLock(trackId, editState.stepIndex, 'volume', params.volume);
      }
      if (params.pan !== undefined) {
        engine.setStepParamLock(trackId, editState.stepIndex, 'pan', params.pan);
      }
      // Update UI state so sliders reflect changes during editing
      // We need to merge the incoming params with current state for display
      setChannelParams(prev => {
        const current = prev.get(trackId);
        if (!current) return prev;
        const updated = { ...current, ...params };
        return new Map(prev).set(trackId, updated);
      });
    } else {
      // Not in p-lock edit mode - update base channel params normally
      engine.updateChannelParams(trackId, params);
      // Capture this as the new base state for p-lock restoration
      engine.captureBaseChannelState(trackId);
      const updated = engine.getChannelParams(trackId);
      if (updated) {
        setChannelParams(prev => new Map(prev).set(trackId, updated));
      }
    }
  }, []);

  const handleMimeophonChange = useCallback((params: Partial<MimeophonParams>) => {
    engine.setMimeophonParams(params);
    setMimeophonParams(engine.getMimeophonParams());
  }, []);

  const handleMimeophonChange2 = useCallback((params: Partial<MimeophonParams>) => {
    engine.setMimeophonParams2(params);
    setMimeophonParams2(engine.getMimeophonParams2());
  }, []);

  const handleMimeophonChange3 = useCallback((params: Partial<MimeophonParams>) => {
    engine.setMimeophonParams3(params);
    setMimeophonParams3(engine.getMimeophonParams3());
  }, []);

  const handleMimeophonChange4 = useCallback((params: Partial<MimeophonParams>) => {
    engine.setMimeophonParams4(params);
    setMimeophonParams4(engine.getMimeophonParams4());
  }, []);

  const handleReverbChange = useCallback((params: Partial<ReverbParams>) => {
    engine.setReverbParams(params);
    setReverbParams(engine.getReverbParams());
  }, []);

  const handleMasterChange = useCallback((params: Partial<MasterBusParams>) => {
    engine.setMasterParams(params);
    setMasterParams(engine.getMasterParams());
  }, []);

  const handleMimeophonReturnChange = useCallback((level: number) => {
    engine.setMimeophonReturnLevel(level);
    setMimeophonReturnLevel(engine.getMimeophonReturnLevel());
  }, []);

  const handleMimeophonReturnChange2 = useCallback((level: number) => {
    engine.setMimeophonReturnLevel2(level);
    setMimeophonReturnLevel2(engine.getMimeophonReturnLevel2());
  }, []);

  const handleMimeophonReturnChange3 = useCallback((level: number) => {
    engine.setMimeophonReturnLevel3(level);
    setMimeophonReturnLevel3(engine.getMimeophonReturnLevel3());
  }, []);

  const handleMimeophonReturnChange4 = useCallback((level: number) => {
    engine.setMimeophonReturnLevel4(level);
    setMimeophonReturnLevel4(engine.getMimeophonReturnLevel4());
  }, []);

  const handleReverbReturnChange = useCallback((level: number) => {
    engine.setReverbReturnLevel(level);
    setReverbReturnLevel(engine.getReverbReturnLevel());
  }, []);

  const handleFXCrossSendsChange = useCallback((params: Partial<FXCrossSends>) => {
    engine.setFXCrossSends(params);
    setFxCrossSends(engine.getFXCrossSends());
  }, []);

  // Modulation handlers
  const handleLFOChange = useCallback((index: number, params: Partial<LFOParams>) => {
    engine.setLFOParams(index, params);
    setLfoParams(engine.getLFOParams());
  }, []);

  const handleEnvModChange = useCallback((index: number, params: Partial<EnvelopeModulatorParams>) => {
    engine.setEnvModParams(index, params);
    setEnvModParams(engine.getEnvModParams());
  }, []);

  const handleSlowRandomChange = useCallback((index: 1 | 2, rate: number, smoothing: number) => {
    engine.setSlowRandomParams(index, rate, smoothing);
    setSlowRandomParams(engine.getSlowRandomParams());
  }, []);

  const handleAddModRoute = useCallback((route: Omit<ModRoute, 'id'>) => {
    engine.addModRoute(route);
    setModRoutes(engine.getModRoutes());
  }, []);

  const handleUpdateModRoute = useCallback((id: string, updates: Partial<ModRoute>) => {
    engine.updateModRoute(id, updates);
    setModRoutes(engine.getModRoutes());
  }, []);

  const handleRemoveModRoute = useCallback((id: string) => {
    engine.removeModRoute(id);
    setModRoutes(engine.getModRoutes());
  }, []);

  const handleLoadModPreset = useCallback((presetName: string) => {
    engine.loadModPreset(presetName);
    setModRoutes(engine.getModRoutes());
  }, []);

  const handleGlobalModDepthChange = useCallback((depth: number) => {
    engine.setGlobalModDepth(depth);
    setGlobalModDepth(engine.getGlobalModDepth());
  }, []);

  const handleModEnabledChange = useCallback((enabled: boolean) => {
    engine.setModEnabled(enabled);
    setModEnabled(engine.isModEnabled());
  }, []);

  const handleMutate = useCallback((intensity: RandomIntensity) => {
    if (selectedTrack) {
      engine.mutateTrack(selectedTrack, intensity);
      const config = engine.getVoiceConfig(selectedTrack);
      if (config) {
        setVoiceConfigs(prev => new Map(prev).set(selectedTrack, config));
      }
    }
  }, [selectedTrack]);

  const handleRandomizeScene = useCallback((intensity: RandomIntensity) => {
    engine.randomizeScene(intensity);
    // Refresh all voice configs
    const configs = new Map<string, TrackVoiceConfig>();
    for (const track of DEFAULT_TRACKS) {
      const config = engine.getVoiceConfig(track.id);
      if (config) {
        configs.set(track.id, config);
      }
    }
    setVoiceConfigs(configs);
  }, []);

  const handleMicroJitterChange = useCallback((enabled: boolean, amount: number) => {
    engine.setMicroJitter({ enabled, amount });
    setMicroJitterEnabled(enabled);
    setMicroJitterAmount(amount);
  }, []);

  // Pattern bank refresh callbacks (called after paste operations)
  const handleVoiceConfigsRefresh = useCallback(() => {
    const configs = new Map<string, TrackVoiceConfig>();
    for (const track of DEFAULT_TRACKS) {
      const config = engine.getVoiceConfig(track.id);
      if (config) {
        configs.set(track.id, config);
      }
    }
    setVoiceConfigs(configs);
  }, []);

  const handleChannelParamsRefresh = useCallback(() => {
    const channels = new Map<string, ChannelParams>();
    for (const track of DEFAULT_TRACKS) {
      const params = engine.getChannelParams(track.id);
      if (params) {
        channels.set(track.id, params);
      }
    }
    setChannelParams(channels);
    // Also refresh mixer view
    setMixerRefreshKey(prev => prev + 1);
  }, []);

  // Refresh global FX params from engine (for pattern switching)
  const handleFXParamsRefresh = useCallback(() => {
    setMimeophonParams(engine.getMimeophonParams());
    setMimeophonParams2(engine.getMimeophonParams2());
    setMimeophonParams3(engine.getMimeophonParams3());
    setMimeophonParams4(engine.getMimeophonParams4());
    setReverbParams(engine.getReverbParams());
    setMasterParams(engine.getMasterParams());
    setMimeophonReturnLevel(engine.getMimeophonReturnLevel());
    setMimeophonReturnLevel2(engine.getMimeophonReturnLevel2());
    setMimeophonReturnLevel3(engine.getMimeophonReturnLevel3());
    setMimeophonReturnLevel4(engine.getMimeophonReturnLevel4());
    setReverbReturnLevel(engine.getReverbReturnLevel());
    setFxCrossSends(engine.getFXCrossSends());
  }, []);

  // Mixer toggle handler
  const handleMixerToggle = useCallback(() => {
    setMixerOpen(prev => !prev);
  }, []);

  // Preset save/load handlers
  const handleSavePreset = useCallback((): PresetState | null => {
    return engine.exportPreset(
      voiceConfigs,
      channelParams,
      mimeophonParams,
      mimeophonParams2,
      mimeophonParams3,
      mimeophonParams4,
      reverbParams,
      masterParams,
      mimeophonReturnLevel,
      mimeophonReturnLevel2,
      mimeophonReturnLevel3,
      mimeophonReturnLevel4,
      reverbReturnLevel,
      fxCrossSends,
      lfoParams,
      envModParams,
      slowRandomParams,
      modRoutes,
      globalModDepth,
      modEnabled,
      microJitterEnabled,
      microJitterAmount
    );
  }, [
    voiceConfigs, channelParams, mimeophonParams, mimeophonParams2, mimeophonParams3, mimeophonParams4,
    reverbParams, masterParams, mimeophonReturnLevel, mimeophonReturnLevel2, mimeophonReturnLevel3,
    mimeophonReturnLevel4, reverbReturnLevel, fxCrossSends, lfoParams, envModParams, slowRandomParams,
    modRoutes, globalModDepth, modEnabled, microJitterEnabled, microJitterAmount
  ]);

  const handleLoadPreset = useCallback((preset: PresetState) => {
    const state = engine.importPreset(preset);

    // Update all React state from the imported preset
    setVoiceConfigs(state.voiceConfigs);
    setChannelParams(state.channelParams);
    setMimeophonParams(state.mimeophonParams);
    setMimeophonParams2(state.mimeophonParams2);
    setMimeophonParams3(state.mimeophonParams3);
    setMimeophonParams4(state.mimeophonParams4);
    setReverbParams(state.reverbParams);
    setMasterParams(state.masterParams);
    setMimeophonReturnLevel(state.mimeophonReturnLevel);
    setMimeophonReturnLevel2(state.mimeophonReturnLevel2);
    setMimeophonReturnLevel3(state.mimeophonReturnLevel3);
    setMimeophonReturnLevel4(state.mimeophonReturnLevel4);
    setReverbReturnLevel(state.reverbReturnLevel);
    setFxCrossSends(state.fxCrossSends);
    setLfoParams(state.lfoParams);
    setEnvModParams(state.envModParams);
    setSlowRandomParams(state.slowRandomParams);
    setModRoutes(state.modRoutes);
    setGlobalModDepth(state.globalModDepth);
    setModEnabled(state.modEnabled);
    setMicroJitterEnabled(state.microJitterEnabled);
    setMicroJitterAmount(state.microJitterAmount);
  }, []);

  if (!isInitialized) {
    return (
      <div className="app loading">
        <h1>tQr4x</h1>
        <p>Initializing audio engine...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>tQr4x</h1>
      </header>

      <main className="app-main">
        <section className="transport-section">
          <Transport
            onSavePreset={handleSavePreset}
            onLoadPreset={handleLoadPreset}
            mixerOpen={mixerOpen}
            onMixerToggle={handleMixerToggle}
          />
        </section>

        {mixerOpen && (
          <section className="mixer-section">
            <MixerView
              tracks={tracks}
              refreshKey={mixerRefreshKey}
            />
          </section>
        )}

        <section className="pattern-bank-section">
          <PatternBank
            onVoiceConfigsRefresh={handleVoiceConfigsRefresh}
            onChannelParamsRefresh={handleChannelParamsRefresh}
            onFXParamsRefresh={handleFXParamsRefresh}
          />
          <PatternSequencer />
        </section>

        <section className="patterns-section">
          <h2>Tracks</h2>
          <div className="track-tabs">
            {tracks.map(track => (
              <button
                key={track.id}
                className={`track-tab ${selectedTrack === track.id ? 'active' : ''}`}
                onClick={() => setSelectedTrack(track.id)}
              >
                {track.name}
              </button>
            ))}
          </div>

          {selectedTrack && (
            <div className="track-editor">
              <PatternGrid
                trackId={selectedTrack}
                trackName={tracks.find(t => t.id === selectedTrack)?.name ?? ''}
                isMelodic={needsNoteSequencing(voiceConfigs.get(selectedTrack)?.voiceType ?? 'fm-drum')}
              />
              <TrackControls
                trackId={selectedTrack}
                isMelodic={needsNoteSequencing(voiceConfigs.get(selectedTrack)?.voiceType ?? 'fm-drum')}
              />
              {/* Show specialized panels based on voice type */}
              {voiceConfigs.get(selectedTrack)?.voiceType === 'complex-morph' ? (
                <ComplexMorphPanel
                  trackId={selectedTrack}
                  params={voiceConfigs.get(selectedTrack)?.params as ComplexMorphParams ?? null}
                  preset={voiceConfigs.get(selectedTrack)?.preset ?? ''}
                  onParamChange={handleParamChange}
                  onPresetChange={handlePresetChange}
                  onVoiceChange={handleVoiceChange}
                />
              ) : voiceConfigs.get(selectedTrack)?.voiceType === 'sample' ? (
                <SamplePanel
                  trackId={selectedTrack}
                  params={voiceConfigs.get(selectedTrack)?.params as Partial<SampleVoiceParams> ?? {}}
                  onChange={(params) => handleParamChange(selectedTrack, params)}
                  onPresetChange={(preset) => handlePresetChange(selectedTrack, preset)}
                  onVoiceChange={handleVoiceChange}
                  currentPreset={voiceConfigs.get(selectedTrack)?.preset}
                  channelParams={channelParams.get(selectedTrack) ?? null}
                  onChannelChange={handleChannelChange}
                />
              ) : voiceConfigs.get(selectedTrack)?.voiceType === 'ocean' ? (
                <OceanPanel
                  trackId={selectedTrack}
                  params={voiceConfigs.get(selectedTrack)?.params as Partial<OceanVoiceParams> ?? {}}
                  onChange={(params) => handleParamChange(selectedTrack, params)}
                  onPresetChange={(preset) => handlePresetChange(selectedTrack, preset)}
                  onVoiceChange={handleVoiceChange}
                  currentPreset={voiceConfigs.get(selectedTrack)?.preset}
                  channelParams={channelParams.get(selectedTrack) ?? null}
                  onChannelChange={handleChannelChange}
                />
              ) : (
                <VoicePanel
                  trackId={selectedTrack}
                  config={voiceConfigs.get(selectedTrack) ?? null}
                  onVoiceChange={handleVoiceChange}
                  onParamChange={handleParamChange}
                  onPresetChange={handlePresetChange}
                  onNoteChange={handleNoteChange}
                  channelParams={channelParams.get(selectedTrack) ?? null}
                  onChannelChange={handleChannelChange}
                />
              )}
              {mimeophonParams && mimeophonParams2 && mimeophonParams3 && mimeophonParams4 && reverbParams && masterParams && (
                <FXPanel
                  mimeophonParams={mimeophonParams}
                  mimeophonParams2={mimeophonParams2}
                  mimeophonParams3={mimeophonParams3}
                  mimeophonParams4={mimeophonParams4}
                  reverbParams={reverbParams}
                  masterParams={masterParams}
                  onMimeophonChange={handleMimeophonChange}
                  onMimeophonChange2={handleMimeophonChange2}
                  onMimeophonChange3={handleMimeophonChange3}
                  onMimeophonChange4={handleMimeophonChange4}
                  onReverbChange={handleReverbChange}
                  onMasterChange={handleMasterChange}
                  mimeophonReturnLevel={mimeophonReturnLevel}
                  mimeophonReturnLevel2={mimeophonReturnLevel2}
                  mimeophonReturnLevel3={mimeophonReturnLevel3}
                  mimeophonReturnLevel4={mimeophonReturnLevel4}
                  reverbReturnLevel={reverbReturnLevel}
                  onMimeophonReturnChange={handleMimeophonReturnChange}
                  onMimeophonReturnChange2={handleMimeophonReturnChange2}
                  onMimeophonReturnChange3={handleMimeophonReturnChange3}
                  onMimeophonReturnChange4={handleMimeophonReturnChange4}
                  onReverbReturnChange={handleReverbReturnChange}
                  fxCrossSends={fxCrossSends}
                  onFXCrossSendsChange={handleFXCrossSendsChange}
                />
              )}
              <ModulationPanel
                lfoParams={lfoParams}
                onLFOChange={handleLFOChange}
                envModParams={envModParams}
                onEnvModChange={handleEnvModChange}
                slowRandomParams={slowRandomParams}
                onSlowRandomChange={handleSlowRandomChange}
                routes={modRoutes}
                onAddRoute={handleAddModRoute}
                onUpdateRoute={handleUpdateModRoute}
                onRemoveRoute={handleRemoveModRoute}
                onLoadModPreset={handleLoadModPreset}
                globalDepth={globalModDepth}
                onGlobalDepthChange={handleGlobalModDepthChange}
                modEnabled={modEnabled}
                onModEnabledChange={handleModEnabledChange}
                onMutate={handleMutate}
                onRandomizeScene={handleRandomizeScene}
                microJitterEnabled={microJitterEnabled}
                microJitterAmount={microJitterAmount}
                onMicroJitterChange={handleMicroJitterChange}
              />
            </div>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <p>Phase 5: Complex Morph FM Engine - "The Structuralist"</p>
      </footer>
    </div>
  );
}

export default App;

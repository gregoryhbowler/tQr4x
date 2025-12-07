import { useState, useEffect, useCallback, useRef } from 'react';
import { engine, type EngineState, type ScaleConfig, SCALE_INTERVALS, NOTE_NAMES, type PresetState, loadPresetFromFile, downloadPreset } from '../audio/engine';
import './Transport.css';

const SCALE_NAMES = Object.keys(SCALE_INTERVALS);

interface TransportProps {
  onSavePreset?: () => PresetState | null;
  onLoadPreset?: (preset: PresetState) => void;
  /** Whether the mixer view is currently shown */
  mixerOpen?: boolean;
  /** Callback to toggle mixer view */
  onMixerToggle?: () => void;
}

export function Transport({ onSavePreset, onLoadPreset, mixerOpen, onMixerToggle }: TransportProps) {
  const [engineState, setEngineState] = useState<EngineState>('uninitialized');
  const [bpm, setBpm] = useState(engine.bpm);
  const [swing, setSwing] = useState(engine.swing);
  const [currentStep, setCurrentStep] = useState(0);
  const [scale, setScale] = useState<ScaleConfig>({ root: 0, scale: 'minor', octave: 3 });

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [lastRecording, setLastRecording] = useState<Blob | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);

  // Preset file input ref
  const presetFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubState = engine.onStateChange(setEngineState);
    const unsubTick = engine.onTick((event) => {
      setCurrentStep(event.step % 16);
    });

    // Load global scale on mount
    const globalScale = engine.getGlobalScale();
    if (globalScale) setScale(globalScale);

    return () => {
      unsubState();
      unsubTick();
    };
  }, []);

  const handlePlay = useCallback(async () => {
    try {
      await engine.start();
    } catch (error) {
      console.error('Failed to start engine:', error);
    }
  }, []);

  const handleStop = useCallback(() => {
    engine.stop();
    setCurrentStep(0);
  }, []);

  const handleBpmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newBpm = parseInt(e.target.value, 10);
    if (!isNaN(newBpm)) {
      setBpm(newBpm);
      engine.bpm = newBpm;
    }
  }, []);

  const handleSwingChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newSwing = parseFloat(e.target.value);
    if (!isNaN(newSwing)) {
      setSwing(newSwing);
      engine.swing = newSwing;
    }
  }, []);

  const handleNudgeTempo = useCallback((delta: number) => {
    const newBpm = Math.max(20, Math.min(300, bpm + delta));
    setBpm(newBpm);
    engine.bpm = newBpm;
  }, [bpm]);

  const handleRootChange = useCallback((root: number) => {
    const newScale = { ...scale, root };
    setScale(newScale);
    engine.setGlobalScale(newScale);
  }, [scale]);

  const handleScaleChange = useCallback((scaleName: string) => {
    const newScale = { ...scale, scale: scaleName as keyof typeof SCALE_INTERVALS };
    setScale(newScale);
    engine.setGlobalScale(newScale);
  }, [scale]);

  const handleOctaveChange = useCallback((octave: number) => {
    const newScale = { ...scale, octave };
    setScale(newScale);
    engine.setGlobalScale(newScale);
  }, [scale]);

  const handleResyncAll = useCallback(() => {
    engine.resyncAllTracks();
  }, []);

  // Recording handlers
  const handleStartRecording = useCallback(() => {
    if (engine.startRecording()) {
      setIsRecording(true);
      setRecordingDuration(0);
      setLastRecording(null);
      // Start a timer to update the duration display
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingDuration(engine.recordingDuration);
      }, 100);
    }
  }, []);

  const handleStopRecording = useCallback(() => {
    // Clear the timer
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    const blob = engine.stopRecording();
    setIsRecording(false);
    if (blob) {
      setLastRecording(blob);
    }
  }, []);

  const handleDownloadRecording = useCallback(() => {
    if (lastRecording) {
      engine.downloadRecording(lastRecording);
    }
  }, [lastRecording]);

  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup recording interval on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  // Preset handlers
  const handleSavePreset = useCallback(() => {
    if (onSavePreset) {
      const preset = onSavePreset();
      if (preset) {
        downloadPreset(preset);
      }
    }
  }, [onSavePreset]);

  const handleLoadPresetClick = useCallback(() => {
    presetFileInputRef.current?.click();
  }, []);

  const handlePresetFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onLoadPreset) return;

    try {
      const preset = await loadPresetFromFile(file);
      onLoadPreset(preset);
      // Update local state from engine after load
      setBpm(engine.bpm);
      setSwing(engine.swing);
      const globalScale = engine.getGlobalScale();
      if (globalScale) setScale(globalScale);
    } catch (error) {
      console.error('Failed to load preset:', error);
      alert(`Failed to load preset: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Reset file input so the same file can be loaded again
    e.target.value = '';
  }, [onLoadPreset]);

  const isRunning = engineState === 'running';
  const isReady = engineState === 'ready' || engineState === 'stopped' || engineState === 'uninitialized';

  return (
    <div className="transport">
      <div className="transport-controls">
        <button
          className={`transport-btn ${isRunning ? 'active' : ''}`}
          onClick={isRunning ? handleStop : handlePlay}
          disabled={!isReady && !isRunning}
        >
          {isRunning ? 'STOP' : 'PLAY'}
        </button>
        <button
          className="transport-btn resync-all-btn"
          onClick={handleResyncAll}
          title="Reset all tracks to downbeat"
        >
          RESET
        </button>
      </div>

      <div className="transport-tempo">
        <label>
          <span>BPM</span>
          <div className="tempo-controls">
            <button onClick={() => handleNudgeTempo(-1)}>-</button>
            <input
              type="number"
              min="20"
              max="300"
              value={bpm}
              onChange={handleBpmChange}
            />
            <button onClick={() => handleNudgeTempo(1)}>+</button>
          </div>
        </label>
      </div>

      <div className="transport-swing">
        <label>
          <span>SWING {Math.round(swing * 100)}%</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={swing}
            onChange={handleSwingChange}
          />
        </label>
      </div>

      <div className="transport-scale">
        <span className="scale-label">SCALE</span>
        <div className="scale-selectors">
          <select
            value={scale.root}
            onChange={(e) => handleRootChange(parseInt(e.target.value, 10))}
            className="root-select"
          >
            {NOTE_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>

          <select
            value={scale.scale}
            onChange={(e) => handleScaleChange(e.target.value)}
            className="scale-select"
          >
            {SCALE_NAMES.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          <select
            value={scale.octave}
            onChange={(e) => handleOctaveChange(parseInt(e.target.value, 10))}
            className="octave-select"
          >
            {[1, 2, 3, 4, 5].map(oct => (
              <option key={oct} value={oct}>Oct {oct}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="transport-position">
        <div className="step-display">
          {Array.from({ length: 16 }, (_, i) => (
            <div
              key={i}
              className={`step-indicator ${i === currentStep && isRunning ? 'active' : ''} ${i % 4 === 0 ? 'beat' : ''}`}
            />
          ))}
        </div>
      </div>

      <div className="transport-recording">
        {isRecording ? (
          <>
            <button
              className="transport-btn record-btn recording"
              onClick={handleStopRecording}
              title="Stop recording"
            >
              STOP REC
            </button>
            <span className="recording-duration">{formatDuration(recordingDuration)}</span>
          </>
        ) : (
          <button
            className="transport-btn record-btn"
            onClick={handleStartRecording}
            title="Start recording"
          >
            REC
          </button>
        )}
        {lastRecording && !isRecording && (
          <button
            className="transport-btn download-btn"
            onClick={handleDownloadRecording}
            title="Download recording as WAV"
          >
            DOWNLOAD
          </button>
        )}
      </div>

      {onMixerToggle && (
        <div className="transport-mixer">
          <button
            className={`transport-btn mixer-btn ${mixerOpen ? 'active' : ''}`}
            onClick={onMixerToggle}
            title={mixerOpen ? 'Close mixer' : 'Open mixer'}
          >
            {mixerOpen ? 'CLOSE MIXER' : 'MIXER'}
          </button>
        </div>
      )}

      <div className="transport-preset">
        <input
          ref={presetFileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handlePresetFileChange}
        />
        <button
          className="transport-btn preset-btn"
          onClick={handleSavePreset}
          disabled={!onSavePreset}
          title="Save preset to file"
        >
          SAVE
        </button>
        <button
          className="transport-btn preset-btn"
          onClick={handleLoadPresetClick}
          disabled={!onLoadPreset}
          title="Load preset from file"
        >
          LOAD
        </button>
      </div>

      <div className="transport-state">
        {engineState}
      </div>
    </div>
  );
}

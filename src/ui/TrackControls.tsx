import { useState, useCallback, useEffect } from 'react';
import { engine, type TrackPerformance, type TrackClockConfig, type ClockDivisionRatio, CLOCK_DIVISION_VALUES } from '../audio/engine';
import './TrackControls.css';

const CLOCK_DIVISION_OPTIONS: { value: ClockDivisionRatio; label: string }[] = [
  { value: '1/8', label: '1/8 (8x slower)' },
  { value: '1/4', label: '1/4 (4x slower)' },
  { value: '1/2', label: '1/2 (2x slower)' },
  { value: '1/1', label: '1/1 (normal)' },
  { value: '2/1', label: '2/1 (2x faster)' },
  { value: '4/1', label: '4/1 (4x faster)' },
  { value: '8/1', label: '8/1 (8x faster)' },
];

// Octave options for per-track octave setting (0-6)
const OCTAVE_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

interface TrackControlsProps {
  trackId: string;
  isMelodic: boolean;  // Show drift controls only for melodic tracks
  onOctaveChange?: (octave: number) => void;  // Callback when track octave changes
}

export function TrackControls({ trackId, isMelodic, onOctaveChange }: TrackControlsProps) {
  const [performance, setPerformance] = useState<TrackPerformance>({ drift: 0, fill: 0 });
  const [clockConfig, setClockConfig] = useState<TrackClockConfig>({ useGlobalClock: true, division: '1/1' });
  const [trackOctave, setTrackOctave] = useState<number | undefined>(undefined);

  // Load current values
  useEffect(() => {
    const perf = engine.getTrackPerformance(trackId);
    if (perf) setPerformance(perf);
    const clock = engine.getTrackClockConfig(trackId);
    if (clock) setClockConfig(clock);
    const octave = engine.getTrackOctave(trackId);
    setTrackOctave(octave);
  }, [trackId]);

  const handleDriftChange = useCallback((drift: number) => {
    setPerformance(prev => ({ ...prev, drift }));
    engine.setTrackDrift(trackId, drift);
  }, [trackId]);

  const handleFillChange = useCallback((fill: number) => {
    setPerformance(prev => ({ ...prev, fill }));
    engine.setTrackFill(trackId, fill);
  }, [trackId]);

  const handleUseGlobalClockChange = useCallback((useGlobalClock: boolean) => {
    setClockConfig(prev => ({ ...prev, useGlobalClock }));
    engine.setTrackClockConfig(trackId, { useGlobalClock });
  }, [trackId]);

  const handleDivisionChange = useCallback((division: ClockDivisionRatio) => {
    setClockConfig(prev => ({ ...prev, division }));
    engine.setTrackClockConfig(trackId, { division });
  }, [trackId]);

  const handleResyncTrack = useCallback(() => {
    engine.resyncTrack(trackId);
  }, [trackId]);

  const handleOctaveChange = useCallback((octave: number) => {
    setTrackOctave(octave);
    engine.setTrackOctave(trackId, octave);
    onOctaveChange?.(octave);
  }, [trackId, onOctaveChange]);

  // Format fill value for display (-100% to +100%)
  const fillDisplay = performance.fill === 0
    ? '0'
    : performance.fill > 0
      ? `+${Math.round(performance.fill * 100)}%`
      : `${Math.round(performance.fill * 100)}%`;

  return (
    <div className="track-controls">
      <div className="control-group">
        <div className="control-item">
          <label>
            <span className="control-label">FILL</span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={performance.fill}
              onChange={(e) => handleFillChange(parseFloat(e.target.value))}
              className="fill-slider"
            />
            <span className="control-value">{fillDisplay}</span>
          </label>
          <div className="control-hint">
            Trigger density (left = thin, center = as sequenced, right = fill)
          </div>
        </div>
      </div>

      {isMelodic && (
        <>
          <div className="control-group">
            <div className="control-item">
              <label>
                <span className="control-label">OCTAVE</span>
                <select
                  value={trackOctave ?? ''}
                  onChange={(e) => handleOctaveChange(parseInt(e.target.value, 10))}
                  className="octave-select"
                >
                  <option value="" disabled>Global</option>
                  {OCTAVE_OPTIONS.map(oct => (
                    <option key={oct} value={oct}>Oct {oct}</option>
                  ))}
                </select>
                <span className="control-value">{trackOctave !== undefined ? `C${trackOctave}` : 'Global'}</span>
              </label>
              <div className="control-hint">
                Per-track octave range (overrides global octave)
              </div>
            </div>
          </div>
          <div className="control-group">
            <div className="control-item">
              <label>
                <span className="control-label">DRIFT</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={performance.drift}
                  onChange={(e) => handleDriftChange(parseFloat(e.target.value))}
                />
                <span className="control-value">{Math.round(performance.drift * 100)}%</span>
              </label>
              <div className="control-hint">
                Note variation (0% = exact, 100% = random from scale)
              </div>
            </div>
          </div>
        </>
      )}

      <div className="control-group clock-division-group">
        <div className="control-item">
          <div className="clock-header">
            <span className="control-label">CLOCK DIVISION</span>
            <label className="global-clock-toggle">
              <input
                type="checkbox"
                checked={clockConfig.useGlobalClock}
                onChange={(e) => handleUseGlobalClockChange(e.target.checked)}
              />
              <span>Use Global</span>
            </label>
          </div>
          <div className="clock-controls">
            <select
              value={clockConfig.division}
              onChange={(e) => handleDivisionChange(e.target.value as ClockDivisionRatio)}
              disabled={clockConfig.useGlobalClock}
              className="division-select"
            >
              {CLOCK_DIVISION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={handleResyncTrack}
              className="resync-btn"
              title="Align track to master clock position (respects clock division)"
            >
              SYNC
            </button>
          </div>
          <div className="control-hint">
            {clockConfig.useGlobalClock
              ? 'Track follows global clock'
              : `Track runs at ${clockConfig.division} speed (${CLOCK_DIVISION_VALUES[clockConfig.division]}x)`
            }
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback, useRef, useEffect } from 'react';
import type { SampleVoiceParams, SampleMode, PlayDirection } from '../audio/voices/SampleVoice';
import { SAMPLE_PRESETS } from '../audio/voices/SampleVoice';
import { engine } from '../audio/engine';
import type { VoiceType } from '../audio/voices/VoiceManager';
import type { ChannelParams } from '../audio/fx/Mixer';
import type { FilterParams } from '../audio/fx/FilterEffect';
import type { HarmonicEmphasis } from '../audio/fx/SaturationEffect';
import { SATURATION_MODES } from '../audio/fx/SaturationEffect';
import { FilterPanel } from './FilterPanel';
import './SamplePanel.css';

// Voice type options - allows switching to other voice types
const VOICE_TYPES: { value: VoiceType; label: string; group?: string }[] = [
  { value: 'fm-drum', label: 'FM Drum' },
  { value: 'fm-melodic', label: 'FM Melodic' },
  { value: 'noise', label: 'Noise/Hat' },
  { value: 'complex-morph', label: 'Complex Morph' },
  { value: 'sample', label: 'Sample' },
  { value: 'ocean', label: 'Ocean' },
  // Plaits melodic engines
  { value: 'plaits-va', label: 'Virtual Analog', group: 'Plaits Melodic' },
  { value: 'plaits-waveshaper', label: 'Waveshaper', group: 'Plaits Melodic' },
  { value: 'plaits-fm', label: 'FM', group: 'Plaits Melodic' },
  { value: 'plaits-formant', label: 'Formant', group: 'Plaits Melodic' },
  { value: 'plaits-additive', label: 'Additive', group: 'Plaits Melodic' },
  { value: 'plaits-wavetable', label: 'Wavetable', group: 'Plaits Melodic' },
  { value: 'plaits-chords', label: 'Chords', group: 'Plaits Melodic' },
  { value: 'plaits-speech', label: 'Speech', group: 'Plaits Melodic' },
  // Plaits percussion engines
  { value: 'plaits-grain', label: 'Grain Cloud', group: 'Plaits Perc' },
  { value: 'plaits-noise', label: 'Filtered Noise', group: 'Plaits Perc' },
  { value: 'plaits-particle', label: 'Particle Noise', group: 'Plaits Perc' },
  { value: 'plaits-string', label: 'Inharmonic String', group: 'Plaits Perc' },
  { value: 'plaits-modal', label: 'Modal Resonator', group: 'Plaits Perc' },
  { value: 'plaits-kick', label: 'Analog Kick', group: 'Plaits Perc' },
  { value: 'plaits-snare', label: 'Analog Snare', group: 'Plaits Perc' },
  { value: 'plaits-hihat', label: 'Analog Hi-Hat', group: 'Plaits Perc' },
];

interface SamplePanelProps {
  trackId: string;
  params: Partial<SampleVoiceParams>;
  onChange: (params: Partial<SampleVoiceParams>) => void;
  onPresetChange: (preset: string) => void;
  onVoiceChange?: (trackId: string, voiceType: VoiceType, preset?: string) => void;
  currentPreset?: string;
  channelParams?: ChannelParams | null;
  onChannelChange?: (trackId: string, params: Partial<ChannelParams>) => void;
}

interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

function ParamSlider({ label, value, min, max, step = 0.01, unit = '', onChange }: ParamSliderProps) {
  return (
    <div className="param-slider">
      <label>
        <span className="param-label">{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span className="param-value">{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
      </label>
    </div>
  );
}

interface WaveformDisplayProps {
  trackId: string;
  startPoint: number;
  onStartPointChange: (value: number) => void;
  refreshKey?: number;
}

function WaveformDisplay({ trackId, startPoint, onStartPointChange, refreshKey }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);
  const [sampleName, setSampleName] = useState<string>('');

  useEffect(() => {
    // Get waveform data from voice
    try {
      const voice = engine.getVoice(trackId);
      if (voice && 'getWaveformData' in voice) {
        const data = (voice as any).getWaveformData(200);
        setWaveformData(data);
        setSampleName((voice as any).getSampleName?.() || '');
      }
    } catch (error) {
      console.error('Error getting waveform data:', error);
    }
  }, [trackId, refreshKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    if (waveformData) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1;
      ctx.beginPath();

      const centerY = height / 2;
      const scale = height / 2 - 4;

      for (let i = 0; i < waveformData.length; i++) {
        const x = (i / waveformData.length) * width;
        const y = centerY - waveformData[i] * scale;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Mirror
      ctx.beginPath();
      for (let i = 0; i < waveformData.length; i++) {
        const x = (i / waveformData.length) * width;
        const y = centerY + waveformData[i] * scale;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    } else {
      // No sample loaded
      ctx.fillStyle = '#666';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No sample loaded', width / 2, height / 2);
    }

    // Draw start point marker
    const markerX = startPoint * width;
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(markerX, 0);
    ctx.lineTo(markerX, height);
    ctx.stroke();

    // Draw triangle at top
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(markerX - 5, 0);
    ctx.lineTo(markerX + 5, 0);
    ctx.lineTo(markerX, 8);
    ctx.closePath();
    ctx.fill();
  }, [waveformData, startPoint]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const position = x / rect.width;
    onStartPointChange(Math.max(0, Math.min(1, position)));
  }, [onStartPointChange]);

  return (
    <div className="waveform-container">
      <canvas
        ref={canvasRef}
        width={400}
        height={80}
        onClick={handleCanvasClick}
        className="waveform-canvas"
      />
      {sampleName && <div className="sample-name">{sampleName}</div>}
    </div>
  );
}

export function SamplePanel({ trackId, params, onChange, onPresetChange, onVoiceChange, currentPreset, channelParams, onChannelChange }: SamplePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [waveformRefreshKey, setWaveformRefreshKey] = useState(0);

  const mode = params.mode ?? 'standard';
  const presets = Object.keys(SAMPLE_PRESETS);

  const handleModeChange = useCallback((newMode: SampleMode) => {
    onChange({ mode: newMode });
  }, [onChange]);

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      const voice = engine.getVoice(trackId);
      if (!voice) {
        console.error('No voice found for track:', trackId);
        return;
      }
      if (!('loadSampleFromFile' in voice)) {
        console.error('Voice does not support sample loading:', voice);
        return;
      }
      await (voice as any).loadSampleFromFile(file);
      // Trigger waveform refresh
      setWaveformRefreshKey(k => k + 1);
      // Trigger re-render to update params
      onChange({});
    } catch (error) {
      console.error('Failed to load sample:', error);
    }
  }, [trackId, onChange]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[SamplePanel] File input change event', e.target.files);
    const file = e.target.files?.[0];
    if (file) {
      console.log('[SamplePanel] File selected:', file.name, file.type);
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    console.log('[SamplePanel] Drop event', e.dataTransfer.files);
    const file = e.dataTransfer.files[0];
    if (file) {
      console.log('[SamplePanel] Dropped file:', file.name, file.type);
      if (file.type.startsWith('audio/')) {
        handleFileSelect(file);
      } else {
        console.log('[SamplePanel] File is not audio type:', file.type);
      }
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleVoiceTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as VoiceType;
    if (newType !== 'sample' && onVoiceChange) {
      onVoiceChange(trackId, newType);
    }
  }, [trackId, onVoiceChange]);

  return (
    <div className="sample-panel">
      <div className="sample-panel-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="panel-title">SAMPLE</span>
        {currentPreset && <span className="preset-label">{currentPreset}</span>}
      </div>

      {isExpanded && (
        <div className="sample-panel-content">
          {/* Voice type and Preset selector */}
          <div className="preset-row">
            <label>Voice</label>
            <select value="sample" onChange={handleVoiceTypeChange}>
              {/* Non-Plaits voices */}
              {VOICE_TYPES.filter(vt => !vt.group).map(vt => (
                <option key={vt.value} value={vt.value}>{vt.label}</option>
              ))}
              {/* Plaits Melodic engines */}
              <optgroup label="Plaits Melodic">
                {VOICE_TYPES.filter(vt => vt.group === 'Plaits Melodic').map(vt => (
                  <option key={vt.value} value={vt.value}>{vt.label}</option>
                ))}
              </optgroup>
              {/* Plaits Percussion engines */}
              <optgroup label="Plaits Percussion">
                {VOICE_TYPES.filter(vt => vt.group === 'Plaits Perc').map(vt => (
                  <option key={vt.value} value={vt.value}>{vt.label}</option>
                ))}
              </optgroup>
            </select>
            <label>Preset</label>
            <select
              value={currentPreset ?? ''}
              onChange={(e) => onPresetChange(e.target.value)}
            >
              <option value="">Custom</option>
              {presets.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Mode toggle */}
          <div className="mode-toggle">
            <button
              className={mode === 'standard' ? 'active' : ''}
              onClick={() => handleModeChange('standard')}
            >
              STANDARD
            </button>
            <button
              className={mode === 'granular' ? 'active' : ''}
              onClick={() => handleModeChange('granular')}
            >
              GRANULAR
            </button>
          </div>

          {/* Sample loading */}
          <div
            className={`sample-drop-zone ${isDragging ? 'dragging' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => {
              console.log('[SamplePanel] Drop zone clicked, triggering file input');
              fileInputRef.current?.click();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
            <span>Drop audio file or click to load</span>
          </div>

          {/* Waveform display */}
          <WaveformDisplay
            trackId={trackId}
            startPoint={params.startPoint ?? 0}
            onStartPointChange={(v) => onChange({ startPoint: v })}
            refreshKey={waveformRefreshKey}
          />

          {mode === 'standard' ? (
            <>
              {/* Standard mode controls */}
              <div className="param-group">
                <h4>Playback</h4>
                <ParamSlider
                  label="Start"
                  value={params.startPoint ?? 0}
                  min={0}
                  max={1}
                  onChange={(v) => onChange({ startPoint: v })}
                />
                <ParamSlider
                  label="Pitch"
                  value={params.pitch ?? 0}
                  min={-24}
                  max={24}
                  step={1}
                  unit=" st"
                  onChange={(v) => onChange({ pitch: v })}
                />
                <div className="direction-toggle">
                  <label>Direction</label>
                  <button
                    className={(params.direction ?? 'forward') === 'forward' ? 'active' : ''}
                    onClick={() => onChange({ direction: 'forward' as PlayDirection })}
                  >
                    FWD
                  </button>
                  <button
                    className={params.direction === 'reverse' ? 'active' : ''}
                    onClick={() => onChange({ direction: 'reverse' as PlayDirection })}
                  >
                    REV
                  </button>
                </div>
              </div>

              <div className="param-group">
                <h4>Envelope</h4>
                <ParamSlider
                  label="Attack"
                  value={params.attack ?? 0.001}
                  min={0.001}
                  max={2}
                  onChange={(v) => onChange({ attack: v })}
                />
                <ParamSlider
                  label="Decay"
                  value={params.decay ?? 0.1}
                  min={0.001}
                  max={2}
                  onChange={(v) => onChange({ decay: v })}
                />
                <ParamSlider
                  label="Sustain"
                  value={params.sustain ?? 1}
                  min={0}
                  max={1}
                  onChange={(v) => onChange({ sustain: v })}
                />
                <ParamSlider
                  label="Release"
                  value={params.release ?? 0.1}
                  min={0.001}
                  max={5}
                  onChange={(v) => onChange({ release: v })}
                />
              </div>

              <div className="param-group">
                <h4>Lowpass Filter</h4>
                <div className="filter-toggle">
                  <label>
                    <input
                      type="checkbox"
                      checked={params.lpEnabled ?? false}
                      onChange={(e) => onChange({ lpEnabled: e.target.checked })}
                    />
                    Enable
                  </label>
                </div>
                <ParamSlider
                  label="Cutoff"
                  value={params.lpCutoff ?? 20000}
                  min={20}
                  max={20000}
                  step={10}
                  unit=" Hz"
                  onChange={(v) => onChange({ lpCutoff: v })}
                />
                <ParamSlider
                  label="Resonance"
                  value={params.lpResonance ?? 0}
                  min={0}
                  max={20}
                  onChange={(v) => onChange({ lpResonance: v })}
                />
              </div>

              <div className="param-group">
                <h4>Highpass Filter</h4>
                <div className="filter-toggle">
                  <label>
                    <input
                      type="checkbox"
                      checked={params.hpEnabled ?? false}
                      onChange={(e) => onChange({ hpEnabled: e.target.checked })}
                    />
                    Enable
                  </label>
                </div>
                <ParamSlider
                  label="Cutoff"
                  value={params.hpCutoff ?? 20}
                  min={20}
                  max={20000}
                  step={10}
                  unit=" Hz"
                  onChange={(v) => onChange({ hpCutoff: v })}
                />
                <ParamSlider
                  label="Resonance"
                  value={params.hpResonance ?? 0}
                  min={0}
                  max={20}
                  onChange={(v) => onChange({ hpResonance: v })}
                />
              </div>
            </>
          ) : (
            <>
              {/* Granular mode controls */}
              <div className="param-group">
                <h4>Scan</h4>
                <ParamSlider
                  label="Start"
                  value={params.startPoint ?? 0}
                  min={0}
                  max={1}
                  onChange={(v) => onChange({ startPoint: v })}
                />
                <ParamSlider
                  label="Speed"
                  value={params.scanSpeed ?? 1}
                  min={0}
                  max={8}
                  step={0.1}
                  unit="x"
                  onChange={(v) => onChange({ scanSpeed: v })}
                />
              </div>

              <div className="param-group">
                <h4>Grains</h4>
                <ParamSlider
                  label="Length"
                  value={(params.grainLength ?? 0.05) * 1000}
                  min={1}
                  max={1000}
                  step={1}
                  unit=" ms"
                  onChange={(v) => onChange({ grainLength: v / 1000 })}
                />
                <ParamSlider
                  label="Density"
                  value={params.grainDensity ?? 20}
                  min={1}
                  max={100}
                  step={1}
                  unit=" /s"
                  onChange={(v) => onChange({ grainDensity: v })}
                />
                <ParamSlider
                  label="Spread"
                  value={params.spread ?? 0}
                  min={0}
                  max={1}
                  onChange={(v) => onChange({ spread: v })}
                />
                <ParamSlider
                  label="Pan"
                  value={params.grainPan ?? 0}
                  min={-1}
                  max={1}
                  onChange={(v) => onChange({ grainPan: v })}
                />
              </div>
            </>
          )}

          {/* Output */}
          <div className="param-group">
            <h4>Output</h4>
            <ParamSlider
              label="Gain"
              value={params.gain ?? 0.8}
              min={0}
              max={1}
              onChange={(v) => onChange({ gain: v })}
            />
          </div>

          {/* Per-channel Filter */}
          {channelParams && onChannelChange && (
            <FilterPanel
              params={channelParams.filter}
              onChange={(filterParams: Partial<FilterParams>) => onChannelChange(trackId, {
                filter: { ...channelParams.filter, ...filterParams }
              })}
            />
          )}

          {/* Per-channel Saturation */}
          {channelParams && onChannelChange && (
            <div className="param-group">
              <h4>Saturation</h4>
              <div className="saturation-mode-selector">
                {SATURATION_MODES.map(({ mode, label, description }) => (
                  <button
                    key={mode}
                    className={`saturation-mode-btn ${channelParams.saturation.mode === mode ? 'active' : ''}`}
                    onClick={() => onChannelChange(trackId, {
                      saturation: { ...channelParams.saturation, mode }
                    })}
                    title={description}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <ParamSlider
                label="Drive"
                value={channelParams.saturation.drive}
                min={0}
                max={1}
                onChange={(v) => onChannelChange(trackId, {
                  saturation: { ...channelParams.saturation, drive: v }
                })}
              />

              <ParamSlider
                label="Mix"
                value={channelParams.saturation.mix}
                min={0}
                max={1}
                onChange={(v) => onChannelChange(trackId, {
                  saturation: { ...channelParams.saturation, mix: v }
                })}
              />

              <div className="saturation-advanced">
                <ParamSlider
                  label="Bias"
                  value={channelParams.saturation.bias}
                  min={-1}
                  max={1}
                  onChange={(v) => onChannelChange(trackId, {
                    saturation: { ...channelParams.saturation, bias: v }
                  })}
                />

                <div className="harmonics-selector">
                  <span className="param-label">Harmonics</span>
                  <div className="harmonics-buttons">
                    {(['even', 'odd', 'both'] as HarmonicEmphasis[]).map((h) => (
                      <button
                        key={h}
                        className={`harmonics-btn ${channelParams.saturation.harmonics === h ? 'active' : ''}`}
                        onClick={() => onChannelChange(trackId, {
                          saturation: { ...channelParams.saturation, harmonics: h }
                        })}
                      >
                        {h.charAt(0).toUpperCase() + h.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

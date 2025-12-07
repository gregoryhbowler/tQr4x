import { useState, useCallback, useRef, useEffect } from 'react';
import type { OceanVoiceParams, GrainShape } from '../audio/voices/OceanVoice';
import { engine } from '../audio/engine';
import type { VoiceType } from '../audio/voices/VoiceManager';
import type { ChannelParams } from '../audio/fx/Mixer';
import type { FilterParams } from '../audio/fx/FilterEffect';
import type { HarmonicEmphasis } from '../audio/fx/SaturationEffect';
import { SATURATION_MODES } from '../audio/fx/SaturationEffect';
import { FilterPanel } from './FilterPanel';
import './OceanPanel.css';

interface OceanPanelProps {
  trackId: string;
  params: Partial<OceanVoiceParams>;
  onChange: (params: Partial<OceanVoiceParams>) => void;
  onPresetChange: (preset: string) => void;
  onVoiceChange?: (trackId: string, voiceType: VoiceType, preset?: string) => void;
  currentPreset?: string;
  channelParams?: ChannelParams | null;
  onChannelChange?: (trackId: string, params: Partial<ChannelParams>) => void;
}

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

const GRAIN_SHAPES: { value: GrainShape; label: string }[] = [
  { value: 'hanning', label: 'Hanning' },
  { value: 'trapezoid', label: 'Trapezoid' },
  { value: 'exponentialUp', label: 'Exp Up' },
  { value: 'exponentialDown', label: 'Exp Down' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'trapezium', label: 'Trapezium' },
];

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
    <div className="ocean-param-slider">
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
  position: number;
  spread: number;
  onPositionChange: (value: number) => void;
  refreshKey?: number;
}

function WaveformDisplay({ trackId, position, spread, onPositionChange, refreshKey }: WaveformDisplayProps) {
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
      ctx.strokeStyle = '#06b6d4';
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

    // Draw spread region
    const posX = (position / 100) * width;
    const spreadWidth = (spread / 100) * width;

    ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.fillRect(posX - spreadWidth / 2, 0, spreadWidth, height);

    // Draw position marker
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(posX, 0);
    ctx.lineTo(posX, height);
    ctx.stroke();

    // Draw triangle at top
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.moveTo(posX - 5, 0);
    ctx.lineTo(posX + 5, 0);
    ctx.lineTo(posX, 8);
    ctx.closePath();
    ctx.fill();
  }, [waveformData, position, spread]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const positionPercent = (x / rect.width) * 100;
    onPositionChange(Math.max(0, Math.min(100, positionPercent)));
  }, [onPositionChange]);

  return (
    <div className="ocean-waveform-container">
      <canvas
        ref={canvasRef}
        width={400}
        height={80}
        onClick={handleCanvasClick}
        className="ocean-waveform-canvas"
      />
      {sampleName && <div className="ocean-sample-name">{sampleName}</div>}
    </div>
  );
}

export function OceanPanel({ trackId, params, onChange, onPresetChange, onVoiceChange, currentPreset, channelParams, onChannelChange }: OceanPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [waveformRefreshKey, setWaveformRefreshKey] = useState(0);

  const presets: string[] = [];

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
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      handleFileSelect(file);
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
    if (newType !== 'ocean' && onVoiceChange) {
      onVoiceChange(trackId, newType);
    }
  }, [trackId, onVoiceChange]);

  return (
    <div className="ocean-panel">
      <div className="ocean-panel-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="panel-title">OCEAN</span>
        {currentPreset && <span className="preset-label">{currentPreset}</span>}
      </div>

      {isExpanded && (
        <div className="ocean-panel-content">
          {/* Voice type and Preset selector */}
          <div className="ocean-preset-row">
            <label>Voice</label>
            <select value="ocean" onChange={handleVoiceTypeChange}>
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

          {/* Sample loading */}
          <div
            className={`ocean-drop-zone ${isDragging ? 'dragging' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
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
            position={params.position ?? 50}
            spread={params.spread ?? 10}
            onPositionChange={(v) => onChange({ position: v })}
            refreshKey={waveformRefreshKey}
          />

          {/* Pitch control */}
          <div className="ocean-param-group">
            <h4>Pitch</h4>
            <ParamSlider
              label="Pitch"
              value={params.pitch ?? 0}
              min={-24}
              max={24}
              step={1}
              unit=" st"
              onChange={(v) => onChange({ pitch: v })}
            />
          </div>

          {/* Grain controls */}
          <div className="ocean-param-group">
            <h4>Grains</h4>
            <ParamSlider
              label="Size"
              value={params.grainSize ?? 100}
              min={10}
              max={4000}
              step={1}
              unit=" ms"
              onChange={(v) => onChange({ grainSize: v })}
            />
            <ParamSlider
              label="Density"
              value={params.density ?? 100}
              min={0}
              max={200}
              step={1}
              unit="%"
              onChange={(v) => onChange({ density: v })}
            />
            <ParamSlider
              label="Position"
              value={params.position ?? 50}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(v) => onChange({ position: v })}
            />
            <ParamSlider
              label="Spread"
              value={params.spread ?? 10}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(v) => onChange({ spread: v })}
            />
            <div className="ocean-shape-select">
              <label>Shape</label>
              <select
                value={params.grainShape ?? 'hanning'}
                onChange={(e) => onChange({ grainShape: e.target.value as GrainShape })}
              >
                {GRAIN_SHAPES.map(shape => (
                  <option key={shape.value} value={shape.value}>{shape.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter controls */}
          <div className="ocean-param-group">
            <h4>Filters</h4>
            <ParamSlider
              label="HPF"
              value={params.hpfFreq ?? 20}
              min={20}
              max={20000}
              step={1}
              unit=" Hz"
              onChange={(v) => onChange({ hpfFreq: v })}
            />
            <ParamSlider
              label="LPF"
              value={params.lpfFreq ?? 20000}
              min={20}
              max={20000}
              step={1}
              unit=" Hz"
              onChange={(v) => onChange({ lpfFreq: v })}
            />
          </div>

          {/* Output */}
          <div className="ocean-param-group">
            <h4>Output</h4>
            <ParamSlider
              label="Volume"
              value={params.volume ?? 80}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(v) => onChange({ volume: v })}
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
            <div className="ocean-param-group">
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

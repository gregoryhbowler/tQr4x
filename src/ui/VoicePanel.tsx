import { useState, useCallback, useEffect } from 'react';
import type { VoiceType, TrackVoiceConfig } from '../audio/voices/VoiceManager';
import { isPlaitsVoice, isPlaitsmelodicEngine } from '../audio/voices/VoiceManager';
import type { FMDrumParams } from '../audio/voices/FMDrumVoice';
import type { FMMelodicParams } from '../audio/voices/FMMelodicVoice';
import type { NoiseVoiceParams } from '../audio/voices/NoiseVoice';
import type { PlaitsParams } from '../audio/voices/PlaitsVoice';
import type { PlaitsMelodicParams } from '../audio/voices/PlaitsMelodicVoice';
import type { ChannelParams } from '../audio/fx/Mixer';
import type { FilterParams } from '../audio/fx/FilterEffect';
import type { HarmonicEmphasis } from '../audio/fx/SaturationEffect';
import { PLAITS_ENGINE_INFO } from '../audio/voices/PlaitsVoice';
import { FM_DRUM_PRESETS } from '../audio/voices/FMDrumVoice';
import { FM_MELODIC_PRESETS } from '../audio/voices/FMMelodicVoice';
import { NOISE_PRESETS } from '../audio/voices/NoiseVoice';
import { COMPLEX_MORPH_PRESETS } from '../audio/voices/ComplexMorphVoice';
import { SAMPLE_PRESETS } from '../audio/voices/SampleVoice';
import { PLAITS_MELODIC_PRESETS } from '../audio/voices/PlaitsMelodicVoice';
import { PLAITS_PERC_PRESETS } from '../audio/voices/PlaitsPercVoice';
import { SATURATION_MODES } from '../audio/fx/SaturationEffect';
import { FilterPanel } from './FilterPanel';
import './VoicePanel.css';

interface VoicePanelProps {
  trackId: string;
  config: TrackVoiceConfig | null;
  onVoiceChange: (trackId: string, voiceType: VoiceType, preset?: string) => void;
  onParamChange: (trackId: string, params: Partial<FMDrumParams | FMMelodicParams | NoiseVoiceParams>) => void;
  onPresetChange: (trackId: string, preset: string) => void;
  onNoteChange?: (trackId: string, note: number) => void;
  channelParams?: ChannelParams | null;
  onChannelChange?: (trackId: string, params: Partial<ChannelParams>) => void;
}

const VOICE_TYPES: { value: VoiceType; label: string; group?: string }[] = [
  { value: 'fm-drum', label: 'FM Drum' },
  { value: 'fm-melodic', label: 'FM Melodic' },
  { value: 'noise', label: 'Noise/Hat' },
  { value: 'complex-morph', label: 'Complex Morph' },
  { value: 'sample', label: 'Sample' },
  { value: 'ocean', label: 'Ocean' },
  // Plaits melodic engines (0-7)
  { value: 'plaits-va', label: 'Virtual Analog', group: 'Plaits Melodic' },
  { value: 'plaits-waveshaper', label: 'Waveshaper', group: 'Plaits Melodic' },
  { value: 'plaits-fm', label: 'FM', group: 'Plaits Melodic' },
  { value: 'plaits-formant', label: 'Formant', group: 'Plaits Melodic' },
  { value: 'plaits-additive', label: 'Additive', group: 'Plaits Melodic' },
  { value: 'plaits-wavetable', label: 'Wavetable', group: 'Plaits Melodic' },
  { value: 'plaits-chords', label: 'Chords', group: 'Plaits Melodic' },
  { value: 'plaits-speech', label: 'Speech', group: 'Plaits Melodic' },
  // Plaits percussion engines (8-15)
  { value: 'plaits-grain', label: 'Grain Cloud', group: 'Plaits Perc' },
  { value: 'plaits-noise', label: 'Filtered Noise', group: 'Plaits Perc' },
  { value: 'plaits-particle', label: 'Particle Noise', group: 'Plaits Perc' },
  { value: 'plaits-string', label: 'Inharmonic String', group: 'Plaits Perc' },
  { value: 'plaits-modal', label: 'Modal Resonator', group: 'Plaits Perc' },
  { value: 'plaits-kick', label: 'Analog Kick', group: 'Plaits Perc' },
  { value: 'plaits-snare', label: 'Analog Snare', group: 'Plaits Perc' },
  { value: 'plaits-hihat', label: 'Analog Hi-Hat', group: 'Plaits Perc' },
];

// Get Plaits engine number from voice type
function getPlaitsEngineFromVoiceType(voiceType: VoiceType): number {
  const engineMap: Record<string, number> = {
    'plaits-va': 0, 'plaits-waveshaper': 1, 'plaits-fm': 2, 'plaits-formant': 3,
    'plaits-additive': 4, 'plaits-wavetable': 5, 'plaits-chords': 6, 'plaits-speech': 7,
    'plaits-grain': 8, 'plaits-noise': 9, 'plaits-particle': 10, 'plaits-string': 11,
    'plaits-modal': 12, 'plaits-kick': 13, 'plaits-snare': 14, 'plaits-hihat': 15,
  };
  return engineMap[voiceType] ?? 0;
}

// Check if a Plaits percussion engine should have pitch control
// String (11) and Modal (12) are pitched physical modeling engines
function isPitchedPercEngine(voiceType: VoiceType): boolean {
  return voiceType === 'plaits-string' || voiceType === 'plaits-modal';
}

function getPresets(voiceType: VoiceType): string[] {
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
    default:
      // Plaits engines
      if (isPlaitsmelodicEngine(voiceType)) {
        return Object.keys(PLAITS_MELODIC_PRESETS);
      } else if (isPlaitsVoice(voiceType)) {
        return Object.keys(PLAITS_PERC_PRESETS);
      }
      return [];
  }
}

interface ParamControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

function ParamControl({ label, value, min, max, step = 0.01, onChange }: ParamControlProps) {
  return (
    <div className="param-control">
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
        <span className="param-value">{value.toFixed(2)}</span>
      </label>
    </div>
  );
}

function FMDrumControls({
  params,
  onChange
}: {
  params: Partial<FMDrumParams>;
  onChange: (params: Partial<FMDrumParams>) => void;
}) {
  return (
    <div className="voice-params">
      <div className="param-group">
        <h4>Pitch</h4>
        <ParamControl
          label="Pitch"
          value={params.pitch ?? 55}
          min={20}
          max={500}
          step={1}
          onChange={(v) => onChange({ pitch: v })}
        />
        <ParamControl
          label="Pitch Env"
          value={params.pitchEnvAmount ?? 4}
          min={1}
          max={16}
          onChange={(v) => onChange({ pitchEnvAmount: v })}
        />
        <ParamControl
          label="Pitch Decay"
          value={params.pitchEnvDecay ?? 0.05}
          min={0.001}
          max={0.3}
          onChange={(v) => onChange({ pitchEnvDecay: v })}
        />
      </div>

      <div className="param-group">
        <h4>FM</h4>
        <ParamControl
          label="Op1 Ratio"
          value={params.op1Ratio ?? 1.5}
          min={0.1}
          max={8}
          onChange={(v) => onChange({ op1Ratio: v })}
        />
        <ParamControl
          label="Op1 Index"
          value={params.op1Index ?? 3}
          min={0}
          max={20}
          onChange={(v) => onChange({ op1Index: v })}
        />
        <ParamControl
          label="Op2 Ratio"
          value={params.op2Ratio ?? 3}
          min={0.1}
          max={8}
          onChange={(v) => onChange({ op2Ratio: v })}
        />
        <ParamControl
          label="Op2 Index"
          value={params.op2Index ?? 1}
          min={0}
          max={20}
          onChange={(v) => onChange({ op2Index: v })}
        />
      </div>

      <div className="param-group">
        <h4>Amplitude</h4>
        <ParamControl
          label="Attack"
          value={params.ampAttack ?? 0.001}
          min={0.001}
          max={0.1}
          onChange={(v) => onChange({ ampAttack: v })}
        />
        <ParamControl
          label="Decay"
          value={params.ampDecay ?? 0.3}
          min={0.01}
          max={2}
          onChange={(v) => onChange({ ampDecay: v })}
        />
      </div>

      <div className="param-group">
        <h4>Noise</h4>
        <ParamControl
          label="Noise Mix"
          value={params.noiseMix ?? 0}
          min={0}
          max={1}
          onChange={(v) => onChange({ noiseMix: v })}
        />
        <ParamControl
          label="Noise Decay"
          value={params.noiseDecay ?? 0.1}
          min={0.01}
          max={0.5}
          onChange={(v) => onChange({ noiseDecay: v })}
        />
      </div>

      <div className="param-group">
        <h4>Output</h4>
        <ParamControl
          label="Gain"
          value={params.gain ?? 0.8}
          min={0}
          max={1}
          onChange={(v) => onChange({ gain: v })}
        />
      </div>
    </div>
  );
}

function FMMelodicControls({
  params,
  note,
  onChange,
  onNoteChange
}: {
  params: Partial<FMMelodicParams>;
  note: number;
  onChange: (params: Partial<FMMelodicParams>) => void;
  onNoteChange: (note: number) => void;
}) {
  return (
    <div className="voice-params">
      <div className="param-group">
        <h4>Note</h4>
        <ParamControl
          label="MIDI Note"
          value={note}
          min={24}
          max={96}
          step={1}
          onChange={onNoteChange}
        />
      </div>

      <div className="param-group">
        <h4>FM</h4>
        <ParamControl
          label="Op2 Ratio"
          value={params.op2Ratio ?? 2}
          min={0.1}
          max={8}
          onChange={(v) => onChange({ op2Ratio: v })}
        />
        <ParamControl
          label="Op2 Index"
          value={params.op2Index ?? 2}
          min={0}
          max={20}
          onChange={(v) => onChange({ op2Index: v })}
        />
        <ParamControl
          label="Op3 Ratio"
          value={params.op3Ratio ?? 3}
          min={0.1}
          max={8}
          onChange={(v) => onChange({ op3Ratio: v })}
        />
        <ParamControl
          label="Op3 Index"
          value={params.op3Index ?? 1}
          min={0}
          max={20}
          onChange={(v) => onChange({ op3Index: v })}
        />
        <ParamControl
          label="Feedback"
          value={params.op2Feedback ?? 0}
          min={0}
          max={1}
          onChange={(v) => onChange({ op2Feedback: v })}
        />
      </div>

      <div className="param-group">
        <h4>Filter</h4>
        <div className="param-toggle">
          <label>
            <input
              type="checkbox"
              checked={params.filterEnabled ?? false}
              onChange={(e) => onChange({ filterEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
        </div>
        <ParamControl
          label="Cutoff"
          value={params.filterFreq ?? 2000}
          min={20}
          max={15000}
          step={10}
          onChange={(v) => onChange({ filterFreq: v })}
        />
        <ParamControl
          label="Resonance"
          value={params.filterQ ?? 1}
          min={0.1}
          max={20}
          onChange={(v) => onChange({ filterQ: v })}
        />
        <ParamControl
          label="Env Amt"
          value={params.filterEnvAmount ?? 0}
          min={0}
          max={10000}
          step={50}
          onChange={(v) => onChange({ filterEnvAmount: v })}
        />
        <ParamControl
          label="Env Decay"
          value={params.filterEnvDecay ?? 0.3}
          min={0.01}
          max={2}
          onChange={(v) => onChange({ filterEnvDecay: v })}
        />
      </div>

      <div className="param-group">
        <h4>Envelope</h4>
        <ParamControl
          label="Attack"
          value={params.ampAttack ?? 0.01}
          min={0.001}
          max={1}
          onChange={(v) => onChange({ ampAttack: v })}
        />
        <ParamControl
          label="Decay"
          value={params.ampDecay ?? 0.2}
          min={0.001}
          max={2}
          onChange={(v) => onChange({ ampDecay: v })}
        />
        <ParamControl
          label="Sustain"
          value={params.ampSustain ?? 0.6}
          min={0}
          max={1}
          onChange={(v) => onChange({ ampSustain: v })}
        />
        <ParamControl
          label="Release"
          value={params.ampRelease ?? 0.3}
          min={0.001}
          max={2}
          onChange={(v) => onChange({ ampRelease: v })}
        />
      </div>

      <div className="param-group">
        <h4>Glide</h4>
        <div className="param-toggle">
          <label>
            <input
              type="checkbox"
              checked={params.glideEnabled ?? false}
              onChange={(e) => onChange({ glideEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
        </div>
        <ParamControl
          label="Time"
          value={params.glideTime ?? 0.05}
          min={0.01}
          max={0.5}
          onChange={(v) => onChange({ glideTime: v })}
        />
      </div>

      <div className="param-group">
        <h4>Output</h4>
        <ParamControl
          label="Gain"
          value={params.gain ?? 0.7}
          min={0}
          max={1}
          onChange={(v) => onChange({ gain: v })}
        />
      </div>
    </div>
  );
}

function NoiseControls({
  params,
  onChange
}: {
  params: Partial<NoiseVoiceParams>;
  onChange: (params: Partial<NoiseVoiceParams>) => void;
}) {
  return (
    <div className="voice-params">
      <div className="param-group">
        <h4>Filter</h4>
        <ParamControl
          label="Frequency"
          value={params.filterFreq ?? 8000}
          min={100}
          max={15000}
          step={100}
          onChange={(v) => onChange({ filterFreq: v })}
        />
        <ParamControl
          label="Resonance"
          value={params.filterQ ?? 1}
          min={0.1}
          max={10}
          onChange={(v) => onChange({ filterQ: v })}
        />
      </div>

      <div className="param-group">
        <h4>Envelope</h4>
        <ParamControl
          label="Attack"
          value={params.attack ?? 0.001}
          min={0.0001}
          max={0.1}
          onChange={(v) => onChange({ attack: v })}
        />
        <ParamControl
          label="Decay"
          value={params.decay ?? 0.08}
          min={0.01}
          max={2}
          onChange={(v) => onChange({ decay: v })}
        />
      </div>

      <div className="param-group">
        <h4>Metallic</h4>
        <div className="param-toggle">
          <label>
            <input
              type="checkbox"
              checked={params.metallicEnabled ?? false}
              onChange={(e) => onChange({ metallicEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
        </div>
        <ParamControl
          label="Gain"
          value={params.metallicGain ?? 0.5}
          min={0}
          max={1}
          onChange={(v) => onChange({ metallicGain: v })}
        />
        <ParamControl
          label="Index"
          value={params.metallicIndex ?? 2}
          min={0}
          max={10}
          onChange={(v) => onChange({ metallicIndex: v })}
        />
      </div>

      <div className="param-group">
        <h4>Click</h4>
        <div className="param-toggle">
          <label>
            <input
              type="checkbox"
              checked={params.clickEnabled ?? false}
              onChange={(e) => onChange({ clickEnabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
        </div>
        <ParamControl
          label="Frequency"
          value={params.clickFreq ?? 1500}
          min={100}
          max={5000}
          step={100}
          onChange={(v) => onChange({ clickFreq: v })}
        />
      </div>

      <div className="param-group">
        <h4>Output</h4>
        <ParamControl
          label="Gain"
          value={params.gain ?? 0.8}
          min={0}
          max={1}
          onChange={(v) => onChange({ gain: v })}
        />
      </div>
    </div>
  );
}

function PlaitsControls({
  params,
  voiceType,
  note,
  onChange,
  onNoteChange
}: {
  params: Partial<PlaitsParams | PlaitsMelodicParams>;
  voiceType: VoiceType;
  note: number;
  onChange: (params: Partial<PlaitsParams | PlaitsMelodicParams>) => void;
  onNoteChange: (note: number) => void;
}) {
  const engineNum = getPlaitsEngineFromVoiceType(voiceType);
  const engineInfo = PLAITS_ENGINE_INFO[engineNum];
  const isMelodic = isPlaitsmelodicEngine(voiceType);
  const isPitchedPerc = isPitchedPercEngine(voiceType);
  const showPitch = isMelodic || isPitchedPerc;

  return (
    <div className="voice-params">
      <div className="param-group">
        <h4>{engineInfo?.name ?? 'Plaits'}</h4>
        <p className="engine-description">{engineInfo?.description ?? ''}</p>
      </div>

      {showPitch && (
        <div className="param-group">
          <h4>Pitch</h4>
          <ParamControl
            label="MIDI Note"
            value={note}
            min={24}
            max={96}
            step={1}
            onChange={onNoteChange}
          />
          {/* For pitched percussion, also allow direct note param adjustment */}
          {isPitchedPerc && (
            <ParamControl
              label="Note (param)"
              value={(params as PlaitsParams).note ?? 48}
              min={24}
              max={96}
              step={1}
              onChange={(v) => onChange({ note: v })}
            />
          )}
        </div>
      )}

      <div className="param-group">
        <h4>Macro Controls</h4>
        <ParamControl
          label={engineInfo?.harmonicsLabel ?? 'Harmonics'}
          value={(params as PlaitsParams).harmonics ?? 0.5}
          min={0}
          max={1}
          onChange={(v) => onChange({ harmonics: v })}
        />
        <ParamControl
          label={engineInfo?.timbreLabel ?? 'Timbre'}
          value={(params as PlaitsParams).timbre ?? 0.5}
          min={0}
          max={1}
          onChange={(v) => onChange({ timbre: v })}
        />
        <ParamControl
          label={engineInfo?.morphLabel ?? 'Morph'}
          value={(params as PlaitsParams).morph ?? 0.5}
          min={0}
          max={1}
          onChange={(v) => onChange({ morph: v })}
        />
      </div>

      <div className="param-group">
        <h4>Internal LPG</h4>
        <ParamControl
          label="Decay"
          value={(params as PlaitsParams).decay ?? 0.5}
          min={0}
          max={1}
          onChange={(v) => onChange({ decay: v })}
        />
        <ParamControl
          label="Fade (Aux Mix)"
          value={(params as PlaitsParams).fade ?? 0}
          min={0}
          max={1}
          onChange={(v) => onChange({ fade: v })}
        />
      </div>

      {isMelodic && (
        <div className="param-group">
          <h4>Glide</h4>
          <div className="param-toggle">
            <label>
              <input
                type="checkbox"
                checked={(params as PlaitsMelodicParams).glideEnabled ?? false}
                onChange={(e) => onChange({ glideEnabled: e.target.checked } as Partial<PlaitsMelodicParams>)}
              />
              <span>Enable</span>
            </label>
          </div>
          <ParamControl
            label="Time"
            value={(params as PlaitsMelodicParams).glideTime ?? 0.05}
            min={0.01}
            max={2}
            onChange={(v) => onChange({ glideTime: v } as Partial<PlaitsMelodicParams>)}
          />
        </div>
      )}

      <div className="param-group">
        <h4>Output</h4>
        <ParamControl
          label="Volume"
          value={(params as PlaitsParams).volume ?? 0.8}
          min={0}
          max={1}
          onChange={(v) => onChange({ volume: v })}
        />
      </div>
    </div>
  );
}

export function VoicePanel({
  trackId,
  config,
  onVoiceChange,
  onParamChange,
  onPresetChange,
  onNoteChange,
  channelParams,
  onChannelChange
}: VoicePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [localNote, setLocalNote] = useState(config?.note ?? 60);

  const voiceType = config?.voiceType ?? 'fm-drum';
  const preset = config?.preset ?? '';
  const params = config?.params ?? {};
  const presets = getPresets(voiceType);

  useEffect(() => {
    if (config?.note !== undefined) {
      setLocalNote(config.note);
    }
  }, [config?.note]);

  const handleVoiceTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onVoiceChange(trackId, e.target.value as VoiceType);
  }, [trackId, onVoiceChange]);

  const handlePresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onPresetChange(trackId, e.target.value);
  }, [trackId, onPresetChange]);

  const handleParamChange = useCallback((newParams: Partial<FMDrumParams | FMMelodicParams | NoiseVoiceParams>) => {
    onParamChange(trackId, newParams);
  }, [trackId, onParamChange]);

  const handleNoteChange = useCallback((note: number) => {
    setLocalNote(note);
    onNoteChange?.(trackId, note);
  }, [trackId, onNoteChange]);

  return (
    <div className="voice-panel">
      <div className="voice-panel-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="voice-type-label">{voiceType}</span>
        {preset && <span className="preset-label">{preset}</span>}
      </div>

      {isExpanded && (
        <div className="voice-panel-content">
          <div className="voice-selectors">
            <div className="selector-group">
              <label>Voice Type</label>
              <select value={voiceType} onChange={handleVoiceTypeChange}>
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
            </div>

            <div className="selector-group">
              <label>Preset</label>
              <select value={preset} onChange={handlePresetChange}>
                <option value="">Custom</option>
                {presets.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {voiceType === 'fm-drum' && (
            <FMDrumControls
              params={params as Partial<FMDrumParams>}
              onChange={handleParamChange}
            />
          )}

          {voiceType === 'fm-melodic' && (
            <FMMelodicControls
              params={params as Partial<FMMelodicParams>}
              note={localNote}
              onChange={handleParamChange}
              onNoteChange={handleNoteChange}
            />
          )}

          {voiceType === 'noise' && (
            <NoiseControls
              params={params as Partial<NoiseVoiceParams>}
              onChange={handleParamChange}
            />
          )}

          {isPlaitsVoice(voiceType) && (
            <PlaitsControls
              params={params as Partial<PlaitsParams | PlaitsMelodicParams>}
              voiceType={voiceType}
              note={localNote}
              onChange={handleParamChange}
              onNoteChange={handleNoteChange}
            />
          )}

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
            <div className="voice-saturation-section">
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

              <ParamControl
                label="Drive"
                value={channelParams.saturation.drive}
                min={0}
                max={1}
                onChange={(v) => onChannelChange(trackId, {
                  saturation: { ...channelParams.saturation, drive: v }
                })}
              />

              <ParamControl
                label="Mix"
                value={channelParams.saturation.mix}
                min={0}
                max={1}
                onChange={(v) => onChannelChange(trackId, {
                  saturation: { ...channelParams.saturation, mix: v }
                })}
              />

              <div className="saturation-advanced">
                <ParamControl
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

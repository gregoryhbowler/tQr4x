/**
 * ComplexMorphPanel - UI for "The Structuralist" Complex Morph FM engine
 *
 * Updated for MULTI-BREAKPOINT LOOPING ENVELOPE architecture:
 * - Each envelope has 2-16 drawable breakpoints
 * - User-defined cycle period
 * - Envelopes loop continuously
 * - Canvas-based envelope editor
 */

import { useState, useCallback } from 'react';
import type {
  ComplexMorphParams,
  ComplexMorphOperator,
  CyclingEnvelope,
  OperatorEnvelopes
} from '../audio/voices/ComplexMorphVoice';
import { COMPLEX_MORPH_PRESETS } from '../audio/voices/ComplexMorphVoice';
import type { VoiceType } from '../audio/voices/VoiceManager';
import { EnvelopeEditor } from './EnvelopeEditor';
import './ComplexMorphPanel.css';

// Voice type options - allows switching to other voice types
const VOICE_TYPES: { value: VoiceType; label: string }[] = [
  { value: 'fm-drum', label: 'FM Drum' },
  { value: 'fm-melodic', label: 'FM Melodic' },
  { value: 'noise', label: 'Noise/Hat' },
  { value: 'complex-morph', label: 'Complex Morph' },
  { value: 'sample', label: 'Sample' },
  { value: 'ocean', label: 'Ocean' },
];

interface ComplexMorphPanelProps {
  trackId: string;
  params: ComplexMorphParams | null;
  preset: string;
  onParamChange: (trackId: string, params: Partial<ComplexMorphParams>) => void;
  onPresetChange: (trackId: string, preset: string) => void;
  onVoiceChange?: (trackId: string, voiceType: VoiceType, preset?: string) => void;
}

interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  logarithmic?: boolean;
  onChange: (value: number) => void;
}

function ParamSlider({ label, value, min, max, step: _step = 0.01, unit = '', logarithmic = false, onChange }: ParamSliderProps) {
  const safeValue = value ?? min;

  const toSliderValue = (v: number) => {
    if (logarithmic && min > 0) {
      return Math.log(Math.max(v, min) / min) / Math.log(max / min);
    }
    return (v - min) / (max - min);
  };

  const fromSliderValue = (s: number) => {
    if (logarithmic && min > 0) {
      return min * Math.pow(max / min, s);
    }
    return min + s * (max - min);
  };

  const sliderValue = toSliderValue(safeValue);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const s = parseFloat(e.target.value);
    onChange(fromSliderValue(s));
  };

  const formatValue = (v: number) => {
    if (v === undefined || v === null || isNaN(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1000) return `${(v / 1000).toFixed(1)}k${unit}`;
    if (abs >= 100) return `${Math.round(v)}${unit}`;
    if (abs >= 10) return `${v.toFixed(1)}${unit}`;
    return `${v.toFixed(2)}${unit}`;
  };

  return (
    <div className="cm-param">
      <span className="cm-param-label">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={sliderValue}
        onChange={handleChange}
      />
      <span className="cm-param-value">{formatValue(safeValue)}</span>
    </div>
  );
}

interface OperatorPanelProps {
  name: string;
  color: string;
  operator: ComplexMorphOperator;
  onFreqChange: (freq: number) => void;
  onEnvelopeChange: (envType: keyof OperatorEnvelopes, changes: Partial<CyclingEnvelope> | number) => void;
}

function OperatorPanel({ name, color, operator, onFreqChange, onEnvelopeChange }: OperatorPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const env = operator.envelopes;

  return (
    <div className="cm-operator-panel" style={{ borderColor: color }}>
      <div
        className="cm-operator-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ color }}
      >
        <span className="cm-expand">{isExpanded ? '▼' : '▶'}</span>
        <span>{name}</span>
        <span className="cm-op-freq">{operator.freq.toFixed(1)} Hz</span>
      </div>

      {isExpanded && (
        <div className="cm-operator-content">
          {/* Base frequency */}
          <div className="cm-op-row">
            <ParamSlider
              label="Base Freq"
              value={operator.freq}
              min={20}
              max={2000}
              logarithmic
              unit="Hz"
              onChange={onFreqChange}
            />
          </div>

          {/* Pitch Envelope */}
          <EnvelopeEditor
            label="Pitch Envelope"
            color={color}
            envelope={env.pitch}
            onChange={(changes) => onEnvelopeChange('pitch', changes)}
          />
          <div className="cm-range-row">
            <ParamSlider
              label="Pitch Range"
              value={env.pitchRange}
              min={0}
              max={500}
              unit="Hz"
              onChange={(v) => onEnvelopeChange('pitchRange', v)}
            />
          </div>

          {/* Index Envelope */}
          <EnvelopeEditor
            label="Index Envelope"
            color={color}
            envelope={env.index}
            onChange={(changes) => onEnvelopeChange('index', changes)}
          />
          <div className="cm-range-row">
            <ParamSlider
              label="Index Min"
              value={env.indexMin}
              min={0}
              max={20}
              onChange={(v) => onEnvelopeChange('indexMin', v)}
            />
            <ParamSlider
              label="Index Max"
              value={env.indexMax}
              min={0}
              max={30}
              onChange={(v) => onEnvelopeChange('indexMax', v)}
            />
          </div>

          {/* Level Envelope */}
          <EnvelopeEditor
            label="Level Envelope"
            color={color}
            envelope={env.level}
            onChange={(changes) => onEnvelopeChange('level', changes)}
          />
          <div className="cm-range-row">
            <ParamSlider
              label="Level Max"
              value={env.levelMax}
              min={0}
              max={2}
              onChange={(v) => onEnvelopeChange('levelMax', v)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Default flat envelope
const DEFAULT_ENVELOPE: CyclingEnvelope = {
  breakpoints: [
    { time: 0, value: 0.5, curve: 'linear' },
    { time: 1, value: 0.5, curve: 'linear' }
  ],
  period: 1,
  syncToTempo: false,
  amount: 1,
  enabled: true,
  loopMode: 'cycle'
};

const DEFAULT_FULL_ENVELOPE: CyclingEnvelope = {
  breakpoints: [
    { time: 0, value: 1, curve: 'linear' },
    { time: 1, value: 1, curve: 'linear' }
  ],
  period: 1,
  syncToTempo: false,
  amount: 1,
  enabled: true,
  loopMode: 'cycle'
};

const DEFAULT_OP_ENVELOPES: OperatorEnvelopes = {
  pitch: { ...DEFAULT_ENVELOPE },
  pitchRange: 100,
  index: { ...DEFAULT_ENVELOPE },
  indexMin: 0,
  indexMax: 10,
  level: { ...DEFAULT_FULL_ENVELOPE },
  levelMax: 1
};

const DEFAULT_OPERATOR: ComplexMorphOperator = {
  freq: 220,
  envelopes: { ...DEFAULT_OP_ENVELOPES }
};

export function ComplexMorphPanel({
  trackId,
  params,
  preset,
  onParamChange,
  onPresetChange,
  onVoiceChange
}: ComplexMorphPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const presetNames = Object.keys(COMPLEX_MORPH_PRESETS);

  const handleVoiceTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onVoiceChange?.(trackId, e.target.value as VoiceType);
  }, [trackId, onVoiceChange]);

  // Default params if none provided
  const p = params ?? {
    carrierFreq: 110,
    carrierPitchEnv: { ...DEFAULT_ENVELOPE },
    carrierPitchRange: 50,
    opA: { ...DEFAULT_OPERATOR, freq: 220 },
    opB: { ...DEFAULT_OPERATOR, freq: 330 },
    opC: { ...DEFAULT_OPERATOR, freq: 165 },
    ampEnv: { ...DEFAULT_FULL_ENVELOPE },
    notchFreq: 800,
    notchQ: 12,
    notchEnv: { ...DEFAULT_ENVELOPE },
    notchRange: 600,
    outputLevel: 0.7,
    gain: 0.8
  };

  const handlePresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onPresetChange(trackId, e.target.value);
  }, [trackId, onPresetChange]);

  const handleOperatorFreqChange = useCallback((op: 'opA' | 'opB' | 'opC', freq: number) => {
    const currentOp = p[op];
    const newOp = { ...currentOp, freq };
    onParamChange(trackId, { [op]: newOp } as Partial<ComplexMorphParams>);
  }, [trackId, p, onParamChange]);

  const handleOperatorEnvelopeChange = useCallback((
    op: 'opA' | 'opB' | 'opC',
    envType: keyof OperatorEnvelopes,
    changes: Partial<CyclingEnvelope> | number
  ) => {
    const currentOp = p[op];
    const currentEnvelopes = currentOp.envelopes;

    let newEnvelopes: OperatorEnvelopes;

    if (envType === 'pitch' || envType === 'index' || envType === 'level') {
      // It's an envelope object
      newEnvelopes = {
        ...currentEnvelopes,
        [envType]: { ...currentEnvelopes[envType], ...(changes as Partial<CyclingEnvelope>) }
      };
    } else {
      // It's a simple value (pitchRange, indexMin, etc.)
      newEnvelopes = {
        ...currentEnvelopes,
        [envType]: changes
      };
    }

    const newOp = { ...currentOp, envelopes: newEnvelopes };
    onParamChange(trackId, { [op]: newOp } as Partial<ComplexMorphParams>);
  }, [trackId, p, onParamChange]);

  return (
    <div className="complex-morph-panel">
      <div className="cm-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="cm-expand-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="cm-title">THE STRUCTURALIST</span>
        <span className="cm-subtitle">Complex Morph FM</span>
        {preset && <span className="cm-preset-badge">{preset}</span>}
      </div>

      {isExpanded && (
        <div className="cm-content">
          {/* Voice type and Preset selector */}
          <div className="cm-preset-row">
            <label>Voice</label>
            <select value="complex-morph" onChange={handleVoiceTypeChange}>
              {VOICE_TYPES.map(vt => (
                <option key={vt.value} value={vt.value}>{vt.label}</option>
              ))}
            </select>
            <label>Preset</label>
            <select value={preset} onChange={handlePresetChange}>
              <option value="">Custom</option>
              {presetNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Carrier section */}
          <div className="cm-carrier-section">
            <div className="cm-section-title">CARRIER</div>
            <ParamSlider
              label="Frequency"
              value={p.carrierFreq}
              min={20}
              max={2000}
              logarithmic
              unit="Hz"
              onChange={(v) => onParamChange(trackId, { carrierFreq: v })}
            />
            <EnvelopeEditor
              label="Carrier Pitch Env"
              color="#ffaa00"
              envelope={p.carrierPitchEnv}
              onChange={(changes) => onParamChange(trackId, {
                carrierPitchEnv: { ...p.carrierPitchEnv, ...changes }
              })}
            />
            <div className="cm-range-row">
              <ParamSlider
                label="Pitch Range"
                value={p.carrierPitchRange}
                min={0}
                max={500}
                unit="Hz"
                onChange={(v) => onParamChange(trackId, { carrierPitchRange: v })}
              />
            </div>
          </div>

          {/* FM Topology diagram */}
          <div className="cm-topology">
            <div className="cm-topology-title">FM: (Op A + Op B) → Op C → Carrier</div>
            <div className="cm-topology-diagram">
              <div className="cm-topo-box cm-op-a">A</div>
              <span className="cm-topo-plus">+</span>
              <div className="cm-topo-box cm-op-b">B</div>
              <span className="cm-topo-arrow">→</span>
              <div className="cm-topo-box cm-op-c">C</div>
              <span className="cm-topo-arrow">→</span>
              <div className="cm-topo-box cm-carrier">Car</div>
              <span className="cm-topo-arrow">→</span>
              <div className="cm-topo-box cm-notch">⌁</div>
            </div>
          </div>

          {/* Operators */}
          <OperatorPanel
            name="Operator A"
            color="#00ff88"
            operator={p.opA}
            onFreqChange={(freq) => handleOperatorFreqChange('opA', freq)}
            onEnvelopeChange={(envType, changes) => handleOperatorEnvelopeChange('opA', envType, changes)}
          />

          <OperatorPanel
            name="Operator B"
            color="#00aaff"
            operator={p.opB}
            onFreqChange={(freq) => handleOperatorFreqChange('opB', freq)}
            onEnvelopeChange={(envType, changes) => handleOperatorEnvelopeChange('opB', envType, changes)}
          />

          <OperatorPanel
            name="Operator C"
            color="#ff66aa"
            operator={p.opC}
            onFreqChange={(freq) => handleOperatorFreqChange('opC', freq)}
            onEnvelopeChange={(envType, changes) => handleOperatorEnvelopeChange('opC', envType, changes)}
          />

          {/* Amp Envelope */}
          <div className="cm-amp-section">
            <div className="cm-section-title">AMP ENVELOPE</div>
            <EnvelopeEditor
              label="Master Amplitude"
              color="#ffffff"
              envelope={p.ampEnv}
              onChange={(changes) => onParamChange(trackId, {
                ampEnv: { ...p.ampEnv, ...changes }
              })}
            />
          </div>

          {/* Notch filter section */}
          <div className="cm-notch-section">
            <div className="cm-section-title">NOTCH FILTER</div>
            <div className="cm-notch-row">
              <ParamSlider
                label="Frequency"
                value={p.notchFreq}
                min={100}
                max={10000}
                logarithmic
                unit="Hz"
                onChange={(v) => onParamChange(trackId, { notchFreq: v })}
              />
              <ParamSlider
                label="Q"
                value={p.notchQ}
                min={1}
                max={30}
                onChange={(v) => onParamChange(trackId, { notchQ: v })}
              />
            </div>
            <EnvelopeEditor
              label="Filter Envelope"
              color="#aa66ff"
              envelope={p.notchEnv}
              onChange={(changes) => onParamChange(trackId, {
                notchEnv: { ...p.notchEnv, ...changes }
              })}
            />
            <div className="cm-range-row">
              <ParamSlider
                label="Filter Range"
                value={p.notchRange}
                min={0}
                max={2000}
                unit="Hz"
                onChange={(v) => onParamChange(trackId, { notchRange: v })}
              />
            </div>
          </div>

          {/* Output section */}
          <div className="cm-output-section">
            <div className="cm-section-title">OUTPUT</div>
            <div className="cm-output-row">
              <ParamSlider
                label="Level"
                value={p.outputLevel}
                min={0}
                max={1}
                onChange={(v) => onParamChange(trackId, { outputLevel: v })}
              />
              <ParamSlider
                label="Gain"
                value={p.gain}
                min={0}
                max={1}
                onChange={(v) => onParamChange(trackId, { gain: v })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

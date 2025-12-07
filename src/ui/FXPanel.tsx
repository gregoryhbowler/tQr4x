import { useState, useCallback, useMemo } from 'react';
import type { MimeophonParams } from '../audio/fx/Mimeophon';
import type { ReverbParams } from '../audio/fx/Reverb';
import type { MasterBusParams } from '../audio/fx/MasterBus';
import type { FXCrossSends } from '../audio/fx/Mixer';
import { MIMEOPHON_PRESETS } from '../audio/fx/Mimeophon';
import { REVERB_PRESETS } from '../audio/fx/Reverb';
import { MASTER_PRESETS } from '../audio/fx/MasterBus';
import './FXPanel.css';

interface FXPanelProps {
  // Global FX params - 4 Mimeophons
  mimeophonParams: MimeophonParams;
  mimeophonParams2: MimeophonParams;
  mimeophonParams3: MimeophonParams;
  mimeophonParams4: MimeophonParams;
  reverbParams: ReverbParams;
  masterParams: MasterBusParams;

  // FX callbacks - 4 Mimeophons
  onMimeophonChange: (params: Partial<MimeophonParams>) => void;
  onMimeophonChange2: (params: Partial<MimeophonParams>) => void;
  onMimeophonChange3: (params: Partial<MimeophonParams>) => void;
  onMimeophonChange4: (params: Partial<MimeophonParams>) => void;
  onReverbChange: (params: Partial<ReverbParams>) => void;
  onMasterChange: (params: Partial<MasterBusParams>) => void;

  // Return levels - 4 Mimeophons
  mimeophonReturnLevel: number;
  mimeophonReturnLevel2: number;
  mimeophonReturnLevel3: number;
  mimeophonReturnLevel4: number;
  reverbReturnLevel: number;
  onMimeophonReturnChange: (level: number) => void;
  onMimeophonReturnChange2: (level: number) => void;
  onMimeophonReturnChange3: (level: number) => void;
  onMimeophonReturnChange4: (level: number) => void;
  onReverbReturnChange: (level: number) => void;

  // FX Cross-sends
  fxCrossSends: FXCrossSends;
  onFXCrossSendsChange: (params: Partial<FXCrossSends>) => void;
}

// Zone descriptions
const ZONES = [
  { name: 'A', range: '5-50ms', desc: 'Karplus/Flange' },
  { name: 'B', range: '50-400ms', desc: 'Chorus/Slapback' },
  { name: 'C', range: '0.4-2s', desc: 'Standard Delay' },
  { name: 'D', range: '2-10s', desc: 'Ambient/Loop' }
];

// Color names based on value
function getColorName(value: number): string {
  if (value < 0.2) return 'Dark';
  if (value < 0.4) return 'BBD';
  if (value < 0.6) return 'Tape';
  if (value < 0.8) return 'Bright';
  return 'Crisp';
}

interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  displayValue?: string;
  onChange: (value: number) => void;
}

function ParamSlider({ label, value, min, max, step = 0.01, unit = '', displayValue, onChange }: ParamSliderProps) {
  return (
    <div className="fx-param">
      <span className="fx-param-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="fx-param-value">{displayValue ?? `${value.toFixed(2)}${unit}`}</span>
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <div className="fx-toggle">
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
    </div>
  );
}

// Reusable Mimeophon section component
interface MimeophonSectionProps {
  title: string;
  sectionKey: 'mimeophon' | 'mimeophon2' | 'mimeophon3' | 'mimeophon4';
  isExpanded: boolean;
  onToggle: () => void;
  params: MimeophonParams;
  returnLevel: number;
  onChange: (params: Partial<MimeophonParams>) => void;
  onReturnChange: (level: number) => void;
}

function MimeophonSection({
  title,
  isExpanded,
  onToggle,
  params,
  returnLevel,
  onChange,
  onReturnChange
}: MimeophonSectionProps) {
  return (
    <div className="fx-section">
      <div className="fx-section-header" onClick={onToggle}>
        <span className="fx-expand-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="fx-section-title">{title}</span>
      </div>

      {isExpanded && (
        <div className="fx-section-content">
          <div className="fx-presets">
            <label>Preset</label>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && e.target.value in MIMEOPHON_PRESETS) {
                  onChange(MIMEOPHON_PRESETS[e.target.value]);
                }
              }}
            >
              <option value="">Select...</option>
              {Object.keys(MIMEOPHON_PRESETS).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="fx-params-grid">
            {/* Zone & Delay Time */}
            <div className="fx-param-group">
              <h5>Zone & Time</h5>
              <div className="mimeophon-zones">
                {ZONES.map((zone, i) => (
                  <button
                    key={zone.name}
                    className={`zone-btn ${Math.floor(params.zone) === i ? 'active' : ''}`}
                    onClick={() => onChange({ zone: i })}
                    title={`${zone.range} - ${zone.desc}`}
                  >
                    <span className="zone-letter">{zone.name}</span>
                    <span className="zone-range">{zone.range}</span>
                  </button>
                ))}
              </div>
              <ParamSlider
                label="Rate"
                value={params.rate}
                min={0}
                max={1}
                displayValue={`${Math.round(params.rate * 100)}%`}
                onChange={(v) => onChange({ rate: v })}
              />
              <ParamSlider
                label="Skew"
                value={params.skew}
                min={-1}
                max={1}
                displayValue={params.skew > 0 ? `R${Math.round(params.skew * 100)}` : params.skew < 0 ? `L${Math.round(Math.abs(params.skew) * 100)}` : '0'}
                onChange={(v) => onChange({ skew: v })}
              />
            </div>

            {/* Micro-Rate Modulation */}
            <div className="fx-param-group">
              <h5>μRate (LFO)</h5>
              <ParamSlider
                label="Amount"
                value={params.microRate}
                min={0}
                max={1}
                displayValue={`${Math.round(params.microRate * 100)}%`}
                onChange={(v) => onChange({ microRate: v })}
              />
              <ParamSlider
                label="Freq"
                value={params.microRateFreq}
                min={0.1}
                max={8}
                step={0.1}
                displayValue={`${params.microRateFreq.toFixed(1)} Hz`}
                onChange={(v) => onChange({ microRateFreq: v })}
              />
            </div>

            {/* Feedback & Color */}
            <div className="fx-param-group">
              <h5>Feedback</h5>
              <ParamSlider
                label="Repeats"
                value={params.repeats}
                min={0}
                max={1.2}
                displayValue={`${Math.round(params.repeats * 100)}%`}
                onChange={(v) => onChange({ repeats: v })}
              />
              <ParamSlider
                label="Color"
                value={params.color}
                min={0}
                max={1}
                displayValue={getColorName(params.color)}
                onChange={(v) => onChange({ color: v })}
              />
              <ParamSlider
                label="Halo"
                value={params.halo}
                min={0}
                max={1}
                displayValue={`${Math.round(params.halo * 100)}%`}
                onChange={(v) => onChange({ halo: v })}
              />
            </div>

            {/* Toggles & Mix */}
            <div className="fx-param-group">
              <h5>Special</h5>
              <div className="mimeophon-toggles">
                <Toggle
                  label="Hold"
                  checked={params.hold}
                  onChange={(v) => onChange({ hold: v })}
                />
                <Toggle
                  label="Flip"
                  checked={params.flip}
                  onChange={(v) => onChange({ flip: v })}
                />
                <Toggle
                  label="Ping-Pong"
                  checked={params.pingPong}
                  onChange={(v) => onChange({ pingPong: v })}
                />
                <Toggle
                  label="Swap L/R"
                  checked={params.swap}
                  onChange={(v) => onChange({ swap: v })}
                />
              </div>
              <ParamSlider
                label="Return"
                value={returnLevel}
                min={0}
                max={1}
                displayValue={`${Math.round(returnLevel * 100)}%`}
                onChange={onReturnChange}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to detect potential feedback loops
function detectFeedbackLoops(sends: FXCrossSends): string[] {
  const warnings: string[] = [];

  // Check for direct 2-way feedback loops (A->B and B->A)
  if (sends.mim1ToMim2 > 0 && sends.mim2ToMim1 > 0) {
    warnings.push('Mim1 <-> Mim2');
  }
  if (sends.mim1ToMim3 > 0 && sends.mim3ToMim1 > 0) {
    warnings.push('Mim1 <-> Mim3');
  }
  if (sends.mim1ToMim4 > 0 && sends.mim4ToMim1 > 0) {
    warnings.push('Mim1 <-> Mim4');
  }
  if (sends.mim2ToMim3 > 0 && sends.mim3ToMim2 > 0) {
    warnings.push('Mim2 <-> Mim3');
  }
  if (sends.mim2ToMim4 > 0 && sends.mim4ToMim2 > 0) {
    warnings.push('Mim2 <-> Mim4');
  }
  if (sends.mim3ToMim4 > 0 && sends.mim4ToMim3 > 0) {
    warnings.push('Mim3 <-> Mim4');
  }

  // Check reverb loops
  if (sends.mim1ToReverb > 0 && sends.reverbToMim1 > 0) {
    warnings.push('Mim1 <-> Reverb');
  }
  if (sends.mim2ToReverb > 0 && sends.reverbToMim2 > 0) {
    warnings.push('Mim2 <-> Reverb');
  }
  if (sends.mim3ToReverb > 0 && sends.reverbToMim3 > 0) {
    warnings.push('Mim3 <-> Reverb');
  }
  if (sends.mim4ToReverb > 0 && sends.reverbToMim4 > 0) {
    warnings.push('Mim4 <-> Reverb');
  }

  // Check for 3-way circular loops (A->B->C->A)
  if (sends.mim1ToMim2 > 0 && sends.mim2ToMim3 > 0 && sends.mim3ToMim1 > 0) {
    warnings.push('Mim1 -> Mim2 -> Mim3 -> Mim1');
  }
  if (sends.mim1ToMim3 > 0 && sends.mim3ToMim2 > 0 && sends.mim2ToMim1 > 0) {
    warnings.push('Mim1 -> Mim3 -> Mim2 -> Mim1');
  }
  if (sends.mim1ToMim2 > 0 && sends.mim2ToMim4 > 0 && sends.mim4ToMim1 > 0) {
    warnings.push('Mim1 -> Mim2 -> Mim4 -> Mim1');
  }
  if (sends.mim1ToMim4 > 0 && sends.mim4ToMim2 > 0 && sends.mim2ToMim1 > 0) {
    warnings.push('Mim1 -> Mim4 -> Mim2 -> Mim1');
  }

  return warnings;
}

export function FXPanel({
  mimeophonParams,
  mimeophonParams2,
  mimeophonParams3,
  mimeophonParams4,
  reverbParams,
  masterParams,
  onMimeophonChange,
  onMimeophonChange2,
  onMimeophonChange3,
  onMimeophonChange4,
  onReverbChange,
  onMasterChange,
  mimeophonReturnLevel,
  mimeophonReturnLevel2,
  mimeophonReturnLevel3,
  mimeophonReturnLevel4,
  reverbReturnLevel,
  onMimeophonReturnChange,
  onMimeophonReturnChange2,
  onMimeophonReturnChange3,
  onMimeophonReturnChange4,
  onReverbReturnChange,
  fxCrossSends,
  onFXCrossSendsChange
}: FXPanelProps) {
  const [expandedSection, setExpandedSection] = useState<'mimeophon' | 'mimeophon2' | 'mimeophon3' | 'mimeophon4' | 'reverb' | 'master' | 'routing' | null>('mimeophon');

  const toggleSection = useCallback((section: 'mimeophon' | 'mimeophon2' | 'mimeophon3' | 'mimeophon4' | 'reverb' | 'master' | 'routing') => {
    setExpandedSection(prev => prev === section ? null : section);
  }, []);

  // Detect feedback loops
  const feedbackWarnings = useMemo(() => detectFeedbackLoops(fxCrossSends), [fxCrossSends]);
  const hasFeedbackRisk = feedbackWarnings.length > 0;

  return (
    <div className="fx-panel">
      {/* Mimeophon 1 Section */}
      <MimeophonSection
        title="MIMEOPHON 1"
        sectionKey="mimeophon"
        isExpanded={expandedSection === 'mimeophon'}
        onToggle={() => toggleSection('mimeophon')}
        params={mimeophonParams}
        returnLevel={mimeophonReturnLevel}
        onChange={onMimeophonChange}
        onReturnChange={onMimeophonReturnChange}
      />

      {/* Mimeophon 2 Section */}
      <MimeophonSection
        title="MIMEOPHON 2"
        sectionKey="mimeophon2"
        isExpanded={expandedSection === 'mimeophon2'}
        onToggle={() => toggleSection('mimeophon2')}
        params={mimeophonParams2}
        returnLevel={mimeophonReturnLevel2}
        onChange={onMimeophonChange2}
        onReturnChange={onMimeophonReturnChange2}
      />

      {/* Mimeophon 3 Section */}
      <MimeophonSection
        title="MIMEOPHON 3"
        sectionKey="mimeophon3"
        isExpanded={expandedSection === 'mimeophon3'}
        onToggle={() => toggleSection('mimeophon3')}
        params={mimeophonParams3}
        returnLevel={mimeophonReturnLevel3}
        onChange={onMimeophonChange3}
        onReturnChange={onMimeophonReturnChange3}
      />

      {/* Mimeophon 4 Section */}
      <MimeophonSection
        title="MIMEOPHON 4"
        sectionKey="mimeophon4"
        isExpanded={expandedSection === 'mimeophon4'}
        onToggle={() => toggleSection('mimeophon4')}
        params={mimeophonParams4}
        returnLevel={mimeophonReturnLevel4}
        onChange={onMimeophonChange4}
        onReturnChange={onMimeophonReturnChange4}
      />

      {/* Reverb Section (Zita) */}
      <div className="fx-section">
        <div className="fx-section-header" onClick={() => toggleSection('reverb')}>
          <span className="fx-expand-icon">{expandedSection === 'reverb' ? '▼' : '▶'}</span>
          <span className="fx-section-title">REVERB (ZITA)</span>
        </div>

        {expandedSection === 'reverb' && (
          <div className="fx-section-content">
            <div className="fx-presets">
              <label>Preset</label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && e.target.value in REVERB_PRESETS) {
                    onReverbChange(REVERB_PRESETS[e.target.value]);
                  }
                }}
              >
                <option value="">Select...</option>
                {Object.keys(REVERB_PRESETS).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="fx-params-grid">
              <div className="fx-param-group">
                <h5>Space</h5>
                <ParamSlider
                  label="Size"
                  value={reverbParams.size}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(reverbParams.size * 100)}%`}
                  onChange={(v) => onReverbChange({ size: v })}
                />
                <ParamSlider
                  label="Decay"
                  value={reverbParams.decay}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(reverbParams.decay * 100)}%`}
                  onChange={(v) => onReverbChange({ decay: v })}
                />
              </div>

              <div className="fx-param-group">
                <h5>Mix</h5>
                <ParamSlider
                  label="Return"
                  value={reverbReturnLevel}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(reverbReturnLevel * 100)}%`}
                  onChange={onReverbReturnChange}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FX Routing Section */}
      <div className="fx-section">
        <div className="fx-section-header" onClick={() => toggleSection('routing')}>
          <span className="fx-expand-icon">{expandedSection === 'routing' ? '▼' : '▶'}</span>
          <span className="fx-section-title">FX ROUTING</span>
          {hasFeedbackRisk && <span className="fx-warning-badge">!</span>}
        </div>

        {expandedSection === 'routing' && (
          <div className="fx-section-content">
            {/* Feedback Warning */}
            {hasFeedbackRisk && (
              <div className="fx-feedback-warning">
                <strong>Feedback Loop Warning!</strong>
                <p>The following routing combinations may cause audio feedback:</p>
                <ul>
                  {feedbackWarnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
                <p>High send levels with feedback loops can cause loud or distorted audio. Use with caution.</p>
              </div>
            )}

            {/* Mimeophon 1 Sends */}
            <div className="fx-routing-group">
              <h5>Mimeophon 1 Sends To</h5>
              <div className="fx-routing-row">
                <ParamSlider
                  label="Mim 2"
                  value={fxCrossSends.mim1ToMim2}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim1ToMim2 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim1ToMim2: v })}
                />
                <ParamSlider
                  label="Mim 3"
                  value={fxCrossSends.mim1ToMim3}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim1ToMim3 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim1ToMim3: v })}
                />
                <ParamSlider
                  label="Mim 4"
                  value={fxCrossSends.mim1ToMim4}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim1ToMim4 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim1ToMim4: v })}
                />
                <ParamSlider
                  label="Reverb"
                  value={fxCrossSends.mim1ToReverb}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim1ToReverb * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim1ToReverb: v })}
                />
              </div>
            </div>

            {/* Mimeophon 2 Sends */}
            <div className="fx-routing-group">
              <h5>Mimeophon 2 Sends To</h5>
              <div className="fx-routing-row">
                <ParamSlider
                  label="Mim 1"
                  value={fxCrossSends.mim2ToMim1}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim2ToMim1 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim2ToMim1: v })}
                />
                <ParamSlider
                  label="Mim 3"
                  value={fxCrossSends.mim2ToMim3}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim2ToMim3 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim2ToMim3: v })}
                />
                <ParamSlider
                  label="Mim 4"
                  value={fxCrossSends.mim2ToMim4}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim2ToMim4 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim2ToMim4: v })}
                />
                <ParamSlider
                  label="Reverb"
                  value={fxCrossSends.mim2ToReverb}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim2ToReverb * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim2ToReverb: v })}
                />
              </div>
            </div>

            {/* Mimeophon 3 Sends */}
            <div className="fx-routing-group">
              <h5>Mimeophon 3 Sends To</h5>
              <div className="fx-routing-row">
                <ParamSlider
                  label="Mim 1"
                  value={fxCrossSends.mim3ToMim1}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim3ToMim1 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim3ToMim1: v })}
                />
                <ParamSlider
                  label="Mim 2"
                  value={fxCrossSends.mim3ToMim2}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim3ToMim2 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim3ToMim2: v })}
                />
                <ParamSlider
                  label="Mim 4"
                  value={fxCrossSends.mim3ToMim4}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim3ToMim4 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim3ToMim4: v })}
                />
                <ParamSlider
                  label="Reverb"
                  value={fxCrossSends.mim3ToReverb}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim3ToReverb * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim3ToReverb: v })}
                />
              </div>
            </div>

            {/* Mimeophon 4 Sends */}
            <div className="fx-routing-group">
              <h5>Mimeophon 4 Sends To</h5>
              <div className="fx-routing-row">
                <ParamSlider
                  label="Mim 1"
                  value={fxCrossSends.mim4ToMim1}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim4ToMim1 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim4ToMim1: v })}
                />
                <ParamSlider
                  label="Mim 2"
                  value={fxCrossSends.mim4ToMim2}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim4ToMim2 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim4ToMim2: v })}
                />
                <ParamSlider
                  label="Mim 3"
                  value={fxCrossSends.mim4ToMim3}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim4ToMim3 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim4ToMim3: v })}
                />
                <ParamSlider
                  label="Reverb"
                  value={fxCrossSends.mim4ToReverb}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.mim4ToReverb * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ mim4ToReverb: v })}
                />
              </div>
            </div>

            {/* Reverb Sends */}
            <div className="fx-routing-group">
              <h5>Reverb Sends To</h5>
              <div className="fx-routing-row">
                <ParamSlider
                  label="Mim 1"
                  value={fxCrossSends.reverbToMim1}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.reverbToMim1 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ reverbToMim1: v })}
                />
                <ParamSlider
                  label="Mim 2"
                  value={fxCrossSends.reverbToMim2}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.reverbToMim2 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ reverbToMim2: v })}
                />
                <ParamSlider
                  label="Mim 3"
                  value={fxCrossSends.reverbToMim3}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.reverbToMim3 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ reverbToMim3: v })}
                />
                <ParamSlider
                  label="Mim 4"
                  value={fxCrossSends.reverbToMim4}
                  min={0}
                  max={1}
                  displayValue={`${Math.round(fxCrossSends.reverbToMim4 * 100)}%`}
                  onChange={(v) => onFXCrossSendsChange({ reverbToMim4: v })}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Master Section */}
      <div className="fx-section">
        <div className="fx-section-header" onClick={() => toggleSection('master')}>
          <span className="fx-expand-icon">{expandedSection === 'master' ? '▼' : '▶'}</span>
          <span className="fx-section-title">MASTER</span>
        </div>

        {expandedSection === 'master' && (
          <div className="fx-section-content">
            <div className="fx-presets">
              <label>Preset</label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && e.target.value in MASTER_PRESETS) {
                    onMasterChange(MASTER_PRESETS[e.target.value]);
                  }
                }}
              >
                <option value="">Select...</option>
                {Object.keys(MASTER_PRESETS).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="fx-params-grid">
              <div className="fx-param-group">
                <h5>Gain</h5>
                <ParamSlider
                  label="Input"
                  value={masterParams.inputGain}
                  min={-12}
                  max={12}
                  step={0.5}
                  unit="dB"
                  onChange={(v) => onMasterChange({ inputGain: v })}
                />
                <ParamSlider
                  label="Output"
                  value={masterParams.outputGain}
                  min={-24}
                  max={0}
                  step={0.5}
                  unit="dB"
                  onChange={(v) => onMasterChange({ outputGain: v })}
                />
              </div>

              <div className="fx-param-group">
                <h5>Saturation</h5>
                <ParamSlider
                  label="Amount"
                  value={masterParams.saturationAmount}
                  min={0}
                  max={1}
                  onChange={(v) => onMasterChange({ saturationAmount: v })}
                />
                <ParamSlider
                  label="Drive"
                  value={masterParams.saturationDrive}
                  min={0}
                  max={18}
                  step={0.5}
                  unit="dB"
                  onChange={(v) => onMasterChange({ saturationDrive: v })}
                />
              </div>

              <div className="fx-param-group">
                <h5>Tone</h5>
                <ParamSlider
                  label="High Shelf"
                  value={masterParams.highShelf}
                  min={-6}
                  max={6}
                  step={0.5}
                  unit="dB"
                  onChange={(v) => onMasterChange({ highShelf: v })}
                />
                <ParamSlider
                  label="Shelf Freq"
                  value={masterParams.highShelfFreq}
                  min={2000}
                  max={12000}
                  step={100}
                  unit="Hz"
                  onChange={(v) => onMasterChange({ highShelfFreq: v })}
                />
              </div>

              <div className="fx-param-group">
                <h5>Limiter</h5>
                <Toggle
                  label="Enabled"
                  checked={masterParams.limiterEnabled}
                  onChange={(v) => onMasterChange({ limiterEnabled: v })}
                />
                <ParamSlider
                  label="Threshold"
                  value={masterParams.limiterThreshold}
                  min={-6}
                  max={0}
                  step={0.1}
                  unit="dB"
                  onChange={(v) => onMasterChange({ limiterThreshold: v })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

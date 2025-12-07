import { useCallback } from 'react';
import type { FilterParams, FilterType, ThreeSistersParams, WaspParams, SEMParams, MoogParams } from '../audio/fx/FilterEffect';
import { FILTER_TYPES, THREE_SISTERS_OUTPUTS, WASP_MODES } from '../audio/fx/FilterEffect';
import './FilterPanel.css';

interface FilterPanelProps {
  params: FilterParams;
  onChange: (params: Partial<FilterParams>) => void;
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
    <div className="filter-param">
      <span className="filter-param-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="filter-param-value">{displayValue ?? `${value.toFixed(2)}${unit}`}</span>
    </div>
  );
}

// Three Sisters Controls
function ThreeSistersControls({
  params,
  onChange
}: {
  params: ThreeSistersParams;
  onChange: (params: Partial<ThreeSistersParams>) => void;
}) {
  return (
    <div className="filter-controls">
      <div className="filter-param-group">
        <h6>Frequency</h6>
        <ParamSlider
          label="Freq"
          value={params.freq}
          min={0}
          max={1}
          displayValue={`${Math.round(params.freq * 100)}%`}
          onChange={(v) => onChange({ freq: v })}
        />
        <ParamSlider
          label="Span"
          value={params.span}
          min={0}
          max={1}
          displayValue={`${Math.round(params.span * 100)}%`}
          onChange={(v) => onChange({ span: v })}
        />
      </div>

      <div className="filter-param-group">
        <h6>Character</h6>
        <ParamSlider
          label="Quality"
          value={params.quality}
          min={0}
          max={1}
          displayValue={params.quality < 0.5
            ? `Anti ${Math.round((0.5 - params.quality) * 200)}%`
            : params.quality > 0.5
              ? `Res ${Math.round((params.quality - 0.5) * 200)}%`
              : 'Flat'}
          onChange={(v) => onChange({ quality: v })}
        />
        <ParamSlider
          label="Mode"
          value={params.mode}
          min={0}
          max={1}
          displayValue={params.mode < 0.5 ? 'Crossover' : 'Formant'}
          onChange={(v) => onChange({ mode: v })}
        />
      </div>

      <div className="filter-param-group">
        <h6>Output</h6>
        <div className="filter-output-buttons">
          {THREE_SISTERS_OUTPUTS.map(({ value, label }) => (
            <button
              key={value}
              className={`filter-output-btn ${params.output === value ? 'active' : ''}`}
              onClick={() => onChange({ output: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Wasp Controls
function WaspControls({
  params,
  onChange
}: {
  params: WaspParams;
  onChange: (params: Partial<WaspParams>) => void;
}) {
  return (
    <div className="filter-controls">
      <div className="filter-param-group">
        <h6>Filter</h6>
        <ParamSlider
          label="Cutoff"
          value={params.cutoff}
          min={20}
          max={20000}
          step={1}
          displayValue={params.cutoff >= 1000 ? `${(params.cutoff / 1000).toFixed(1)}kHz` : `${Math.round(params.cutoff)}Hz`}
          onChange={(v) => onChange({ cutoff: v })}
        />
        <ParamSlider
          label="Resonance"
          value={params.resonance}
          min={0}
          max={1}
          displayValue={`${Math.round(params.resonance * 100)}%`}
          onChange={(v) => onChange({ resonance: v })}
        />
      </div>

      <div className="filter-param-group">
        <h6>Mode</h6>
        <div className="filter-mode-buttons">
          {WASP_MODES.map(({ value, label }) => (
            <button
              key={value}
              className={`filter-mode-btn ${params.mode === value ? 'active' : ''}`}
              onClick={() => onChange({ mode: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-param-group">
        <h6>Character</h6>
        <ParamSlider
          label="Drive"
          value={params.drive}
          min={0}
          max={1}
          displayValue={`${Math.round(params.drive * 100)}%`}
          onChange={(v) => onChange({ drive: v })}
        />
        <ParamSlider
          label="Chaos"
          value={params.chaos}
          min={0}
          max={1}
          displayValue={`${Math.round(params.chaos * 100)}%`}
          onChange={(v) => onChange({ chaos: v })}
        />
      </div>
    </div>
  );
}

// SEM Controls
function SEMControls({
  params,
  onChange
}: {
  params: SEMParams;
  onChange: (params: Partial<SEMParams>) => void;
}) {
  return (
    <div className="filter-controls">
      <div className="filter-param-group">
        <h6>Filter</h6>
        <ParamSlider
          label="Cutoff"
          value={params.cutoff}
          min={20}
          max={20000}
          step={1}
          displayValue={params.cutoff >= 1000 ? `${(params.cutoff / 1000).toFixed(1)}kHz` : `${Math.round(params.cutoff)}Hz`}
          onChange={(v) => onChange({ cutoff: v })}
        />
        <ParamSlider
          label="Resonance"
          value={params.resonance}
          min={0}
          max={1}
          displayValue={`${Math.round(params.resonance * 100)}%`}
          onChange={(v) => onChange({ resonance: v })}
        />
      </div>

      <div className="filter-param-group">
        <h6>Morph</h6>
        <ParamSlider
          label="LP/HP"
          value={params.morph}
          min={-1}
          max={1}
          displayValue={params.morph < -0.3
            ? 'LP'
            : params.morph > 0.3
              ? 'HP'
              : 'Notch'}
          onChange={(v) => onChange({ morph: v })}
        />
        <ParamSlider
          label="Drive"
          value={params.drive}
          min={0.1}
          max={10}
          step={0.1}
          displayValue={`${params.drive.toFixed(1)}x`}
          onChange={(v) => onChange({ drive: v })}
        />
      </div>
    </div>
  );
}

// Moog Controls
function MoogControls({
  params,
  onChange
}: {
  params: MoogParams;
  onChange: (params: Partial<MoogParams>) => void;
}) {
  return (
    <div className="filter-controls">
      <div className="filter-param-group">
        <h6>Filter</h6>
        <ParamSlider
          label="Cutoff"
          value={params.cutoff}
          min={20}
          max={20000}
          step={1}
          displayValue={params.cutoff >= 1000 ? `${(params.cutoff / 1000).toFixed(1)}kHz` : `${Math.round(params.cutoff)}Hz`}
          onChange={(v) => onChange({ cutoff: v })}
        />
        <ParamSlider
          label="Resonance"
          value={params.resonance}
          min={0}
          max={1}
          displayValue={`${Math.round(params.resonance * 100)}%`}
          onChange={(v) => onChange({ resonance: v })}
        />
      </div>

      <div className="filter-param-group">
        <h6>Character</h6>
        <ParamSlider
          label="Drive"
          value={params.drive}
          min={0}
          max={1}
          displayValue={`${Math.round(params.drive * 100)}%`}
          onChange={(v) => onChange({ drive: v })}
        />
        <ParamSlider
          label="Warmth"
          value={params.warmth}
          min={0}
          max={1}
          displayValue={`${Math.round(params.warmth * 100)}%`}
          onChange={(v) => onChange({ warmth: v })}
        />
      </div>
    </div>
  );
}

export function FilterPanel({ params, onChange }: FilterPanelProps) {
  const handleTypeChange = useCallback((type: FilterType) => {
    onChange({ type });
  }, [onChange]);

  const handleThreeSistersChange = useCallback((threeSisters: Partial<ThreeSistersParams>) => {
    onChange({ threeSisters: { ...params.threeSisters, ...threeSisters } });
  }, [onChange, params.threeSisters]);

  const handleWaspChange = useCallback((wasp: Partial<WaspParams>) => {
    onChange({ wasp: { ...params.wasp, ...wasp } });
  }, [onChange, params.wasp]);

  const handleSEMChange = useCallback((sem: Partial<SEMParams>) => {
    onChange({ sem: { ...params.sem, ...sem } });
  }, [onChange, params.sem]);

  const handleMoogChange = useCallback((moog: Partial<MoogParams>) => {
    onChange({ moog: { ...params.moog, ...moog } });
  }, [onChange, params.moog]);

  return (
    <div className="filter-panel">
      <h5>Filter</h5>

      {/* Filter Type Selector */}
      <div className="filter-type-selector">
        {FILTER_TYPES.map(({ type, label, description }) => (
          <button
            key={type}
            className={`filter-type-btn ${params.type === type ? 'active' : ''}`}
            onClick={() => handleTypeChange(type)}
            title={description}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filter-specific controls */}
      {params.type === 'threeSisters' && params.threeSisters && (
        <ThreeSistersControls
          params={params.threeSisters}
          onChange={handleThreeSistersChange}
        />
      )}

      {params.type === 'wasp' && params.wasp && (
        <WaspControls
          params={params.wasp}
          onChange={handleWaspChange}
        />
      )}

      {params.type === 'sem' && params.sem && (
        <SEMControls
          params={params.sem}
          onChange={handleSEMChange}
        />
      )}

      {params.type === 'moog' && params.moog && (
        <MoogControls
          params={params.moog}
          onChange={handleMoogChange}
        />
      )}

      {params.type === 'bypass' && (
        <div className="filter-bypass-message">
          Filter bypassed - signal passes through unprocessed
        </div>
      )}
    </div>
  );
}

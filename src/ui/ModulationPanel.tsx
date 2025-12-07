import { useState, useCallback } from 'react';
import type { LFOParams, LFOShape, LFOSync, ModRoute, ModulationSource, ModulationDestination, RandomIntensity, EnvelopeModulatorParams, EnvelopeLoopMode, ModTrackTarget } from '../audio/mod';
import { LFO_PRESETS, MOD_PRESETS, DESTINATION_CATEGORIES, ENVELOPE_MOD_PRESETS } from '../audio/mod';
import { ENVELOPE_PRESETS, getPresetCategories } from '../audio/voices/EnvelopePresets';
import './ModulationPanel.css';

// LFO control props
interface LFOControlProps {
  index: number;
  params: LFOParams;
  onParamChange: (index: number, params: Partial<LFOParams>) => void;
}

const LFO_SHAPES: { value: LFOShape; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'sampleHold', label: 'S&H' },
  { value: 'random', label: 'Random' },
];

const LFO_SYNC_VALUES: { value: LFOSync; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: '8bars', label: '8 Bars' },
  { value: '4bars', label: '4 Bars' },
  { value: '2bars', label: '2 Bars' },
  { value: '1bar', label: '1 Bar' },
  { value: '1/2', label: '1/2' },
  { value: '1/4', label: '1/4' },
  { value: '1/8', label: '1/8' },
  { value: '1/16', label: '1/16' },
  { value: '1/32', label: '1/32' },
  { value: '1/4d', label: '1/4.' },
  { value: '1/8d', label: '1/8.' },
  { value: '1/4t', label: '1/4t' },
  { value: '1/8t', label: '1/8t' },
];

function LFOControl({ index, params, onParamChange }: LFOControlProps) {
  const handleChange = useCallback((updates: Partial<LFOParams>) => {
    onParamChange(index, updates);
  }, [index, onParamChange]);

  return (
    <div className="lfo-control">
      <div className="lfo-header">
        <span className="lfo-label">LFO {index + 1}</span>
        <select
          className="lfo-preset"
          onChange={(e) => {
            const preset = LFO_PRESETS[e.target.value];
            if (preset) handleChange(preset);
          }}
        >
          <option value="">Preset...</option>
          {Object.keys(LFO_PRESETS).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div className="lfo-params">
        <div className="lfo-row">
          <label className="lfo-param">
            <span>Shape</span>
            <select
              value={params.shape}
              onChange={(e) => handleChange({ shape: e.target.value as LFOShape })}
            >
              {LFO_SHAPES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          <label className="lfo-param">
            <span>Sync</span>
            <select
              value={params.sync}
              onChange={(e) => handleChange({ sync: e.target.value as LFOSync, tempoSync: e.target.value !== 'free' })}
            >
              {LFO_SYNC_VALUES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="lfo-row">
          <label className="lfo-param">
            <span>Rate</span>
            <input
              type="range"
              min={0.01}
              max={20}
              step={0.01}
              value={params.rate}
              onChange={(e) => handleChange({ rate: parseFloat(e.target.value) })}
              disabled={params.tempoSync}
            />
            <span className="lfo-value">{params.rate.toFixed(2)} Hz</span>
          </label>
        </div>

        <div className="lfo-row">
          <label className="lfo-param">
            <span>Depth</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.depth}
              onChange={(e) => handleChange({ depth: parseFloat(e.target.value) })}
            />
            <span className="lfo-value">{(params.depth * 100).toFixed(0)}%</span>
          </label>
        </div>

        <div className="lfo-row">
          <label className="lfo-param">
            <span>Phase</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.phase}
              onChange={(e) => handleChange({ phase: parseFloat(e.target.value) })}
            />
            <span className="lfo-value">{(params.phase * 360).toFixed(0)}°</span>
          </label>
        </div>

        <div className="lfo-toggles">
          <label className="lfo-toggle">
            <input
              type="checkbox"
              checked={params.bipolar}
              onChange={(e) => handleChange({ bipolar: e.target.checked })}
            />
            <span>Bipolar</span>
          </label>

          {(params.shape === 'sampleHold' || params.shape === 'random') && (
            <label className="lfo-param smooth-param">
              <span>Smooth</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={params.smoothing}
                onChange={(e) => handleChange({ smoothing: parseFloat(e.target.value) })}
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

// Envelope modulator control props
interface EnvModControlProps {
  index: number;
  params: EnvelopeModulatorParams;
  onParamChange: (index: number, params: Partial<EnvelopeModulatorParams>) => void;
}

const LOOP_MODES: { value: EnvelopeLoopMode; label: string }[] = [
  { value: 'cycle', label: 'Cycle' },
  { value: 'oneshot', label: 'One-shot' },
  { value: 'oneshot-hold', label: 'One-shot Hold' },
];

// Get all envelope preset categories
const ENVELOPE_CATEGORIES = getPresetCategories();

function EnvModControl({ index, params, onParamChange }: EnvModControlProps) {
  const handleChange = useCallback((updates: Partial<EnvelopeModulatorParams>) => {
    onParamChange(index, updates);
  }, [index, onParamChange]);

  // Find current preset name
  const currentPreset = ENVELOPE_PRESETS.find(p => p.id === params.presetId);

  return (
    <div className="env-mod-control">
      <div className="env-mod-header">
        <span className="env-mod-label">Env {index + 1}</span>
        <select
          className="env-mod-preset-quick"
          onChange={(e) => {
            const preset = ENVELOPE_MOD_PRESETS[e.target.value];
            if (preset) handleChange(preset);
          }}
        >
          <option value="">Quick Preset...</option>
          {Object.keys(ENVELOPE_MOD_PRESETS).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div className="env-mod-params">
        <div className="env-mod-row">
          <label className="env-mod-param">
            <span>Shape</span>
            <select
              value={params.presetId}
              onChange={(e) => handleChange({ presetId: e.target.value })}
              title={currentPreset?.description}
            >
              {ENVELOPE_CATEGORIES.map(category => (
                <optgroup key={category} label={category}>
                  {ENVELOPE_PRESETS.filter(p => p.category === category).map(preset => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <div className="env-mod-row">
          <label className="env-mod-param">
            <span>Sync</span>
            <select
              value={params.sync}
              onChange={(e) => handleChange({ sync: e.target.value as LFOSync, tempoSync: e.target.value !== 'free' })}
            >
              {LFO_SYNC_VALUES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          <label className="env-mod-param">
            <span>Mode</span>
            <select
              value={params.loopMode}
              onChange={(e) => handleChange({ loopMode: e.target.value as EnvelopeLoopMode })}
            >
              {LOOP_MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="env-mod-row">
          <label className="env-mod-param">
            <span>Period</span>
            <input
              type="range"
              min={0.01}
              max={10}
              step={0.01}
              value={params.period}
              onChange={(e) => handleChange({ period: parseFloat(e.target.value) })}
              disabled={params.tempoSync}
            />
            <span className="env-mod-value">{params.period.toFixed(2)}s</span>
          </label>
        </div>

        <div className="env-mod-row">
          <label className="env-mod-param">
            <span>Depth</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.depth}
              onChange={(e) => handleChange({ depth: parseFloat(e.target.value) })}
            />
            <span className="env-mod-value">{(params.depth * 100).toFixed(0)}%</span>
          </label>
        </div>

        <div className="env-mod-row">
          <label className="env-mod-param">
            <span>Phase</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.phase}
              onChange={(e) => handleChange({ phase: parseFloat(e.target.value) })}
            />
            <span className="env-mod-value">{(params.phase * 360).toFixed(0)}°</span>
          </label>
        </div>

        <div className="env-mod-toggles">
          <label className="env-mod-toggle">
            <input
              type="checkbox"
              checked={params.bipolar}
              onChange={(e) => handleChange({ bipolar: e.target.checked })}
            />
            <span>Bipolar</span>
          </label>

          <label className="env-mod-toggle">
            <input
              type="checkbox"
              checked={params.retrigger}
              onChange={(e) => handleChange({ retrigger: e.target.checked })}
            />
            <span>Retrigger</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// Available track targets for modulation routing
const TRACK_TARGETS: { value: ModTrackTarget | 'all'; label: string }[] = [
  { value: 'all', label: 'All Tracks' },
  { value: 1, label: 'Track 1' },
  { value: 2, label: 'Track 2' },
  { value: 3, label: 'Track 3' },
  { value: 4, label: 'Track 4' },
  { value: 5, label: 'Track 5' },
  { value: 6, label: 'Track 6' },
  { value: 7, label: 'Track 7' },
  { value: 8, label: 'Track 8' },
  { value: 9, label: 'Track 9' },
  { value: 10, label: 'Track 10' },
  { value: 11, label: 'Track 11' },
  { value: 12, label: 'Track 12' },
];

// Mod Route control props
interface ModRouteControlProps {
  route: ModRoute;
  onUpdate: (id: string, updates: Partial<ModRoute>) => void;
  onRemove: (id: string) => void;
}

const MOD_SOURCES: { value: ModulationSource; label: string; group?: string }[] = [
  { value: 'lfo1', label: 'LFO 1', group: 'LFOs' },
  { value: 'lfo2', label: 'LFO 2', group: 'LFOs' },
  { value: 'lfo3', label: 'LFO 3', group: 'LFOs' },
  { value: 'lfo4', label: 'LFO 4', group: 'LFOs' },
  { value: 'env1', label: 'Env 1', group: 'Envelopes' },
  { value: 'env2', label: 'Env 2', group: 'Envelopes' },
  { value: 'env3', label: 'Env 3', group: 'Envelopes' },
  { value: 'env4', label: 'Env 4', group: 'Envelopes' },
  { value: 'env5', label: 'Env 5', group: 'Envelopes' },
  { value: 'env6', label: 'Env 6', group: 'Envelopes' },
  { value: 'random1', label: 'Random 1', group: 'Random' },
  { value: 'random2', label: 'Random 2', group: 'Random' },
  { value: 'velocity', label: 'Velocity', group: 'MIDI' },
  { value: 'modWheel', label: 'Mod Wheel', group: 'MIDI' },
];

// Group sources by category for optgroup display
const MOD_SOURCE_GROUPS = MOD_SOURCES.reduce((acc, source) => {
  const group = source.group || 'Other';
  if (!acc[group]) acc[group] = [];
  acc[group].push(source);
  return acc;
}, {} as Record<string, typeof MOD_SOURCES>);

function ModRouteControl({ route, onUpdate, onRemove }: ModRouteControlProps) {
  // Parse trackTarget value for the select
  const trackTargetValue = route.trackTarget ?? 'all';

  return (
    <div className="mod-route">
      <select
        className="mod-track"
        value={trackTargetValue}
        onChange={(e) => {
          const val = e.target.value;
          const target: ModTrackTarget = val === 'all' ? 'all' : parseInt(val, 10) as ModTrackTarget;
          onUpdate(route.id, { trackTarget: target, trackId: undefined });
        }}
        title="Target track"
      >
        {TRACK_TARGETS.map(t => (
          <option key={String(t.value)} value={t.value}>{t.label}</option>
        ))}
      </select>

      <select
        className="mod-source"
        value={route.source}
        onChange={(e) => onUpdate(route.id, { source: e.target.value as ModulationSource })}
      >
        {Object.entries(MOD_SOURCE_GROUPS).map(([group, sources]) => (
          <optgroup key={group} label={group}>
            {sources.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      <span className="mod-arrow">→</span>

      <select
        className="mod-destination"
        value={route.destination}
        onChange={(e) => onUpdate(route.id, { destination: e.target.value as ModulationDestination })}
      >
        {Object.entries(DESTINATION_CATEGORIES).map(([category, destinations]) => (
          <optgroup key={category} label={category}>
            {destinations.map(dest => (
              <option key={dest} value={dest}>{dest}</option>
            ))}
          </optgroup>
        ))}
      </select>

      <div className="mod-depth-control">
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={route.depth}
          onChange={(e) => onUpdate(route.id, { depth: parseFloat(e.target.value) })}
        />
        <span className="mod-depth-value">{(route.depth * 100).toFixed(0)}%</span>
      </div>

      <button className="mod-remove" onClick={() => onRemove(route.id)}>×</button>
    </div>
  );
}

// Main ModulationPanel props
interface ModulationPanelProps {
  // LFO state
  lfoParams: LFOParams[];
  onLFOChange: (index: number, params: Partial<LFOParams>) => void;

  // Envelope modulator state
  envModParams: EnvelopeModulatorParams[];
  onEnvModChange: (index: number, params: Partial<EnvelopeModulatorParams>) => void;

  // Slow random state
  slowRandomParams: {
    rate1: number;
    rate2: number;
    smoothing1: number;
    smoothing2: number;
  };
  onSlowRandomChange: (index: 1 | 2, rate: number, smoothing: number) => void;

  // Mod matrix state
  routes: ModRoute[];
  onAddRoute: (route: Omit<ModRoute, 'id'>) => void;
  onUpdateRoute: (id: string, updates: Partial<ModRoute>) => void;
  onRemoveRoute: (id: string) => void;
  onLoadModPreset: (presetName: string) => void;

  // Global controls
  globalDepth: number;
  onGlobalDepthChange: (depth: number) => void;
  modEnabled: boolean;
  onModEnabledChange: (enabled: boolean) => void;

  // Randomizer
  onMutate: (intensity: RandomIntensity) => void;
  onRandomizeScene: (intensity: RandomIntensity) => void;
  microJitterEnabled: boolean;
  microJitterAmount: number;
  onMicroJitterChange: (enabled: boolean, amount: number) => void;
}

export function ModulationPanel({
  lfoParams,
  onLFOChange,
  envModParams,
  onEnvModChange,
  slowRandomParams,
  onSlowRandomChange,
  routes,
  onAddRoute,
  onUpdateRoute,
  onRemoveRoute,
  onLoadModPreset,
  globalDepth,
  onGlobalDepthChange,
  modEnabled,
  onModEnabledChange,
  onMutate,
  onRandomizeScene,
  microJitterEnabled,
  microJitterAmount,
  onMicroJitterChange,
}: ModulationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'lfos' | 'envelopes' | 'matrix' | 'random'>('lfos');

  const handleAddRoute = useCallback(() => {
    onAddRoute({
      source: 'lfo1',
      destination: 'filterCutoff',
      depth: 0.5
    });
  }, [onAddRoute]);

  return (
    <div className="modulation-panel">
      <div className="mod-panel-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="mod-panel-title">MODULATION</span>
        <label className="mod-enable" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={modEnabled}
            onChange={(e) => onModEnabledChange(e.target.checked)}
          />
          <span>Enable</span>
        </label>
      </div>

      {isExpanded && (
        <div className="mod-panel-content">
          <div className="mod-tabs">
            <button
              className={`mod-tab ${activeTab === 'lfos' ? 'active' : ''}`}
              onClick={() => setActiveTab('lfos')}
            >
              LFOs
            </button>
            <button
              className={`mod-tab ${activeTab === 'envelopes' ? 'active' : ''}`}
              onClick={() => setActiveTab('envelopes')}
            >
              Envelopes
            </button>
            <button
              className={`mod-tab ${activeTab === 'matrix' ? 'active' : ''}`}
              onClick={() => setActiveTab('matrix')}
            >
              Mod Matrix
            </button>
            <button
              className={`mod-tab ${activeTab === 'random' ? 'active' : ''}`}
              onClick={() => setActiveTab('random')}
            >
              Randomize
            </button>
          </div>

          {activeTab === 'lfos' && (
            <div className="lfos-section">
              <div className="lfos-grid">
                {lfoParams.map((params, index) => (
                  <LFOControl
                    key={index}
                    index={index}
                    params={params}
                    onParamChange={onLFOChange}
                  />
                ))}
              </div>

              <div className="slow-random-section">
                <h4>Slow Random Modulators</h4>
                <div className="slow-random-controls">
                  <div className="slow-random-control">
                    <span className="slow-random-label">Random 1</span>
                    <label className="slow-random-param">
                      <span>Rate</span>
                      <input
                        type="range"
                        min={0.01}
                        max={0.5}
                        step={0.01}
                        value={slowRandomParams.rate1}
                        onChange={(e) => onSlowRandomChange(1, parseFloat(e.target.value), slowRandomParams.smoothing1)}
                      />
                      <span className="slow-random-value">{slowRandomParams.rate1.toFixed(2)} Hz</span>
                    </label>
                    <label className="slow-random-param">
                      <span>Smooth</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={slowRandomParams.smoothing1}
                        onChange={(e) => onSlowRandomChange(1, slowRandomParams.rate1, parseFloat(e.target.value))}
                      />
                    </label>
                  </div>

                  <div className="slow-random-control">
                    <span className="slow-random-label">Random 2</span>
                    <label className="slow-random-param">
                      <span>Rate</span>
                      <input
                        type="range"
                        min={0.01}
                        max={0.5}
                        step={0.01}
                        value={slowRandomParams.rate2}
                        onChange={(e) => onSlowRandomChange(2, parseFloat(e.target.value), slowRandomParams.smoothing2)}
                      />
                      <span className="slow-random-value">{slowRandomParams.rate2.toFixed(2)} Hz</span>
                    </label>
                    <label className="slow-random-param">
                      <span>Smooth</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={slowRandomParams.smoothing2}
                        onChange={(e) => onSlowRandomChange(2, slowRandomParams.rate2, parseFloat(e.target.value))}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'envelopes' && (
            <div className="envelopes-section">
              <div className="envelopes-grid">
                {envModParams.map((params, index) => (
                  <EnvModControl
                    key={index}
                    index={index}
                    params={params}
                    onParamChange={onEnvModChange}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'matrix' && (
            <div className="matrix-section">
              <div className="matrix-header">
                <div className="matrix-controls">
                  <label className="global-depth">
                    <span>Global Depth</span>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.01}
                      value={globalDepth}
                      onChange={(e) => onGlobalDepthChange(parseFloat(e.target.value))}
                    />
                    <span className="global-depth-value">{(globalDepth * 100).toFixed(0)}%</span>
                  </label>

                  <select
                    className="mod-preset-select"
                    onChange={(e) => {
                      if (e.target.value) {
                        onLoadModPreset(e.target.value);
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="">Load Preset...</option>
                    {Object.keys(MOD_PRESETS).map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>

                  <button className="add-route-btn" onClick={handleAddRoute}>
                    + Add Route
                  </button>
                </div>
              </div>

              <div className="mod-routes">
                {routes.length === 0 ? (
                  <div className="no-routes">
                    No modulation routes. Click "+ Add Route" to create one.
                  </div>
                ) : (
                  routes.map(route => (
                    <ModRouteControl
                      key={route.id}
                      route={route}
                      onUpdate={onUpdateRoute}
                      onRemove={onRemoveRoute}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'random' && (
            <div className="random-section">
              <div className="random-group">
                <h4>Mutate Current Track</h4>
                <p className="random-desc">Apply random variations to the current track's voice parameters</p>
                <div className="random-buttons">
                  <button onClick={() => onMutate('subtle')}>Subtle</button>
                  <button onClick={() => onMutate('moderate')}>Moderate</button>
                  <button onClick={() => onMutate('extreme')}>Extreme</button>
                </div>
              </div>

              <div className="random-group">
                <h4>Randomize Scene</h4>
                <p className="random-desc">Apply random variations to all tracks</p>
                <div className="random-buttons">
                  <button onClick={() => onRandomizeScene('subtle')}>Subtle</button>
                  <button onClick={() => onRandomizeScene('moderate')}>Moderate</button>
                  <button onClick={() => onRandomizeScene('extreme')}>Extreme</button>
                </div>
              </div>

              <div className="random-group">
                <h4>Micro Jitter</h4>
                <p className="random-desc">Continuous subtle variations for organic feel</p>
                <div className="jitter-controls">
                  <label className="jitter-enable">
                    <input
                      type="checkbox"
                      checked={microJitterEnabled}
                      onChange={(e) => onMicroJitterChange(e.target.checked, microJitterAmount)}
                    />
                    <span>Enable</span>
                  </label>
                  <label className="jitter-amount">
                    <span>Amount</span>
                    <input
                      type="range"
                      min={0}
                      max={0.1}
                      step={0.001}
                      value={microJitterAmount}
                      onChange={(e) => onMicroJitterChange(microJitterEnabled, parseFloat(e.target.value))}
                    />
                    <span className="jitter-value">{(microJitterAmount * 100).toFixed(1)}%</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

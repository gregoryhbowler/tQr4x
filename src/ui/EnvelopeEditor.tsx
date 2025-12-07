/**
 * EnvelopeEditor - Canvas-based multi-breakpoint envelope editor
 *
 * Features:
 * - Click to add breakpoints (up to 16)
 * - Drag breakpoints to reposition
 * - Right-click to delete or change curve type
 * - Displays cycling envelope curve
 * - Period/cycle time control
 * - Amount (bipolar depth) control
 * - Envelope preset menu with Zadar-inspired shapes
 * - Loop mode control (cycle/oneshot/oneshot-hold)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { CyclingEnvelope, EnvBreakpoint, CurveType, LoopMode } from '../audio/voices/ComplexMorphVoice';
import { ENVELOPE_PRESETS, getPresetCategories, getPresetsByCategory } from '../audio/voices/EnvelopePresets';
import './EnvelopeEditor.css';

interface EnvelopeEditorProps {
  envelope: CyclingEnvelope;
  onChange: (envelope: Partial<CyclingEnvelope>) => void;
  label: string;
  color?: string;
  height?: number;
}

const CURVE_TYPES: CurveType[] = ['linear', 'exp', 'sharp', 'punch', 'swell', 'step'];
const LOOP_MODES: { value: LoopMode; label: string }[] = [
  { value: 'cycle', label: 'Cycle' },
  { value: 'oneshot', label: 'One-Shot' },
  { value: 'oneshot-hold', label: 'One-Shot Hold' }
];

const MAX_BREAKPOINTS = 16;
const MIN_BREAKPOINTS = 2;

// Interpolation functions matching the worklet
function interpolate(t: number, startVal: number, endVal: number, curve: CurveType): number {
  const range = endVal - startVal;

  switch (curve) {
    case 'linear':
      return startVal + range * t;
    case 'exp':
      if (range >= 0) {
        return startVal + range * (1 - Math.pow(1 - t, 2.5));
      } else {
        return startVal + range * Math.pow(t, 2.5);
      }
    case 'sharp':
      return startVal + range * Math.pow(t, 0.4);
    case 'punch':
      return startVal + range * Math.pow(t, 0.15);
    case 'swell':
      return startVal + range * Math.pow(t, 2.5);
    case 'step':
      return t >= 1 ? endVal : startVal;
    default:
      return startVal + range * t;
  }
}

export function EnvelopeEditor({
  envelope,
  onChange,
  label,
  color = '#00ff88',
  height = 80
}: EnvelopeEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const width = 280;

  // Convert canvas coords to envelope coords
  const canvasToEnv = useCallback((x: number, y: number) => {
    return {
      time: Math.max(0, Math.min(1, x / width)),
      value: Math.max(0, Math.min(1, 1 - y / height))
    };
  }, [width, height]);

  // Convert envelope coords to canvas coords
  const envToCanvas = useCallback((time: number, value: number) => {
    return {
      x: time * width,
      y: (1 - value) * height
    };
  }, [width, height]);

  // Find breakpoint at position
  const findBreakpointAt = useCallback((x: number, y: number, threshold: number = 10): number => {
    for (let i = 0; i < envelope.breakpoints.length; i++) {
      const bp = envelope.breakpoints[i];
      const pos = envToCanvas(bp.time, bp.value);
      const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
      if (dist < threshold) {
        return i;
      }
    }
    return -1;
  }, [envelope.breakpoints, envToCanvas]);

  // Draw the envelope
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = (i / 4) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw center line (0.5 value)
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw envelope curve
    const breakpoints = envelope.breakpoints;
    if (breakpoints.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Draw curve segments
    const resolution = 200;
    for (let i = 0; i <= resolution; i++) {
      const t = i / resolution;

      // Find surrounding breakpoints
      let prevBp = breakpoints[0];
      let nextBp = breakpoints[1];

      for (let j = 1; j < breakpoints.length; j++) {
        if (breakpoints[j].time >= t) {
          nextBp = breakpoints[j];
          prevBp = breakpoints[j - 1];
          break;
        }
        if (j === breakpoints.length - 1) {
          prevBp = breakpoints[j];
          nextBp = breakpoints[0];
        }
      }

      // Calculate progress within segment
      let segmentDuration = nextBp.time - prevBp.time;
      if (segmentDuration <= 0) {
        segmentDuration = (1 - prevBp.time) + nextBp.time;
      }

      let progress = 0;
      if (t >= prevBp.time && t < nextBp.time && segmentDuration > 0) {
        progress = (t - prevBp.time) / segmentDuration;
      }

      progress = Math.max(0, Math.min(1, progress));

      // Interpolate
      const value = interpolate(progress, prevBp.value, nextBp.value, nextBp.curve);

      // Apply amount
      const centered = value - 0.5;
      const scaled = 0.5 + centered * envelope.amount;
      const finalValue = Math.max(0, Math.min(1, scaled));

      const pos = envToCanvas(t, finalValue);

      if (i === 0) {
        ctx.moveTo(pos.x, pos.y);
      } else {
        ctx.lineTo(pos.x, pos.y);
      }
    }
    ctx.stroke();

    // Draw breakpoints
    for (let i = 0; i < breakpoints.length; i++) {
      const bp = breakpoints[i];
      const pos = envToCanvas(bp.time, bp.value);

      // Breakpoint circle
      ctx.fillStyle = i === dragging ? '#fff' : color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Inner circle
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Curve type indicator (small text)
      if (i > 0) {
        ctx.fillStyle = '#888';
        ctx.font = '8px monospace';
        ctx.fillText(bp.curve.charAt(0).toUpperCase(), pos.x - 3, pos.y - 10);
      }
    }

  }, [envelope, width, height, color, envToCanvas, dragging]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Right click - context menu
    if (e.button === 2) {
      e.preventDefault();
      const index = findBreakpointAt(x, y);
      if (index >= 0) {
        setContextMenu({ x: e.clientX, y: e.clientY, index });
      }
      return;
    }

    // Check if clicking on existing breakpoint
    const index = findBreakpointAt(x, y);
    if (index >= 0) {
      setDragging(index);
      return;
    }

    // Add new breakpoint if not at max
    if (envelope.breakpoints.length < MAX_BREAKPOINTS) {
      const { time, value } = canvasToEnv(x, y);

      // Insert in sorted order
      const newBreakpoints = [...envelope.breakpoints];
      let insertIndex = newBreakpoints.findIndex(bp => bp.time > time);
      if (insertIndex === -1) insertIndex = newBreakpoints.length;

      const newBp: EnvBreakpoint = {
        time,
        value,
        curve: 'linear'
      };

      newBreakpoints.splice(insertIndex, 0, newBp);
      onChange({ breakpoints: newBreakpoints });
    }
  }, [envelope.breakpoints, findBreakpointAt, canvasToEnv, onChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging === null) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { time, value } = canvasToEnv(x, y);

    const newBreakpoints = [...envelope.breakpoints];

    // First and last breakpoints are locked to time 0 and 1
    if (dragging === 0) {
      newBreakpoints[0] = { ...newBreakpoints[0], time: 0, value };
    } else if (dragging === newBreakpoints.length - 1) {
      newBreakpoints[dragging] = { ...newBreakpoints[dragging], time: 1, value };
    } else {
      // Middle breakpoints can move, but stay between neighbors
      const prevTime = newBreakpoints[dragging - 1].time;
      const nextTime = newBreakpoints[dragging + 1].time;
      const clampedTime = Math.max(prevTime + 0.01, Math.min(nextTime - 0.01, time));
      newBreakpoints[dragging] = { ...newBreakpoints[dragging], time: clampedTime, value };
    }

    onChange({ breakpoints: newBreakpoints });
  }, [dragging, envelope.breakpoints, canvasToEnv, onChange]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Context menu actions
  const handleDeleteBreakpoint = useCallback(() => {
    if (contextMenu === null) return;
    if (envelope.breakpoints.length <= MIN_BREAKPOINTS) {
      setContextMenu(null);
      return;
    }
    // Don't delete first or last
    if (contextMenu.index === 0 || contextMenu.index === envelope.breakpoints.length - 1) {
      setContextMenu(null);
      return;
    }

    const newBreakpoints = envelope.breakpoints.filter((_, i) => i !== contextMenu.index);
    onChange({ breakpoints: newBreakpoints });
    setContextMenu(null);
  }, [contextMenu, envelope.breakpoints, onChange]);

  const handleChangeCurve = useCallback((curve: CurveType) => {
    if (contextMenu === null) return;

    const newBreakpoints = [...envelope.breakpoints];
    newBreakpoints[contextMenu.index] = { ...newBreakpoints[contextMenu.index], curve };
    onChange({ breakpoints: newBreakpoints });
    setContextMenu(null);
  }, [contextMenu, envelope.breakpoints, onChange]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Close preset menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.ee-preset-menu') && !target.closest('.ee-preset-btn')) {
        setPresetMenuOpen(false);
        setSelectedCategory(null);
      }
    };
    if (presetMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [presetMenuOpen]);

  // Apply a preset
  const handleApplyPreset = useCallback((presetId: string) => {
    const preset = ENVELOPE_PRESETS.find(p => p.id === presetId);
    if (preset) {
      onChange({
        breakpoints: [...preset.breakpoints],
        period: preset.defaultPeriod
      });
      setPresetMenuOpen(false);
      setSelectedCategory(null);
    }
  }, [onChange]);

  // Get categories for preset menu
  const categories = getPresetCategories();

  return (
    <div className="envelope-editor" ref={containerRef}>
      <div className="ee-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="ee-expand">{isExpanded ? '−' : '+'}</span>
        <span className="ee-label">{label}</span>
        <span className="ee-summary" style={{ color }}>
          {envelope.breakpoints.length} pts | {envelope.period.toFixed(2)}s
        </span>
      </div>

      {isExpanded && (
        <div className="ee-content">
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="ee-canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={handleContextMenu}
          />

          {/* Preset and Loop Mode Row */}
          <div className="ee-preset-row">
            <div className="ee-preset-container">
              <button
                className="ee-preset-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setPresetMenuOpen(!presetMenuOpen);
                }}
              >
                Presets ▾
              </button>
              {presetMenuOpen && (
                <div className="ee-preset-menu">
                  {selectedCategory === null ? (
                    // Show categories
                    <>
                      <div className="ee-menu-section">Categories</div>
                      {categories.map(cat => (
                        <div
                          key={cat}
                          className="ee-menu-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCategory(cat);
                          }}
                        >
                          {cat} →
                        </div>
                      ))}
                    </>
                  ) : (
                    // Show presets in category
                    <>
                      <div
                        className="ee-menu-item ee-back"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCategory(null);
                        }}
                      >
                        ← Back
                      </div>
                      <div className="ee-menu-section">{selectedCategory}</div>
                      {getPresetsByCategory(selectedCategory).map(preset => (
                        <div
                          key={preset.id}
                          className="ee-menu-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyPreset(preset.id);
                          }}
                          title={preset.description}
                        >
                          {preset.name}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="ee-loop-mode">
              <label>Mode:</label>
              <select
                value={envelope.loopMode || 'cycle'}
                onChange={(e) => onChange({ loopMode: e.target.value as LoopMode })}
              >
                {LOOP_MODES.map(mode => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="ee-controls">
            <div className="ee-control">
              <label>Period</label>
              <input
                type="range"
                min={0.05}
                max={10}
                step={0.01}
                value={envelope.period}
                onChange={(e) => onChange({ period: parseFloat(e.target.value) })}
              />
              <span>{envelope.period.toFixed(2)}s</span>
            </div>

            <div className="ee-control">
              <label>Amount</label>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={envelope.amount}
                onChange={(e) => onChange({ amount: parseFloat(e.target.value) })}
              />
              <span>{envelope.amount > 0 ? '+' : ''}{envelope.amount.toFixed(2)}</span>
            </div>

            <div className="ee-control">
              <label>Enabled</label>
              <input
                type="checkbox"
                checked={envelope.enabled}
                onChange={(e) => onChange({ enabled: e.target.checked })}
              />
            </div>
          </div>

          <div className="ee-help">
            Click to add point | Drag to move | Right-click for options
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="ee-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="ee-menu-section">Curve Type</div>
          {CURVE_TYPES.map(curve => (
            <div
              key={curve}
              className={`ee-menu-item ${envelope.breakpoints[contextMenu.index]?.curve === curve ? 'active' : ''}`}
              onClick={() => handleChangeCurve(curve)}
            >
              {curve}
            </div>
          ))}
          <div className="ee-menu-divider" />
          <div
            className={`ee-menu-item delete ${contextMenu.index === 0 || contextMenu.index === envelope.breakpoints.length - 1 ? 'disabled' : ''}`}
            onClick={handleDeleteBreakpoint}
          >
            Delete Point
          </div>
        </div>
      )}
    </div>
  );
}

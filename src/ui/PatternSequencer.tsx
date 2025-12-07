/**
 * PatternSequencer - UI for pattern arrangement/sequencing
 *
 * 16 cells that can each hold a pattern slot (1-16) with a cycle count.
 * The sequencer listens to Track 1's cycle count to advance through cells.
 * Compact visual design to avoid being overwhelming.
 */

import { useState, useEffect, useCallback } from 'react';
import { engine, PATTERN_BANK_SIZE, type PatternSequencerState, type PatternSequencerCell } from '../audio/engine';
import './PatternSequencer.css';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  cellIndex: number;
}

const DEFAULT_STATE: PatternSequencerState = {
  enabled: false,
  cells: Array(16).fill(null).map(() => ({ patternSlot: null, cycles: 1 })),
  currentCell: 0,
  cyclesRemaining: 0,
};

export function PatternSequencer() {
  const [state, setState] = useState<PatternSequencerState>(DEFAULT_STATE);
  const [expanded, setExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, cellIndex: 0 });
  const [editingCell, setEditingCell] = useState<number | null>(null);
  const [editPattern, setEditPattern] = useState<number>(1);
  const [editCycles, setEditCycles] = useState<number>(1);

  // Subscribe to pattern sequencer changes and get initial state
  useEffect(() => {
    // Get initial state after engine is ready
    setState(engine.getPatternSequencerState());

    const unsubscribe = engine.onPatternSequencerChange((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(prev => ({ ...prev, visible: false }));
    };
    if (contextMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  const handleToggleEnabled = useCallback(() => {
    engine.setPatternSequencerEnabled(!state.enabled);
  }, [state.enabled]);

  const handleCellClick = useCallback((cellIndex: number) => {
    const cell = state.cells[cellIndex];
    // Start editing this cell
    setEditingCell(cellIndex);
    setEditPattern(cell.patternSlot ?? 1);
    setEditCycles(cell.cycles);
  }, [state.cells]);

  const handleContextMenu = useCallback((e: React.MouseEvent, cellIndex: number) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      cellIndex,
    });
  }, []);

  const handleClearCell = useCallback(() => {
    engine.clearPatternSequencerCell(contextMenu.cellIndex);
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.cellIndex]);

  const handleSaveEdit = useCallback(() => {
    if (editingCell !== null) {
      engine.setPatternSequencerCell(editingCell, editPattern, editCycles);
      setEditingCell(null);
    }
  }, [editingCell, editPattern, editCycles]);

  const handleCancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleClearEdit = useCallback(() => {
    if (editingCell !== null) {
      engine.clearPatternSequencerCell(editingCell);
      setEditingCell(null);
    }
  }, [editingCell]);

  const handleReset = useCallback(() => {
    engine.resetPatternSequencer();
  }, []);

  const handleClearAll = useCallback(() => {
    engine.clearPatternSequencer();
  }, []);

  // Count non-empty cells for summary
  const filledCellCount = state.cells.filter(c => c.patternSlot !== null).length;

  // Render compact cell
  const renderCell = (cell: PatternSequencerCell, index: number) => {
    const isActive = state.enabled && state.currentCell === index;
    const isEmpty = cell.patternSlot === null;
    const isEditing = editingCell === index;

    return (
      <div
        key={index}
        className={`seq-cell ${isActive ? 'active' : ''} ${isEmpty ? 'empty' : 'filled'} ${isEditing ? 'editing' : ''}`}
        onClick={() => handleCellClick(index)}
        onContextMenu={(e) => handleContextMenu(e, index)}
        title={isEmpty ? `Cell ${index + 1} (empty)` : `Cell ${index + 1}: P${cell.patternSlot} x${cell.cycles}`}
      >
        {isEmpty ? (
          <span className="cell-index">{index + 1}</span>
        ) : (
          <>
            <span className="cell-pattern">P{cell.patternSlot}</span>
            {cell.cycles > 1 && <span className="cell-cycles">x{cell.cycles}</span>}
          </>
        )}
        {isActive && state.cyclesRemaining > 0 && (
          <span className="cell-remaining">{state.cyclesRemaining}</span>
        )}
      </div>
    );
  };

  return (
    <div className={`pattern-sequencer ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="seq-header">
        <button
          className="seq-expand-toggle"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '−' : '+'}
        </button>
        <span className="seq-title">Arranger</span>
        <span className="seq-summary">
          {filledCellCount > 0 ? `${filledCellCount} cells` : 'empty'}
        </span>
        <button
          className={`seq-enable-btn ${state.enabled ? 'enabled' : ''}`}
          onClick={handleToggleEnabled}
          title={state.enabled ? 'Disable Arranger' : 'Enable Arranger'}
        >
          {state.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {expanded && (
        <>
          <div className="seq-grid">
            {state.cells.map((cell, i) => renderCell(cell, i))}
          </div>

          <div className="seq-controls">
            <button onClick={handleReset} title="Reset to beginning">Reset</button>
            <button onClick={handleClearAll} className="danger" title="Clear all cells">Clear All</button>
          </div>

          {/* Edit Modal */}
          {editingCell !== null && (
            <div className="seq-edit-modal" onClick={handleCancelEdit}>
              <div className="seq-edit-content" onClick={e => e.stopPropagation()}>
                <h4>Cell {editingCell + 1}</h4>

                <div className="seq-edit-field">
                  <label>Pattern:</label>
                  <select
                    value={editPattern}
                    onChange={(e) => setEditPattern(parseInt(e.target.value))}
                  >
                    {Array.from({ length: PATTERN_BANK_SIZE }, (_, i) => i + 1).map(slot => (
                      <option key={slot} value={slot}>P{slot}</option>
                    ))}
                  </select>
                </div>

                <div className="seq-edit-field">
                  <label>Cycles:</label>
                  <select
                    value={editCycles}
                    onChange={(e) => setEditCycles(parseInt(e.target.value))}
                  >
                    {Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <div className="seq-edit-actions">
                  <button onClick={handleSaveEdit} className="primary">Save</button>
                  <button onClick={handleClearEdit} className="danger">Clear</button>
                  <button onClick={handleCancelEdit}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="seq-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => {
            handleCellClick(contextMenu.cellIndex);
            setContextMenu(prev => ({ ...prev, visible: false }));
          }}>
            Edit Cell
          </button>
          <button onClick={handleClearCell} className="danger">
            Clear Cell
          </button>
        </div>
      )}
    </div>
  );
}

export default PatternSequencer;

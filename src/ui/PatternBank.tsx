/**
 * PatternBank - UI for 16-pattern bank system
 *
 * Elektron-style pattern switching with copy/paste functionality.
 * - Click a pattern slot to switch to it
 * - Right-click for context menu (copy, paste, clear)
 * - Visual indicators for empty vs populated patterns
 */

import { useState, useEffect, useCallback } from 'react';
import { engine, PATTERN_BANK_SIZE } from '../audio/engine';
import './PatternBank.css';

interface PatternBankProps {
  /** Callback when voice configs need to be refreshed (after paste) */
  onVoiceConfigsRefresh?: () => void;
  /** Callback when channel params need to be refreshed (after paste) */
  onChannelParamsRefresh?: () => void;
  /** Callback when global FX params need to be refreshed (after pattern switch) */
  onFXParamsRefresh?: () => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  slot: number;
}

export function PatternBank({ onVoiceConfigsRefresh, onChannelParamsRefresh, onFXParamsRefresh }: PatternBankProps) {
  const [activeSlot, setActiveSlot] = useState(1);
  const [slotStates, setSlotStates] = useState<boolean[]>(Array(PATTERN_BANK_SIZE).fill(true)); // true = empty
  const [hasClipboard, setHasClipboard] = useState(false);
  const [clipboardMode, setClipboardMode] = useState<'engines' | 'all' | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, slot: 0 });

  // Sync with engine state
  useEffect(() => {
    setActiveSlot(engine.getActivePatternSlot());

    // Check which slots have data
    const states: boolean[] = [];
    for (let i = 1; i <= PATTERN_BANK_SIZE; i++) {
      states.push(engine.isPatternSlotEmpty(i));
    }
    setSlotStates(states);

    // Subscribe to pattern slot changes (e.g., from arranger)
    const unsubscribe = engine.onPatternSlotChange((slot) => {
      setActiveSlot(slot);
      // Refresh all UI state when arranger changes patterns
      onVoiceConfigsRefresh?.();
      onChannelParamsRefresh?.();
      onFXParamsRefresh?.();
    });

    return unsubscribe;
  }, [onVoiceConfigsRefresh, onChannelParamsRefresh, onFXParamsRefresh]);

  // Refresh slot states
  const refreshSlotStates = useCallback(() => {
    const states: boolean[] = [];
    for (let i = 1; i <= PATTERN_BANK_SIZE; i++) {
      states.push(engine.isPatternSlotEmpty(i));
    }
    setSlotStates(states);
    setHasClipboard(engine.hasPatternClipboard());
    setClipboardMode(engine.getPatternClipboardMode());
  }, []);

  // Handle slot click
  const handleSlotClick = useCallback((slot: number) => {
    const previousSlot = engine.getActivePatternSlot();
    engine.setActivePatternSlot(slot);
    setActiveSlot(slot);
    // Close context menu if open
    setContextMenu(prev => ({ ...prev, visible: false }));
    // Refresh UI if switching to a different slot (voice/channel/FX configs may have changed)
    if (slot !== previousSlot) {
      onVoiceConfigsRefresh?.();
      onChannelParamsRefresh?.();
      onFXParamsRefresh?.();
    }
  }, [onVoiceConfigsRefresh, onChannelParamsRefresh, onFXParamsRefresh]);

  // Handle right-click for context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, slot: number) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      slot,
    });
  }, []);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(prev => ({ ...prev, visible: false }));
    };
    if (contextMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  // Copy pattern (engines only)
  const handleCopyEngines = useCallback(() => {
    engine.copyPatternSlot(contextMenu.slot, 'engines');
    refreshSlotStates();
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.slot, refreshSlotStates]);

  // Copy pattern (all data)
  const handleCopyAll = useCallback(() => {
    engine.copyPatternSlot(contextMenu.slot, 'all');
    refreshSlotStates();
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.slot, refreshSlotStates]);

  // Paste pattern
  const handlePaste = useCallback(() => {
    engine.pastePatternSlot(contextMenu.slot);
    refreshSlotStates();
    setContextMenu(prev => ({ ...prev, visible: false }));
    // Notify parent to refresh UI state
    onVoiceConfigsRefresh?.();
    onChannelParamsRefresh?.();
    onFXParamsRefresh?.();
  }, [contextMenu.slot, refreshSlotStates, onVoiceConfigsRefresh, onChannelParamsRefresh, onFXParamsRefresh]);

  // Clear pattern
  const handleClear = useCallback(() => {
    engine.clearPatternSlot(contextMenu.slot);
    refreshSlotStates();
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.slot, refreshSlotStates]);

  // Generate slot buttons
  const slots = [];
  for (let i = 1; i <= PATTERN_BANK_SIZE; i++) {
    const isEmpty = slotStates[i - 1];
    const isActive = activeSlot === i;

    slots.push(
      <button
        key={i}
        className={`pattern-slot ${isActive ? 'active' : ''} ${isEmpty ? 'empty' : 'has-data'}`}
        onClick={() => handleSlotClick(i)}
        onContextMenu={(e) => handleContextMenu(e, i)}
        title={`Pattern ${i}${isEmpty ? ' (empty)' : ''}`}
      >
        {i}
      </button>
    );
  }

  return (
    <div className="pattern-bank">
      <div className="pattern-bank-header">
        <span className="pattern-bank-title">Patterns</span>
        <span className="pattern-bank-active">P{activeSlot}</span>
      </div>

      <div className="pattern-bank-grid">
        {slots}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="pattern-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={handleCopyEngines}>
            Copy Engines
          </button>
          <button onClick={handleCopyAll}>
            Copy All
          </button>
          {hasClipboard && (
            <button onClick={handlePaste}>
              Paste {clipboardMode === 'engines' ? '(Engines)' : '(All)'}
            </button>
          )}
          <button onClick={handleClear} className="danger">
            Clear Pattern
          </button>
        </div>
      )}

      {/* Clipboard indicator */}
      {hasClipboard && (
        <div className="pattern-clipboard-indicator">
          Clipboard: {clipboardMode === 'engines' ? 'Engines' : 'All'}
        </div>
      )}
    </div>
  );
}

export default PatternBank;

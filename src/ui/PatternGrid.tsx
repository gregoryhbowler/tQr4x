import { useState, useEffect, useCallback, useMemo } from 'react';
import { engine, type StepParams, type ScaleConfig, type BasslineStyle, type ConditionalTrig, type ParamLockEditState } from '../audio/engine';
import { generateNotePool, midiToNoteName } from '../audio/music/Scale';
import './PatternGrid.css';

// Predefined conditional trig options (Elektron-style)
const CONDITION_OPTIONS: { label: string; value: ConditionalTrig | null }[] = [
  { label: '---', value: null },  // Always trigger (no condition)
  { label: '1:2', value: { a: 1, b: 2 } },
  { label: '2:2', value: { a: 2, b: 2 } },
  { label: '1:3', value: { a: 1, b: 3 } },
  { label: '2:3', value: { a: 2, b: 3 } },
  { label: '3:3', value: { a: 3, b: 3 } },
  { label: '1:4', value: { a: 1, b: 4 } },
  { label: '2:4', value: { a: 2, b: 4 } },
  { label: '3:4', value: { a: 3, b: 4 } },
  { label: '4:4', value: { a: 4, b: 4 } },
  { label: '1:5', value: { a: 1, b: 5 } },
  { label: '2:5', value: { a: 2, b: 5 } },
  { label: '3:5', value: { a: 3, b: 5 } },
  { label: '4:5', value: { a: 4, b: 5 } },
  { label: '5:5', value: { a: 5, b: 5 } },
  { label: '1:6', value: { a: 1, b: 6 } },
  { label: '2:6', value: { a: 2, b: 6 } },
  { label: '3:6', value: { a: 3, b: 6 } },
  { label: '4:6', value: { a: 4, b: 6 } },
  { label: '5:6', value: { a: 5, b: 6 } },
  { label: '6:6', value: { a: 6, b: 6 } },
  { label: '1:7', value: { a: 1, b: 7 } },
  { label: '2:7', value: { a: 2, b: 7 } },
  { label: '3:7', value: { a: 3, b: 7 } },
  { label: '4:7', value: { a: 4, b: 7 } },
  { label: '5:7', value: { a: 5, b: 7 } },
  { label: '6:7', value: { a: 6, b: 7 } },
  { label: '7:7', value: { a: 7, b: 7 } },
  { label: '1:8', value: { a: 1, b: 8 } },
  { label: '2:8', value: { a: 2, b: 8 } },
  { label: '3:8', value: { a: 3, b: 8 } },
  { label: '4:8', value: { a: 4, b: 8 } },
  { label: '5:8', value: { a: 5, b: 8 } },
  { label: '6:8', value: { a: 6, b: 8 } },
  { label: '7:8', value: { a: 7, b: 8 } },
  { label: '8:8', value: { a: 8, b: 8 } },
];

// Helper to get condition option index
function getConditionIndex(condition?: ConditionalTrig): number {
  if (!condition) return 0;
  const idx = CONDITION_OPTIONS.findIndex(
    opt => opt.value?.a === condition.a && opt.value?.b === condition.b
  );
  return idx >= 0 ? idx : 0;
}

// Helper to format condition for display
function formatCondition(condition?: ConditionalTrig): string {
  if (!condition) return '';
  return `${condition.a}:${condition.b}`;
}

interface PatternGridProps {
  trackId: string;
  trackName: string;
  isMelodic?: boolean;
}

export function PatternGrid({ trackId, trackName, isMelodic = false }: PatternGridProps) {
  const [steps, setSteps] = useState<StepParams[]>([]);
  const [patternLength, setPatternLength] = useState(16);
  const [currentStep, setCurrentStep] = useState(-1);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [scaleConfig, setScaleConfig] = useState<ScaleConfig | null>(null);
  const [basslineStyle, setBasslineStyle] = useState<BasslineStyle>('acid');
  // P-lock edit mode state
  const [pLockEditState, setPLockEditState] = useState<ParamLockEditState>({ isActive: false, trackId: '', stepIndex: -1 });
  // Clipboard state for copy/paste
  const [hasClipboard, setHasClipboard] = useState(false);

  // Get available bassline styles
  const basslineStyles = useMemo(() => engine.getBasslineStyles(), []);

  // Generate note pool from scale config
  const notePool = useMemo(() => {
    if (!scaleConfig) {
      // Default: 2 octaves of C minor starting at octave 2
      return generateNotePool({ root: 0, scale: 'minor', octave: 2 }, 2);
    }
    return generateNotePool(scaleConfig, 2);
  }, [scaleConfig]);

  // Load pattern data and scale config
  const loadPattern = useCallback(() => {
    const pattern = engine.getCurrentPattern(trackId);
    if (pattern) {
      setSteps([...pattern.steps]);
      setPatternLength(pattern.length);
    }
    // Load scale config for melodic tracks
    if (isMelodic) {
      const scale = engine.getTrackScale(trackId);
      setScaleConfig(scale ?? null);
    }
  }, [trackId, isMelodic]);

  // Effect to load pattern when track changes
  // Includes retry logic for initial mount timing issues
  useEffect(() => {
    loadPattern();

    // If pattern didn't load on first try, retry a few times
    // This handles race conditions during initial app load
    let retryCount = 0;
    const maxRetries = 3;

    const retryLoad = () => {
      const pattern = engine.getCurrentPattern(trackId);
      if (pattern && pattern.steps.length > 0) {
        setSteps([...pattern.steps]);
        setPatternLength(pattern.length);
      } else if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(retryLoad, 50);
      }
    };

    // Start retry after initial delay
    const retryTimeout = setTimeout(retryLoad, 50);

    return () => clearTimeout(retryTimeout);
  }, [trackId, loadPattern]);

  // Effect for tick subscriptions
  useEffect(() => {
    const unsubTick = engine.onTick(() => {
      // Use track-specific step position instead of global clock step
      // This ensures visual indicator matches actual sequencer position
      // especially when pattern length differs between tracks
      const trackStep = engine.getTrackStepPosition(trackId);
      setCurrentStep(trackStep);
    });

    const unsubState = engine.onStateChange((state) => {
      if (state === 'stopped') {
        setCurrentStep(-1);
      }
    });

    // Subscribe to p-lock edit state changes
    const unsubPLock = engine.onParamLockEditStateChange((state) => {
      setPLockEditState(state);
    });

    // Subscribe to clipboard state changes
    const unsubClipboard = engine.onClipboardChange((hasData) => {
      setHasClipboard(hasData);
    });

    // Subscribe to pattern slot changes - reload pattern when user switches patterns
    const unsubPatternSlot = engine.onPatternSlotChange(() => {
      loadPattern();
      // Clear selected step when switching patterns
      setSelectedStep(null);
    });

    return () => {
      unsubTick();
      unsubState();
      unsubPLock();
      unsubClipboard();
      unsubPatternSlot();
    };
  }, [trackId, loadPattern]);

  // Poll for global scale config changes (since there's no event system for it)
  // This ensures note pool updates when Transport changes scale/octave
  // When octave changes, transpose all step notes accordingly
  useEffect(() => {
    if (!isMelodic) return;

    const checkScaleConfig = () => {
      const currentScale = engine.getTrackScale(trackId);
      if (currentScale) {
        setScaleConfig(prev => {
          // Check if scale config has changed
          if (!prev ||
              prev.root !== currentScale.root ||
              prev.scale !== currentScale.scale ||
              prev.octave !== currentScale.octave) {

            // If octave changed, transpose all step notes
            if (prev && prev.octave !== currentScale.octave) {
              const octaveDiff = (currentScale.octave - prev.octave) * 12;
              const pattern = engine.getCurrentPattern(trackId);
              if (pattern) {
                pattern.steps.forEach((step, index) => {
                  if (step.note !== undefined) {
                    const newNote = Math.max(0, Math.min(127, step.note + octaveDiff));
                    engine.setTrackStep(trackId, index, { note: newNote });
                  }
                });
                // Reload steps to reflect changes
                setSteps([...pattern.steps]);
              }
            }

            return currentScale;
          }
          return prev;
        });
      }
    };

    // Check immediately and on interval
    checkScaleConfig();
    const intervalId = setInterval(checkScaleConfig, 100);

    return () => clearInterval(intervalId);
  }, [trackId, isMelodic]);

  const handleToggleStep = useCallback((stepIndex: number) => {
    engine.toggleTrackStep(trackId, stepIndex);
    // Reload pattern from engine to ensure UI stays in sync
    const pattern = engine.getCurrentPattern(trackId);
    if (pattern) {
      setSteps([...pattern.steps]);
    }
  }, [trackId]);

  const handleStepRightClick = useCallback((e: React.MouseEvent, stepIndex: number) => {
    e.preventDefault();
    setSelectedStep(selectedStep === stepIndex ? null : stepIndex);
  }, [selectedStep]);

  const handleVelocityChange = useCallback((stepIndex: number, velocity: number) => {
    const success = engine.setTrackStep(trackId, stepIndex, { velocity });
    if (success) {
      setSteps(prev => {
        const newSteps = [...prev];
        newSteps[stepIndex] = { ...newSteps[stepIndex], velocity };
        return newSteps;
      });
    }
  }, [trackId]);

  const handleProbabilityChange = useCallback((stepIndex: number, probability: number) => {
    const success = engine.setTrackStep(trackId, stepIndex, { probability });
    if (success) {
      setSteps(prev => {
        const newSteps = [...prev];
        newSteps[stepIndex] = { ...newSteps[stepIndex], probability };
        return newSteps;
      });
    }
  }, [trackId]);

  const handleRatchetsChange = useCallback((stepIndex: number, ratchets: number) => {
    const success = engine.setTrackStep(trackId, stepIndex, { ratchets });
    if (success) {
      setSteps(prev => {
        const newSteps = [...prev];
        newSteps[stepIndex] = { ...newSteps[stepIndex], ratchets };
        return newSteps;
      });
    }
  }, [trackId]);

  const handlePatternLengthChange = useCallback((length: number) => {
    engine.setPatternLength(trackId, length);
    loadPattern();
  }, [trackId, loadPattern]);

  const handleNoteChange = useCallback((stepIndex: number, note: number) => {
    const success = engine.setTrackStep(trackId, stepIndex, { note });
    if (success) {
      setSteps(prev => {
        const newSteps = [...prev];
        newSteps[stepIndex] = { ...newSteps[stepIndex], note };
        return newSteps;
      });
    }
  }, [trackId]);

  const handleGenerateBassline = useCallback(() => {
    const result = engine.generateTrackBassline(trackId, basslineStyle);
    if (result) {
      setSteps([...result.steps]);
    }
  }, [trackId, basslineStyle]);

  const handleConditionChange = useCallback((stepIndex: number, optionIndex: number) => {
    const condition = CONDITION_OPTIONS[optionIndex].value ?? undefined;
    const success = engine.setTrackStep(trackId, stepIndex, { condition });
    if (success) {
      setSteps(prev => {
        const newSteps = [...prev];
        newSteps[stepIndex] = { ...newSteps[stepIndex], condition };
        return newSteps;
      });
    }
  }, [trackId]);

  // P-lock edit mode handlers
  const handleTogglePLockEdit = useCallback((stepIndex: number) => {
    const isNowEditing = engine.toggleParamLockEditMode(trackId, stepIndex);
    // If entering edit mode, ensure the step has paramLocks initialized
    if (isNowEditing) {
      const step = steps[stepIndex];
      if (step && !step.paramLocks) {
        engine.setTrackStep(trackId, stepIndex, { paramLocks: {}, hasParamLocks: false });
      }
    }
  }, [trackId, steps]);

  const handleClearPLocks = useCallback((stepIndex: number) => {
    engine.clearStepParamLocks(trackId, stepIndex);
    // Reload pattern to reflect changes
    const pattern = engine.getCurrentPattern(trackId);
    if (pattern) {
      setSteps([...pattern.steps]);
    }
  }, [trackId]);

  const handleAuditionPLock = useCallback(() => {
    engine.triggerParamLockAudition();
  }, []);

  // Check if a step is in p-lock edit mode for this track
  const isStepInPLockEditMode = useCallback((stepIndex: number): boolean => {
    return pLockEditState.isActive &&
           pLockEditState.trackId === trackId &&
           pLockEditState.stepIndex === stepIndex;
  }, [pLockEditState, trackId]);

  // Copy/Paste handlers
  const handleCopyStep = useCallback((stepIndex: number) => {
    engine.copyStep(trackId, stepIndex);
  }, [trackId]);

  const handlePasteStep = useCallback((stepIndex: number) => {
    const success = engine.pasteStep(trackId, stepIndex);
    if (success) {
      // Reload pattern to reflect changes
      const pattern = engine.getCurrentPattern(trackId);
      if (pattern) {
        setSteps([...pattern.steps]);
      }
    }
  }, [trackId]);

  // Keyboard shortcuts for copy/paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if this grid's container has focus or a step is selected
      if (selectedStep === null) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key === 'c') {
        e.preventDefault();
        handleCopyStep(selectedStep);
      } else if (modKey && e.key === 'v') {
        e.preventDefault();
        handlePasteStep(selectedStep);
      }
    };

    // Add listener to the document for keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedStep, handleCopyStep, handlePasteStep]);

  // Get note index in pool for a step
  // If note is not in pool, find the closest matching note
  const getNoteIndex = useCallback((step: StepParams): number => {
    if (step.note === undefined || notePool.length === 0) {
      // Default to first note in pool
      return 0;
    }
    const idx = notePool.indexOf(step.note);
    if (idx >= 0) return idx;

    // Note not in pool - find closest note by pitch
    let closestIdx = 0;
    let closestDist = Math.abs(notePool[0] - step.note);
    for (let i = 1; i < notePool.length; i++) {
      const dist = Math.abs(notePool[i] - step.note);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    return closestIdx;
  }, [notePool]);

  return (
    <div className="pattern-grid">
      <div className="pattern-header">
        <span className="track-name">{trackName}</span>
        <div className="pattern-controls">
          {isMelodic && (
            <div className="bassline-generator">
              <select
                className="bassline-style"
                value={basslineStyle}
                onChange={(e) => setBasslineStyle(e.target.value as BasslineStyle)}
                title="Bassline style"
              >
                {basslineStyles.map(({ style, label }) => (
                  <option key={style} value={style}>{label}</option>
                ))}
              </select>
              <button
                className="generate-btn"
                onClick={handleGenerateBassline}
                title="Generate bassline"
              >
                GEN
              </button>
            </div>
          )}
          <div className="pattern-length">
            <label>
              LEN
              <select
                value={patternLength}
                onChange={(e) => handlePatternLengthChange(parseInt(e.target.value, 10))}
              >
                {[4, 8, 12, 16, 24, 32, 48, 64].map(len => (
                  <option key={len} value={len}>{len}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Note selectors for melodic tracks */}
      {isMelodic && (
        <div className="note-selectors-container">
          {steps.slice(0, patternLength).map((step, index) => (
            <div key={index} className={`note-selector ${index % 4 === 0 ? 'beat-start' : ''}`}>
              <input
                type="range"
                className="note-knob"
                min={0}
                max={notePool.length - 1}
                value={getNoteIndex(step)}
                onChange={(e) => handleNoteChange(index, notePool[parseInt(e.target.value)])}
                title={step.note !== undefined ? midiToNoteName(step.note) : midiToNoteName(notePool[0])}
              />
              <span className="note-label">
                {step.note !== undefined ? midiToNoteName(step.note) : midiToNoteName(notePool[0])}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="steps-container">
        {steps.slice(0, patternLength).map((step, index) => (
          <div
            key={index}
            className={`step ${step.trigger ? 'active' : ''} ${index === currentStep ? 'current' : ''} ${index % 4 === 0 ? 'beat-start' : ''} ${selectedStep === index ? 'selected' : ''} ${step.hasParamLocks ? 'has-plocks' : ''} ${isStepInPLockEditMode(index) ? 'plock-editing' : ''}`}
            onClick={() => handleToggleStep(index)}
            onContextMenu={(e) => handleStepRightClick(e, index)}
          >
            <div
              className="step-velocity"
              style={{ height: `${step.velocity * 100}%` }}
            />
            {step.probability < 1 && (
              <div className="step-probability">{Math.round(step.probability * 100)}</div>
            )}
            {step.ratchets > 0 && (
              <div className="step-ratchets">{step.ratchets + 1}</div>
            )}
            {step.condition && (
              <div className="step-condition">{formatCondition(step.condition)}</div>
            )}
            {step.hasParamLocks && (
              <div className="step-plock-indicator">P</div>
            )}
          </div>
        ))}
      </div>

      {selectedStep !== null && steps[selectedStep] && (
        <div className="step-editor">
          <div className="step-editor-header">
            Step {selectedStep + 1}
            <button onClick={() => setSelectedStep(null)}>X</button>
          </div>

          {/* Copy/Paste Controls */}
          <div className="step-copy-paste">
            <button
              className="copy-btn"
              onClick={() => handleCopyStep(selectedStep)}
              title="Copy step (Cmd/Ctrl+C)"
            >
              COPY
            </button>
            <button
              className="paste-btn"
              onClick={() => handlePasteStep(selectedStep)}
              disabled={!hasClipboard}
              title={hasClipboard ? "Paste step (Cmd/Ctrl+V)" : "Nothing to paste"}
            >
              PASTE
            </button>
          </div>

          <div className="step-param">
            <label>
              VEL
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={steps[selectedStep].velocity}
                onChange={(e) => handleVelocityChange(selectedStep, parseFloat(e.target.value))}
              />
              <span>{Math.round(steps[selectedStep].velocity * 100)}</span>
            </label>
          </div>

          <div className="step-param">
            <label>
              PROB
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={steps[selectedStep].probability}
                onChange={(e) => handleProbabilityChange(selectedStep, parseFloat(e.target.value))}
              />
              <span>{Math.round(steps[selectedStep].probability * 100)}%</span>
            </label>
          </div>

          <div className="step-param">
            <label>
              RATCHETS
              <select
                value={steps[selectedStep].ratchets}
                onChange={(e) => handleRatchetsChange(selectedStep, parseInt(e.target.value, 10))}
              >
                <option value="0">Off</option>
                <option value="1">2x</option>
                <option value="2">3x</option>
                <option value="3">4x</option>
              </select>
            </label>
          </div>

          <div className="step-param">
            <label>
              COND
              <select
                value={getConditionIndex(steps[selectedStep].condition)}
                onChange={(e) => handleConditionChange(selectedStep, parseInt(e.target.value, 10))}
                title="Conditional trig: triggers on Ath cycle of every B pattern repeats"
              >
                {CONDITION_OPTIONS.map((opt, idx) => (
                  <option key={idx} value={idx}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>

          {isMelodic && (
            <div className="step-param">
              <label>
                NOTE
                <select
                  value={getNoteIndex(steps[selectedStep])}
                  onChange={(e) => handleNoteChange(selectedStep, notePool[parseInt(e.target.value)])}
                >
                  {notePool.map((note, idx) => (
                    <option key={idx} value={idx}>{midiToNoteName(note)}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* P-Lock Edit Mode Section */}
          <div className="plock-section">
            <div className="plock-header">PARAMETER LOCKS</div>
            <div className="plock-controls">
              <button
                className={`plock-edit-toggle ${isStepInPLockEditMode(selectedStep) ? 'active' : ''}`}
                onClick={() => handleTogglePLockEdit(selectedStep)}
                title={isStepInPLockEditMode(selectedStep)
                  ? 'Exit P-Lock Edit Mode'
                  : 'Enter P-Lock Edit Mode - parameter changes will be stored on this step'}
              >
                {isStepInPLockEditMode(selectedStep) ? 'EXIT P-LOCK EDIT' : 'EDIT P-LOCKS'}
              </button>

              {isStepInPLockEditMode(selectedStep) && (
                <button
                  className="plock-audition-btn"
                  onClick={handleAuditionPLock}
                  title="Audition this step with its p-locks"
                >
                  AUDITION
                </button>
              )}

              {steps[selectedStep].hasParamLocks && (
                <button
                  className="plock-clear-btn"
                  onClick={() => handleClearPLocks(selectedStep)}
                  title="Clear all parameter locks from this step"
                >
                  CLEAR P-LOCKS
                </button>
              )}
            </div>

            {isStepInPLockEditMode(selectedStep) && (
              <div className="plock-status">
                <span className="plock-status-indicator"></span>
                P-Lock Edit Mode Active - Adjust parameters in the panels below to lock them to this step
              </div>
            )}

            {steps[selectedStep].hasParamLocks && steps[selectedStep].paramLocks && (
              <div className="plock-list">
                <div className="plock-list-header">Locked Parameters:</div>
                {Object.entries(steps[selectedStep].paramLocks!).map(([paramId, value]) => (
                  <div key={paramId} className="plock-item">
                    <span className="plock-param-name">{paramId}</span>
                    <span className="plock-param-value">{typeof value === 'number' ? value.toFixed(2) : value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

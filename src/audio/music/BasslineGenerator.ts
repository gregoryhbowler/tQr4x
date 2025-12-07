/**
 * BasslineGenerator - Generates bass patterns with various styles
 *
 * Creates musically coherent basslines that follow common bass conventions:
 * - Root note emphasis on downbeats
 * - Octave jumps for energy
 * - Scale-quantized melodies
 * - Acid-style patterns with 16th note runs and accents
 */

import { generateNotePool, type ScaleConfig } from './Scale';
import type { StepParams } from '../engine/Sequencer';

export type BasslineStyle =
  | 'root'           // Simple root note pattern
  | 'octave'         // Root with octave jumps
  | 'walking'        // Walking bass movement
  | 'acid'           // 303-style acid patterns
  | 'acidRun'        // Acid with 16th note runs
  | 'syncopated'     // Off-beat emphasis
  | 'minimal'        // Sparse, spacious pattern
  | 'driving'        // Steady 8th or 16th notes
  | 'random';        // Fully random within scale

export interface BasslineConfig {
  style: BasslineStyle;
  scaleConfig: ScaleConfig;
  patternLength: number;
  density?: number;        // 0-1, how many steps trigger (default varies by style)
  octaveRange?: number;    // How many octaves to use (default 2)
  velocityVariation?: number;  // 0-1, how much velocity varies
  accentBeats?: boolean;   // Accent on beat 1 and 3
}

export interface GeneratedBassline {
  steps: StepParams[];
  style: BasslineStyle;
}

// Common rhythm patterns (1 = trigger, 0 = rest)
const RHYTHM_PATTERNS = {
  // 16-step patterns
  fourOnFloor: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  offbeat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  syncopated: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
  driving8th: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  driving16th: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  minimal: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  acidClassic: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1],
  acidRun: [1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0],
  acidSynth: [1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1],
};

// Accent patterns for acid style (velocity multiplier)
const ACCENT_PATTERNS = {
  classic: [1.0, 0.6, 0.8, 0.6, 1.0, 0.6, 0.8, 0.6, 1.0, 0.6, 0.8, 0.6, 1.0, 0.6, 0.8, 0.6],
  acid: [1.0, 0.5, 0.7, 1.0, 0.5, 0.8, 0.5, 1.0, 0.6, 0.5, 0.9, 0.5, 1.0, 0.5, 0.7, 0.6],
  random: () => Array(16).fill(0).map(() => 0.5 + Math.random() * 0.5),
};

/**
 * Generate a bassline based on the given configuration
 */
export function generateBassline(config: BasslineConfig): GeneratedBassline {
  const {
    style,
    scaleConfig,
    patternLength,
    octaveRange = 2,
    velocityVariation = 0.2,
    accentBeats = true,
  } = config;

  // Generate note pool from scale
  const notePool = generateNotePool(scaleConfig, octaveRange);
  if (notePool.length === 0) {
    return { steps: createEmptySteps(patternLength), style };
  }

  // Get root note indices (notes that are the root of the scale)
  const rootNote = scaleConfig.root + (scaleConfig.octave * 12);
  const rootIndices = notePool
    .map((note, idx) => ({ note, idx }))
    .filter(({ note }) => note % 12 === scaleConfig.root)
    .map(({ idx }) => idx);

  // Get octave up root if available
  const octaveUpRoots = rootIndices.filter(idx => notePool[idx] >= rootNote + 12);
  // octaveDownRoots available for future use
  // const octaveDownRoots = rootIndices.filter(idx => notePool[idx] < rootNote);

  let steps: StepParams[];

  switch (style) {
    case 'root':
      steps = generateRootPattern(notePool, rootIndices, patternLength, velocityVariation, accentBeats);
      break;
    case 'octave':
      steps = generateOctavePattern(notePool, rootIndices, octaveUpRoots, patternLength, velocityVariation);
      break;
    case 'walking':
      steps = generateWalkingPattern(notePool, rootIndices, patternLength, velocityVariation);
      break;
    case 'acid':
      steps = generateAcidPattern(notePool, rootIndices, octaveUpRoots, patternLength, velocityVariation);
      break;
    case 'acidRun':
      steps = generateAcidRunPattern(notePool, rootIndices, patternLength, velocityVariation);
      break;
    case 'syncopated':
      steps = generateSyncopatedPattern(notePool, rootIndices, patternLength, velocityVariation);
      break;
    case 'minimal':
      steps = generateMinimalPattern(notePool, rootIndices, patternLength, velocityVariation);
      break;
    case 'driving':
      steps = generateDrivingPattern(notePool, rootIndices, octaveUpRoots, patternLength, velocityVariation);
      break;
    case 'random':
    default:
      steps = generateRandomPattern(notePool, patternLength, velocityVariation);
      break;
  }

  return { steps, style };
}

function createEmptySteps(length: number): StepParams[] {
  return Array(length).fill(null).map(() => ({
    trigger: false,
    velocity: 0.8,
    microTime: 0,
    probability: 1,
    ratchets: 0,
  }));
}

function createStep(trigger: boolean, velocity: number, note?: number): StepParams {
  return {
    trigger,
    velocity: Math.max(0, Math.min(1, velocity)),
    microTime: 0,
    probability: 1,
    ratchets: 0,
    note,
  };
}

/**
 * Simple root note pattern - emphasizes the root on downbeats
 */
function generateRootPattern(
  notePool: number[],
  rootIndices: number[],
  length: number,
  velocityVar: number,
  accentBeats: boolean
): StepParams[] {
  const pattern = extendPattern(RHYTHM_PATTERNS.fourOnFloor, length);
  const accents = ACCENT_PATTERNS.classic;
  const rootIdx = rootIndices[0] ?? 0;
  const rootNote = notePool[rootIdx];

  return pattern.map((trigger, i) => {
    const accent = accentBeats ? accents[i % 16] : 1;
    const velocity = 0.7 + (accent * 0.3) + (Math.random() - 0.5) * velocityVar;
    return createStep(trigger === 1, velocity, rootNote);
  });
}

/**
 * Octave pattern - jumps between root and octave up
 */
function generateOctavePattern(
  notePool: number[],
  rootIndices: number[],
  octaveUpRoots: number[],
  length: number,
  velocityVar: number
): StepParams[] {
  const pattern = extendPattern(RHYTHM_PATTERNS.driving8th, length);
  const lowRoot = notePool[rootIndices[0] ?? 0];
  const highRoot = octaveUpRoots.length > 0 ? notePool[octaveUpRoots[0]] : lowRoot;

  return pattern.map((trigger, i) => {
    // Alternate between low and high, with some variation
    const useHigh = (i % 4 === 2) || (Math.random() < 0.2);
    const note = useHigh ? highRoot : lowRoot;
    const velocity = 0.7 + (i % 4 === 0 ? 0.2 : 0) + (Math.random() - 0.5) * velocityVar;
    return createStep(trigger === 1, velocity, note);
  });
}

/**
 * Walking bass - moves through scale degrees
 */
function generateWalkingPattern(
  notePool: number[],
  rootIndices: number[],
  length: number,
  velocityVar: number
): StepParams[] {
  const pattern = extendPattern(RHYTHM_PATTERNS.driving8th, length);
  let currentIndex = rootIndices[0] ?? 0;
  const steps: StepParams[] = [];

  for (let i = 0; i < length; i++) {
    const trigger = pattern[i] === 1;

    // On beat 1, often return to root
    if (i % 16 === 0 && Math.random() < 0.7) {
      currentIndex = rootIndices[0] ?? 0;
    } else if (trigger) {
      // Walk up or down by 1-2 scale degrees
      const direction = Math.random() < 0.6 ? 1 : -1;
      const distance = Math.random() < 0.7 ? 1 : 2;
      currentIndex = Math.max(0, Math.min(notePool.length - 1, currentIndex + direction * distance));
    }

    const velocity = 0.65 + (i % 4 === 0 ? 0.2 : 0.1) + (Math.random() - 0.5) * velocityVar;
    steps.push(createStep(trigger, velocity, notePool[currentIndex]));
  }

  return steps;
}

/**
 * Classic acid pattern - 303-style with accents and slides
 */
function generateAcidPattern(
  notePool: number[],
  rootIndices: number[],
  octaveUpRoots: number[],
  length: number,
  velocityVar: number
): StepParams[] {
  const rhythmPattern = extendPattern(RHYTHM_PATTERNS.acidClassic, length);
  const accents = ACCENT_PATTERNS.acid;
  const rootIdx = rootIndices[0] ?? 0;
  const lowRoot = notePool[rootIdx];
  const highRoot = octaveUpRoots.length > 0 ? notePool[octaveUpRoots[0]] : lowRoot;

  // Acid often uses root, fifth, and octave
  const fifthIdx = Math.min(rootIdx + 4, notePool.length - 1); // Approximate fifth in scale
  const fifth = notePool[fifthIdx];

  const steps: StepParams[] = [];
  let lastNote = lowRoot;

  for (let i = 0; i < length; i++) {
    const trigger = rhythmPattern[i] === 1;
    const accent = accents[i % 16];

    // Choose note with acid-style movement
    let note: number;
    const rand = Math.random();

    if (i % 16 === 0) {
      // Downbeat - usually root
      note = lowRoot;
    } else if (rand < 0.3) {
      // Stay on same note (characteristic of acid)
      note = lastNote;
    } else if (rand < 0.5) {
      // Jump to octave
      note = lastNote === highRoot ? lowRoot : highRoot;
    } else if (rand < 0.7) {
      // Move to fifth
      note = fifth;
    } else {
      // Random scale note
      note = notePool[Math.floor(Math.random() * notePool.length)];
    }

    const velocity = 0.5 + accent * 0.4 + (Math.random() - 0.5) * velocityVar;
    steps.push(createStep(trigger, velocity, note));

    if (trigger) lastNote = note;
  }

  return steps;
}

/**
 * Acid run pattern - 16th note sequences with runs up/down the scale
 */
function generateAcidRunPattern(
  notePool: number[],
  rootIndices: number[],
  length: number,
  velocityVar: number
): StepParams[] {
  const rhythmPattern = extendPattern(RHYTHM_PATTERNS.acidRun, length);
  const accents = ACCENT_PATTERNS.acid;

  let currentIndex = rootIndices[0] ?? 0;
  let direction = 1;
  let runLength = 0;
  const maxRunLength = 4 + Math.floor(Math.random() * 4);

  const steps: StepParams[] = [];

  for (let i = 0; i < length; i++) {
    const trigger = rhythmPattern[i] === 1;
    const accent = accents[i % 16];

    // On bar boundaries, sometimes reset or change direction
    if (i % 16 === 0) {
      if (Math.random() < 0.5) {
        currentIndex = rootIndices[0] ?? 0;
        direction = Math.random() < 0.5 ? 1 : -1;
        runLength = 0;
      }
    }

    if (trigger) {
      runLength++;

      // Check if we should change direction
      if (runLength >= maxRunLength || currentIndex >= notePool.length - 1 || currentIndex <= 0) {
        direction = -direction;
        runLength = 0;
      }

      // Move in current direction
      currentIndex = Math.max(0, Math.min(notePool.length - 1, currentIndex + direction));
    }

    const velocity = 0.5 + accent * 0.4 + (Math.random() - 0.5) * velocityVar;
    steps.push(createStep(trigger, velocity, notePool[currentIndex]));
  }

  return steps;
}

/**
 * Syncopated pattern - emphasis on off-beats
 */
function generateSyncopatedPattern(
  notePool: number[],
  rootIndices: number[],
  length: number,
  velocityVar: number
): StepParams[] {
  const rhythmPattern = extendPattern(RHYTHM_PATTERNS.syncopated, length);
  const rootIdx = rootIndices[0] ?? 0;
  const rootNote = notePool[rootIdx];

  // Use root, one below, and one above
  const below = notePool[Math.max(0, rootIdx - 1)];
  const above = notePool[Math.min(notePool.length - 1, rootIdx + 1)];

  return rhythmPattern.map((trigger, i) => {
    let note: number;
    const pos = i % 16;

    if (pos === 0 || pos === 8) {
      note = rootNote;
    } else if (pos % 2 === 1) {
      // Offbeats sometimes move up
      note = Math.random() < 0.4 ? above : rootNote;
    } else {
      note = Math.random() < 0.3 ? below : rootNote;
    }

    const velocity = 0.6 + (pos % 4 !== 0 ? 0.2 : 0.1) + (Math.random() - 0.5) * velocityVar;
    return createStep(trigger === 1, velocity, note);
  });
}

/**
 * Minimal pattern - sparse, spacious bass
 */
function generateMinimalPattern(
  notePool: number[],
  rootIndices: number[],
  length: number,
  velocityVar: number
): StepParams[] {
  const rhythmPattern = extendPattern(RHYTHM_PATTERNS.minimal, length);
  const rootIdx = rootIndices[0] ?? 0;
  const rootNote = notePool[rootIdx];

  // Occasionally add an extra hit
  const pattern = [...rhythmPattern];
  for (let i = 0; i < length; i++) {
    if (pattern[i] === 0 && Math.random() < 0.1) {
      pattern[i] = 1;
    }
  }

  return pattern.map((trigger, i) => {
    // Minimal bass often sticks to root with occasional fifth
    const note = Math.random() < 0.85 ? rootNote : notePool[Math.min(rootIdx + 4, notePool.length - 1)];
    const velocity = 0.75 + (i % 8 === 0 ? 0.15 : 0) + (Math.random() - 0.5) * velocityVar;
    return createStep(trigger === 1, velocity, note);
  });
}

/**
 * Driving pattern - steady rhythmic bass
 */
function generateDrivingPattern(
  notePool: number[],
  rootIndices: number[],
  octaveUpRoots: number[],
  length: number,
  velocityVar: number
): StepParams[] {
  // Randomly choose 8th or 16th note pattern
  const use16th = Math.random() < 0.4;
  const rhythmPattern = extendPattern(
    use16th ? RHYTHM_PATTERNS.driving16th : RHYTHM_PATTERNS.driving8th,
    length
  );

  const rootIdx = rootIndices[0] ?? 0;
  const lowRoot = notePool[rootIdx];
  const highRoot = octaveUpRoots.length > 0 ? notePool[octaveUpRoots[0]] : lowRoot;
  const fifth = notePool[Math.min(rootIdx + 4, notePool.length - 1)];

  return rhythmPattern.map((trigger, i) => {
    let note: number;
    const bar = Math.floor(i / 16);

    // Create some variation between bars
    if (bar % 2 === 0) {
      // Even bars - mostly root
      note = i % 8 === 4 ? (Math.random() < 0.5 ? highRoot : fifth) : lowRoot;
    } else {
      // Odd bars - more movement
      const rand = Math.random();
      if (rand < 0.5) note = lowRoot;
      else if (rand < 0.75) note = fifth;
      else note = highRoot;
    }

    const velocity = 0.65 + (i % 4 === 0 ? 0.2 : 0.1) + (Math.random() - 0.5) * velocityVar;
    return createStep(trigger === 1, velocity, note);
  });
}

/**
 * Random pattern - fully random within scale
 */
function generateRandomPattern(
  notePool: number[],
  length: number,
  velocityVar: number
): StepParams[] {
  const density = 0.4 + Math.random() * 0.4; // 40-80% density

  return Array(length).fill(null).map(() => {
    const trigger = Math.random() < density;
    const note = notePool[Math.floor(Math.random() * notePool.length)];
    const velocity = 0.5 + Math.random() * 0.4 + (Math.random() - 0.5) * velocityVar;
    return createStep(trigger, velocity, note);
  });
}

/**
 * Extend a pattern to match desired length
 */
function extendPattern(pattern: number[], length: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < length; i++) {
    result.push(pattern[i % pattern.length]);
  }
  return result;
}

/**
 * Get available bassline styles with descriptions
 */
export function getBasslineStyles(): Array<{ style: BasslineStyle; label: string; description: string }> {
  return [
    { style: 'root', label: 'Root', description: 'Simple root note pattern' },
    { style: 'octave', label: 'Octave', description: 'Root with octave jumps' },
    { style: 'walking', label: 'Walking', description: 'Walking bass movement' },
    { style: 'acid', label: 'Acid', description: '303-style acid pattern' },
    { style: 'acidRun', label: 'Acid Run', description: 'Acid with scale runs' },
    { style: 'syncopated', label: 'Syncopated', description: 'Off-beat emphasis' },
    { style: 'minimal', label: 'Minimal', description: 'Sparse, spacious' },
    { style: 'driving', label: 'Driving', description: 'Steady rhythmic bass' },
    { style: 'random', label: 'Random', description: 'Fully random' },
  ];
}

export const BasslineGenerator = {
  generate: generateBassline,
  getStyles: getBasslineStyles,
};

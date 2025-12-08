/**
 * Scale - Musical scale/mode system with note quantization
 *
 * Provides scale definitions, note pools, and pitch quantization
 * for melodic sequencing with drift control.
 */

// Scale intervals as semitones from root
export const SCALE_INTERVALS: Record<string, number[]> = {
  // Major modes
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],  // Aeolian
  locrian: [0, 1, 3, 5, 6, 8, 10],

  // Other common scales
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],  // Half-whole
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],

  // Exotic scales
  hirajoshi: [0, 2, 3, 7, 8],
  insen: [0, 1, 5, 7, 10],
  iwato: [0, 1, 5, 6, 10],
  hungarian: [0, 2, 3, 6, 7, 8, 11],
  arabic: [0, 1, 4, 5, 7, 8, 11],
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ============================================
// Chord System
// ============================================

/**
 * Chord types defined as scale degree intervals (0-indexed)
 * These are intervals in scale degrees, not semitones
 * e.g., [0, 2, 4] = root, 3rd, 5th in the current scale
 */
export const CHORD_DEGREES: Record<string, number[]> = {
  // Triads (3-note)
  triad: [0, 2, 4],                    // Root, 3rd, 5th
  triadInv1: [2, 4, 7],                // 1st inversion (3rd in bass)
  triadInv2: [4, 7, 9],                // 2nd inversion (5th in bass)

  // Seventh chords (4-note)
  seventh: [0, 2, 4, 6],               // Root, 3rd, 5th, 7th
  seventhInv1: [2, 4, 6, 7],           // 1st inversion
  seventhInv2: [4, 6, 7, 9],           // 2nd inversion
  seventhInv3: [6, 7, 9, 11],          // 3rd inversion

  // Extended chords
  ninth: [0, 2, 4, 6, 8],              // Add 9th
  add9: [0, 2, 4, 8],                  // Triad + 9th (no 7th)
  sus2: [0, 1, 4],                     // Suspended 2nd
  sus4: [0, 3, 4],                     // Suspended 4th

  // Power/open voicings
  power: [0, 4],                       // Root + 5th only
  powerOctave: [0, 4, 7],              // Root + 5th + octave
  octaves: [0, 7],                     // Root + octave
  octaves2: [0, 7, 14],                // Root + 2 octaves

  // Stacked voicings (wider spread)
  openTriad: [0, 4, 9],                // Root, 5th, 10th (3rd up an octave)
  openSeventh: [0, 4, 6, 9],           // Open seventh voicing
  quartal: [0, 3, 6],                  // Stacked 4ths (in scale degrees)
  quintal: [0, 4, 8],                  // Stacked 5ths

  // Clusters
  cluster3: [0, 1, 2],                 // 3 adjacent scale notes
  cluster4: [0, 1, 2, 3],              // 4 adjacent scale notes
};

export type ChordType = keyof typeof CHORD_DEGREES;

export const CHORD_NAMES: Record<ChordType, string> = {
  triad: 'Triad',
  triadInv1: 'Triad 1st Inv',
  triadInv2: 'Triad 2nd Inv',
  seventh: '7th',
  seventhInv1: '7th 1st Inv',
  seventhInv2: '7th 2nd Inv',
  seventhInv3: '7th 3rd Inv',
  ninth: '9th',
  add9: 'Add9',
  sus2: 'Sus2',
  sus4: 'Sus4',
  power: 'Power',
  powerOctave: 'Power+Oct',
  octaves: 'Octaves',
  octaves2: '2 Octaves',
  openTriad: 'Open Triad',
  openSeventh: 'Open 7th',
  quartal: 'Quartal',
  quintal: 'Quintal',
  cluster3: 'Cluster 3',
  cluster4: 'Cluster 4',
};

/**
 * Get available chord types grouped by category
 */
export function getChordCategories(): Record<string, ChordType[]> {
  return {
    'Triads': ['triad', 'triadInv1', 'triadInv2'],
    'Sevenths': ['seventh', 'seventhInv1', 'seventhInv2', 'seventhInv3'],
    'Extended': ['ninth', 'add9', 'sus2', 'sus4'],
    'Power/Open': ['power', 'powerOctave', 'octaves', 'octaves2'],
    'Voicings': ['openTriad', 'openSeventh', 'quartal', 'quintal'],
    'Clusters': ['cluster3', 'cluster4'],
  };
}

/**
 * Generate chord notes from a root note using scale degrees
 *
 * @param rootNote - MIDI note number of the root
 * @param chordType - Type of chord to generate
 * @param config - Scale configuration for determining intervals
 * @returns Array of MIDI note numbers forming the chord
 */
export function generateChord(
  rootNote: number,
  chordType: ChordType,
  config: ScaleConfig
): number[] {
  const degrees = CHORD_DEGREES[chordType];
  if (!degrees) return [rootNote];

  const scaleIntervals = SCALE_INTERVALS[config.scale];
  if (!scaleIntervals) return [rootNote];

  const notes: number[] = [];

  for (const degree of degrees) {
    // Calculate which octave offset and scale degree
    const octaveOffset = Math.floor(degree / scaleIntervals.length);
    const scaleDegree = degree % scaleIntervals.length;

    // Get semitone interval for this scale degree
    const semitones = scaleIntervals[scaleDegree] + (octaveOffset * 12);

    const note = rootNote + semitones;
    if (note >= 0 && note <= 127) {
      notes.push(note);
    }
  }

  return notes;
}

/**
 * Get the root note index in the note pool for a given chord
 * Used for the chord slider - maps slider position to root notes
 */
export function generateChordRootPool(
  config: ScaleConfig,
  octaveRange: number = 2
): number[] {
  // Generate the standard note pool - each note can be a chord root
  return generateNotePool(config, octaveRange);
}

/**
 * Get a descriptive name for a chord based on root note and type
 */
export function getChordName(
  rootNote: number,
  chordType: ChordType,
  config: ScaleConfig
): string {
  const noteName = NOTE_NAMES[rootNote % 12];
  const chordLabel = CHORD_NAMES[chordType] || chordType;

  // Determine chord quality based on scale intervals
  const scaleIntervals = SCALE_INTERVALS[config.scale];
  const rootInScale = (rootNote - config.root) % 12;

  // Find which scale degree this root is
  const degreeIndex = scaleIntervals.indexOf(rootInScale);
  const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const degree = degreeIndex >= 0 ? romanNumerals[degreeIndex] : '';

  return `${noteName} ${chordLabel}${degree ? ` (${degree})` : ''}`;
}

export type ScaleName = keyof typeof SCALE_INTERVALS;

export interface ScaleConfig {
  root: number;        // 0-11 (C=0, C#=1, etc.)
  scale: ScaleName;
  octave: number;      // Base octave (e.g., 3 for C3)
}

/**
 * Generate all MIDI notes in a scale across a range of octaves
 */
export function generateNotePool(
  config: ScaleConfig,
  octaveRange: number = 3  // How many octaves to span
): number[] {
  const intervals = SCALE_INTERVALS[config.scale];
  if (!intervals) return [];

  const notes: number[] = [];
  // MIDI note numbers: C-1 = 0, C0 = 12, C1 = 24, C2 = 36, C3 = 48, C4 = 60 (middle C)
  // So for octave N, the base MIDI note is (N + 1) * 12
  // e.g., octave 2 -> (2 + 1) * 12 = 36 = C2
  const baseNote = config.root + ((config.octave + 1) * 12);

  for (let oct = 0; oct < octaveRange; oct++) {
    for (const interval of intervals) {
      const note = baseNote + interval + (oct * 12);
      if (note >= 0 && note <= 127) {
        notes.push(note);
      }
    }
  }

  return notes;
}

/**
 * Quantize a pitch offset to the nearest scale degree
 */
export function quantizeToScale(
  offset: number,           // Semitone offset from root
  scale: ScaleName
): number {
  const intervals = SCALE_INTERVALS[scale];
  if (!intervals) return offset;

  // Normalize to single octave
  const octaves = Math.floor(offset / 12);
  const normalizedOffset = ((offset % 12) + 12) % 12;

  // Find closest scale degree
  let closest = intervals[0];
  let minDistance = Math.abs(normalizedOffset - intervals[0]);

  for (const interval of intervals) {
    const distance = Math.abs(normalizedOffset - interval);
    if (distance < minDistance) {
      minDistance = distance;
      closest = interval;
    }
    // Also check wrapping around octave
    const wrapDistance = Math.abs(normalizedOffset - (interval - 12));
    if (wrapDistance < minDistance) {
      minDistance = wrapDistance;
      closest = interval;
    }
  }

  return closest + (octaves * 12);
}

/**
 * Get neighboring notes in a scale (for drift variations)
 */
export function getScaleNeighbors(
  note: number,
  config: ScaleConfig,
  range: number = 1  // How many scale degrees away
): number[] {
  const pool = generateNotePool(config, 4);
  const noteIndex = pool.indexOf(note);

  if (noteIndex === -1) {
    // Note not in scale, find closest
    let closestIndex = 0;
    let minDiff = Math.abs(pool[0] - note);
    for (let i = 1; i < pool.length; i++) {
      const diff = Math.abs(pool[i] - note);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    return getNeighborsAtIndex(pool, closestIndex, range);
  }

  return getNeighborsAtIndex(pool, noteIndex, range);
}

function getNeighborsAtIndex(pool: number[], index: number, range: number): number[] {
  const neighbors: number[] = [];
  for (let i = -range; i <= range; i++) {
    const neighborIndex = index + i;
    if (neighborIndex >= 0 && neighborIndex < pool.length) {
      neighbors.push(pool[neighborIndex]);
    }
  }
  return neighbors;
}

/**
 * Pick a random note from a weighted pool based on drift amount
 *
 * @param baseNote - The sequenced note
 * @param drift - 0 to 1 (0 = exact note, 1 = fully random from pool)
 * @param config - Scale configuration
 * @returns Selected note
 */
export function applyNoteDrift(
  baseNote: number,
  drift: number,
  config: ScaleConfig
): number {
  if (drift <= 0) return baseNote;

  const pool = generateNotePool(config, 4);

  if (drift >= 1) {
    // Fully random from pool
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Probability of changing note
  if (Math.random() > drift) {
    return baseNote;
  }

  // Determine how far to drift based on drift amount
  // Low drift = close neighbors, high drift = wider range
  const maxRange = Math.ceil(drift * pool.length * 0.5);
  const neighbors = getScaleNeighbors(baseNote, config, maxRange);

  // Weight towards closer notes
  const weights: number[] = neighbors.map((_, i) => {
    const distance = Math.abs(i - Math.floor(neighbors.length / 2));
    return Math.pow(1 - drift, distance + 1);
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < neighbors.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return neighbors[i];
    }
  }

  return neighbors[neighbors.length - 1];
}

/**
 * Apply fill control to determine if a step should trigger
 *
 * @param isSequenced - Whether the step has a trigger in the pattern
 * @param fill - -1 to 1 (negative = thin, 0 = as sequenced, positive = fill)
 * @returns Whether to trigger
 */
export function applyFillControl(
  isSequenced: boolean,
  fill: number
): boolean {
  if (fill === 0) return isSequenced;

  if (fill < 0) {
    // Thinning mode: remove triggers
    if (!isSequenced) return false;
    // At -1, remove all. At -0.5, 50% chance to remove.
    const removeChance = Math.abs(fill);
    return Math.random() > removeChance;
  } else {
    // Fill mode: add triggers
    if (isSequenced) return true;
    // At 1, trigger everything. At 0.5, 50% chance to add.
    return Math.random() < fill;
  }
}

/**
 * Convert MIDI note number to note name with octave
 */
export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return NOTE_NAMES[noteIndex] + octave;
}

/**
 * Convert note name to MIDI number
 */
export function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(-?\d)$/);
  if (!match) return 60; // Default to middle C

  const noteName = match[1];
  const octave = parseInt(match[2], 10);

  const noteIndex = NOTE_NAMES.indexOf(noteName);
  if (noteIndex === -1) return 60;

  return (octave + 1) * 12 + noteIndex;
}

export const Scale = {
  INTERVALS: SCALE_INTERVALS,
  NOTE_NAMES,
  CHORD_DEGREES,
  CHORD_NAMES,
  generateNotePool,
  quantizeToScale,
  getScaleNeighbors,
  applyNoteDrift,
  applyFillControl,
  midiToNoteName,
  noteNameToMidi,
  generateChord,
  generateChordRootPool,
  getChordName,
  getChordCategories,
};

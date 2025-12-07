/**
 * LFO - Low Frequency Oscillator for modulation
 *
 * Features:
 * - Multiple waveform shapes: sine, triangle, square, sawtooth, sample & hold
 * - Tempo sync with musical divisions
 * - Free-running rate in Hz
 * - Phase offset control
 * - Bipolar and unipolar output modes
 * - 2 slow random modulators for organic movement
 */

export type LFOShape = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'sampleHold' | 'random';

export type LFOSync = 'free' | '8bars' | '4bars' | '2bars' | '1bar' |
                      '1/2' | '1/4' | '1/8' | '1/16' | '1/32' |
                      '1/2d' | '1/4d' | '1/8d' | '1/16d' |
                      '1/2t' | '1/4t' | '1/8t' | '1/16t';

export interface LFOParams {
  shape: LFOShape;
  rate: number;           // Rate in Hz (when not synced)
  sync: LFOSync;          // Tempo sync division
  tempoSync: boolean;     // Whether to use tempo sync
  phase: number;          // Phase offset 0-1
  depth: number;          // Output depth 0-1
  bipolar: boolean;       // true = -1 to +1, false = 0 to +1
  smoothing: number;      // Sample & hold smoothing 0-1
}

const DEFAULT_PARAMS: LFOParams = {
  shape: 'sine',
  rate: 1,
  sync: '1/4',
  tempoSync: false,
  phase: 0,
  depth: 1,
  bipolar: true,
  smoothing: 0
};

// Sync value to bars (quarter note = 0.25 bars at 4/4)
const SYNC_VALUES: Record<LFOSync, number> = {
  'free': 0,      // Not used
  '8bars': 32,    // 8 bars = 32 beats
  '4bars': 16,    // 4 bars = 16 beats
  '2bars': 8,     // 2 bars = 8 beats
  '1bar': 4,      // 1 bar = 4 beats
  '1/2': 2,       // half note
  '1/4': 1,       // quarter note
  '1/8': 0.5,     // eighth note
  '1/16': 0.25,   // sixteenth note
  '1/32': 0.125,  // thirty-second note
  '1/2d': 3,      // dotted half
  '1/4d': 1.5,    // dotted quarter
  '1/8d': 0.75,   // dotted eighth
  '1/16d': 0.375, // dotted sixteenth
  '1/2t': 4/3,    // half triplet
  '1/4t': 2/3,    // quarter triplet
  '1/8t': 1/3,    // eighth triplet
  '1/16t': 1/6    // sixteenth triplet
};

/**
 * Single LFO instance
 */
export class LFO {
  private params: LFOParams;
  private phase: number = 0;
  private sampleHoldValue: number = 0;
  private lastSampleHoldPhase: number = 0;
  private smoothedValue: number = 0;
  private bpm: number = 120;

  // For random walk modulator
  private randomTarget: number = 0;
  private randomCurrent: number = 0;
  private randomChangeTime: number = 0;

  constructor(params?: Partial<LFOParams>) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.phase = this.params.phase;
  }

  /**
   * Get the current LFO value
   * @param time - Current time in seconds
   */
  getValue(time: number): number {
    const freq = this.getFrequency();

    // Calculate phase (0-1)
    this.phase = ((time * freq) + this.params.phase) % 1;

    let value: number;

    switch (this.params.shape) {
      case 'sine':
        value = Math.sin(this.phase * Math.PI * 2);
        break;

      case 'triangle':
        // Triangle: 0 -> 1 -> -1 -> 0
        value = this.phase < 0.5
          ? (this.phase * 4) - 1
          : 3 - (this.phase * 4);
        break;

      case 'square':
        value = this.phase < 0.5 ? 1 : -1;
        break;

      case 'sawtooth':
        // Rising sawtooth: -1 to 1
        value = (this.phase * 2) - 1;
        break;

      case 'sampleHold':
        // Update sample & hold when we cross a new cycle
        if (this.phase < this.lastSampleHoldPhase) {
          this.sampleHoldValue = (Math.random() * 2) - 1;
        }
        this.lastSampleHoldPhase = this.phase;

        // Apply smoothing
        if (this.params.smoothing > 0) {
          const smoothFactor = 1 - this.params.smoothing;
          this.smoothedValue = this.smoothedValue + (this.sampleHoldValue - this.smoothedValue) * smoothFactor * 0.1;
          value = this.smoothedValue;
        } else {
          value = this.sampleHoldValue;
        }
        break;

      case 'random':
        // Smooth random walk
        value = this.getRandomWalkValue(time, freq);
        break;

      default:
        value = 0;
    }

    // Apply depth
    value *= this.params.depth;

    // Convert to unipolar if needed
    if (!this.params.bipolar) {
      value = (value + 1) / 2;
    }

    return value;
  }

  /**
   * Random walk modulator - creates smooth organic movement
   */
  private getRandomWalkValue(time: number, freq: number): number {
    const changeInterval = 1 / freq;

    if (time - this.randomChangeTime > changeInterval) {
      this.randomTarget = (Math.random() * 2) - 1;
      this.randomChangeTime = time;
    }

    // Smooth interpolation toward target
    const smoothFactor = 0.02 * (1 - this.params.smoothing * 0.9);
    this.randomCurrent = this.randomCurrent + (this.randomTarget - this.randomCurrent) * smoothFactor;

    return this.randomCurrent;
  }

  /**
   * Get the effective frequency based on tempo sync
   */
  getFrequency(): number {
    if (!this.params.tempoSync || this.params.sync === 'free') {
      return this.params.rate;
    }

    // Calculate frequency from sync value
    // sync value is in beats, so freq = bpm/60 / syncBeats
    const syncBeats = SYNC_VALUES[this.params.sync];
    const beatsPerSecond = this.bpm / 60;
    return beatsPerSecond / syncBeats;
  }

  /**
   * Set the tempo for sync calculations
   */
  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  /**
   * Reset the LFO phase
   */
  reset(): void {
    this.phase = this.params.phase;
    this.sampleHoldValue = 0;
    this.lastSampleHoldPhase = 0;
    this.smoothedValue = 0;
    this.randomTarget = 0;
    this.randomCurrent = 0;
    this.randomChangeTime = 0;
  }

  /**
   * Get parameters
   */
  getParams(): LFOParams {
    return { ...this.params };
  }

  /**
   * Set parameters
   */
  setParams(params: Partial<LFOParams>): void {
    this.params = { ...this.params, ...params };
  }

  // Individual parameter accessors
  get shape(): LFOShape { return this.params.shape; }
  set shape(value: LFOShape) { this.params.shape = value; }

  get rate(): number { return this.params.rate; }
  set rate(value: number) { this.params.rate = Math.max(0.01, Math.min(30, value)); }

  get sync(): LFOSync { return this.params.sync; }
  set sync(value: LFOSync) { this.params.sync = value; }

  get tempoSync(): boolean { return this.params.tempoSync; }
  set tempoSync(value: boolean) { this.params.tempoSync = value; }

  get phaseOffset(): number { return this.params.phase; }
  set phaseOffset(value: number) { this.params.phase = value % 1; }

  get depth(): number { return this.params.depth; }
  set depth(value: number) { this.params.depth = Math.max(0, Math.min(1, value)); }

  get bipolar(): boolean { return this.params.bipolar; }
  set bipolar(value: boolean) { this.params.bipolar = value; }

  get smoothing(): number { return this.params.smoothing; }
  set smoothing(value: number) { this.params.smoothing = Math.max(0, Math.min(1, value)); }
}

/**
 * LFO Manager - Manages 4 global LFOs + 2 slow random modulators
 */
export interface LFOManagerState {
  lfos: LFOParams[];
  slowRandom: {
    rate1: number;
    rate2: number;
    smoothing1: number;
    smoothing2: number;
  };
}

// Re-export sync values for use by EnvelopeModulator
export { SYNC_VALUES };

export class LFOManager {
  private lfos: LFO[] = [];
  private slowRandom1: LFO;
  private slowRandom2: LFO;
  private _bpm: number = 120;

  constructor() {
    // Create 4 global LFOs with different default settings
    this.lfos = [
      new LFO({ shape: 'sine', rate: 1, depth: 1, bipolar: true }),
      new LFO({ shape: 'triangle', rate: 0.5, depth: 1, bipolar: true }),
      new LFO({ shape: 'square', rate: 2, depth: 1, bipolar: true }),
      new LFO({ shape: 'sampleHold', rate: 4, depth: 1, bipolar: true })
    ];

    // Create 2 slow random modulators
    this.slowRandom1 = new LFO({
      shape: 'random',
      rate: 0.1,
      depth: 1,
      bipolar: true,
      smoothing: 0.8
    });

    this.slowRandom2 = new LFO({
      shape: 'random',
      rate: 0.07,
      depth: 1,
      bipolar: true,
      smoothing: 0.9
    });
  }

  /**
   * Get LFO by index (0-3)
   */
  getLFO(index: number): LFO | null {
    return this.lfos[index] ?? null;
  }

  /**
   * Get slow random modulator (1 or 2)
   */
  getSlowRandom(index: 1 | 2): LFO {
    return index === 1 ? this.slowRandom1 : this.slowRandom2;
  }

  /**
   * Get value from specific LFO
   */
  getValue(lfoIndex: number, time: number): number {
    const lfo = this.lfos[lfoIndex];
    return lfo ? lfo.getValue(time) : 0;
  }

  /**
   * Get value from slow random modulator
   */
  getSlowRandomValue(index: 1 | 2, time: number): number {
    const lfo = index === 1 ? this.slowRandom1 : this.slowRandom2;
    return lfo.getValue(time);
  }

  /**
   * Get all LFO values at a given time
   */
  getAllValues(time: number): {
    lfo1: number;
    lfo2: number;
    lfo3: number;
    lfo4: number;
    random1: number;
    random2: number;
  } {
    return {
      lfo1: this.lfos[0].getValue(time),
      lfo2: this.lfos[1].getValue(time),
      lfo3: this.lfos[2].getValue(time),
      lfo4: this.lfos[3].getValue(time),
      random1: this.slowRandom1.getValue(time),
      random2: this.slowRandom2.getValue(time)
    };
  }

  /**
   * Set tempo for all LFOs
   */
  setBpm(bpm: number): void {
    this._bpm = bpm;
    for (const lfo of this.lfos) {
      lfo.setBpm(bpm);
    }
    this.slowRandom1.setBpm(bpm);
    this.slowRandom2.setBpm(bpm);
  }

  /**
   * Get current BPM
   */
  getBpm(): number {
    return this._bpm;
  }

  /**
   * Reset all LFOs
   */
  reset(): void {
    for (const lfo of this.lfos) {
      lfo.reset();
    }
    this.slowRandom1.reset();
    this.slowRandom2.reset();
  }

  /**
   * Get parameters for all LFOs
   */
  getState(): LFOManagerState {
    return {
      lfos: this.lfos.map(lfo => lfo.getParams()),
      slowRandom: {
        rate1: this.slowRandom1.rate,
        rate2: this.slowRandom2.rate,
        smoothing1: this.slowRandom1.smoothing,
        smoothing2: this.slowRandom2.smoothing
      }
    };
  }

  /**
   * Restore state
   */
  setState(state: LFOManagerState): void {
    state.lfos.forEach((params, index) => {
      if (this.lfos[index]) {
        this.lfos[index].setParams(params);
      }
    });

    this.slowRandom1.rate = state.slowRandom.rate1;
    this.slowRandom2.rate = state.slowRandom.rate2;
    this.slowRandom1.smoothing = state.slowRandom.smoothing1;
    this.slowRandom2.smoothing = state.slowRandom.smoothing2;
  }

  /**
   * Set parameters for a specific LFO
   */
  setLFOParams(index: number, params: Partial<LFOParams>): void {
    const lfo = this.lfos[index];
    if (lfo) {
      lfo.setParams(params);
    }
  }

  /**
   * Set slow random parameters
   */
  setSlowRandomParams(index: 1 | 2, rate: number, smoothing: number): void {
    const lfo = index === 1 ? this.slowRandom1 : this.slowRandom2;
    lfo.rate = rate;
    lfo.smoothing = smoothing;
  }
}

// Export types for mod matrix integration
export type ModulationSource =
  | 'lfo1' | 'lfo2' | 'lfo3' | 'lfo4'
  | 'random1' | 'random2'
  | 'env1' | 'env2' | 'env3' | 'env4' | 'env5' | 'env6'
  | 'velocity' | 'aftertouch' | 'modWheel';

// Common LFO presets
export const LFO_PRESETS: Record<string, Partial<LFOParams>> = {
  slowSweep: {
    shape: 'sine',
    rate: 0.1,
    depth: 1,
    bipolar: true
  },

  fastWobble: {
    shape: 'sine',
    rate: 6,
    depth: 0.5,
    bipolar: true
  },

  tremolo: {
    shape: 'sine',
    rate: 8,
    depth: 1,
    bipolar: false
  },

  gate: {
    shape: 'square',
    sync: '1/8',
    tempoSync: true,
    depth: 1,
    bipolar: false
  },

  ramp: {
    shape: 'sawtooth',
    sync: '1/4',
    tempoSync: true,
    depth: 1,
    bipolar: true
  },

  randomSteps: {
    shape: 'sampleHold',
    sync: '1/16',
    tempoSync: true,
    depth: 1,
    bipolar: true,
    smoothing: 0
  },

  smoothRandom: {
    shape: 'sampleHold',
    rate: 2,
    depth: 1,
    bipolar: true,
    smoothing: 0.7
  },

  drift: {
    shape: 'random',
    rate: 0.05,
    depth: 0.3,
    bipolar: true,
    smoothing: 0.95
  }
};

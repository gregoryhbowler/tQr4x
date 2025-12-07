/**
 * ComplexMorphVoice - "The Structuralist" FM engine
 *
 * MULTI-BREAKPOINT LOOPING ENVELOPE architecture:
 * - Each envelope has 2-16 breakpoints defining a curve
 * - Envelopes cycle continuously with user-defined period
 * - Each segment has its own curve type (exp, linear, sharp, punch, swell, step)
 * - Drawable/editable via UI
 * - Multiple competing envelopes create complex, evolving timbres
 *
 * FM Topology: (Op A + Op B) → Op C → Carrier → Notch Filter
 */

// Curve types for segments between breakpoints
export type CurveType = 'exp' | 'linear' | 'sharp' | 'punch' | 'swell' | 'step';

// A single breakpoint in the envelope
export interface EnvBreakpoint {
  time: number;       // 0-1 normalized position in cycle (0 = start, 1 = end/loop point)
  value: number;      // 0-1 normalized value
  curve: CurveType;   // Curve type for segment LEADING TO this point
}

// Loop modes for envelopes
export type LoopMode = 'cycle' | 'oneshot' | 'oneshot-hold';

// A complete cycling envelope
export interface CyclingEnvelope {
  breakpoints: EnvBreakpoint[];  // 2-16 breakpoints, must be sorted by time
  period: number;                // Cycle time in seconds (or bars if synced)
  syncToTempo: boolean;          // If true, period is in bars (quarter notes)
  amount: number;                // -1 to 1 (bipolar depth/amount)
  enabled: boolean;              // Can disable individual envelopes
  loopMode: LoopMode;            // cycle = loop forever, oneshot = play once then stop, oneshot-hold = play once then hold final value
}

// Operator envelopes - each modulates a different parameter
export interface OperatorEnvelopes {
  pitch: CyclingEnvelope;
  pitchRange: number;           // Hz range (envelope 0-1 maps to ±this value)

  index: CyclingEnvelope;
  indexMin: number;             // Min FM index when envelope = 0
  indexMax: number;             // Max FM index when envelope = 1

  level: CyclingEnvelope;
  levelMax: number;             // Max level (envelope 0-1 maps to 0-levelMax)
}

export interface ComplexMorphOperator {
  freq: number;                 // Base frequency in Hz
  envelopes: OperatorEnvelopes;
}

export interface ComplexMorphParams {
  // Carrier
  carrierFreq: number;
  carrierPitchEnv: CyclingEnvelope;
  carrierPitchRange: number;    // Hz range for carrier pitch envelope

  // Operators
  opA: ComplexMorphOperator;
  opB: ComplexMorphOperator;
  opC: ComplexMorphOperator;

  // Master amplitude envelope
  ampEnv: CyclingEnvelope;

  // Post-carrier notch filter
  notchFreq: number;
  notchQ: number;
  notchEnv: CyclingEnvelope;
  notchRange: number;           // Hz range for filter envelope

  // Output
  outputLevel: number;
  gain: number;
}

// Helper to create a default flat envelope (no movement)
function createFlatEnvelope(value: number = 0.5, period: number = 1, loopMode: LoopMode = 'cycle'): CyclingEnvelope {
  return {
    breakpoints: [
      { time: 0, value, curve: 'linear' },
      { time: 1, value, curve: 'linear' }
    ],
    period,
    syncToTempo: false,
    amount: 1,
    enabled: true,
    loopMode
  };
}

// Helper to create a simple sine-like envelope
function createSineEnvelope(period: number = 1, loopMode: LoopMode = 'cycle'): CyclingEnvelope {
  return {
    breakpoints: [
      { time: 0, value: 0.5, curve: 'linear' },
      { time: 0.25, value: 1, curve: 'exp' },
      { time: 0.5, value: 0.5, curve: 'exp' },
      { time: 0.75, value: 0, curve: 'exp' },
      { time: 1, value: 0.5, curve: 'exp' }
    ],
    period,
    syncToTempo: false,
    amount: 1,
    enabled: true,
    loopMode
  };
}

// Helper to create a ramp envelope
function createRampEnvelope(period: number = 1, ascending: boolean = true, loopMode: LoopMode = 'cycle'): CyclingEnvelope {
  return {
    breakpoints: [
      { time: 0, value: ascending ? 0 : 1, curve: 'linear' },
      { time: 1, value: ascending ? 1 : 0, curve: 'linear' }
    ],
    period,
    syncToTempo: false,
    amount: 1,
    enabled: true,
    loopMode
  };
}

// Default operator envelopes - starts FLAT (no movement)
function createDefaultOperatorEnvelopes(): OperatorEnvelopes {
  return {
    pitch: createFlatEnvelope(0.5, 1),
    pitchRange: 100,

    index: createFlatEnvelope(0.5, 1),
    indexMin: 0,
    indexMax: 10,

    level: createFlatEnvelope(1, 1),  // Full level by default
    levelMax: 1
  };
}

// Default operator
function createDefaultOperator(freq: number): ComplexMorphOperator {
  return {
    freq,
    envelopes: createDefaultOperatorEnvelopes()
  };
}

// Default params - EMPTY/FLAT envelopes, no preset movement
const DEFAULT_PARAMS: ComplexMorphParams = {
  carrierFreq: 110,
  carrierPitchEnv: createFlatEnvelope(0.5, 1),
  carrierPitchRange: 50,

  opA: createDefaultOperator(220),
  opB: createDefaultOperator(330),
  opC: createDefaultOperator(165),

  ampEnv: createFlatEnvelope(1, 1),  // Full amplitude, no cycling

  notchFreq: 800,
  notchQ: 12,
  notchEnv: createFlatEnvelope(0.5, 1),
  notchRange: 600,

  outputLevel: 0.7,
  gain: 0.8
};

// Presets demonstrating different envelope configurations
export const COMPLEX_MORPH_PRESETS: Record<string, Partial<ComplexMorphParams>> = {
  // Empty - flat envelopes, good starting point
  empty: {
    ...DEFAULT_PARAMS
  },

  // Plucky - fast attack envelopes
  pluck: {
    carrierFreq: 165,
    carrierPitchEnv: {
      breakpoints: [
        { time: 0, value: 1, curve: 'linear' },
        { time: 0.05, value: 0.5, curve: 'punch' },
        { time: 1, value: 0.5, curve: 'linear' }
      ],
      period: 0.3,
      syncToTempo: false,
      amount: 1,
      enabled: true,
      loopMode: 'cycle'
    },
    carrierPitchRange: 80,
    opA: {
      freq: 330,
      envelopes: {
        pitch: {
          breakpoints: [
            { time: 0, value: 1, curve: 'linear' },
            { time: 0.03, value: 0.5, curve: 'punch' },
            { time: 1, value: 0.5, curve: 'linear' }
          ],
          period: 0.25,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        pitchRange: 120,
        index: {
          breakpoints: [
            { time: 0, value: 1, curve: 'linear' },
            { time: 0.1, value: 0.2, curve: 'exp' },
            { time: 1, value: 0.2, curve: 'linear' }
          ],
          period: 0.3,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        indexMin: 1,
        indexMax: 15,
        level: {
          breakpoints: [
            { time: 0, value: 1, curve: 'linear' },
            { time: 0.15, value: 0.3, curve: 'exp' },
            { time: 1, value: 0.3, curve: 'linear' }
          ],
          period: 0.35,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        levelMax: 1.2
      }
    },
    opB: {
      freq: 466,
      envelopes: {
        pitch: {
          breakpoints: [
            { time: 0, value: 0.8, curve: 'linear' },
            { time: 0.05, value: 0.5, curve: 'sharp' },
            { time: 1, value: 0.5, curve: 'linear' }
          ],
          period: 0.28,
          syncToTempo: false,
          amount: 0.8,
          enabled: true,
      loopMode: 'cycle'
        },
        pitchRange: 90,
        index: {
          breakpoints: [
            { time: 0, value: 0.9, curve: 'linear' },
            { time: 0.12, value: 0.15, curve: 'exp' },
            { time: 1, value: 0.15, curve: 'linear' }
          ],
          period: 0.32,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        indexMin: 0.5,
        indexMax: 12,
        level: {
          breakpoints: [
            { time: 0, value: 1, curve: 'linear' },
            { time: 0.18, value: 0.25, curve: 'exp' },
            { time: 1, value: 0.25, curve: 'linear' }
          ],
          period: 0.38,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        levelMax: 1
      }
    },
    opC: {
      freq: 82.5,
      envelopes: {
        pitch: {
          breakpoints: [
            { time: 0, value: 1, curve: 'linear' },
            { time: 0.08, value: 0.5, curve: 'punch' },
            { time: 1, value: 0.5, curve: 'linear' }
          ],
          period: 0.22,
          syncToTempo: false,
          amount: 0.9,
          enabled: true,
      loopMode: 'cycle'
        },
        pitchRange: 60,
        index: {
          breakpoints: [
            { time: 0, value: 1, curve: 'linear' },
            { time: 0.06, value: 0.1, curve: 'punch' },
            { time: 1, value: 0.1, curve: 'linear' }
          ],
          period: 0.2,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        indexMin: 1,
        indexMax: 20,
        level: {
          breakpoints: [
            { time: 0, value: 1, curve: 'linear' },
            { time: 0.12, value: 0.2, curve: 'exp' },
            { time: 1, value: 0.2, curve: 'linear' }
          ],
          period: 0.25,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        levelMax: 1.5
      }
    },
    ampEnv: {
      breakpoints: [
        { time: 0, value: 1, curve: 'linear' },
        { time: 0.2, value: 0, curve: 'exp' },
        { time: 1, value: 0, curve: 'linear' }
      ],
      period: 0.4,
      syncToTempo: false,
      amount: 1,
      enabled: true,
      loopMode: 'cycle'
    }
  },

  // Morphing - slow evolving envelopes with different periods
  morph: {
    carrierFreq: 110,
    carrierPitchEnv: createSineEnvelope(3),
    carrierPitchRange: 30,
    opA: {
      freq: 220,
      envelopes: {
        pitch: createSineEnvelope(2.3),
        pitchRange: 50,
        index: {
          breakpoints: [
            { time: 0, value: 0.2, curve: 'linear' },
            { time: 0.3, value: 0.8, curve: 'swell' },
            { time: 0.6, value: 0.4, curve: 'exp' },
            { time: 1, value: 0.2, curve: 'sharp' }
          ],
          period: 4.1,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        indexMin: 1,
        indexMax: 8,
        level: createSineEnvelope(5.7),
        levelMax: 1
      }
    },
    opB: {
      freq: 330,
      envelopes: {
        pitch: {
          breakpoints: [
            { time: 0, value: 0.5, curve: 'linear' },
            { time: 0.5, value: 0.7, curve: 'swell' },
            { time: 1, value: 0.5, curve: 'exp' }
          ],
          period: 3.7,
          syncToTempo: false,
          amount: 0.6,
          enabled: true,
      loopMode: 'cycle'
        },
        pitchRange: 40,
        index: createSineEnvelope(2.9),
        indexMin: 0.5,
        indexMax: 6,
        level: {
          breakpoints: [
            { time: 0, value: 0.6, curve: 'linear' },
            { time: 0.4, value: 1, curve: 'exp' },
            { time: 0.7, value: 0.3, curve: 'sharp' },
            { time: 1, value: 0.6, curve: 'swell' }
          ],
          period: 6.3,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        levelMax: 0.9
      }
    },
    opC: {
      freq: 165,
      envelopes: {
        pitch: createSineEnvelope(4.3),
        pitchRange: 35,
        index: {
          breakpoints: [
            { time: 0, value: 0.3, curve: 'linear' },
            { time: 0.25, value: 0.9, curve: 'punch' },
            { time: 0.5, value: 0.5, curve: 'exp' },
            { time: 0.75, value: 0.1, curve: 'sharp' },
            { time: 1, value: 0.3, curve: 'swell' }
          ],
          period: 3.1,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        indexMin: 2,
        indexMax: 12,
        level: createSineEnvelope(7.1),
        levelMax: 1.2
      }
    },
    ampEnv: createFlatEnvelope(1, 1),
    notchEnv: {
      breakpoints: [
        { time: 0, value: 0.3, curve: 'linear' },
        { time: 0.5, value: 0.8, curve: 'swell' },
        { time: 1, value: 0.3, curve: 'exp' }
      ],
      period: 5.5,
      syncToTempo: false,
      amount: 1,
      enabled: true,
      loopMode: 'cycle'
    },
    notchRange: 800
  },

  // Chaotic - fast competing envelopes
  chaos: {
    carrierFreq: 165,
    carrierPitchEnv: {
      breakpoints: [
        { time: 0, value: 0.5, curve: 'linear' },
        { time: 0.1, value: 0.9, curve: 'punch' },
        { time: 0.3, value: 0.2, curve: 'sharp' },
        { time: 0.5, value: 0.7, curve: 'exp' },
        { time: 0.7, value: 0.1, curve: 'punch' },
        { time: 1, value: 0.5, curve: 'swell' }
      ],
      period: 0.7,
      syncToTempo: false,
      amount: 1,
      enabled: true,
      loopMode: 'cycle'
    },
    carrierPitchRange: 150,
    opA: {
      freq: 233,
      envelopes: {
        pitch: {
          breakpoints: [
            { time: 0, value: 0.3, curve: 'linear' },
            { time: 0.15, value: 1, curve: 'punch' },
            { time: 0.4, value: 0, curve: 'exp' },
            { time: 0.6, value: 0.8, curve: 'sharp' },
            { time: 1, value: 0.3, curve: 'linear' }
          ],
          period: 0.5,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        pitchRange: 200,
        index: {
          breakpoints: [
            { time: 0, value: 0.1, curve: 'linear' },
            { time: 0.08, value: 1, curve: 'punch' },
            { time: 0.25, value: 0.3, curve: 'exp' },
            { time: 0.5, value: 0.8, curve: 'sharp' },
            { time: 0.75, value: 0.2, curve: 'punch' },
            { time: 1, value: 0.1, curve: 'swell' }
          ],
          period: 0.35,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        indexMin: 0,
        indexMax: 20,
        level: {
          breakpoints: [
            { time: 0, value: 0.8, curve: 'linear' },
            { time: 0.2, value: 0.2, curve: 'punch' },
            { time: 0.5, value: 1, curve: 'swell' },
            { time: 0.8, value: 0.4, curve: 'exp' },
            { time: 1, value: 0.8, curve: 'linear' }
          ],
          period: 0.6,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        levelMax: 1.5
      }
    },
    opB: {
      freq: 448,
      envelopes: {
        pitch: {
          breakpoints: [
            { time: 0, value: 0.7, curve: 'linear' },
            { time: 0.2, value: 0, curve: 'sharp' },
            { time: 0.5, value: 1, curve: 'punch' },
            { time: 0.8, value: 0.3, curve: 'exp' },
            { time: 1, value: 0.7, curve: 'swell' }
          ],
          period: 0.45,
          syncToTempo: false,
          amount: -0.8,  // Inverted!
          enabled: true,
      loopMode: 'cycle'
        },
        pitchRange: 180,
        index: {
          breakpoints: [
            { time: 0, value: 0.5, curve: 'linear' },
            { time: 0.1, value: 0.9, curve: 'punch' },
            { time: 0.3, value: 0.1, curve: 'exp' },
            { time: 0.6, value: 0.7, curve: 'sharp' },
            { time: 1, value: 0.5, curve: 'linear' }
          ],
          period: 0.28,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        indexMin: 0,
        indexMax: 18,
        level: {
          breakpoints: [
            { time: 0, value: 0.6, curve: 'linear' },
            { time: 0.3, value: 1, curve: 'swell' },
            { time: 0.7, value: 0.2, curve: 'punch' },
            { time: 1, value: 0.6, curve: 'exp' }
          ],
          period: 0.55,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        levelMax: 1.3
      }
    },
    opC: {
      freq: 82.5,
      envelopes: {
        pitch: {
          breakpoints: [
            { time: 0, value: 0.4, curve: 'linear' },
            { time: 0.15, value: 1, curve: 'punch' },
            { time: 0.4, value: 0, curve: 'sharp' },
            { time: 0.7, value: 0.6, curve: 'swell' },
            { time: 1, value: 0.4, curve: 'exp' }
          ],
          period: 0.38,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        pitchRange: 120,
        index: {
          breakpoints: [
            { time: 0, value: 0.2, curve: 'linear' },
            { time: 0.05, value: 1, curve: 'punch' },
            { time: 0.2, value: 0.4, curve: 'exp' },
            { time: 0.5, value: 0.9, curve: 'sharp' },
            { time: 0.8, value: 0.1, curve: 'punch' },
            { time: 1, value: 0.2, curve: 'swell' }
          ],
          period: 0.25,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        indexMin: 1,
        indexMax: 25,
        level: {
          breakpoints: [
            { time: 0, value: 1, curve: 'linear' },
            { time: 0.25, value: 0.3, curve: 'exp' },
            { time: 0.5, value: 0.9, curve: 'punch' },
            { time: 0.75, value: 0.5, curve: 'sharp' },
            { time: 1, value: 1, curve: 'swell' }
          ],
          period: 0.42,
          syncToTempo: false,
          amount: 1,
          enabled: true,
      loopMode: 'cycle'
        },
        levelMax: 1.8
      }
    },
    ampEnv: createFlatEnvelope(1, 1),
    notchEnv: {
      breakpoints: [
        { time: 0, value: 0.3, curve: 'linear' },
        { time: 0.2, value: 0.9, curve: 'punch' },
        { time: 0.5, value: 0.1, curve: 'sharp' },
        { time: 0.8, value: 0.7, curve: 'swell' },
        { time: 1, value: 0.3, curve: 'exp' }
      ],
      period: 0.65,
      syncToTempo: false,
      amount: 1,
      enabled: true,
      loopMode: 'cycle'
    },
    notchRange: 1200,
    notchQ: 18
  }
};

// Serialize envelope for worklet
function serializeEnvelope(env: CyclingEnvelope, prefix: string): Record<string, unknown> {
  return {
    [`${prefix}Breakpoints`]: env.breakpoints.map(bp => ({
      time: bp.time,
      value: bp.value,
      curve: bp.curve
    })),
    [`${prefix}Period`]: env.period,
    [`${prefix}SyncToTempo`]: env.syncToTempo,
    [`${prefix}Amount`]: env.amount,
    [`${prefix}Enabled`]: env.enabled,
    [`${prefix}LoopMode`]: env.loopMode || 'cycle'
  };
}

// Serialize operator for worklet
function serializeOperator(op: ComplexMorphOperator, prefix: string): Record<string, unknown> {
  const e = op.envelopes;
  return {
    [`${prefix}Freq`]: op.freq,

    ...serializeEnvelope(e.pitch, `${prefix}Pitch`),
    [`${prefix}PitchRange`]: e.pitchRange,

    ...serializeEnvelope(e.index, `${prefix}Index`),
    [`${prefix}IndexMin`]: e.indexMin,
    [`${prefix}IndexMax`]: e.indexMax,

    ...serializeEnvelope(e.level, `${prefix}Level`),
    [`${prefix}LevelMax`]: e.levelMax
  };
}

// Deep clone helper
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class ComplexMorphVoice {
  private ctx: AudioContext;
  private output: GainNode;
  private workletNode: AudioWorkletNode | null = null;
  private params: ComplexMorphParams;
  private workletReady: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(ctx: AudioContext, destination?: AudioNode) {
    this.ctx = ctx;
    this.params = deepClone(DEFAULT_PARAMS);

    this.output = ctx.createGain();
    this.output.gain.value = this.params.gain;

    if (destination) {
      this.output.connect(destination);
    } else {
      this.output.connect(ctx.destination);
    }

    this.initPromise = this.initWorklet();
  }

  private async initWorklet(): Promise<void> {
    try {
      const base = import.meta.env.BASE_URL || '/';
      await this.ctx.audioWorklet.addModule(`${base}worklets/complex-morph-processor.js`);

      this.workletNode = new AudioWorkletNode(this.ctx, 'complex-morph-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      this.workletNode.connect(this.output);
      this.syncParamsToWorklet();
      this.workletReady = true;
    } catch (error) {
      console.error('Failed to initialize ComplexMorphVoice worklet:', error);
      this.workletReady = false;
    }
  }

  private async ensureReady(): Promise<boolean> {
    if (this.workletReady) return true;
    if (this.initPromise) {
      await this.initPromise;
    }
    return this.workletReady;
  }

  private syncParamsToWorklet(): void {
    if (!this.workletNode) return;

    const p = this.params;

    this.workletNode.port.postMessage({
      type: 'params',
      params: {
        carrierFreq: p.carrierFreq,
        ...serializeEnvelope(p.carrierPitchEnv, 'carrierPitch'),
        carrierPitchRange: p.carrierPitchRange,

        ...serializeOperator(p.opA, 'opA'),
        ...serializeOperator(p.opB, 'opB'),
        ...serializeOperator(p.opC, 'opC'),

        ...serializeEnvelope(p.ampEnv, 'amp'),

        notchFreq: p.notchFreq,
        notchQ: p.notchQ,
        ...serializeEnvelope(p.notchEnv, 'notch'),
        notchRange: p.notchRange,

        outputLevel: p.outputLevel
      }
    });
  }

  async trigger(_time: number, velocity: number = 1, paramLocks?: Partial<ComplexMorphParams> | Record<string, unknown>): Promise<void> {
    await this.ensureReady();

    if (!this.workletNode) {
      console.warn('ComplexMorphVoice: worklet not available');
      return;
    }

    if (paramLocks) {
      const tempParams = deepClone(this.params);
      const locks = paramLocks as Record<string, unknown>;

      // Handle nested structure (from direct ComplexMorphParams)
      if (locks.opA && typeof locks.opA === 'object') {
        tempParams.opA = { ...tempParams.opA, ...(locks.opA as Partial<ComplexMorphOperator>) };
      }
      if (locks.opB && typeof locks.opB === 'object') {
        tempParams.opB = { ...tempParams.opB, ...(locks.opB as Partial<ComplexMorphOperator>) };
      }
      if (locks.opC && typeof locks.opC === 'object') {
        tempParams.opC = { ...tempParams.opC, ...(locks.opC as Partial<ComplexMorphOperator>) };
      }

      // Handle flat p-lock keys (from modulation/sequencer p-lock system)
      // These are keyed like 'complexOpAPitchPeriod' and need to be applied to nested paths
      for (const [key, value] of Object.entries(locks)) {
        if (typeof value !== 'number') continue;
        this.applyFlatParamLock(tempParams, key, value);
      }

      const originalParams = this.params;
      this.params = tempParams;
      this.syncParamsToWorklet();
      this.params = originalParams;
    }

    this.workletNode.port.postMessage({
      type: 'trigger',
      velocity
    });
  }

  /**
   * Apply a flat p-lock key to the nested params structure
   * Maps keys like 'complexOpAPitchPeriod' to nested paths like opA.envelopes.pitch.period
   */
  private applyFlatParamLock(params: ComplexMorphParams, key: string, value: number): void {
    // Top-level params
    if (key === 'carrierFreq' || key === 'complexCarrierFreq') {
      params.carrierFreq = value;
    } else if (key === 'notchFreq' || key === 'complexNotchFreq') {
      params.notchFreq = value;
    } else if (key === 'notchQ' || key === 'complexNotchQ') {
      params.notchQ = value;
    } else if (key === 'outputLevel' || key === 'complexOutputLevel') {
      params.outputLevel = value;
    } else if (key === 'notchRange' || key === 'complexNotchRange') {
      params.notchRange = value;
    } else if (key === 'carrierPitchRange' || key === 'complexCarrierPitchRange') {
      params.carrierPitchRange = value;
    }
    // Carrier pitch envelope
    else if (key === 'complexCarrierPitchPeriod') {
      params.carrierPitchEnv.period = value;
    } else if (key === 'complexCarrierPitchAmount') {
      params.carrierPitchEnv.amount = value;
    }
    // Amp envelope
    else if (key === 'complexAmpPeriod') {
      params.ampEnv.period = value;
    } else if (key === 'complexAmpAmount') {
      params.ampEnv.amount = value;
    }
    // Notch envelope
    else if (key === 'complexNotchEnvPeriod') {
      params.notchEnv.period = value;
    } else if (key === 'complexNotchEnvAmount') {
      params.notchEnv.amount = value;
    }
    // Operator A envelopes
    else if (key === 'complexOpAPitchPeriod') {
      params.opA.envelopes.pitch.period = value;
    } else if (key === 'complexOpAPitchAmount') {
      params.opA.envelopes.pitch.amount = value;
    } else if (key === 'complexOpAPitchRange') {
      params.opA.envelopes.pitchRange = value;
    } else if (key === 'complexOpAIndexPeriod') {
      params.opA.envelopes.index.period = value;
    } else if (key === 'complexOpAIndexAmount') {
      params.opA.envelopes.index.amount = value;
    } else if (key === 'complexOpAIndexMin') {
      params.opA.envelopes.indexMin = value;
    } else if (key === 'complexOpAIndexMax') {
      params.opA.envelopes.indexMax = value;
    } else if (key === 'complexOpALevelPeriod') {
      params.opA.envelopes.level.period = value;
    } else if (key === 'complexOpALevelAmount') {
      params.opA.envelopes.level.amount = value;
    } else if (key === 'complexOpALevelMax') {
      params.opA.envelopes.levelMax = value;
    }
    // Operator B envelopes
    else if (key === 'complexOpBPitchPeriod') {
      params.opB.envelopes.pitch.period = value;
    } else if (key === 'complexOpBPitchAmount') {
      params.opB.envelopes.pitch.amount = value;
    } else if (key === 'complexOpBPitchRange') {
      params.opB.envelopes.pitchRange = value;
    } else if (key === 'complexOpBIndexPeriod') {
      params.opB.envelopes.index.period = value;
    } else if (key === 'complexOpBIndexAmount') {
      params.opB.envelopes.index.amount = value;
    } else if (key === 'complexOpBIndexMin') {
      params.opB.envelopes.indexMin = value;
    } else if (key === 'complexOpBIndexMax') {
      params.opB.envelopes.indexMax = value;
    } else if (key === 'complexOpBLevelPeriod') {
      params.opB.envelopes.level.period = value;
    } else if (key === 'complexOpBLevelAmount') {
      params.opB.envelopes.level.amount = value;
    } else if (key === 'complexOpBLevelMax') {
      params.opB.envelopes.levelMax = value;
    }
    // Operator C envelopes
    else if (key === 'complexOpCPitchPeriod') {
      params.opC.envelopes.pitch.period = value;
    } else if (key === 'complexOpCPitchAmount') {
      params.opC.envelopes.pitch.amount = value;
    } else if (key === 'complexOpCPitchRange') {
      params.opC.envelopes.pitchRange = value;
    } else if (key === 'complexOpCIndexPeriod') {
      params.opC.envelopes.index.period = value;
    } else if (key === 'complexOpCIndexAmount') {
      params.opC.envelopes.index.amount = value;
    } else if (key === 'complexOpCIndexMin') {
      params.opC.envelopes.indexMin = value;
    } else if (key === 'complexOpCIndexMax') {
      params.opC.envelopes.indexMax = value;
    } else if (key === 'complexOpCLevelPeriod') {
      params.opC.envelopes.level.period = value;
    } else if (key === 'complexOpCLevelAmount') {
      params.opC.envelopes.level.amount = value;
    } else if (key === 'complexOpCLevelMax') {
      params.opC.envelopes.levelMax = value;
    }
  }

  async release(): Promise<void> {
    await this.ensureReady();
    if (!this.workletNode) return;

    this.workletNode.port.postMessage({
      type: 'release'
    });
  }

  // Getters/setters for main params
  get carrierFreq(): number { return this.params.carrierFreq; }
  set carrierFreq(value: number) {
    this.params.carrierFreq = Math.max(20, Math.min(2000, value));
    this.syncParamsToWorklet();
  }

  get opA(): ComplexMorphOperator { return deepClone(this.params.opA); }
  set opA(value: Partial<ComplexMorphOperator>) {
    if (value.envelopes) {
      this.params.opA.envelopes = { ...this.params.opA.envelopes, ...value.envelopes };
    }
    const { envelopes, ...rest } = value;
    Object.assign(this.params.opA, rest);
    this.syncParamsToWorklet();
  }

  get opB(): ComplexMorphOperator { return deepClone(this.params.opB); }
  set opB(value: Partial<ComplexMorphOperator>) {
    if (value.envelopes) {
      this.params.opB.envelopes = { ...this.params.opB.envelopes, ...value.envelopes };
    }
    const { envelopes, ...rest } = value;
    Object.assign(this.params.opB, rest);
    this.syncParamsToWorklet();
  }

  get opC(): ComplexMorphOperator { return deepClone(this.params.opC); }
  set opC(value: Partial<ComplexMorphOperator>) {
    if (value.envelopes) {
      this.params.opC.envelopes = { ...this.params.opC.envelopes, ...value.envelopes };
    }
    const { envelopes, ...rest } = value;
    Object.assign(this.params.opC, rest);
    this.syncParamsToWorklet();
  }

  get notchFreq(): number { return this.params.notchFreq; }
  set notchFreq(value: number) {
    this.params.notchFreq = Math.max(20, Math.min(20000, value));
    this.syncParamsToWorklet();
  }

  get notchQ(): number { return this.params.notchQ; }
  set notchQ(value: number) {
    this.params.notchQ = Math.max(1, Math.min(30, value));
    this.syncParamsToWorklet();
  }

  get outputLevel(): number { return this.params.outputLevel; }
  set outputLevel(value: number) {
    this.params.outputLevel = Math.max(0, Math.min(1, value));
    this.syncParamsToWorklet();
  }

  get gain(): number { return this.params.gain; }
  set gain(value: number) {
    this.params.gain = Math.max(0, Math.min(1, value));
    this.output.gain.setValueAtTime(this.params.gain, this.ctx.currentTime);
  }

  getParams(): ComplexMorphParams {
    return deepClone(this.params);
  }

  setParams(params: Partial<ComplexMorphParams>): void {
    if (params.opA) {
      if (params.opA.envelopes) {
        this.params.opA.envelopes = { ...this.params.opA.envelopes, ...params.opA.envelopes };
      }
      const { envelopes, ...rest } = params.opA;
      Object.assign(this.params.opA, rest);
    }
    if (params.opB) {
      if (params.opB.envelopes) {
        this.params.opB.envelopes = { ...this.params.opB.envelopes, ...params.opB.envelopes };
      }
      const { envelopes, ...rest } = params.opB;
      Object.assign(this.params.opB, rest);
    }
    if (params.opC) {
      if (params.opC.envelopes) {
        this.params.opC.envelopes = { ...this.params.opC.envelopes, ...params.opC.envelopes };
      }
      const { envelopes, ...rest } = params.opC;
      Object.assign(this.params.opC, rest);
    }

    const { opA, opB, opC, ...topLevel } = params;
    Object.assign(this.params, topLevel);

    if (params.gain !== undefined) {
      this.output.gain.setValueAtTime(this.params.gain, this.ctx.currentTime);
    }

    this.syncParamsToWorklet();
  }

  loadPreset(presetName: keyof typeof COMPLEX_MORPH_PRESETS): void {
    const preset = COMPLEX_MORPH_PRESETS[presetName];
    if (preset) {
      // Reset to defaults first, then apply preset
      this.params = deepClone(DEFAULT_PARAMS);
      this.setParams(preset);
    }
  }

  setOperator(op: 'opA' | 'opB' | 'opC', params: Partial<ComplexMorphOperator>): void {
    if (params.envelopes) {
      this.params[op].envelopes = { ...this.params[op].envelopes, ...params.envelopes };
    }
    const { envelopes, ...rest } = params;
    Object.assign(this.params[op], rest);
    this.syncParamsToWorklet();
  }

  // Envelope-specific setters for UI
  setOperatorEnvelope(
    op: 'opA' | 'opB' | 'opC',
    envType: 'pitch' | 'index' | 'level',
    envelope: Partial<CyclingEnvelope>
  ): void {
    Object.assign(this.params[op].envelopes[envType], envelope);
    this.syncParamsToWorklet();
  }

  setCarrierPitchEnvelope(envelope: Partial<CyclingEnvelope>): void {
    Object.assign(this.params.carrierPitchEnv, envelope);
    this.syncParamsToWorklet();
  }

  setAmpEnvelope(envelope: Partial<CyclingEnvelope>): void {
    Object.assign(this.params.ampEnv, envelope);
    this.syncParamsToWorklet();
  }

  setNotchEnvelope(envelope: Partial<CyclingEnvelope>): void {
    Object.assign(this.params.notchEnv, envelope);
    this.syncParamsToWorklet();
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  getOutput(): GainNode {
    return this.output;
  }

  isReady(): boolean {
    return this.workletReady;
  }

  dispose(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.output.disconnect();
    this.workletReady = false;
  }
}

// Export helpers for creating envelopes
export { createFlatEnvelope, createSineEnvelope, createRampEnvelope };

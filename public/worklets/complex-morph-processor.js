/**
 * ComplexMorphProcessor - AudioWorklet for "The Structuralist" FM engine
 *
 * MULTI-BREAKPOINT LOOPING ENVELOPE architecture:
 * - Each envelope has 2-16 breakpoints defining a looping curve
 * - Envelopes cycle continuously with user-defined period
 * - Each segment has its own curve type (exp, linear, sharp, punch, swell, step)
 * - Phase-based cycling (not triggered ADSR)
 *
 * FM Topology: (Op A + Op B) → Op C → Carrier → Notch Filter
 */

// Curve type constants
const CURVE_EXP = 'exp';
const CURVE_LINEAR = 'linear';
const CURVE_SHARP = 'sharp';
const CURVE_PUNCH = 'punch';
const CURVE_SWELL = 'swell';
const CURVE_STEP = 'step';

// Loop mode constants
const LOOP_CYCLE = 'cycle';
const LOOP_ONESHOT = 'oneshot';
const LOOP_ONESHOT_HOLD = 'oneshot-hold';

class ComplexMorphProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Phase accumulators for oscillators
    this.carrierPhase = 0;
    this.opAPhase = 0;
    this.opBPhase = 0;
    this.opCPhase = 0;

    // Phase accumulators for cycling envelopes (0-1, wraps)
    this.envPhases = {
      carrierPitch: 0,
      opAPitch: 0, opAIndex: 0, opALevel: 0,
      opBPitch: 0, opBIndex: 0, opBLevel: 0,
      opCPitch: 0, opCIndex: 0, opCLevel: 0,
      amp: 0,
      notch: 0
    };

    // Default flat breakpoints
    const flatBreakpoints = [
      { time: 0, value: 0.5, curve: 'linear' },
      { time: 1, value: 0.5, curve: 'linear' }
    ];

    const fullBreakpoints = [
      { time: 0, value: 1, curve: 'linear' },
      { time: 1, value: 1, curve: 'linear' }
    ];

    // Envelope configurations (now with loopMode)
    this.envelopes = {
      carrierPitch: { breakpoints: [...flatBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      opAPitch: { breakpoints: [...flatBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      opAIndex: { breakpoints: [...flatBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      opALevel: { breakpoints: [...fullBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      opBPitch: { breakpoints: [...flatBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      opBIndex: { breakpoints: [...flatBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      opBLevel: { breakpoints: [...fullBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      opCPitch: { breakpoints: [...flatBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      opCIndex: { breakpoints: [...flatBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      opCLevel: { breakpoints: [...fullBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      amp: { breakpoints: [...fullBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE },
      notch: { breakpoints: [...flatBreakpoints], period: 1, amount: 1, enabled: true, loopMode: LOOP_CYCLE }
    };

    // Current parameters
    this.params = {
      carrierFreq: 110,
      carrierPitchRange: 50,

      opAFreq: 220,
      opAPitchRange: 100,
      opAIndexMin: 0,
      opAIndexMax: 10,
      opALevelMax: 1,

      opBFreq: 330,
      opBPitchRange: 100,
      opBIndexMin: 0,
      opBIndexMax: 10,
      opBLevelMax: 1,

      opCFreq: 165,
      opCPitchRange: 100,
      opCIndexMin: 0,
      opCIndexMax: 10,
      opCLevelMax: 1,

      notchFreq: 800,
      notchQ: 12,
      notchRange: 600,

      outputLevel: 0.7,

      // Voice state
      active: false,
      velocity: 1
    };

    // Notch filter state
    this.notchState = { x1: 0, x2: 0, y1: 0, y2: 0 };

    // Listen for messages
    this.port.onmessage = (event) => {
      if (event.data.type === 'params') {
        this.updateParams(event.data.params);
      } else if (event.data.type === 'trigger') {
        this.trigger(event.data.velocity ?? 1);
      } else if (event.data.type === 'release') {
        this.release();
      }
    };
  }

  /**
   * Update parameters from main thread
   */
  updateParams(params) {
    // Update simple params
    const simpleParams = [
      'carrierFreq', 'carrierPitchRange',
      'opAFreq', 'opAPitchRange', 'opAIndexMin', 'opAIndexMax', 'opALevelMax',
      'opBFreq', 'opBPitchRange', 'opBIndexMin', 'opBIndexMax', 'opBLevelMax',
      'opCFreq', 'opCPitchRange', 'opCIndexMin', 'opCIndexMax', 'opCLevelMax',
      'notchFreq', 'notchQ', 'notchRange', 'outputLevel'
    ];

    for (const key of simpleParams) {
      if (params[key] !== undefined) {
        this.params[key] = params[key];
      }
    }

    // Update envelope configurations
    const envMappings = [
      ['carrierPitch', 'carrierPitch'],
      ['opAPitch', 'opAPitch'], ['opAIndex', 'opAIndex'], ['opALevel', 'opALevel'],
      ['opBPitch', 'opBPitch'], ['opBIndex', 'opBIndex'], ['opBLevel', 'opBLevel'],
      ['opCPitch', 'opCPitch'], ['opCIndex', 'opCIndex'], ['opCLevel', 'opCLevel'],
      ['amp', 'amp'],
      ['notch', 'notch']
    ];

    for (const [envKey, paramPrefix] of envMappings) {
      if (params[`${paramPrefix}Breakpoints`]) {
        this.envelopes[envKey].breakpoints = params[`${paramPrefix}Breakpoints`];
      }
      if (params[`${paramPrefix}Period`] !== undefined) {
        this.envelopes[envKey].period = params[`${paramPrefix}Period`];
      }
      if (params[`${paramPrefix}Amount`] !== undefined) {
        this.envelopes[envKey].amount = params[`${paramPrefix}Amount`];
      }
      if (params[`${paramPrefix}Enabled`] !== undefined) {
        this.envelopes[envKey].enabled = params[`${paramPrefix}Enabled`];
      }
      if (params[`${paramPrefix}LoopMode`] !== undefined) {
        this.envelopes[envKey].loopMode = params[`${paramPrefix}LoopMode`];
      }
    }
  }

  /**
   * Trigger voice - resets envelope phases for sync
   */
  trigger(velocity) {
    this.params.active = true;
    this.params.velocity = velocity;

    // Reset all envelope phases to 0 for synchronized start
    for (const key in this.envPhases) {
      this.envPhases[key] = 0;
    }

    // Reset oscillator phases for consistent attack
    this.carrierPhase = 0;
    this.opAPhase = 0;
    this.opBPhase = 0;
    this.opCPhase = 0;
  }

  /**
   * Release voice
   */
  release() {
    this.params.active = false;
  }

  /**
   * Apply curve interpolation between two values
   * @param {number} t - Progress 0-1 within segment
   * @param {number} startVal - Start value
   * @param {number} endVal - End value
   * @param {string} curve - Curve type
   * @returns {number} Interpolated value
   */
  interpolate(t, startVal, endVal, curve) {
    const range = endVal - startVal;

    switch (curve) {
      case CURVE_LINEAR:
        return startVal + range * t;

      case CURVE_EXP:
        // Exponential: fast start, slow end (or vice versa)
        if (range >= 0) {
          return startVal + range * (1 - Math.pow(1 - t, 2.5));
        } else {
          return startVal + range * Math.pow(t, 2.5);
        }

      case CURVE_SHARP:
        // Sharp: very fast initial change
        return startVal + range * Math.pow(t, 0.4);

      case CURVE_PUNCH:
        // Punch: extremely fast attack, immediate
        return startVal + range * Math.pow(t, 0.15);

      case CURVE_SWELL:
        // Swell: slow start, accelerating
        return startVal + range * Math.pow(t, 2.5);

      case CURVE_STEP:
        // Step: immediate jump at end
        return t >= 1 ? endVal : startVal;

      default:
        return startVal + range * t;
    }
  }

  /**
   * Evaluate envelope at current phase
   * @param {Object} envelope - Envelope configuration
   * @param {number} phase - Current phase 0-1
   * @returns {number} Envelope value 0-1
   */
  evaluateEnvelope(envelope, phase) {
    if (!envelope.enabled) {
      return 0.5; // Neutral when disabled
    }

    const breakpoints = envelope.breakpoints;
    if (!breakpoints || breakpoints.length < 2) {
      return 0.5;
    }

    const loopMode = envelope.loopMode || LOOP_CYCLE;

    // For one-shot modes at phase >= 1, return the final breakpoint value
    if (loopMode !== LOOP_CYCLE && phase >= 1) {
      const lastBp = breakpoints[breakpoints.length - 1];
      const rawValue = lastBp.value;
      // Apply amount (bipolar)
      const centered = rawValue - 0.5;
      const scaled = 0.5 + centered * envelope.amount;
      return Math.max(0, Math.min(1, scaled));
    }

    // Find surrounding breakpoints
    let prevBp = breakpoints[0];
    let nextBp = breakpoints[1];

    for (let i = 1; i < breakpoints.length; i++) {
      if (breakpoints[i].time >= phase) {
        nextBp = breakpoints[i];
        prevBp = breakpoints[i - 1];
        break;
      }
      // If we've passed all breakpoints, wrap to last->first
      if (i === breakpoints.length - 1) {
        prevBp = breakpoints[i];
        nextBp = breakpoints[0];
      }
    }

    // Calculate progress within segment
    let segmentDuration = nextBp.time - prevBp.time;
    if (segmentDuration <= 0) {
      // Handle wrap-around case
      segmentDuration = (1 - prevBp.time) + nextBp.time;
    }

    let progress;
    if (phase >= prevBp.time && phase < nextBp.time) {
      progress = (phase - prevBp.time) / segmentDuration;
    } else if (segmentDuration > 0) {
      // Wrap around case
      if (phase >= prevBp.time) {
        progress = (phase - prevBp.time) / segmentDuration;
      } else {
        progress = ((1 - prevBp.time) + phase) / segmentDuration;
      }
    } else {
      progress = 0;
    }

    progress = Math.max(0, Math.min(1, progress));

    // Interpolate using the curve of the target breakpoint
    const rawValue = this.interpolate(progress, prevBp.value, nextBp.value, nextBp.curve);

    // Apply amount (bipolar)
    const centered = rawValue - 0.5; // -0.5 to 0.5
    const scaled = 0.5 + centered * envelope.amount;

    return Math.max(0, Math.min(1, scaled));
  }

  /**
   * Advance envelope phase based on loop mode
   * - 'cycle': loops forever (phase wraps from 1 to 0)
   * - 'oneshot': plays once then stays at 0 (end value)
   * - 'oneshot-hold': plays once then holds at final breakpoint value
   */
  advanceEnvelopePhase(envKey, dt) {
    const env = this.envelopes[envKey];
    if (env.period > 0) {
      const loopMode = env.loopMode || LOOP_CYCLE;

      if (loopMode === LOOP_CYCLE) {
        // Continuous cycling - wrap phase
        this.envPhases[envKey] += dt / env.period;
        this.envPhases[envKey] = this.envPhases[envKey] % 1;
      } else {
        // One-shot modes - don't wrap, clamp at 1
        if (this.envPhases[envKey] < 1) {
          this.envPhases[envKey] += dt / env.period;
          if (this.envPhases[envKey] > 1) {
            this.envPhases[envKey] = 1;
          }
        }
        // For 'oneshot', phase stays at 1, evaluateEnvelope returns last breakpoint value
        // For 'oneshot-hold', same behavior (hold at final value)
      }
    }
    return this.envPhases[envKey];
  }

  /**
   * Calculate notch filter coefficients
   */
  calculateNotchCoeffs(freq, Q, sampleRate) {
    const omega = 2 * Math.PI * freq / sampleRate;
    const cosOmega = Math.cos(omega);
    const sinOmega = Math.sin(omega);
    const alpha = sinOmega / (2 * Q);

    const b0 = 1;
    const b1 = -2 * cosOmega;
    const b2 = 1;
    const a0 = 1 + alpha;
    const a1 = -2 * cosOmega;
    const a2 = 1 - alpha;

    return {
      b0: b0 / a0, b1: b1 / a0, b2: b2 / a0,
      a1: a1 / a0, a2: a2 / a0
    };
  }

  /**
   * Apply notch filter
   */
  applyNotchFilter(input, coeffs) {
    const output = coeffs.b0 * input
                 + coeffs.b1 * this.notchState.x1
                 + coeffs.b2 * this.notchState.x2
                 - coeffs.a1 * this.notchState.y1
                 - coeffs.a2 * this.notchState.y2;

    this.notchState.x2 = this.notchState.x1;
    this.notchState.x1 = input;
    this.notchState.y2 = this.notchState.y1;
    this.notchState.y1 = output;

    return output;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const sampleRate = globalThis.sampleRate || 44100;
    const p = this.params;
    const dt = 1 / sampleRate;

    if (!p.active) {
      // Silence when not active
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].fill(0);
      }
      return true;
    }

    const numSamples = output[0]?.length || 128;
    const vel = p.velocity;

    for (let i = 0; i < numSamples; i++) {
      // Advance all envelope phases
      const carrierPitchPhase = this.advanceEnvelopePhase('carrierPitch', dt);
      const opAPitchPhase = this.advanceEnvelopePhase('opAPitch', dt);
      const opAIndexPhase = this.advanceEnvelopePhase('opAIndex', dt);
      const opALevelPhase = this.advanceEnvelopePhase('opALevel', dt);
      const opBPitchPhase = this.advanceEnvelopePhase('opBPitch', dt);
      const opBIndexPhase = this.advanceEnvelopePhase('opBIndex', dt);
      const opBLevelPhase = this.advanceEnvelopePhase('opBLevel', dt);
      const opCPitchPhase = this.advanceEnvelopePhase('opCPitch', dt);
      const opCIndexPhase = this.advanceEnvelopePhase('opCIndex', dt);
      const opCLevelPhase = this.advanceEnvelopePhase('opCLevel', dt);
      const ampPhase = this.advanceEnvelopePhase('amp', dt);
      const notchPhase = this.advanceEnvelopePhase('notch', dt);

      // Evaluate all envelopes (0-1 values)
      const carrierPitchEnv = this.evaluateEnvelope(this.envelopes.carrierPitch, carrierPitchPhase);
      const opAPitchEnv = this.evaluateEnvelope(this.envelopes.opAPitch, opAPitchPhase);
      const opAIndexEnv = this.evaluateEnvelope(this.envelopes.opAIndex, opAIndexPhase);
      const opALevelEnv = this.evaluateEnvelope(this.envelopes.opALevel, opALevelPhase);
      const opBPitchEnv = this.evaluateEnvelope(this.envelopes.opBPitch, opBPitchPhase);
      const opBIndexEnv = this.evaluateEnvelope(this.envelopes.opBIndex, opBIndexPhase);
      const opBLevelEnv = this.evaluateEnvelope(this.envelopes.opBLevel, opBLevelPhase);
      const opCPitchEnv = this.evaluateEnvelope(this.envelopes.opCPitch, opCPitchPhase);
      const opCIndexEnv = this.evaluateEnvelope(this.envelopes.opCIndex, opCIndexPhase);
      const opCLevelEnv = this.evaluateEnvelope(this.envelopes.opCLevel, opCLevelPhase);
      const ampEnv = this.evaluateEnvelope(this.envelopes.amp, ampPhase);
      const notchEnv = this.evaluateEnvelope(this.envelopes.notch, notchPhase);

      // Apply amp envelope
      const ampValue = ampEnv * vel;
      if (ampValue < 0.0001) {
        for (let channel = 0; channel < output.length; channel++) {
          output[channel][i] = 0;
        }
        continue;
      }

      // Calculate operator frequencies with pitch envelopes
      // Pitch envelope: 0.5 = no change, 0 = -range, 1 = +range
      const opAFreq = p.opAFreq + (opAPitchEnv - 0.5) * 2 * p.opAPitchRange;
      const opBFreq = p.opBFreq + (opBPitchEnv - 0.5) * 2 * p.opBPitchRange;
      const opCFreq = p.opCFreq + (opCPitchEnv - 0.5) * 2 * p.opCPitchRange;
      const carrierFreq = p.carrierFreq + (carrierPitchEnv - 0.5) * 2 * p.carrierPitchRange;

      // Calculate FM indices with index envelopes
      // Index envelope: 0 = min, 1 = max
      const opAIndex = p.opAIndexMin + opAIndexEnv * (p.opAIndexMax - p.opAIndexMin);
      const opBIndex = p.opBIndexMin + opBIndexEnv * (p.opBIndexMax - p.opBIndexMin);
      const opCIndex = p.opCIndexMin + opCIndexEnv * (p.opCIndexMax - p.opCIndexMin);

      // Calculate operator levels with level envelopes
      // Level envelope: 0-1 maps to 0-levelMax
      const opALevel = opALevelEnv * p.opALevelMax;
      const opBLevel = opBLevelEnv * p.opBLevelMax;
      const opCLevel = opCLevelEnv * p.opCLevelMax;

      // Generate Op A
      const opAOut = Math.sin(this.opAPhase * 2 * Math.PI) * opALevel;
      this.opAPhase = (this.opAPhase + Math.max(20, opAFreq) / sampleRate) % 1;

      // Generate Op B
      const opBOut = Math.sin(this.opBPhase * 2 * Math.PI) * opBLevel;
      this.opBPhase = (this.opBPhase + Math.max(20, opBFreq) / sampleRate) % 1;

      // Sum Op A + Op B for modulating Op C
      const summedMod = (opAOut + opBOut) * 0.5;

      // Generate Op C with FM from summed modulators
      const opCFreqModulated = Math.max(20, opCFreq + summedMod * opCIndex * opCFreq);
      const opCOut = Math.sin(this.opCPhase * 2 * Math.PI) * opCLevel;
      this.opCPhase = (this.opCPhase + opCFreqModulated / sampleRate) % 1;

      // Generate Carrier with FM from Op C
      const carrierFreqModulated = Math.max(20, carrierFreq + opCOut * opCIndex * carrierFreq * 0.5);
      const carrierOut = Math.sin(this.carrierPhase * 2 * Math.PI);
      this.carrierPhase = (this.carrierPhase + carrierFreqModulated / sampleRate) % 1;

      // Apply notch filter with envelope
      // Notch envelope: 0.5 = base freq, 0 = -range, 1 = +range
      const notchFreqModulated = Math.max(20, Math.min(20000,
        p.notchFreq + (notchEnv - 0.5) * 2 * p.notchRange
      ));
      const notchCoeffs = this.calculateNotchCoeffs(notchFreqModulated, p.notchQ, sampleRate);
      const filtered = this.applyNotchFilter(carrierOut, notchCoeffs);

      // Apply amp envelope and output level
      const finalOutput = filtered * ampValue * p.outputLevel;

      // Output to all channels
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = finalOutput;
      }
    }

    return true;
  }
}

registerProcessor('complex-morph-processor', ComplexMorphProcessor);

/**
 * Envelope - Multi-stage envelope generator
 *
 * Supports AD, AR, ADSR shapes with various curve types.
 * Works with Web Audio AudioParam for sample-accurate automation.
 */

export type EnvelopeType = 'ad' | 'ar' | 'adsr';
export type CurveType = 'linear' | 'exponential' | 'sharp';

export interface EnvelopeConfig {
  type: EnvelopeType;
  attack: number;           // seconds
  decay?: number;           // seconds (for AD, ADSR)
  sustain?: number;         // 0-1 level (for ADSR)
  release?: number;         // seconds (for AR, ADSR)
  curve: CurveType;
  peak?: number;            // peak level (default 1)
}

export interface EnvelopeStage {
  time: number;
  level: number;
  curve: CurveType;
}

const MIN_EXPONENTIAL_VALUE = 0.001;

/**
 * Applies an envelope to an AudioParam at a specific time
 */
export function applyEnvelope(
  param: AudioParam,
  config: EnvelopeConfig,
  startTime: number,
  velocity: number = 1,
  gateTime?: number  // For gated envelopes (ADSR)
): number {
  const peak = (config.peak ?? 1) * velocity;
  const stages = getEnvelopeStages(config, peak);

  // Cancel any scheduled values
  param.cancelScheduledValues(startTime);

  // Start at zero
  param.setValueAtTime(MIN_EXPONENTIAL_VALUE, startTime);

  let currentTime = startTime;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const targetTime = currentTime + stage.time;
    const targetValue = Math.max(stage.level, MIN_EXPONENTIAL_VALUE);

    // Handle sustain stage specially for ADSR
    if (config.type === 'adsr' && i === 2 && gateTime !== undefined) {
      // Sustain until gate release
      const sustainEnd = startTime + gateTime;
      param.setValueAtTime(targetValue, sustainEnd);
      currentTime = sustainEnd;
      continue;
    }

    applyRamp(param, targetValue, targetTime, stage.curve);
    currentTime = targetTime;
  }

  // Return the total envelope duration
  return currentTime - startTime;
}

/**
 * Creates a one-shot envelope (AD) - no gate needed
 */
export function applyOneShotEnvelope(
  param: AudioParam,
  attack: number,
  decay: number,
  startTime: number,
  velocity: number = 1,
  peak: number = 1,
  curve: CurveType = 'exponential'
): number {
  const config: EnvelopeConfig = {
    type: 'ad',
    attack,
    decay,
    curve,
    peak
  };
  return applyEnvelope(param, config, startTime, velocity);
}

/**
 * Applies a pitch envelope for drum transients
 */
export function applyPitchEnvelope(
  param: AudioParam,
  startPitch: number,
  endPitch: number,
  decayTime: number,
  startTime: number,
  curve: CurveType = 'exponential'
): void {
  param.cancelScheduledValues(startTime);
  param.setValueAtTime(startPitch, startTime);

  if (curve === 'exponential' && startPitch > 0 && endPitch > 0) {
    param.exponentialRampToValueAtTime(endPitch, startTime + decayTime);
  } else {
    param.linearRampToValueAtTime(endPitch, startTime + decayTime);
  }
}

/**
 * Get envelope stages based on type
 */
function getEnvelopeStages(config: EnvelopeConfig, peak: number): EnvelopeStage[] {
  const stages: EnvelopeStage[] = [];

  switch (config.type) {
    case 'ad':
      // Attack to peak
      stages.push({ time: config.attack, level: peak, curve: config.curve });
      // Decay to zero
      stages.push({ time: config.decay ?? 0.1, level: 0, curve: config.curve });
      break;

    case 'ar':
      // Attack to peak
      stages.push({ time: config.attack, level: peak, curve: config.curve });
      // Release to zero
      stages.push({ time: config.release ?? 0.1, level: 0, curve: config.curve });
      break;

    case 'adsr':
      // Attack to peak
      stages.push({ time: config.attack, level: peak, curve: config.curve });
      // Decay to sustain
      const sustainLevel = (config.sustain ?? 0.7) * peak;
      stages.push({ time: config.decay ?? 0.1, level: sustainLevel, curve: config.curve });
      // Sustain (placeholder - actual sustain time depends on gate)
      stages.push({ time: 0, level: sustainLevel, curve: 'linear' });
      // Release to zero
      stages.push({ time: config.release ?? 0.1, level: 0, curve: config.curve });
      break;
  }

  return stages;
}

/**
 * Apply a ramp to a parameter with the specified curve
 */
function applyRamp(
  param: AudioParam,
  targetValue: number,
  targetTime: number,
  curve: CurveType
): void {
  const safeTarget = Math.max(targetValue, MIN_EXPONENTIAL_VALUE);

  switch (curve) {
    case 'exponential':
      param.exponentialRampToValueAtTime(safeTarget, targetTime);
      break;

    case 'linear':
      param.linearRampToValueAtTime(safeTarget, targetTime);
      break;

    case 'sharp':
      // Sharp curve: fast initial movement, then slow
      // Approximate with setTargetAtTime
      const timeConstant = (targetTime - param.value) * 0.2;
      param.setTargetAtTime(safeTarget, param.value, Math.max(timeConstant, 0.001));
      break;
  }
}

/**
 * Envelope class for creating reusable envelope instances
 */
export class Envelope {
  private config: EnvelopeConfig;

  constructor(config: EnvelopeConfig) {
    this.config = { ...config };
  }

  apply(
    param: AudioParam,
    startTime: number,
    velocity: number = 1,
    gateTime?: number
  ): number {
    return applyEnvelope(param, this.config, startTime, velocity, gateTime);
  }

  get attack(): number { return this.config.attack; }
  set attack(value: number) { this.config.attack = Math.max(0.001, value); }

  get decay(): number { return this.config.decay ?? 0.1; }
  set decay(value: number) { this.config.decay = Math.max(0.001, value); }

  get sustain(): number { return this.config.sustain ?? 0.7; }
  set sustain(value: number) { this.config.sustain = Math.max(0, Math.min(1, value)); }

  get release(): number { return this.config.release ?? 0.1; }
  set release(value: number) { this.config.release = Math.max(0.001, value); }

  get curve(): CurveType { return this.config.curve; }
  set curve(value: CurveType) { this.config.curve = value; }

  get type(): EnvelopeType { return this.config.type; }

  getConfig(): EnvelopeConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<EnvelopeConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Get total duration of envelope (excluding sustain for ADSR)
   */
  getDuration(): number {
    switch (this.config.type) {
      case 'ad':
        return this.config.attack + (this.config.decay ?? 0.1);
      case 'ar':
        return this.config.attack + (this.config.release ?? 0.1);
      case 'adsr':
        // Doesn't include sustain time which is variable
        return this.config.attack + (this.config.decay ?? 0.1) + (this.config.release ?? 0.1);
    }
  }
}

/**
 * SaturationEffect
 * Culture Vulture-inspired saturation/distortion effect
 *
 * Features:
 * - Multiple saturation modes: tape, triode, pentode, transformer
 * - Drive control (0-1) with automatic gain compensation
 * - Bias control (-1 to +1) for asymmetric clipping
 * - Dry/wet mix control
 * - Harmonic emphasis: even, odd, or both
 * - Parallel wet/dry routing for transparent mixing
 */

export type SaturationMode = 'tape' | 'triode' | 'pentode' | 'transformer';
export type HarmonicEmphasis = 'even' | 'odd' | 'both';

export interface SaturationParams {
  mode: SaturationMode;
  drive: number;      // 0-1
  bias: number;       // -1 to 1
  mix: number;        // 0-1 (dry/wet)
  harmonics: HarmonicEmphasis;
}

export const DEFAULT_SATURATION_PARAMS: SaturationParams = {
  mode: 'tape',
  drive: 0,
  bias: 0,
  mix: 0,  // Default to 0 (bypassed) - user enables per track
  harmonics: 'even'
};

export class SaturationEffect {
  private ctx: AudioContext;

  // Nodes
  input: GainNode;
  output: GainNode;
  private inputGain: GainNode;
  private shaper: WaveShaperNode;
  private outputGain: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;

  // Parameters
  private mode: SaturationMode = 'tape';
  private drive: number = 0;
  private bias: number = 0;
  private mix: number = 1.0;
  private harmonics: HarmonicEmphasis = 'even';

  constructor(ctx: AudioContext, options: Partial<SaturationParams> = {}) {
    this.ctx = ctx;

    // === Input ===
    this.input = ctx.createGain();
    this.input.gain.value = 1.0;

    // === Saturation Parameters ===
    this.mode = options.mode || 'tape';
    this.drive = options.drive !== undefined ? options.drive : 0;
    this.bias = options.bias !== undefined ? options.bias : 0;
    this.mix = options.mix !== undefined ? options.mix : 1.0;
    this.harmonics = options.harmonics || 'even';

    // === Saturation Chain ===
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = 1.0;

    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '4x'; // High quality oversampling

    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1.0;

    // === Parallel Dry/Wet Routing ===
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 0;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 1.0;

    // === Output ===
    this.output = ctx.createGain();
    this.output.gain.value = 1.0;

    // === Signal Routing ===
    // Dry path: Input -> Dry Gain -> Output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path: Input -> Input Gain -> Shaper -> Output Gain -> Wet Gain -> Output
    this.input.connect(this.inputGain);
    this.inputGain.connect(this.shaper);
    this.shaper.connect(this.outputGain);
    this.outputGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Initialize waveshaping curve
    this.updateCurve();
  }

  /**
   * Set saturation mode
   */
  setMode(mode: SaturationMode): void {
    const validModes: SaturationMode[] = ['tape', 'triode', 'pentode', 'transformer'];
    if (!validModes.includes(mode)) {
      console.warn(`Invalid saturation mode: ${mode}. Using 'tape'.`);
      mode = 'tape';
    }

    this.mode = mode;
    this.updateCurve();
  }

  /**
   * Set drive amount
   */
  setDrive(drive: number): void {
    this.drive = Math.max(0, Math.min(1, drive));
    this.updateCurve();
  }

  /**
   * Set bias (asymmetric clipping)
   */
  setBias(bias: number): void {
    this.bias = Math.max(-1, Math.min(1, bias));
    this.updateCurve();
  }

  /**
   * Set dry/wet mix
   */
  setMix(mix: number): void {
    this.mix = Math.max(0, Math.min(1, mix));
    this.updateMix();
  }

  /**
   * Set harmonic emphasis
   */
  setHarmonics(harmonics: HarmonicEmphasis): void {
    const validHarmonics: HarmonicEmphasis[] = ['even', 'odd', 'both'];
    if (!validHarmonics.includes(harmonics)) {
      console.warn(`Invalid harmonics: ${harmonics}. Using 'even'.`);
      harmonics = 'even';
    }

    this.harmonics = harmonics;
    this.updateCurve();
  }

  /**
   * Set all parameters at once
   */
  setParams(params: Partial<SaturationParams>): void {
    if (params.mode !== undefined) this.mode = params.mode;
    if (params.drive !== undefined) this.drive = Math.max(0, Math.min(1, params.drive));
    if (params.bias !== undefined) this.bias = Math.max(-1, Math.min(1, params.bias));
    if (params.mix !== undefined) this.mix = Math.max(0, Math.min(1, params.mix));
    if (params.harmonics !== undefined) this.harmonics = params.harmonics;

    this.updateCurve();
  }

  /**
   * Get current parameters
   */
  getParams(): SaturationParams {
    return {
      mode: this.mode,
      drive: this.drive,
      bias: this.bias,
      mix: this.mix,
      harmonics: this.harmonics
    };
  }

  /**
   * Update the waveshaping curve based on current parameters
   */
  private updateCurve(): void {
    const samples = 2048;
    const curve = new Float32Array(samples);

    // Drive maps to pre-gain (1-20x)
    const preGain = 1 + this.drive * 19;

    for (let i = 0; i < samples; i++) {
      let x = (i * 2 / (samples - 1)) - 1;

      // Apply bias (DC offset before clipping)
      x += this.bias * 0.3;

      // Apply pre-gain
      x *= preGain;

      // Apply saturation formula based on mode
      let y: number;
      switch(this.mode) {
        case 'tape':
          y = this.tapeFormula(x);
          break;
        case 'triode':
          y = this.triodeFormula(x);
          break;
        case 'pentode':
          y = this.pentodeFormula(x);
          break;
        case 'transformer':
          y = this.transformerFormula(x);
          break;
        default:
          y = x;
      }

      // Remove bias from output
      y -= this.bias * 0.2;

      // Soft limit final output
      y = Math.tanh(y);

      curve[i] = y;
    }

    this.shaper.curve = curve;
    this.updateMix();
  }

  /**
   * Update dry/wet mix and gain compensation
   */
  private updateMix(): void {
    const now = this.ctx.currentTime;

    // Set dry/wet levels
    this.wetGain.gain.setTargetAtTime(this.mix, now, 0.01);
    this.dryGain.gain.setTargetAtTime(1 - this.mix, now, 0.01);

    // Gain compensation based on drive
    // As drive increases, reduce output gain to maintain perceived loudness
    const driveCompensation = 1 / (1 + this.drive * 0.3);
    this.outputGain.gain.setTargetAtTime(driveCompensation, now, 0.01);
  }

  /**
   * Tape saturation formula - gentle, musical compression
   */
  private tapeFormula(x: number): number {
    // Gentle arctan-based saturation
    let y = (2 / Math.PI) * Math.atan(x * 1.5);

    if (this.harmonics === 'even') {
      // Emphasize even harmonics (square the signal gently)
      y = Math.sign(y) * Math.pow(Math.abs(y), 0.8);
    } else if (this.harmonics === 'odd') {
      // Emphasize odd harmonics (cube the signal)
      y = Math.pow(y, 3) * 0.7 + y * 0.3;
    }

    return y;
  }

  /**
   * Triode tube formula - warm, asymmetric, even harmonics
   */
  private triodeFormula(x: number): number {
    let y: number;

    if (x > 0) {
      // Positive side: softer, more compressed
      y = 1.2 * x / (1 + Math.abs(x * 1.2));
    } else {
      // Negative side: slightly harder
      y = 1.5 * x / (1 + Math.abs(x * 1.5));
    }

    if (this.harmonics === 'even') {
      // Even harmonics: square law
      y = Math.sign(y) * Math.pow(Math.abs(y), 0.75);
    }

    return y * 0.9;
  }

  /**
   * Pentode tube formula - brighter, more aggressive
   */
  private pentodeFormula(x: number): number {
    // Sharper, more aggressive clipping
    let y = 1.8 * x / (1 + Math.pow(Math.abs(x), 1.5));

    if (this.harmonics === 'odd') {
      // Odd harmonics: add some cubic
      y = y * 0.7 + Math.pow(y, 3) * 0.3;
    }

    return y;
  }

  /**
   * Transformer saturation formula - thick, symmetric compression
   */
  private transformerFormula(x: number): number {
    // Symmetric, hard clipping with soft knee
    const knee = 0.5;
    let y: number;

    if (Math.abs(x) < knee) {
      y = x;
    } else {
      y = Math.sign(x) * (knee + (Math.abs(x) - knee) / (1 + Math.pow((Math.abs(x) - knee) * 2, 2)));
    }

    if (this.harmonics === 'both') {
      // Both even and odd
      y = y * 0.6 + Math.pow(y, 2) * Math.sign(y) * 0.2 + Math.pow(y, 3) * 0.2;
    }

    return y;
  }

  /**
   * Reset to default values
   */
  reset(): void {
    this.setMode('tape');
    this.setDrive(0);
    this.setBias(0);
    this.setMix(1.0);
    this.setHarmonics('even');
  }

  /**
   * Disconnect and cleanup
   */
  destroy(): void {
    this.input.disconnect();
    this.inputGain.disconnect();
    this.shaper.disconnect();
    this.outputGain.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.output.disconnect();
  }
}

// Saturation mode labels for UI
export const SATURATION_MODES: { mode: SaturationMode; label: string; description: string }[] = [
  { mode: 'tape', label: 'Tape', description: 'Gentle, musical compression' },
  { mode: 'triode', label: 'Triode', description: 'Warm, asymmetric tube' },
  { mode: 'pentode', label: 'Pentode', description: 'Brighter, aggressive tube' },
  { mode: 'transformer', label: 'Transformer', description: 'Thick, symmetric compression' }
];

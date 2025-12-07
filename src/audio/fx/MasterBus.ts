/**
 * MasterBus - Master output processing with gain staging and saturation
 *
 * Features:
 * - Input gain staging
 * - Soft clipper/saturator for warm limiting
 * - Output limiter for safety
 * - Master volume control
 * - Optional high-shelf for brightness control
 */

export interface MasterBusParams {
  // Gain staging
  inputGain: number;        // Input gain in dB (-12 to +12)
  outputGain: number;       // Output gain in dB (-inf to 0)

  // Saturation
  saturationAmount: number; // 0-1, amount of soft clipping
  saturationDrive: number;  // Pre-saturation drive in dB (0-18)

  // Tone
  highShelf: number;        // High shelf gain in dB (-6 to +6)
  highShelfFreq: number;    // High shelf frequency (2000-12000 Hz)

  // Limiter
  limiterEnabled: boolean;  // Enable brick-wall limiter
  limiterThreshold: number; // Limiter threshold in dB (-6 to 0)
}

const DEFAULT_PARAMS: MasterBusParams = {
  inputGain: 0,
  outputGain: 0,

  saturationAmount: 0.3,
  saturationDrive: 3,

  highShelf: 0,
  highShelfFreq: 6000,

  limiterEnabled: true,
  limiterThreshold: -0.5
};

export class MasterBus {
  private ctx: AudioContext;
  private params: MasterBusParams;

  // Audio nodes
  private inputGainNode: GainNode;
  private outputGainNode: GainNode;
  private driveGain: GainNode;
  private makeupGain: GainNode;
  private highShelfFilter: BiquadFilterNode;

  // Saturation via WaveShaper
  private waveshaper: WaveShaperNode;

  // Simple limiter using DynamicsCompressor
  private limiter: DynamicsCompressorNode;

  constructor(ctx: AudioContext, destination?: AudioNode) {
    this.ctx = ctx;
    this.params = { ...DEFAULT_PARAMS };

    // Create nodes
    this.inputGainNode = ctx.createGain();
    this.outputGainNode = ctx.createGain();
    this.driveGain = ctx.createGain();
    this.makeupGain = ctx.createGain();

    // High shelf EQ
    this.highShelfFilter = ctx.createBiquadFilter();
    this.highShelfFilter.type = 'highshelf';
    this.highShelfFilter.frequency.value = this.params.highShelfFreq;
    this.highShelfFilter.gain.value = this.params.highShelf;

    // Waveshaper for saturation
    this.waveshaper = ctx.createWaveShaper();
    this.waveshaper.oversample = '2x';
    this.updateSaturationCurve();

    // Limiter using compressor with fast attack
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = this.params.limiterThreshold;
    this.limiter.knee.value = 0; // Hard knee for limiting
    this.limiter.ratio.value = 20; // High ratio for limiting
    this.limiter.attack.value = 0.001; // 1ms attack
    this.limiter.release.value = 0.05; // 50ms release

    // Build the signal path
    this.buildGraph();
    this.updateParams();

    if (destination) {
      this.outputGainNode.connect(destination);
    }
  }

  private buildGraph(): void {
    // Signal path: input -> drive -> waveshaper -> makeup -> highshelf -> limiter -> output
    this.inputGainNode.connect(this.driveGain);
    this.driveGain.connect(this.waveshaper);
    this.waveshaper.connect(this.makeupGain);
    this.makeupGain.connect(this.highShelfFilter);
    this.highShelfFilter.connect(this.limiter);
    this.limiter.connect(this.outputGainNode);
  }

  /**
   * Generate a soft-clipping curve for the waveshaper
   * Uses tanh-based saturation for musical warmth
   */
  private updateSaturationCurve(): void {
    const samples = 8192;
    const curve = new Float32Array(samples);

    // Amount controls the shape: 0 = linear, 1 = heavy saturation
    const amount = this.params.saturationAmount;

    for (let i = 0; i < samples; i++) {
      // Input from -1 to 1
      const x = (i / (samples - 1)) * 2 - 1;

      if (amount <= 0) {
        // Linear (bypass)
        curve[i] = x;
      } else {
        // Blend between linear and tanh saturation
        // tanh provides soft clipping
        const k = amount * 3; // Scale factor for curve intensity
        const saturated = Math.tanh(x * (1 + k)) / Math.tanh(1 + k);
        curve[i] = x * (1 - amount) + saturated * amount;
      }
    }

    this.waveshaper.curve = curve;
  }

  private dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  }

  private updateParams(): void {
    const t = this.ctx.currentTime;

    // Input gain
    this.inputGainNode.gain.setTargetAtTime(
      this.dbToLinear(this.params.inputGain),
      t, 0.02
    );

    // Drive (pre-saturation boost)
    this.driveGain.gain.setTargetAtTime(
      this.dbToLinear(this.params.saturationDrive),
      t, 0.02
    );

    // Makeup gain (compensate for drive and saturation)
    const makeupDb = -this.params.saturationDrive * 0.6; // Rough compensation
    this.makeupGain.gain.setTargetAtTime(
      this.dbToLinear(makeupDb),
      t, 0.02
    );

    // High shelf
    this.highShelfFilter.frequency.setTargetAtTime(
      this.params.highShelfFreq,
      t, 0.02
    );
    this.highShelfFilter.gain.setTargetAtTime(
      this.params.highShelf,
      t, 0.02
    );

    // Limiter
    this.limiter.threshold.setTargetAtTime(
      this.params.limiterThreshold,
      t, 0.02
    );

    // Output gain
    this.outputGainNode.gain.setTargetAtTime(
      this.dbToLinear(this.params.outputGain),
      t, 0.02
    );

    // Update saturation curve
    this.updateSaturationCurve();
  }

  /**
   * Get the input node for this effect
   */
  get input(): GainNode {
    return this.inputGainNode;
  }

  /**
   * Get the output node for this effect
   */
  get output(): GainNode {
    return this.outputGainNode;
  }

  /**
   * Get current parameters
   */
  getParams(): MasterBusParams {
    return { ...this.params };
  }

  /**
   * Update parameters
   */
  setParams(params: Partial<MasterBusParams>): void {
    this.params = { ...this.params, ...params };
    this.updateParams();
  }

  /**
   * Get current gain reduction from limiter (for metering)
   */
  getGainReduction(): number {
    return this.limiter.reduction;
  }

  /**
   * Connect output to destination
   */
  connect(destination: AudioNode): void {
    this.outputGainNode.connect(destination);
  }

  /**
   * Disconnect from all destinations
   */
  disconnect(): void {
    this.outputGainNode.disconnect();
  }

  /**
   * Bypass/enable saturation
   */
  setSaturationEnabled(enabled: boolean): void {
    if (enabled) {
      this.setParams({ saturationAmount: this.params.saturationAmount || 0.3 });
    } else {
      this.setParams({ saturationAmount: 0 });
    }
  }

  /**
   * Bypass/enable limiter
   */
  setLimiterEnabled(enabled: boolean): void {
    this.params.limiterEnabled = enabled;
    if (enabled) {
      this.limiter.threshold.setTargetAtTime(
        this.params.limiterThreshold,
        this.ctx.currentTime, 0.02
      );
    } else {
      // Set threshold to 0 dB (effectively bypass)
      this.limiter.threshold.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.inputGainNode.disconnect();
    this.outputGainNode.disconnect();
    this.driveGain.disconnect();
    this.makeupGain.disconnect();
    this.highShelfFilter.disconnect();
    this.waveshaper.disconnect();
    this.limiter.disconnect();
  }
}

// Master bus presets
export const MASTER_PRESETS: Record<string, Partial<MasterBusParams>> = {
  clean: {
    inputGain: 0,
    saturationAmount: 0,
    saturationDrive: 0,
    highShelf: 0,
    outputGain: 0
  },

  warm: {
    inputGain: 0,
    saturationAmount: 0.3,
    saturationDrive: 3,
    highShelf: -1,
    outputGain: 0
  },

  punchy: {
    inputGain: 2,
    saturationAmount: 0.4,
    saturationDrive: 6,
    highShelf: 1,
    outputGain: -1
  },

  loud: {
    inputGain: 3,
    saturationAmount: 0.5,
    saturationDrive: 9,
    highShelf: 0,
    limiterThreshold: -1,
    outputGain: -0.5
  },

  vintage: {
    inputGain: 1,
    saturationAmount: 0.6,
    saturationDrive: 4,
    highShelf: -2,
    highShelfFreq: 8000,
    outputGain: 0
  }
};

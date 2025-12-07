/**
 * Reverb - Zita-style algorithmic reverb using AudioWorklet
 *
 * Based on Faust's Zita reverb (originally by Fons Adriaensen)
 * Known for its natural, high-quality room simulation
 *
 * Features:
 * - 8 parallel comb filters with Hadamard feedback matrix
 * - Frequency-dependent decay (separate low/mid RT60)
 * - High-frequency damping for natural air absorption
 * - True stereo processing
 * - Size and decay parameters for intuitive control
 */

export interface ReverbParams {
  // Space
  size: number;             // Room size 0-1 (affects pre-delay, damping, crossover)
  decay: number;            // Decay time 0-1 (maps to RT60)

  // Mix
  wetLevel: number;         // Wet signal level 0-1
  dryLevel: number;         // Dry signal level 0-1
}

const DEFAULT_PARAMS: ReverbParams = {
  size: 0.5,
  decay: 0.5,
  wetLevel: 1.0,
  dryLevel: 0
};

export class Reverb {
  private ctx: AudioContext;
  private params: ReverbParams;
  private workletReady = false;

  // Audio nodes
  private inputGain: GainNode;
  private outputGain: GainNode;

  // Zita reverb worklet node
  private workletNode: AudioWorkletNode | null = null;

  constructor(ctx: AudioContext, destination?: AudioNode) {
    this.ctx = ctx;
    this.params = { ...DEFAULT_PARAMS };

    // Create main nodes
    this.inputGain = ctx.createGain();
    this.outputGain = ctx.createGain();

    // Build initial graph (without worklet)
    this.buildInitialGraph();

    // Initialize the worklet asynchronously
    this.initWorklet();

    if (destination) {
      this.outputGain.connect(destination);
    }
  }

  private buildInitialGraph(): void {
    // Initial path: input -> output (bypass until worklet loads)
    this.inputGain.connect(this.outputGain);
  }

  private async initWorklet(): Promise<void> {
    try {
      const base = import.meta.env.BASE_URL || '/';
      await this.ctx.audioWorklet.addModule(`${base}worklets/zita-reverb-processor.js`);

      this.workletNode = new AudioWorkletNode(this.ctx, 'zita-reverb-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers'
      });

      // Rewire: disconnect input from output, insert worklet
      this.inputGain.disconnect();
      this.inputGain.connect(this.workletNode);
      this.workletNode.connect(this.outputGain);

      this.workletReady = true;

      // Apply current parameters
      this.updateParams();

    } catch (error) {
      console.error('Failed to load Zita reverb worklet:', error);
      // Keep the bypass path (input -> output)
      this.inputGain.connect(this.outputGain);
    }
  }

  private updateParams(): void {
    const t = this.ctx.currentTime;

    // Update worklet parameters
    if (this.workletNode && this.workletReady) {
      // Size parameter
      const sizeParam = this.workletNode.parameters.get('size');
      if (sizeParam) {
        sizeParam.setTargetAtTime(this.params.size, t, 0.05);
      }

      // Decay parameter
      const decayParam = this.workletNode.parameters.get('decay');
      if (decayParam) {
        decayParam.setTargetAtTime(this.params.decay, t, 0.05);
      }

      // Wet level
      const wetParam = this.workletNode.parameters.get('wetLevel');
      if (wetParam) {
        wetParam.setTargetAtTime(this.params.wetLevel, t, 0.05);
      }

      // Dry level
      const dryParam = this.workletNode.parameters.get('dryLevel');
      if (dryParam) {
        dryParam.setTargetAtTime(this.params.dryLevel, t, 0.05);
      }
    }
  }

  /**
   * Get the input node for this effect
   */
  get input(): GainNode {
    return this.inputGain;
  }

  /**
   * Get the output node for this effect
   */
  get output(): GainNode {
    return this.outputGain;
  }

  /**
   * Get current parameters
   */
  getParams(): ReverbParams {
    return { ...this.params };
  }

  /**
   * Update parameters
   */
  setParams(params: Partial<ReverbParams>): void {
    this.params = { ...this.params, ...params };
    this.updateParams();
  }

  /**
   * Connect output to destination
   */
  connect(destination: AudioNode): void {
    this.outputGain.connect(destination);
  }

  /**
   * Disconnect from all destinations
   */
  disconnect(): void {
    this.outputGain.disconnect();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.inputGain.disconnect();
    this.outputGain.disconnect();

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
  }
}

// Reverb presets - tuned for Zita reverb character
// Note: dryLevel should be 0 when used as a send effect
export const REVERB_PRESETS: Record<string, Partial<ReverbParams>> = {
  // Small spaces
  room: {
    size: 0.2,
    decay: 0.3,
    wetLevel: 1.0,
    dryLevel: 0
  },

  // Medium spaces
  hall: {
    size: 0.5,
    decay: 0.5,
    wetLevel: 1.0,
    dryLevel: 0
  },

  // Plate-like (small size, medium decay)
  plate: {
    size: 0.15,
    decay: 0.45,
    wetLevel: 1.0,
    dryLevel: 0
  },

  // Large spaces
  cathedral: {
    size: 0.9,
    decay: 0.8,
    wetLevel: 1.0,
    dryLevel: 0
  },

  // Bright, short
  bright: {
    size: 0.1,
    decay: 0.35,
    wetLevel: 1.0,
    dryLevel: 0
  },

  // Dark, warm
  dark: {
    size: 0.6,
    decay: 0.55,
    wetLevel: 1.0,
    dryLevel: 0
  },

  // Long ambient tail
  ambient: {
    size: 0.7,
    decay: 0.75,
    wetLevel: 1.0,
    dryLevel: 0
  },

  // Short, tight
  tight: {
    size: 0.1,
    decay: 0.15,
    wetLevel: 1.0,
    dryLevel: 0
  },

  // Very long decay
  infinite: {
    size: 0.85,
    decay: 0.95,
    wetLevel: 1.0,
    dryLevel: 0
  },

  // Ae-style long decay
  aeLong: {
    size: 0.8,
    decay: 0.85,
    wetLevel: 1.0,
    dryLevel: 0
  }
};

/**
 * FilterEffect - Per-channel filter with 4 selectable filter types
 *
 * Filter Types:
 * - bypass: No filtering (pass-through)
 * - threeSisters: Mannequins Three Sisters multi-mode SVF
 * - wasp: EDP Wasp-style dirty CMOS filter
 * - sem: Oberheim SEM state-variable filter
 * - moog: Moog ladder 24dB/oct transistor filter
 *
 * Each filter is implemented as an AudioWorklet for sample-accurate processing
 * with analog-style behavior modeling.
 */

export type FilterType = 'bypass' | 'threeSisters' | 'wasp' | 'sem' | 'moog';

// Three Sisters specific parameters
export interface ThreeSistersParams {
  freq: number;         // 0-1, center frequency
  span: number;         // 0-1, frequency spread for low/high
  quality: number;      // 0-1, resonance/anti-resonance
  mode: number;         // 0-1, crossover vs formant mode
  output: 'low' | 'centre' | 'high' | 'all';  // Which output to use
}

// Wasp specific parameters
export interface WaspParams {
  cutoff: number;       // 20-20000 Hz
  resonance: number;    // 0-1
  mode: number;         // 0=LP, 1=BP, 2=HP, 3=Notch
  drive: number;        // 0-1
  chaos: number;        // 0-1
}

// SEM specific parameters
export interface SEMParams {
  cutoff: number;       // 20-20000 Hz
  resonance: number;    // 0-1
  morph: number;        // -1 to 1 (LP -> Notch -> HP)
  drive: number;        // 0.1-10
}

// Moog specific parameters
export interface MoogParams {
  cutoff: number;       // 20-20000 Hz
  resonance: number;    // 0-1
  drive: number;        // 0-1
  warmth: number;       // 0-1
}

// Combined filter params
export interface FilterParams {
  type: FilterType;
  threeSisters: ThreeSistersParams;
  wasp: WaspParams;
  sem: SEMParams;
  moog: MoogParams;
}

export const DEFAULT_THREE_SISTERS_PARAMS: ThreeSistersParams = {
  freq: 0.5,
  span: 0.5,
  quality: 0.5,
  mode: 0,
  output: 'all'
};

export const DEFAULT_WASP_PARAMS: WaspParams = {
  cutoff: 1000,
  resonance: 0.5,
  mode: 0,
  drive: 0.5,
  chaos: 0.3
};

export const DEFAULT_SEM_PARAMS: SEMParams = {
  cutoff: 1000,
  resonance: 0,
  morph: 0,
  drive: 1
};

export const DEFAULT_MOOG_PARAMS: MoogParams = {
  cutoff: 1000,
  resonance: 0,
  drive: 0,
  warmth: 1
};

export const DEFAULT_FILTER_PARAMS: FilterParams = {
  type: 'bypass',
  threeSisters: { ...DEFAULT_THREE_SISTERS_PARAMS },
  wasp: { ...DEFAULT_WASP_PARAMS },
  sem: { ...DEFAULT_SEM_PARAMS },
  moog: { ...DEFAULT_MOOG_PARAMS }
};

// Filter type labels for UI
export const FILTER_TYPES: { type: FilterType; label: string; description: string }[] = [
  { type: 'bypass', label: 'Bypass', description: 'No filtering' },
  { type: 'threeSisters', label: 'Three Sisters', description: 'Mannequins multi-mode SVF' },
  { type: 'wasp', label: 'Wasp', description: 'EDP Wasp dirty CMOS filter' },
  { type: 'sem', label: 'SEM', description: 'Oberheim SEM state-variable' },
  { type: 'moog', label: 'Moog', description: 'Moog 24dB ladder filter' }
];

// Three Sisters output options
export const THREE_SISTERS_OUTPUTS: { value: ThreeSistersParams['output']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'centre', label: 'Centre' },
  { value: 'high', label: 'High' },
  { value: 'all', label: 'All' }
];

// Wasp filter modes
export const WASP_MODES: { value: number; label: string }[] = [
  { value: 0, label: 'LP' },
  { value: 1, label: 'BP' },
  { value: 2, label: 'HP' },
  { value: 3, label: 'Notch' }
];

export class FilterEffect {
  private ctx: AudioContext;

  // Nodes
  input: GainNode;
  output: GainNode;

  // Filter worklet nodes
  private threeSistersNode: AudioWorkletNode | null = null;
  private waspNode: AudioWorkletNode | null = null;
  private semNode: AudioWorkletNode | null = null;
  private moogNode: AudioWorkletNode | null = null;

  // Current bypass gain (for switching)
  private bypassGain: GainNode;

  // Parameters
  private params: FilterParams;
  private currentType: FilterType = 'bypass';

  // Worklet initialization tracking
  private workletsInitialized = false;

  constructor(ctx: AudioContext, options: Partial<FilterParams> = {}) {
    this.ctx = ctx;

    // Initialize params
    this.params = {
      type: options.type ?? 'bypass',
      threeSisters: { ...DEFAULT_THREE_SISTERS_PARAMS, ...options.threeSisters },
      wasp: { ...DEFAULT_WASP_PARAMS, ...options.wasp },
      sem: { ...DEFAULT_SEM_PARAMS, ...options.sem },
      moog: { ...DEFAULT_MOOG_PARAMS, ...options.moog }
    };

    // Create input/output nodes
    this.input = ctx.createGain();
    this.input.gain.value = 1.0;

    this.output = ctx.createGain();
    this.output.gain.value = 1.0;

    // Create bypass path
    this.bypassGain = ctx.createGain();
    this.bypassGain.gain.value = 1.0;

    // Initial bypass connection
    this.input.connect(this.bypassGain);
    this.bypassGain.connect(this.output);

    this.currentType = this.params.type;
  }

  /**
   * Initialize filter worklets - must be called after worklet modules are registered
   */
  async initWorklets(): Promise<void> {
    if (this.workletsInitialized) return;

    try {
      // Create Three Sisters node
      this.threeSistersNode = new AudioWorkletNode(this.ctx, 'three-sisters-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [4], // LOW, CENTRE, HIGH, ALL
        channelCount: 1,
        channelCountMode: 'explicit'
      });

      // Create Wasp node
      this.waspNode = new AudioWorkletNode(this.ctx, 'wasp-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit'
      });

      // Create SEM node
      this.semNode = new AudioWorkletNode(this.ctx, 'sem-filter-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 2,
        channelCountMode: 'clamped-max'
      });

      // Create Moog node
      this.moogNode = new AudioWorkletNode(this.ctx, 'moog-ladder-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 2,
        channelCountMode: 'clamped-max'
      });

      this.workletsInitialized = true;

      // Apply initial parameters
      this.updateThreeSistersParams(this.params.threeSisters);
      this.updateWaspParams(this.params.wasp);
      this.updateSEMParams(this.params.sem);
      this.updateMoogParams(this.params.moog);

      // Set up routing for current type
      this.setType(this.params.type);

    } catch (error) {
      console.error('[FilterEffect] Failed to initialize worklets:', error);
      // Fall back to bypass
      this.workletsInitialized = false;
    }
  }

  /**
   * Set filter type
   */
  setType(type: FilterType): void {
    if (this.currentType === type) return;

    // Disconnect current routing
    this.disconnectAll();

    this.currentType = type;
    this.params.type = type;

    // Set up new routing
    this.connectForType(type);
  }

  /**
   * Disconnect all filter paths
   */
  private disconnectAll(): void {
    try { this.input.disconnect(); } catch {}
    try { this.bypassGain.disconnect(); } catch {}
    try { this.threeSistersNode?.disconnect(); } catch {}
    try { this.waspNode?.disconnect(); } catch {}
    try { this.semNode?.disconnect(); } catch {}
    try { this.moogNode?.disconnect(); } catch {}
  }

  /**
   * Connect for a specific filter type
   */
  private connectForType(type: FilterType): void {
    switch (type) {
      case 'bypass':
        this.input.connect(this.bypassGain);
        this.bypassGain.connect(this.output);
        break;

      case 'threeSisters':
        if (this.threeSistersNode && this.workletsInitialized) {
          this.input.connect(this.threeSistersNode);
          // Three Sisters has 4 outputs - connect based on selected output
          this.connectThreeSistersOutput();
        } else {
          // Fallback to bypass
          this.input.connect(this.bypassGain);
          this.bypassGain.connect(this.output);
        }
        break;

      case 'wasp':
        if (this.waspNode && this.workletsInitialized) {
          this.input.connect(this.waspNode);
          this.waspNode.connect(this.output);
        } else {
          this.input.connect(this.bypassGain);
          this.bypassGain.connect(this.output);
        }
        break;

      case 'sem':
        if (this.semNode && this.workletsInitialized) {
          this.input.connect(this.semNode);
          this.semNode.connect(this.output);
        } else {
          this.input.connect(this.bypassGain);
          this.bypassGain.connect(this.output);
        }
        break;

      case 'moog':
        if (this.moogNode && this.workletsInitialized) {
          this.input.connect(this.moogNode);
          this.moogNode.connect(this.output);
        } else {
          this.input.connect(this.bypassGain);
          this.bypassGain.connect(this.output);
        }
        break;
    }
  }

  /**
   * Connect Three Sisters output based on selected output mode
   */
  private connectThreeSistersOutput(): void {
    if (!this.threeSistersNode) return;

    try { this.threeSistersNode.disconnect(); } catch {}

    // Three Sisters outputs: 0=LOW, 1=CENTRE, 2=HIGH, 3=ALL
    // We need a channel merger/splitter to handle the 4-channel output
    const outputIndex = this.getThreeSistersOutputIndex();

    // Create a splitter to access individual channels
    const splitter = this.ctx.createChannelSplitter(4);
    this.threeSistersNode.connect(splitter);

    // Connect the selected output channel to our mono output
    splitter.connect(this.output, outputIndex);
  }

  /**
   * Get Three Sisters output channel index
   */
  private getThreeSistersOutputIndex(): number {
    switch (this.params.threeSisters.output) {
      case 'low': return 0;
      case 'centre': return 1;
      case 'high': return 2;
      case 'all': return 3;
      default: return 3;
    }
  }

  /**
   * Update Three Sisters parameters
   */
  private updateThreeSistersParams(params: Partial<ThreeSistersParams>): void {
    if (!this.threeSistersNode) return;

    const p = this.threeSistersNode.parameters as Map<string, AudioParam>;

    if (params.freq !== undefined) {
      p.get('freq')?.setValueAtTime(params.freq, this.ctx.currentTime);
    }
    if (params.span !== undefined) {
      p.get('span')?.setValueAtTime(params.span, this.ctx.currentTime);
    }
    if (params.quality !== undefined) {
      p.get('quality')?.setValueAtTime(params.quality, this.ctx.currentTime);
    }
    if (params.mode !== undefined) {
      p.get('mode')?.setValueAtTime(params.mode, this.ctx.currentTime);
    }
    if (params.output !== undefined) {
      // Need to reconnect for output change
      if (this.currentType === 'threeSisters') {
        this.disconnectAll();
        this.connectForType('threeSisters');
      }
    }
  }

  /**
   * Update Wasp parameters
   */
  private updateWaspParams(params: Partial<WaspParams>): void {
    if (!this.waspNode) return;

    const p = this.waspNode.parameters as Map<string, AudioParam>;

    if (params.cutoff !== undefined) {
      p.get('cutoff')?.setValueAtTime(params.cutoff, this.ctx.currentTime);
    }
    if (params.resonance !== undefined) {
      p.get('resonance')?.setValueAtTime(params.resonance, this.ctx.currentTime);
    }
    if (params.mode !== undefined) {
      p.get('mode')?.setValueAtTime(params.mode, this.ctx.currentTime);
    }
    if (params.drive !== undefined) {
      p.get('drive')?.setValueAtTime(params.drive, this.ctx.currentTime);
    }
    if (params.chaos !== undefined) {
      p.get('chaos')?.setValueAtTime(params.chaos, this.ctx.currentTime);
    }
  }

  /**
   * Update SEM parameters
   */
  private updateSEMParams(params: Partial<SEMParams>): void {
    if (!this.semNode) return;

    const p = this.semNode.parameters as Map<string, AudioParam>;

    if (params.cutoff !== undefined) {
      p.get('cutoff')?.setValueAtTime(params.cutoff, this.ctx.currentTime);
    }
    if (params.resonance !== undefined) {
      p.get('resonance')?.setValueAtTime(params.resonance, this.ctx.currentTime);
    }
    if (params.morph !== undefined) {
      p.get('morph')?.setValueAtTime(params.morph, this.ctx.currentTime);
    }
    if (params.drive !== undefined) {
      p.get('drive')?.setValueAtTime(params.drive, this.ctx.currentTime);
    }
  }

  /**
   * Update Moog parameters
   */
  private updateMoogParams(params: Partial<MoogParams>): void {
    if (!this.moogNode) return;

    const p = this.moogNode.parameters as Map<string, AudioParam>;

    if (params.cutoff !== undefined) {
      p.get('cutoff')?.setValueAtTime(params.cutoff, this.ctx.currentTime);
    }
    if (params.resonance !== undefined) {
      p.get('resonance')?.setValueAtTime(params.resonance, this.ctx.currentTime);
    }
    if (params.drive !== undefined) {
      p.get('drive')?.setValueAtTime(params.drive, this.ctx.currentTime);
    }
    if (params.warmth !== undefined) {
      p.get('warmth')?.setValueAtTime(params.warmth, this.ctx.currentTime);
    }
  }

  /**
   * Set all parameters at once
   */
  setParams(params: Partial<FilterParams>): void {
    if (params.type !== undefined && params.type !== this.currentType) {
      this.setType(params.type);
    }

    if (params.threeSisters) {
      this.params.threeSisters = { ...this.params.threeSisters, ...params.threeSisters };
      this.updateThreeSistersParams(params.threeSisters);
    }

    if (params.wasp) {
      this.params.wasp = { ...this.params.wasp, ...params.wasp };
      this.updateWaspParams(params.wasp);
    }

    if (params.sem) {
      this.params.sem = { ...this.params.sem, ...params.sem };
      this.updateSEMParams(params.sem);
    }

    if (params.moog) {
      this.params.moog = { ...this.params.moog, ...params.moog };
      this.updateMoogParams(params.moog);
    }
  }

  /**
   * Get current parameters
   */
  getParams(): FilterParams {
    return {
      type: this.params.type,
      threeSisters: { ...this.params.threeSisters },
      wasp: { ...this.params.wasp },
      sem: { ...this.params.sem },
      moog: { ...this.params.moog }
    };
  }

  /**
   * Get current filter type
   */
  getType(): FilterType {
    return this.currentType;
  }

  /**
   * Check if worklets are initialized
   */
  isInitialized(): boolean {
    return this.workletsInitialized;
  }

  /**
   * Reset to default values
   */
  reset(): void {
    this.setParams(DEFAULT_FILTER_PARAMS);
  }

  /**
   * Disconnect and cleanup
   */
  destroy(): void {
    this.disconnectAll();
    this.input.disconnect();
    this.output.disconnect();
    this.bypassGain.disconnect();
    this.threeSistersNode?.disconnect();
    this.waspNode?.disconnect();
    this.semNode?.disconnect();
    this.moogNode?.disconnect();
  }
}

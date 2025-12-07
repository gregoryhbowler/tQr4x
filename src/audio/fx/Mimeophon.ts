/**
 * Mimeophon - Stereo delay effect inspired by Make Noise Mimeophon
 *
 * Features:
 * - 4 time zones (A: 5-50ms, B: 50-400ms, C: 0.4-2s, D: 2-10s)
 * - Rate control within each zone
 * - Micro-rate LFO modulation for chorus/flange effects
 * - Skew for stereo time offset
 * - Repeats (feedback) with soft saturation
 * - Color (tonal filtering in feedback)
 * - Halo (diffusion/reverb-like smearing)
 * - Hold (freeze buffer)
 * - Flip (reverse playback)
 * - Ping-pong stereo mode
 * - Swap (exchange L/R delay times)
 * - Wet/dry mix control
 */

export interface MimeophonParams {
  // Time control
  zone: number;              // 0-3 (A, B, C, D time zones)
  rate: number;              // 0-1 position within zone
  microRate: number;         // 0-1 LFO modulation amount
  microRateFreq: number;     // 0.1-8 Hz LFO frequency
  skew: number;              // -1 to 1, L/R time offset

  // Feedback
  repeats: number;           // 0-1.2 feedback amount
  color: number;             // 0-1 tonal character (dark to bright)
  halo: number;              // 0-1 diffusion amount

  // Mix
  mix: number;               // 0-1 wet/dry mix

  // Toggles
  hold: boolean;             // Freeze buffer
  flip: boolean;             // Reverse playback
  pingPong: boolean;         // Stereo ping-pong
  swap: boolean;             // Swap L/R delay times
}

const DEFAULT_PARAMS: MimeophonParams = {
  zone: 1,
  rate: 0.5,
  microRate: 0,
  microRateFreq: 2,
  skew: 0,
  repeats: 0.3,
  color: 0.5,
  halo: 0,
  mix: 0.0,
  hold: false,
  flip: false,
  pingPong: false,
  swap: false
};

// Time zones: min/max delay times in seconds
const ZONES = [
  { min: 0.005, max: 0.050 },  // Zone A: 5-50ms (karplus, flange)
  { min: 0.050, max: 0.400 },  // Zone B: 50-400ms (chorus, slapback)
  { min: 0.400, max: 2.000 },  // Zone C: 0.4-2s (standard delay)
  { min: 2.000, max: 10.000 }  // Zone D: 2-10s (ambient, looping)
];

export class Mimeophon {
  private ctx: AudioContext;
  private params: MimeophonParams;
  private node: AudioWorkletNode | null = null;
  private inputGain: GainNode;
  private outputGain: GainNode;
  private isReady = false;

  constructor(ctx: AudioContext, destination?: AudioNode) {
    this.ctx = ctx;
    this.params = { ...DEFAULT_PARAMS };

    // Create gain nodes for I/O
    this.inputGain = ctx.createGain();
    this.outputGain = ctx.createGain();

    // Connect to destination if provided
    if (destination) {
      this.outputGain.connect(destination);
    }

    // Initialize the worklet
    this.initWorklet();
  }

  private async initWorklet(): Promise<void> {
    try {
      // Register the processor
      await this.ctx.audioWorklet.addModule(this.getProcessorURL());

      // Create the worklet node
      this.node = new AudioWorkletNode(this.ctx, 'mimeophon-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          sampleRate: this.ctx.sampleRate
        }
      });

      // Connect: input -> worklet -> output
      this.inputGain.connect(this.node);
      this.node.connect(this.outputGain);

      this.isReady = true;

      // Apply initial parameters
      this.updateParams();
    } catch (error) {
      console.error('Failed to initialize Mimeophon:', error);
    }
  }

  private getProcessorURL(): string {
    const processorCode = `
// Mimeophon-Inspired Stereo Delay Processor
class MimeophonProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'zone', defaultValue: 1, minValue: 0, maxValue: 3 },
            { name: 'rate', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'microRate', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'microRateFreq', defaultValue: 2, minValue: 0.1, maxValue: 8 },
            { name: 'skew', defaultValue: 0, minValue: -1, maxValue: 1 },
            { name: 'repeats', defaultValue: 0.3, minValue: 0, maxValue: 1.2 },
            { name: 'color', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'halo', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'mix', defaultValue: 0.0, minValue: 0, maxValue: 1 },
            { name: 'hold', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'flip', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'pingPong', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'swap', defaultValue: 0, minValue: 0, maxValue: 1 }
        ];
    }

    constructor(options) {
        super();

        this.sampleRate = options.processorOptions?.sampleRate || 48000;

        const maxDelaySamples = Math.ceil(this.sampleRate * 10);
        this.bufferL = new Float32Array(maxDelaySamples);
        this.bufferR = new Float32Array(maxDelaySamples);
        this.writeIndex = 0;
        this.bufferSize = maxDelaySamples;

        this.zones = [
            { min: 0.005, max: 0.050 },
            { min: 0.050, max: 0.400 },
            { min: 0.400, max: 2.000 },
            { min: 2.000, max: 10.000 }
        ];

        this.delayTimeL = 0.1;
        this.delayTimeR = 0.1;
        this.targetDelayTimeL = 0.1;
        this.targetDelayTimeR = 0.1;
        this.lfoPhase = 0;

        this.filterStateL = this.createFilterState();
        this.filterStateR = this.createFilterState();
        this.haloStateL = this.createHaloState();
        this.haloStateR = this.createHaloState();

        this.feedbackL = 0;
        this.feedbackR = 0;
        this.holdActive = false;
        this.holdBufferL = new Float32Array(maxDelaySamples);
        this.holdBufferR = new Float32Array(maxDelaySamples);
        this.flipActive = false;
        this.crossfadeActive = false;
        this.crossfadeProgress = 0;
        this.crossfadeDuration = 0.02;
        this.prevZone = 1;
        this.prevRate = 0.5;
        this.pingPongPhase = 0;
    }

    createFilterState() {
        return {
            b1: { x1: 0, x2: 0, y1: 0, y2: 0 },
            b2: { x1: 0, x2: 0, y1: 0, y2: 0 },
            coefs1: { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 },
            coefs2: { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
        };
    }

    createHaloState() {
        return {
            buffers: [
                new Float32Array(1307),
                new Float32Array(1811),
                new Float32Array(2473),
                new Float32Array(3181)
            ],
            indices: [0, 0, 0, 0],
            g: [0.6, 0.55, 0.5, 0.45]
        };
    }

    getDelayTime(zone, rate) {
        const z = Math.floor(zone);
        const zoneData = this.zones[Math.min(z, 3)];
        return zoneData.min + rate * (zoneData.max - zoneData.min);
    }

    readBuffer(buffer, delaySamples) {
        const size = this.bufferSize;
        const readPos = (this.writeIndex - delaySamples + size) % size;
        const readIndex = Math.floor(readPos);
        const frac = readPos - readIndex;
        const idx1 = readIndex % size;
        const idx2 = (readIndex + 1) % size;
        return buffer[idx1] * (1 - frac) + buffer[idx2] * frac;
    }

    readBufferReverse(buffer, delaySamples) {
        const size = this.bufferSize;
        const readPos = (this.writeIndex + delaySamples) % size;
        const readIndex = Math.floor(readPos);
        const frac = readPos - readIndex;
        const idx1 = readIndex % size;
        const idx2 = (readIndex + 1) % size;
        return buffer[idx1] * (1 - frac) + buffer[idx2] * frac;
    }

    softSaturate(x) {
        if (x > 1) return 1 - Math.exp(-(x - 1));
        if (x < -1) return -1 + Math.exp(x + 1);
        return x;
    }

    asymmetricSaturate(x, bias = 0.3) {
        const shifted = x + bias;
        return Math.tanh(shifted * 1.5) - Math.tanh(bias * 1.5);
    }

    updateColorFilter(color, filterState) {
        if (color < 0.2) {
            const freq = 4000 + color * 5 * 7000;
            this.setLowpass(filterState.coefs1, freq, 0.707);
            this.setLowpass(filterState.coefs2, freq * 0.5, 0.707);
        } else if (color < 0.4) {
            const t = (color - 0.2) / 0.2;
            const freq = 4000 + t * 6000;
            this.setLowpass(filterState.coefs1, freq, 1.5);
            this.setBandpass(filterState.coefs2, 2000, 2);
        } else if (color < 0.6) {
            const t = (color - 0.4) / 0.2;
            const freq = 8000 - t * 2000;
            this.setHighShelf(filterState.coefs1, freq, -3, 0.707);
            this.setLowpass(filterState.coefs2, 12000, 0.707);
        } else if (color < 0.8) {
            const t = (color - 0.6) / 0.2;
            this.setHighShelf(filterState.coefs1, 8000, t * 2, 0.707);
            this.setAllpass(filterState.coefs2, 0);
        } else {
            const t = (color - 0.8) / 0.2;
            this.setHighShelf(filterState.coefs1, 6000, 3 + t * 2, 0.707);
            this.setPeaking(filterState.coefs2, 3000, 2, 1.5);
        }
    }

    setLowpass(coefs, freq, Q) {
        const w0 = 2 * Math.PI * freq / this.sampleRate;
        const cosw0 = Math.cos(w0);
        const sinw0 = Math.sin(w0);
        const alpha = sinw0 / (2 * Q);
        const b0 = (1 - cosw0) / 2;
        const b1 = 1 - cosw0;
        const b2 = (1 - cosw0) / 2;
        const a0 = 1 + alpha;
        const a1 = -2 * cosw0;
        const a2 = 1 - alpha;
        coefs.b0 = b0 / a0;
        coefs.b1 = b1 / a0;
        coefs.b2 = b2 / a0;
        coefs.a1 = a1 / a0;
        coefs.a2 = a2 / a0;
    }

    setHighShelf(coefs, freq, gainDB, Q) {
        const A = Math.pow(10, gainDB / 40);
        const w0 = 2 * Math.PI * freq / this.sampleRate;
        const cosw0 = Math.cos(w0);
        const sinw0 = Math.sin(w0);
        const alpha = sinw0 / (2 * Q);
        const b0 = A * ((A + 1) + (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha);
        const b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
        const b2 = A * ((A + 1) + (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha);
        const a0 = (A + 1) - (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha;
        const a1 = 2 * ((A - 1) - (A + 1) * cosw0);
        const a2 = (A + 1) - (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha;
        coefs.b0 = b0 / a0;
        coefs.b1 = b1 / a0;
        coefs.b2 = b2 / a0;
        coefs.a1 = a1 / a0;
        coefs.a2 = a2 / a0;
    }

    setBandpass(coefs, freq, Q) {
        const w0 = 2 * Math.PI * freq / this.sampleRate;
        const cosw0 = Math.cos(w0);
        const sinw0 = Math.sin(w0);
        const alpha = sinw0 / (2 * Q);
        const b0 = alpha;
        const b1 = 0;
        const b2 = -alpha;
        const a0 = 1 + alpha;
        const a1 = -2 * cosw0;
        const a2 = 1 - alpha;
        coefs.b0 = b0 / a0;
        coefs.b1 = b1 / a0;
        coefs.b2 = b2 / a0;
        coefs.a1 = a1 / a0;
        coefs.a2 = a2 / a0;
    }

    setPeaking(coefs, freq, gainDB, Q) {
        const A = Math.pow(10, gainDB / 40);
        const w0 = 2 * Math.PI * freq / this.sampleRate;
        const cosw0 = Math.cos(w0);
        const sinw0 = Math.sin(w0);
        const alpha = sinw0 / (2 * Q);
        const b0 = 1 + alpha * A;
        const b1 = -2 * cosw0;
        const b2 = 1 - alpha * A;
        const a0 = 1 + alpha / A;
        const a1 = -2 * cosw0;
        const a2 = 1 - alpha / A;
        coefs.b0 = b0 / a0;
        coefs.b1 = b1 / a0;
        coefs.b2 = b2 / a0;
        coefs.a1 = a1 / a0;
        coefs.a2 = a2 / a0;
    }

    setAllpass(coefs, freq) {
        if (freq === 0) {
            coefs.b0 = 1;
            coefs.b1 = 0;
            coefs.b2 = 0;
            coefs.a1 = 0;
            coefs.a2 = 0;
        } else {
            const w0 = 2 * Math.PI * freq / this.sampleRate;
            const cosw0 = Math.cos(w0);
            const sinw0 = Math.sin(w0);
            const alpha = sinw0 / 2;
            const b0 = 1 - alpha;
            const b1 = -2 * cosw0;
            const b2 = 1 + alpha;
            const a0 = 1 + alpha;
            const a1 = -2 * cosw0;
            const a2 = 1 - alpha;
            coefs.b0 = b0 / a0;
            coefs.b1 = b1 / a0;
            coefs.b2 = b2 / a0;
            coefs.a1 = a1 / a0;
            coefs.a2 = a2 / a0;
        }
    }

    processBiquad(input, state, coefs) {
        const output = coefs.b0 * input +
                      coefs.b1 * state.x1 +
                      coefs.b2 * state.x2 -
                      coefs.a1 * state.y1 -
                      coefs.a2 * state.y2;
        state.x2 = state.x1;
        state.x1 = input;
        state.y2 = state.y1;
        state.y1 = output;
        return output;
    }

    processHalo(input, haloState, amount) {
        if (amount < 0.001) return input;
        let signal = input;
        for (let i = 0; i < 4; i++) {
            const buffer = haloState.buffers[i];
            const index = haloState.indices[i];
            const g = haloState.g[i] * amount;
            const delayed = buffer[index];
            const output = -g * signal + delayed;
            buffer[index] = signal + g * output;
            haloState.indices[i] = (index + 1) % buffer.length;
            signal = output;
        }
        const wetMix = 0.5 + amount * 0.4;
        const dryMix = 1.0 - wetMix;
        return signal * wetMix + input * dryMix;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || !output || !input[0]) {
            return true;
        }

        const inputL = input[0];
        const inputR = input[1] || input[0];
        const outputL = output[0];
        const outputR = output[1] || output[0];
        const blockSize = outputL.length;

        const getParam = (param, index) => {
            return param.length > 1 ? param[index] : param[0];
        };

        for (let i = 0; i < blockSize; i++) {
            const zone = getParam(parameters.zone, i);
            const rate = getParam(parameters.rate, i);
            const microRate = getParam(parameters.microRate, i);
            const microRateFreq = getParam(parameters.microRateFreq, i);
            const skew = getParam(parameters.skew, i);
            const repeats = getParam(parameters.repeats, i);
            const color = getParam(parameters.color, i);
            const halo = getParam(parameters.halo, i);
            const mix = getParam(parameters.mix, i);
            const hold = getParam(parameters.hold, i);
            const flip = getParam(parameters.flip, i);
            const pingPong = getParam(parameters.pingPong, i);
            const swap = getParam(parameters.swap, i);

            const holdNow = hold > 0.5;
            if (holdNow && !this.holdActive) {
                this.holdBufferL.set(this.bufferL);
                this.holdBufferR.set(this.bufferR);
                this.holdActive = true;
            } else if (!holdNow && this.holdActive) {
                this.holdActive = false;
            }

            this.flipActive = flip > 0.5;

            const baseDelayTime = this.getDelayTime(zone, rate);

            this.lfoPhase += 2 * Math.PI * microRateFreq / this.sampleRate;
            if (this.lfoPhase > 2 * Math.PI) this.lfoPhase -= 2 * Math.PI;
            const lfoValue = Math.sin(this.lfoPhase);
            const microRateOffset = lfoValue * microRate * 0.015;

            const skewAmount = skew * baseDelayTime * 0.5;
            this.targetDelayTimeL = baseDelayTime - skewAmount + microRateOffset;
            this.targetDelayTimeR = baseDelayTime + skewAmount + microRateOffset;

            if (swap > 0.5) {
                [this.targetDelayTimeL, this.targetDelayTimeR] =
                    [this.targetDelayTimeR, this.targetDelayTimeL];
            }

            const smoothingCoef = 0.999;
            this.delayTimeL = this.delayTimeL * smoothingCoef +
                             this.targetDelayTimeL * (1 - smoothingCoef);
            this.delayTimeR = this.delayTimeR * smoothingCoef +
                             this.targetDelayTimeR * (1 - smoothingCoef);

            const delayL = Math.max(0.001, this.delayTimeL) * this.sampleRate;
            const delayR = Math.max(0.001, this.delayTimeR) * this.sampleRate;

            let delayedL, delayedR;

            if (this.holdActive) {
                if (this.flipActive) {
                    delayedL = this.readBufferReverse(this.holdBufferL, delayL);
                    delayedR = this.readBufferReverse(this.holdBufferR, delayR);
                } else {
                    delayedL = this.readBuffer(this.holdBufferL, delayL);
                    delayedR = this.readBuffer(this.holdBufferR, delayR);
                }
            } else {
                if (this.flipActive) {
                    delayedL = this.readBufferReverse(this.bufferL, delayL);
                    delayedR = this.readBufferReverse(this.bufferR, delayR);
                } else {
                    delayedL = this.readBuffer(this.bufferL, delayL);
                    delayedR = this.readBuffer(this.bufferR, delayR);
                }
            }

            if (pingPong > 0.5) {
                const temp = delayedL;
                delayedL = this.feedbackR;
                delayedR = this.feedbackL;
            }

            this.updateColorFilter(color, this.filterStateL);
            this.updateColorFilter(color, this.filterStateR);

            let coloredL = this.processBiquad(delayedL, this.filterStateL.b1,
                                             this.filterStateL.coefs1);
            coloredL = this.processBiquad(coloredL, this.filterStateL.b2,
                                         this.filterStateL.coefs2);

            let coloredR = this.processBiquad(delayedR, this.filterStateR.b1,
                                             this.filterStateR.coefs1);
            coloredR = this.processBiquad(coloredR, this.filterStateR.b2,
                                         this.filterStateR.coefs2);

            const haloedL = this.processHalo(coloredL, this.haloStateL, halo);
            const haloedR = this.processHalo(coloredR, this.haloStateR, halo);

            let saturatedL, saturatedR;
            if (color < 0.6) {
                saturatedL = this.asymmetricSaturate(haloedL * 1.5, 0.2);
                saturatedR = this.asymmetricSaturate(haloedR * 1.5, 0.2);
            } else {
                saturatedL = this.softSaturate(haloedL * 1.2);
                saturatedR = this.softSaturate(haloedR * 1.2);
            }

            const feedbackAmount = Math.min(1.1, repeats);
            this.feedbackL = saturatedL * feedbackAmount;
            this.feedbackR = saturatedR * feedbackAmount;

            if (!this.holdActive) {
                this.bufferL[this.writeIndex] = inputL[i] + this.feedbackL * 0.9;
                this.bufferR[this.writeIndex] = inputR[i] + this.feedbackR * 0.9;
                this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
            }

            outputL[i] = inputL[i] * (1 - mix) + saturatedL * mix;
            outputR[i] = inputR[i] * (1 - mix) + saturatedR * mix;
        }

        return true;
    }
}

registerProcessor('mimeophon-processor', MimeophonProcessor);
    `;

    const blob = new Blob([processorCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  private updateParams(): void {
    if (!this.isReady || !this.node) return;

    const t = this.ctx.currentTime;
    const params = this.node.parameters;

    // Set all parameters
    params.get('zone')?.setValueAtTime(this.params.zone, t);
    params.get('rate')?.setValueAtTime(this.params.rate, t);
    params.get('microRate')?.setValueAtTime(this.params.microRate, t);
    params.get('microRateFreq')?.setValueAtTime(this.params.microRateFreq, t);
    params.get('skew')?.setValueAtTime(this.params.skew, t);
    params.get('repeats')?.setValueAtTime(this.params.repeats, t);
    params.get('color')?.setValueAtTime(this.params.color, t);
    params.get('halo')?.setValueAtTime(this.params.halo, t);
    params.get('mix')?.setValueAtTime(this.params.mix, t);
    params.get('hold')?.setValueAtTime(this.params.hold ? 1 : 0, t);
    params.get('flip')?.setValueAtTime(this.params.flip ? 1 : 0, t);
    params.get('pingPong')?.setValueAtTime(this.params.pingPong ? 1 : 0, t);
    params.get('swap')?.setValueAtTime(this.params.swap ? 1 : 0, t);
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
  getParams(): MimeophonParams {
    return { ...this.params };
  }

  /**
   * Update parameters
   */
  setParams(params: Partial<MimeophonParams>): void {
    this.params = { ...this.params, ...params };
    this.updateParams();
  }

  /**
   * Set zone (0-3)
   */
  setZone(zone: number): void {
    this.params.zone = Math.max(0, Math.min(3, Math.floor(zone)));
    this.updateParams();
  }

  /**
   * Set rate within zone (0-1)
   */
  setRate(rate: number): void {
    this.params.rate = Math.max(0, Math.min(1, rate));
    this.updateParams();
  }

  /**
   * Set delay time in seconds (automatically selects zone and rate)
   */
  setDelayTime(seconds: number): void {
    let zone: number;
    let rate: number;

    if (seconds < ZONES[0].max) {
      zone = 0;
      rate = (seconds - ZONES[0].min) / (ZONES[0].max - ZONES[0].min);
    } else if (seconds < ZONES[1].max) {
      zone = 1;
      rate = (seconds - ZONES[1].min) / (ZONES[1].max - ZONES[1].min);
    } else if (seconds < ZONES[2].max) {
      zone = 2;
      rate = (seconds - ZONES[2].min) / (ZONES[2].max - ZONES[2].min);
    } else {
      zone = 3;
      rate = (seconds - ZONES[3].min) / (ZONES[3].max - ZONES[3].min);
    }

    this.params.zone = zone;
    this.params.rate = Math.max(0, Math.min(1, rate));
    this.updateParams();
  }

  /**
   * Get current delay time in seconds
   */
  getDelayTime(): number {
    const zone = ZONES[Math.min(Math.floor(this.params.zone), 3)];
    return zone.min + this.params.rate * (zone.max - zone.min);
  }

  /**
   * Set micro-rate LFO amount (0-1)
   */
  setMicroRate(amount: number): void {
    this.params.microRate = Math.max(0, Math.min(1, amount));
    this.updateParams();
  }

  /**
   * Set micro-rate LFO frequency (0.1-8 Hz)
   */
  setMicroRateFreq(freq: number): void {
    this.params.microRateFreq = Math.max(0.1, Math.min(8, freq));
    this.updateParams();
  }

  /**
   * Set skew (-1 to 1)
   */
  setSkew(skew: number): void {
    this.params.skew = Math.max(-1, Math.min(1, skew));
    this.updateParams();
  }

  /**
   * Set repeats/feedback (0-1.2)
   */
  setRepeats(repeats: number): void {
    this.params.repeats = Math.max(0, Math.min(1.2, repeats));
    this.updateParams();
  }

  /**
   * Set color (0-1)
   */
  setColor(color: number): void {
    this.params.color = Math.max(0, Math.min(1, color));
    this.updateParams();
  }

  /**
   * Set halo/diffusion (0-1)
   */
  setHalo(halo: number): void {
    this.params.halo = Math.max(0, Math.min(1, halo));
    this.updateParams();
  }

  /**
   * Set wet/dry mix (0-1)
   */
  setMix(mix: number): void {
    this.params.mix = Math.max(0, Math.min(1, mix));
    this.updateParams();
  }

  /**
   * Set hold (freeze buffer)
   */
  setHold(hold: boolean): void {
    this.params.hold = hold;
    this.updateParams();
  }

  /**
   * Set flip (reverse playback)
   */
  setFlip(flip: boolean): void {
    this.params.flip = flip;
    this.updateParams();
  }

  /**
   * Set ping-pong mode
   */
  setPingPong(pingPong: boolean): void {
    this.params.pingPong = pingPong;
    this.updateParams();
  }

  /**
   * Set swap (exchange L/R times)
   */
  setSwap(swap: boolean): void {
    this.params.swap = swap;
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
    if (this.node) {
      this.node.disconnect();
      this.node = null;
    }
    this.isReady = false;
  }
}

// Presets matching the standalone Mimeophon presets
export const MIMEOPHON_PRESETS: Record<string, Partial<MimeophonParams>> = {
  karplus: {
    zone: 0,
    rate: 0.8,
    microRate: 0,
    skew: 0,
    repeats: 0.85,
    color: 0.3,
    halo: 0,
    mix: 0.5
  },

  flange: {
    zone: 0,
    rate: 0.3,
    microRate: 0.8,
    microRateFreq: 0.3,
    skew: 0.5,
    repeats: 0.7,
    color: 0.5,
    halo: 0.3,
    mix: 0.5
  },

  chorus: {
    zone: 1,
    rate: 0.2,
    microRate: 0.6,
    microRateFreq: 1.5,
    skew: 0.3,
    repeats: 0.3,
    color: 0.6,
    halo: 0.5,
    mix: 0.4
  },

  slapback: {
    zone: 1,
    rate: 0.4,
    microRate: 0,
    skew: 0,
    repeats: 0.3,
    color: 0.4,
    halo: 0.2,
    mix: 0.3
  },

  dubEcho: {
    zone: 2,
    rate: 0.5,
    microRate: 0.1,
    skew: 0.2,
    repeats: 0.6,
    color: 0.3,
    halo: 0.6,
    mix: 0.5
  },

  tapeDelay: {
    zone: 2,
    rate: 0.6,
    microRate: 0.2,
    microRateFreq: 0.5,
    skew: 0,
    repeats: 0.5,
    color: 0.45,
    halo: 0.4,
    mix: 0.4
  },

  ambient: {
    zone: 3,
    rate: 0.5,
    microRate: 0.3,
    microRateFreq: 0.2,
    skew: 0.4,
    repeats: 0.8,
    color: 0.7,
    halo: 0.8,
    mix: 0.6
  },

  shimmer: {
    zone: 3,
    rate: 0.7,
    microRate: 0.4,
    microRateFreq: 2,
    skew: 0.6,
    repeats: 0.9,
    color: 0.85,
    halo: 1.0,
    mix: 0.7
  },

  // Send-optimized presets (100% wet for use as send effects)
  pingPongSend: {
    zone: 1,
    rate: 0.5,
    microRate: 0,
    skew: 0,
    repeats: 0.45,
    color: 0.4,
    halo: 0.2,
    mix: 1.0,
    pingPong: true
  },

  dubSend: {
    zone: 2,
    rate: 0.5,
    microRate: 0.1,
    skew: 0.2,
    repeats: 0.6,
    color: 0.3,
    halo: 0.5,
    mix: 1.0
  },

  ambientSend: {
    zone: 3,
    rate: 0.4,
    microRate: 0.2,
    microRateFreq: 0.3,
    skew: 0.3,
    repeats: 0.75,
    color: 0.6,
    halo: 0.7,
    mix: 1.0
  }
};

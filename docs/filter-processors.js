/**
 * Filter AudioWorklet Processors
 * Contains: Three Sisters, Wasp, SEM, and Moog Ladder filters
 */

// ============================================================================
// THREE SISTERS - Mannequins Multi-Mode Filter
// ============================================================================

class ThreeSistersProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'freq', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'span', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'quality', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'fmAttenuverter', defaultValue: 0.5, minValue: 0, maxValue: 1 }
    ];
  }

  constructor() {
    super();
    this.sampleRate = sampleRate;
    this.lowSVF1 = this.createSVF();
    this.lowSVF2 = this.createSVF();
    this.centreSVF1 = this.createSVF();
    this.centreSVF2 = this.createSVF();
    this.highSVF1 = this.createSVF();
    this.highSVF2 = this.createSVF();
    this.noiseState = Math.random() * 2 - 1;
  }

  createSVF() {
    return { ic1eq: 0.0, ic2eq: 0.0 };
  }

  resetSVF(svf) {
    svf.ic1eq = 0.0;
    svf.ic2eq = 0.0;
  }

  freqKnobToHz(knob) {
    const octaves = (knob - 0.5) * 8;
    return 500.0 * Math.pow(2, octaves);
  }

  spanKnobToOctaves(knob) {
    return (knob - 0.5) * 6.0;
  }

  fastTanh(x) {
    if (x < -3) return -1;
    if (x > 3) return 1;
    const x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }

  processSVF(svf, input, cutoffHz, resonance) {
    const g = Math.tan(Math.PI * Math.min(cutoffHz, this.sampleRate * 0.49) / this.sampleRate);
    const k = Math.max(0, 2.0 - 2.0 * resonance);

    this.noiseState = this.noiseState * 0.99 + (Math.random() - 0.5) * 0.0001;
    const noisyInput = input + this.noiseState * resonance;

    const d = 1.0 / (1.0 + g * (g + k));

    const hp = (noisyInput - (g + k) * svf.ic1eq - svf.ic2eq) * d;
    const v1 = g * hp;
    const bp = v1 + svf.ic1eq;
    svf.ic1eq = v1 + bp;

    const v2 = g * bp;
    const lp = v2 + svf.ic2eq;
    svf.ic2eq = v2 + lp;

    const satAmount = 0.3 + resonance * 0.5;
    const saturatedBp = this.fastTanh(bp * satAmount) / satAmount;
    const saturatedLp = this.fastTanh(lp * satAmount) / satAmount;
    const saturatedHp = this.fastTanh(hp * satAmount) / satAmount;

    if (!isFinite(svf.ic1eq) || !isFinite(svf.ic2eq)) {
      this.resetSVF(svf);
      return { lp: 0, bp: 0, hp: 0 };
    }

    return { lp: saturatedLp, bp: saturatedBp, hp: saturatedHp };
  }

  processLowBlock(input, cfLow, resonance, mode, antiQ) {
    const out1 = this.processSVF(this.lowSVF1, input, cfLow, resonance);
    const out2 = this.processSVF(this.lowSVF2, out1.lp, cfLow, resonance);

    let mainOutput, complementary;
    if (mode < 0.5) {
      mainOutput = out2.lp;
      complementary = out1.hp;
    } else {
      mainOutput = out2.hp;
      complementary = out1.lp;
    }
    return mainOutput + complementary * antiQ;
  }

  processHighBlock(input, cfHigh, resonance, mode, antiQ) {
    const out1 = this.processSVF(this.highSVF1, input, cfHigh, resonance);
    const out2 = this.processSVF(this.highSVF2, out1.hp, cfHigh, resonance);

    let mainOutput, complementary;
    if (mode < 0.5) {
      mainOutput = out2.hp;
      complementary = out1.lp;
    } else {
      mainOutput = out2.lp;
      complementary = out1.hp;
    }
    return mainOutput + complementary * antiQ;
  }

  processCentreBlock(input, cfLow, cfHigh, cfCentre, resonance, mode, antiQ) {
    let out1, out2;
    if (mode < 0.5) {
      out1 = this.processSVF(this.centreSVF1, input, cfLow, resonance);
      out2 = this.processSVF(this.centreSVF2, out1.hp, cfHigh, resonance);
      const mainOutput = out2.lp;
      const comp1 = out1.lp;
      const comp2 = out2.hp;
      return mainOutput + (comp1 + comp2) * antiQ * 0.5;
    } else {
      out1 = this.processSVF(this.centreSVF1, input, cfCentre, resonance);
      out2 = this.processSVF(this.centreSVF2, out1.hp, cfCentre, resonance);
      const mainOutput = out2.lp;
      const comp1 = out1.lp;
      const comp2 = out2.hp;
      return mainOutput + (comp1 + comp2) * antiQ * 0.5;
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const audioIn = inputs[0]?.[0] || new Float32Array(128);
    const fmIn = inputs[0]?.[1] || new Float32Array(128);

    const lowOut = output[0];
    const centreOut = output[1];
    const highOut = output[2];
    const allOut = output[3];

    if (!lowOut || !centreOut || !highOut || !allOut) return true;

    for (let i = 0; i < audioIn.length; i++) {
      const freqKnob = parameters.freq[i] ?? parameters.freq[0];
      const spanKnob = parameters.span[i] ?? parameters.span[0];
      const quality = parameters.quality[i] ?? parameters.quality[0];
      const mode = parameters.mode[i] ?? parameters.mode[0];
      const fmAtten = parameters.fmAttenuverter[i] ?? parameters.fmAttenuverter[0];

      const audioSample = audioIn[i];
      const fmSample = fmIn[i] || 0;

      let baseFreqHz = this.freqKnobToHz(freqKnob);
      const fmAmount = (fmAtten - 0.5) * 2.0;
      const fmVoltage = fmSample * fmAmount * 5.0;
      const fmMultiplier = Math.pow(2, fmVoltage);
      let modulatedFreq = baseFreqHz * fmMultiplier;

      const nyquist = this.sampleRate * 0.49;
      modulatedFreq = Math.max(20, Math.min(nyquist, modulatedFreq));

      const spanOctaves = this.spanKnobToOctaves(spanKnob);
      const cfCentre = modulatedFreq;
      const cfLow = Math.max(20, Math.min(nyquist, modulatedFreq * Math.pow(2, -Math.abs(spanOctaves))));
      const cfHigh = Math.max(20, Math.min(nyquist, modulatedFreq * Math.pow(2, Math.abs(spanOctaves))));

      let resonance = 0.0;
      let antiQ = 0.0;

      if (quality >= 0.5) {
        const resAmount = (quality - 0.5) * 2.0;
        resonance = Math.pow(resAmount, 1.5) * 1.2;
      } else {
        resonance = 0.0;
        antiQ = (0.5 - quality) * 2.0;
      }

      const inputGain = 2.0;
      const scaledInput = audioSample * inputGain;

      const lowSample = this.processLowBlock(scaledInput, cfLow, resonance, mode, antiQ);
      const centreSample = this.processCentreBlock(scaledInput, cfLow, cfHigh, cfCentre, resonance, mode, antiQ);
      const highSample = this.processHighBlock(scaledInput, cfHigh, resonance, mode, antiQ);

      const outputGain = 3.0;
      lowOut[i] = this.fastTanh(lowSample * outputGain * 0.3) * 3.0;
      centreOut[i] = this.fastTanh(centreSample * outputGain * 0.3) * 3.0;
      highOut[i] = this.fastTanh(highSample * outputGain * 0.3) * 3.0;
      allOut[i] = (lowOut[i] + centreOut[i] + highOut[i]) / 2.0;
    }

    return true;
  }
}

registerProcessor('three-sisters-processor', ThreeSistersProcessor);


// ============================================================================
// WASP - EDP Wasp-style Dirty CMOS Filter
// ============================================================================

class WaspProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 1000, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
      { name: 'resonance', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 3, automationRate: 'k-rate' },
      { name: 'drive', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'chaos', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.ic1eq = 0;
    this.ic2eq = 0;
    this.bias = 0;
    this.biasTarget = 0;
  }

  tanh(x) {
    if (x < -3) return -1;
    if (x > 3) return 1;
    const x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }

  cmos(x, bias, drive) {
    const input = x + bias * 0.05;
    const gained = input * (1 + drive * 2);
    const asymm = gained >= 0 ? gained * 1.15 : gained * 0.85;
    return this.tanh(asymm);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !output || !output[0]) return true;

    const inp = input[0];
    const out = output[0];
    const len = out.length;

    const cutoffArr = parameters.cutoff;
    const resArr = parameters.resonance;
    const driveArr = parameters.drive;
    const mode = parameters.mode[0] | 0;
    const chaos = parameters.chaos[0] || 0;

    if (Math.random() < 0.01 * (0.2 + chaos)) {
      this.biasTarget = (Math.random() - 0.5) * chaos * 0.5;
    }
    this.bias += (this.biasTarget - this.bias) * 0.0005;

    const nyquist = 0.5 * sampleRate;

    for (let i = 0; i < len; i++) {
      const cutoffParam = cutoffArr.length > 1 ? cutoffArr[i] : cutoffArr[0];
      const resParam = resArr.length > 1 ? resArr[i] : resArr[0];
      const driveParam = driveArr.length > 1 ? driveArr[i] : driveArr[0];

      const resShaped = Math.pow(Math.min(Math.max(resParam, 0), 1), 2.2);
      const Q = 0.7 + resShaped * 30.0;
      const k = 1 / Q;

      let cutoff = Math.min(Math.max(cutoffParam, 20), nyquist * 0.98);
      const jitter = (Math.random() - 0.5) * chaos * 0.002;
      cutoff *= (1 + jitter);
      cutoff = Math.min(Math.max(cutoff, 20), nyquist * 0.98);

      const wd = 2 * Math.PI * cutoff;
      const wa = 2 * sampleRate * Math.tan(wd / (2 * sampleRate));
      const g = wa / (2 * sampleRate);

      const a1 = 1 / (1 + g * (g + k));
      const a2 = g * a1;
      const a3 = g * a2;

      const noiseAmt = chaos * 0.0005;
      const noise = (Math.random() * 2 - 1) * noiseAmt;
      const v0 = inp[i] + noise;

      const v3 = v0 - this.ic2eq;
      const v1 = a1 * this.ic1eq + a2 * v3;
      const v2 = this.ic2eq + a2 * this.ic1eq + a3 * v3;

      this.ic1eq = 2 * v1 - this.ic1eq;
      this.ic2eq = 2 * v2 - this.ic2eq;

      const lp = v2;
      const bp = v1;
      const hp = v0 - k * v1 - v2;
      const notch = hp + lp;

      let filtered;
      switch (mode) {
        case 0: default: filtered = lp; break;
        case 1: filtered = bp; break;
        case 2: filtered = hp; break;
        case 3: filtered = notch; break;
      }

      const gainComp = 1 + resShaped * 2.5;
      const outDrive = 1 + driveParam * 1.5;
      const saturated = this.cmos(filtered * outDrive, this.bias, driveParam);
      out[i] = saturated * gainComp;
    }

    return true;
  }
}

registerProcessor('wasp-processor', WaspProcessor);


// ============================================================================
// SEM - Oberheim SEM State-Variable Filter
// ============================================================================

class SEMFilterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 1000, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
      { name: 'resonance', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'morph', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'a-rate' },
      { name: 'drive', defaultValue: 1, minValue: 0.1, maxValue: 10, automationRate: 'a-rate' },
      { name: 'oversample', defaultValue: 2, minValue: 1, maxValue: 4, automationRate: 'k-rate' }
    ];
  }

  constructor(options) {
    super();
    this.ic1eq = [0, 0];
    this.ic2eq = [0, 0];
    this.halfbandState1 = [new Float32Array(12), new Float32Array(12)];
    this.halfbandState2 = [new Float32Array(12), new Float32Array(12)];

    const seed = options?.processorOptions?.seed ?? Math.random() * 10000;
    this.rng = this.createRNG(seed);

    this.cutoffDrift = 1 + (this.rng() - 0.5) * 0.10;
    this.resDrift = 1 + (this.rng() - 0.5) * 0.08;
    this.capDrift1 = 1 + (this.rng() - 0.5) * 0.06;
    this.capDrift2 = 1 + (this.rng() - 0.5) * 0.06;
    this.saturationAmount = 0.8 + this.rng() * 0.4;
    this.asymmetry = 1 + (this.rng() - 0.5) * 0.1;
    this.dcOffset = (this.rng() - 0.5) * 0.001;
    this.denormalThreshold = 1e-18;
  }

  createRNG(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  tanh(x) {
    if (x < -3) return -1;
    if (x > 3) return 1;
    const x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }

  saturate(x, amount, asymmetry) {
    const scaled = x * amount;
    if (scaled >= 0) {
      return this.tanh(scaled * asymmetry) / amount;
    } else {
      return this.tanh(scaled / asymmetry) / amount;
    }
  }

  flushDenormal(x) {
    return (x > this.denormalThreshold || x < -this.denormalThreshold) ? x : 0;
  }

  halfbandDecimate(input, state, len) {
    const h = [0.00320982, -0.01442291, 0.04299436, -0.09939089, 0.31546250, 0.50000000, 0.31546250, -0.09939089, 0.04299436, -0.01442291, 0.00320982];
    const output = new Float32Array(len >> 1);

    for (let i = 0; i < len; i += 2) {
      for (let j = state.length - 1; j >= 2; j--) {
        state[j] = state[j - 2];
      }
      state[1] = input[i + 1];
      state[0] = input[i];

      let sum = 0;
      for (let j = 0; j < h.length; j++) {
        sum += h[j] * state[j];
      }
      output[i >> 1] = sum;
    }

    return output;
  }

  upsample2x(input, output, len) {
    for (let i = 0; i < len; i++) {
      output[i << 1] = input[i];
      output[(i << 1) + 1] = (i < len - 1) ? (input[i] + input[i + 1]) * 0.5 : input[i];
    }
  }

  processSample(x, cutoffHz, resonance, morph, drive, channel, sr) {
    const fc = cutoffHz * this.cutoffDrift;
    const g = Math.tan(Math.PI * Math.min(fc / sr, 0.49));
    const g1 = g * this.capDrift1;
    const g2 = g * this.capDrift2;

    const kMin = 0.02;
    const kMax = 2.0;
    const k = (kMin + resonance * (kMax - kMin)) * this.resDrift;

    x = x * drive;
    x = this.saturate(x, this.saturationAmount, this.asymmetry);
    x += this.dcOffset;

    let s1 = this.ic1eq[channel];
    let s2 = this.ic2eq[channel];

    const gk = g1 * k;
    const g1g2 = g1 * g2;
    const denom = 1 / (1 + gk + g1g2);

    const hp = (x - (k + g1) * s1 - s2) * denom;
    const v1 = g1 * hp;
    const bp = v1 + s1;
    const v2 = g2 * bp;
    const lp = v2 + s2;

    const bpSat = this.saturate(bp, this.saturationAmount * 0.7, this.asymmetry);
    const lpSat = this.saturate(lp, this.saturationAmount * 0.7, this.asymmetry);

    const satMix = 0.3;
    this.ic1eq[channel] = this.flushDenormal(v1 + bp * (1 - satMix) + bpSat * satMix);
    this.ic2eq[channel] = this.flushDenormal(v2 + lp * (1 - satMix) + lpSat * satMix);

    let output;
    if (morph <= 0) {
      const t = morph + 1;
      output = lp * (1 - t) + (lp + hp) * t;
    } else {
      const t = morph;
      output = (lp + hp) * (1 - t) + hp * t;
    }

    return output;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0]) return true;

    const blockSize = input[0].length;
    let osf = Math.round(parameters.oversample[0]);
    if (osf < 1) osf = 1;
    if (osf === 3) osf = 2;
    if (osf > 4) osf = 4;

    const baseSR = sampleRate;
    const numChannels = Math.min(input.length, output.length);

    for (let ch = 0; ch < numChannels; ch++) {
      const inCh = input[ch];
      const outCh = output[ch];

      if (osf === 1) {
        for (let i = 0; i < blockSize; i++) {
          const cutoff = parameters.cutoff.length > 1 ? parameters.cutoff[i] : parameters.cutoff[0];
          const res = parameters.resonance.length > 1 ? parameters.resonance[i] : parameters.resonance[0];
          const morph = parameters.morph.length > 1 ? parameters.morph[i] : parameters.morph[0];
          const drive = parameters.drive.length > 1 ? parameters.drive[i] : parameters.drive[0];

          outCh[i] = this.processSample(inCh[i], cutoff, res, morph, drive, ch, baseSR);
        }
      } else if (osf === 2) {
        const upLen = blockSize * 2;
        const upsampled = new Float32Array(upLen);
        const processed = new Float32Array(upLen);

        this.upsample2x(inCh, upsampled, blockSize);

        const osSR = baseSR * 2;
        for (let i = 0; i < upLen; i++) {
          const idx = i >> 1;
          const cutoff = parameters.cutoff.length > 1 ? parameters.cutoff[idx] : parameters.cutoff[0];
          const res = parameters.resonance.length > 1 ? parameters.resonance[idx] : parameters.resonance[0];
          const morph = parameters.morph.length > 1 ? parameters.morph[idx] : parameters.morph[0];
          const drive = parameters.drive.length > 1 ? parameters.drive[idx] : parameters.drive[0];

          processed[i] = this.processSample(upsampled[i], cutoff, res, morph, drive, ch, osSR);
        }

        const decimated = this.halfbandDecimate(processed, this.halfbandState1[ch], upLen);
        outCh.set(decimated);
      } else if (osf === 4) {
        const up2Len = blockSize * 2;
        const up4Len = blockSize * 4;
        const up2 = new Float32Array(up2Len);
        const up4 = new Float32Array(up4Len);
        const processed = new Float32Array(up4Len);

        this.upsample2x(inCh, up2, blockSize);
        this.upsample2x(up2, up4, up2Len);

        const osSR = baseSR * 4;
        for (let i = 0; i < up4Len; i++) {
          const idx = i >> 2;
          const cutoff = parameters.cutoff.length > 1 ? parameters.cutoff[idx] : parameters.cutoff[0];
          const res = parameters.resonance.length > 1 ? parameters.resonance[idx] : parameters.resonance[0];
          const morph = parameters.morph.length > 1 ? parameters.morph[idx] : parameters.morph[0];
          const drive = parameters.drive.length > 1 ? parameters.drive[idx] : parameters.drive[0];

          processed[i] = this.processSample(up4[i], cutoff, res, morph, drive, ch, osSR);
        }

        const dec2 = this.halfbandDecimate(processed, this.halfbandState1[ch], up4Len);
        const dec1 = this.halfbandDecimate(dec2, this.halfbandState2[ch], up2Len);
        outCh.set(dec1);
      }
    }

    return true;
  }
}

registerProcessor('sem-filter-processor', SEMFilterProcessor);


// ============================================================================
// MOOG LADDER - 24dB/octave Transistor Ladder Filter
// ============================================================================

class MoogLadderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 1000, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
      { name: 'resonance', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'drive', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'warmth', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'a-rate' }
    ];
  }

  constructor() {
    super();
    this.fs = sampleRate;
    this.stages = [[0, 0, 0, 0], [0, 0, 0, 0]];
    this.oversampleStages = [[0, 0, 0, 0], [0, 0, 0, 0]];

    this.stageMismatch = [
      1.0 + (Math.random() - 0.5) * 0.04,
      1.0 + (Math.random() - 0.5) * 0.04,
      1.0 + (Math.random() - 0.5) * 0.04,
      1.0 + (Math.random() - 0.5) * 0.04
    ];

    this.thermalPhase = Math.random() * Math.PI * 2;
    this.thermalPhase2 = Math.random() * Math.PI * 2;
    this.thermalRate = 0.15 + Math.random() * 0.2;
    this.thermalRate2 = 0.08 + Math.random() * 0.12;
    this.thermalDepth = 0.003;

    this.dcLeak = 0.9999;
    this.noiseState = 0x7FFFFFFF;

    this.smoothedCutoff = 1000;
    this.smoothedResonance = 0;
    this.smoothedDrive = 0;
    this.smoothedWarmth = 1;
    this.smoothingCoeff = 0.05;

    this.feedbackState = [0, 0];
    this.dcBlockerX = [0, 0];
    this.dcBlockerY = [0, 0];
    this.dcBlockerCoeff = 0.995;
  }

  tanh(x) {
    if (x > 3) return 1;
    if (x < -3) return -1;
    const x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }

  generateNoise() {
    const bit = this.noiseState & 1;
    this.noiseState >>= 1;
    if (bit) this.noiseState ^= 0xB4BCD35C;
    return ((this.noiseState & 0xFFFF) / 65535 - 0.5) * 0.0002;
  }

  updateThermalDrift() {
    this.thermalPhase += (this.thermalRate * 2 * Math.PI) / this.fs;
    this.thermalPhase2 += (this.thermalRate2 * 2 * Math.PI) / this.fs;

    if (this.thermalPhase > Math.PI * 2) this.thermalPhase -= Math.PI * 2;
    if (this.thermalPhase2 > Math.PI * 2) this.thermalPhase2 -= Math.PI * 2;

    return 1 + this.thermalDepth * (Math.sin(this.thermalPhase) * 0.7 + Math.sin(this.thermalPhase2) * 0.3);
  }

  processLadder(input, g, k, drive, warmth, channel, isOversample = false) {
    const stages = isOversample ? this.oversampleStages[channel] : this.stages[channel];
    const driveScale = 1 + drive * 3;
    const feedback = this.feedbackState[channel];

    const saturatedFeedback = this.tanh(feedback * (1 + drive));
    const blendedFeedback = feedback + (saturatedFeedback - feedback) * warmth;

    let x = input - k * blendedFeedback;
    x += this.generateNoise();

    for (let i = 0; i < 4; i++) {
      const stageG = g * this.stageMismatch[i];
      const saturatedInput = this.tanh(x * driveScale * (1 + drive * 0.5));
      const stageInput = x + (saturatedInput - x) * warmth;
      const v = stageG * (stageInput - stages[i]);
      const y = stages[i] + v;
      stages[i] = y * this.dcLeak;
      x = y;
    }

    this.feedbackState[channel] = stages[3];
    return stages[3];
  }

  processWithOversampling(input, g, k, drive, warmth, channel) {
    const y1 = this.processLadder(input, g, k, drive, warmth, channel, true);
    const y2 = this.processLadder(input, g, k, drive, warmth, channel, true);
    return (y1 + y2) * 0.5;
  }

  dcBlock(input, channel) {
    const y = input - this.dcBlockerX[channel] + this.dcBlockerCoeff * this.dcBlockerY[channel];
    this.dcBlockerX[channel] = input;
    this.dcBlockerY[channel] = y;
    return y;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input.length) return true;

    const blockSize = input[0].length;
    const numChannels = Math.min(input.length, output.length, 2);

    const cutoffParam = parameters.cutoff;
    const resonanceParam = parameters.resonance;
    const driveParam = parameters.drive;
    const warmthParam = parameters.warmth;

    const thermalMod = this.updateThermalDrift();

    for (let i = 0; i < blockSize; i++) {
      const cutoff = cutoffParam.length > 1 ? cutoffParam[i] : cutoffParam[0];
      const resonance = resonanceParam.length > 1 ? resonanceParam[i] : resonanceParam[0];
      const drive = driveParam.length > 1 ? driveParam[i] : driveParam[0];
      const warmth = warmthParam.length > 1 ? warmthParam[i] : warmthParam[0];

      this.smoothedCutoff += (cutoff - this.smoothedCutoff) * this.smoothingCoeff;
      this.smoothedResonance += (resonance - this.smoothedResonance) * this.smoothingCoeff;
      this.smoothedDrive += (drive - this.smoothedDrive) * this.smoothingCoeff;
      this.smoothedWarmth += (warmth - this.smoothedWarmth) * this.smoothingCoeff;

      const modulatedCutoff = this.smoothedCutoff * thermalMod;
      const normalizedFreq = Math.min(modulatedCutoff / this.fs, 0.49);
      const g = Math.tan(Math.PI * normalizedFreq);
      const k = this.smoothedResonance * 4 * (1 - normalizedFreq * 0.2);

      const useOversampling = this.smoothedDrive > 0.5;

      for (let ch = 0; ch < numChannels; ch++) {
        const inputSample = input[ch][i];

        let outputSample;
        if (useOversampling) {
          outputSample = this.processWithOversampling(inputSample, g * 0.5, k, this.smoothedDrive, this.smoothedWarmth, ch);
        } else {
          outputSample = this.processLadder(inputSample, g, k, this.smoothedDrive, this.smoothedWarmth, ch);
        }

        outputSample = this.dcBlock(outputSample, ch);

        const normalizedCutoffForGain = Math.min(Math.max(modulatedCutoff / 20000, 0), 1);
        const makeupGain = 1 + (1 - normalizedCutoffForGain) * 2.0;
        const resonanceReduction = 1 - this.smoothedResonance * 0.5;
        const finalMakeupGain = 1 + (makeupGain - 1) * resonanceReduction;

        output[ch][i] = outputSample * finalMakeupGain;
      }
    }

    return true;
  }
}

registerProcessor('moog-ladder-processor', MoogLadderProcessor);

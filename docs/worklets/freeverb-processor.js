/**
 * Freeverb AudioWorklet Processor
 *
 * Based on Jezar's Freeverb algorithm - the classic smooth reverb
 * used in countless DAWs and known for its lush character.
 *
 * Architecture:
 * - 8 parallel comb filters with lowpass feedback (LBCF)
 * - 4 series allpass filters for diffusion
 * - Stereo with slightly offset delay times (L/R decorrelation)
 */

// Freeverb tuning constants (samples at 44100Hz)
const COMB_TUNING_L = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const COMB_TUNING_R = [1116 + 23, 1188 + 23, 1277 + 23, 1356 + 23, 1422 + 23, 1491 + 23, 1557 + 23, 1617 + 23];
const ALLPASS_TUNING_L = [556, 441, 341, 225];
const ALLPASS_TUNING_R = [556 + 23, 441 + 23, 341 + 23, 225 + 23];

// Freeverb constants
const SCALE_WET = 3.0;
const SCALE_DAMP = 0.4;
const SCALE_ROOM = 0.28;
const OFFSET_ROOM = 0.7;
const INITIAL_ROOM = 0.5;
const INITIAL_DAMP = 0.5;
const INITIAL_WET = 1 / SCALE_WET;
const INITIAL_WIDTH = 1;
const FIXED_GAIN = 0.015;
const STEREO_SPREAD = 23;

class CombFilter {
  constructor(size) {
    this.buffer = new Float32Array(size);
    this.bufferSize = size;
    this.index = 0;
    this.filterStore = 0;
    this.feedback = 0;
    this.damp1 = 0;
    this.damp2 = 0;
  }

  setDamp(val) {
    this.damp1 = val;
    this.damp2 = 1 - val;
  }

  setFeedback(val) {
    this.feedback = val;
  }

  process(input) {
    const output = this.buffer[this.index];

    // Lowpass filter in feedback path
    this.filterStore = (output * this.damp2) + (this.filterStore * this.damp1);

    // Write input + filtered feedback to buffer
    this.buffer[this.index] = input + (this.filterStore * this.feedback);

    // Advance buffer index
    this.index = (this.index + 1) % this.bufferSize;

    return output;
  }
}

class AllpassFilter {
  constructor(size) {
    this.buffer = new Float32Array(size);
    this.bufferSize = size;
    this.index = 0;
    this.feedback = 0.5;
  }

  setFeedback(val) {
    this.feedback = val;
  }

  process(input) {
    const bufout = this.buffer[this.index];
    const output = -input + bufout;

    this.buffer[this.index] = input + (bufout * this.feedback);

    this.index = (this.index + 1) % this.bufferSize;

    return output;
  }
}

class FreeverbProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'roomSize', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'damping', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'wetLevel', defaultValue: 0.33, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'dryLevel', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'width', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();

    const sr = sampleRate;
    const srFactor = sr / 44100;

    // Create comb filters (8 per channel)
    this.combL = [];
    this.combR = [];
    for (let i = 0; i < 8; i++) {
      this.combL.push(new CombFilter(Math.round(COMB_TUNING_L[i] * srFactor)));
      this.combR.push(new CombFilter(Math.round(COMB_TUNING_R[i] * srFactor)));
    }

    // Create allpass filters (4 per channel)
    this.allpassL = [];
    this.allpassR = [];
    for (let i = 0; i < 4; i++) {
      this.allpassL.push(new AllpassFilter(Math.round(ALLPASS_TUNING_L[i] * srFactor)));
      this.allpassR.push(new AllpassFilter(Math.round(ALLPASS_TUNING_R[i] * srFactor)));
    }

    // Set initial allpass feedback
    for (let i = 0; i < 4; i++) {
      this.allpassL[i].setFeedback(0.5);
      this.allpassR[i].setFeedback(0.5);
    }

    // Initialize with default parameters
    this.setRoomSize(INITIAL_ROOM);
    this.setDamp(INITIAL_DAMP);

    this.wet1 = INITIAL_WET * (INITIAL_WIDTH / 2 + 0.5);
    this.wet2 = INITIAL_WET * ((1 - INITIAL_WIDTH) / 2);
  }

  setRoomSize(value) {
    const roomSize = (value * SCALE_ROOM) + OFFSET_ROOM;
    for (let i = 0; i < 8; i++) {
      this.combL[i].setFeedback(roomSize);
      this.combR[i].setFeedback(roomSize);
    }
  }

  setDamp(value) {
    const damp = value * SCALE_DAMP;
    for (let i = 0; i < 8; i++) {
      this.combL[i].setDamp(damp);
      this.combR[i].setDamp(damp);
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!output || !output[0]) return true;

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const blockSize = outputL.length;

    // Get mono or stereo input
    const inputL = (input && input[0]) ? input[0] : new Float32Array(blockSize);
    const inputR = (input && input[1]) ? input[1] : inputL;

    // Get parameters
    const roomSize = parameters.roomSize[0];
    const damping = parameters.damping[0];
    const wetLevel = parameters.wetLevel[0];
    const dryLevel = parameters.dryLevel[0];
    const width = parameters.width[0];

    // Update reverb parameters
    this.setRoomSize(roomSize);
    this.setDamp(damping);

    // Calculate wet mix values for stereo width
    const wet = wetLevel * SCALE_WET;
    this.wet1 = wet * (width / 2 + 0.5);
    this.wet2 = wet * ((1 - width) / 2);

    for (let i = 0; i < blockSize; i++) {
      // Sum to mono and apply input gain
      const inSample = (inputL[i] + inputR[i]) * FIXED_GAIN;

      // Accumulate comb filter outputs
      let outL = 0;
      let outR = 0;

      for (let c = 0; c < 8; c++) {
        outL += this.combL[c].process(inSample);
        outR += this.combR[c].process(inSample);
      }

      // Feed through allpass filters in series
      for (let a = 0; a < 4; a++) {
        outL = this.allpassL[a].process(outL);
        outR = this.allpassR[a].process(outR);
      }

      // Apply stereo width and mix
      const wetL = outL * this.wet1 + outR * this.wet2;
      const wetR = outR * this.wet1 + outL * this.wet2;

      // Mix dry and wet
      outputL[i] = inputL[i] * dryLevel + wetL;
      outputR[i] = inputR[i] * dryLevel + wetR;
    }

    return true;
  }
}

registerProcessor('freeverb-processor', FreeverbProcessor);

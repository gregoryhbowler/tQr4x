/**
 * Delay - Tempo-synced stereo delay with feedback filtering
 *
 * Features:
 * - Tempo-synced delay times (1/4, 1/8, 1/16, dotted, triplet)
 * - Stereo ping-pong mode
 * - Feedback with lowpass/highpass filter in path
 * - Slightly grainy character via subtle modulation
 * - Wet/dry mix control
 */

export type DelaySync = '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' |
                        '1/2d' | '1/4d' | '1/8d' | '1/16d' |
                        '1/2t' | '1/4t' | '1/8t' | '1/16t';

export interface DelayParams {
  // Timing
  syncLeft: DelaySync;          // Left channel sync value
  syncRight: DelaySync;         // Right channel sync value (for ping-pong/cross delays)
  timeLeft: number;             // Manual time in ms (used if not synced)
  timeRight: number;            // Manual time in ms
  tempoSync: boolean;           // Whether to use tempo sync

  // Feedback
  feedback: number;             // Feedback amount 0-0.95
  feedbackFilterFreq: number;   // Feedback filter cutoff Hz
  feedbackFilterType: 'lowpass' | 'highpass' | 'bandpass';

  // Character
  pingPong: boolean;            // Ping-pong stereo mode
  spread: number;               // Stereo spread 0-1
  modRate: number;              // LFO rate for tape-like wobble
  modDepth: number;             // Modulation depth 0-1

  // Mix
  wetLevel: number;             // Wet signal level 0-1
  dryLevel: number;             // Dry signal level 0-1
}

const DEFAULT_PARAMS: DelayParams = {
  syncLeft: '1/8',
  syncRight: '1/8d',
  timeLeft: 250,
  timeRight: 375,
  tempoSync: true,

  feedback: 0.4,
  feedbackFilterFreq: 4000,
  feedbackFilterType: 'lowpass',

  pingPong: true,
  spread: 0.7,
  modRate: 0.3,
  modDepth: 0.002,

  wetLevel: 0.3,
  dryLevel: 1.0
};

// Sync value to beat fraction
const SYNC_VALUES: Record<DelaySync, number> = {
  '1/1': 4,      // whole note
  '1/2': 2,      // half note
  '1/4': 1,      // quarter note
  '1/8': 0.5,    // eighth note
  '1/16': 0.25,  // sixteenth note
  '1/32': 0.125, // thirty-second note
  '1/2d': 3,     // dotted half
  '1/4d': 1.5,   // dotted quarter
  '1/8d': 0.75,  // dotted eighth
  '1/16d': 0.375,// dotted sixteenth
  '1/2t': 4/3,   // half triplet
  '1/4t': 2/3,   // quarter triplet
  '1/8t': 1/3,   // eighth triplet
  '1/16t': 1/6   // sixteenth triplet
};

export class Delay {
  private ctx: AudioContext;
  private params: DelayParams;
  private bpm: number = 120;

  // Audio nodes
  private inputGain: GainNode;
  private outputGain: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;

  // Left channel
  private delayLeft: DelayNode;
  private feedbackGainLeft: GainNode;
  private filterLeft: BiquadFilterNode;

  // Right channel
  private delayRight: DelayNode;
  private feedbackGainRight: GainNode;
  private filterRight: BiquadFilterNode;

  // Stereo handling
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;

  // Modulation (tape wobble)
  private modOsc: OscillatorNode;
  private modGainLeft: GainNode;
  private modGainRight: GainNode;

  constructor(ctx: AudioContext, destination?: AudioNode) {
    this.ctx = ctx;
    this.params = { ...DEFAULT_PARAMS };

    // Create nodes
    this.inputGain = ctx.createGain();
    this.outputGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    // Stereo splitting/merging
    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);

    // Left channel delay
    this.delayLeft = ctx.createDelay(4); // Max 4 seconds
    this.feedbackGainLeft = ctx.createGain();
    this.filterLeft = ctx.createBiquadFilter();

    // Right channel delay
    this.delayRight = ctx.createDelay(4);
    this.feedbackGainRight = ctx.createGain();
    this.filterRight = ctx.createBiquadFilter();

    // Modulation oscillator for tape-like character
    this.modOsc = ctx.createOscillator();
    this.modOsc.type = 'sine';
    this.modOsc.frequency.value = this.params.modRate;
    this.modGainLeft = ctx.createGain();
    this.modGainRight = ctx.createGain();

    // Start modulation oscillator
    this.modOsc.start();

    // Build the signal path
    this.buildGraph();

    // Apply initial parameters
    this.updateParams();

    // Connect to destination
    if (destination) {
      this.outputGain.connect(destination);
    }
  }

  private buildGraph(): void {
    // Input splits into dry and wet paths
    this.inputGain.connect(this.dryGain);
    this.inputGain.connect(this.splitter);

    // Dry path goes straight to output
    this.dryGain.connect(this.outputGain);

    // Left channel: splitter -> delay -> filter -> feedback loop
    this.splitter.connect(this.delayLeft, 0);
    this.delayLeft.connect(this.filterLeft);
    this.filterLeft.connect(this.feedbackGainLeft);

    // Right channel: splitter -> delay -> filter -> feedback loop
    this.splitter.connect(this.delayRight, 1);
    this.delayRight.connect(this.filterRight);
    this.filterRight.connect(this.feedbackGainRight);

    // Modulation connections
    this.modOsc.connect(this.modGainLeft);
    this.modOsc.connect(this.modGainRight);
    this.modGainLeft.connect(this.delayLeft.delayTime);
    this.modGainRight.connect(this.delayRight.delayTime);

    // Merge back to stereo
    this.filterLeft.connect(this.merger, 0, 0);
    this.filterRight.connect(this.merger, 0, 1);

    // Wet signal to output
    this.merger.connect(this.wetGain);
    this.wetGain.connect(this.outputGain);
  }

  private updateFeedbackRouting(): void {
    // Disconnect existing feedback
    this.feedbackGainLeft.disconnect();
    this.feedbackGainRight.disconnect();

    if (this.params.pingPong) {
      // Cross-feedback for ping-pong
      this.feedbackGainLeft.connect(this.delayRight);
      this.feedbackGainRight.connect(this.delayLeft);
    } else {
      // Standard feedback
      this.feedbackGainLeft.connect(this.delayLeft);
      this.feedbackGainRight.connect(this.delayRight);
    }
  }

  private syncToMs(sync: DelaySync): number {
    const beatsPerSecond = this.bpm / 60;
    const secondsPerBeat = 1 / beatsPerSecond;
    return SYNC_VALUES[sync] * secondsPerBeat * 1000;
  }

  private updateParams(): void {
    const t = this.ctx.currentTime;

    // Calculate delay times
    let timeLeftMs: number;
    let timeRightMs: number;

    if (this.params.tempoSync) {
      timeLeftMs = this.syncToMs(this.params.syncLeft);
      timeRightMs = this.syncToMs(this.params.syncRight);
    } else {
      timeLeftMs = this.params.timeLeft;
      timeRightMs = this.params.timeRight;
    }

    // Apply delay times (convert to seconds)
    const timeLeftSec = Math.min(timeLeftMs / 1000, 4);
    const timeRightSec = Math.min(timeRightMs / 1000, 4);

    this.delayLeft.delayTime.setTargetAtTime(timeLeftSec, t, 0.05);
    this.delayRight.delayTime.setTargetAtTime(timeRightSec, t, 0.05);

    // Feedback (clamp to prevent runaway)
    const fb = Math.min(this.params.feedback, 0.95);
    this.feedbackGainLeft.gain.setTargetAtTime(fb, t, 0.02);
    this.feedbackGainRight.gain.setTargetAtTime(fb, t, 0.02);

    // Feedback filter
    this.filterLeft.type = this.params.feedbackFilterType;
    this.filterLeft.frequency.setTargetAtTime(this.params.feedbackFilterFreq, t, 0.02);
    this.filterLeft.Q.setTargetAtTime(0.7, t, 0.02);

    this.filterRight.type = this.params.feedbackFilterType;
    this.filterRight.frequency.setTargetAtTime(this.params.feedbackFilterFreq, t, 0.02);
    this.filterRight.Q.setTargetAtTime(0.7, t, 0.02);

    // Modulation for tape character
    this.modOsc.frequency.setTargetAtTime(this.params.modRate, t, 0.1);
    const modAmount = this.params.modDepth * timeLeftSec;
    this.modGainLeft.gain.setTargetAtTime(modAmount, t, 0.1);
    this.modGainRight.gain.setTargetAtTime(modAmount * 0.8, t, 0.1); // Slight difference for width

    // Mix levels
    this.dryGain.gain.setTargetAtTime(this.params.dryLevel, t, 0.02);
    this.wetGain.gain.setTargetAtTime(this.params.wetLevel, t, 0.02);

    // Update feedback routing based on ping-pong setting
    this.updateFeedbackRouting();
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
   * Set the tempo for sync calculations
   */
  setBpm(bpm: number): void {
    this.bpm = bpm;
    if (this.params.tempoSync) {
      this.updateParams();
    }
  }

  /**
   * Get current parameters
   */
  getParams(): DelayParams {
    return { ...this.params };
  }

  /**
   * Update parameters
   */
  setParams(params: Partial<DelayParams>): void {
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
    this.modOsc.stop();
    this.modOsc.disconnect();
    this.inputGain.disconnect();
    this.outputGain.disconnect();
    this.delayLeft.disconnect();
    this.delayRight.disconnect();
    this.filterLeft.disconnect();
    this.filterRight.disconnect();
    this.feedbackGainLeft.disconnect();
    this.feedbackGainRight.disconnect();
    this.splitter.disconnect();
    this.merger.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.modGainLeft.disconnect();
    this.modGainRight.disconnect();
  }
}

// Presets for common delay types
// Note: dryLevel should be 0 when used as a send effect
export const DELAY_PRESETS: Record<string, Partial<DelayParams>> = {
  pingPong: {
    syncLeft: '1/8',
    syncRight: '1/8',
    pingPong: true,
    feedback: 0.45,
    feedbackFilterFreq: 3500,
    feedbackFilterType: 'lowpass',
    wetLevel: 1.0,
    dryLevel: 0,
    modDepth: 0.003
  },

  slapback: {
    syncLeft: '1/16',
    syncRight: '1/16',
    pingPong: false,
    feedback: 0.1,
    feedbackFilterFreq: 6000,
    wetLevel: 1.0,
    dryLevel: 0,
    modDepth: 0.001
  },

  dub: {
    syncLeft: '1/4d',
    syncRight: '1/8',
    pingPong: true,
    feedback: 0.6,
    feedbackFilterFreq: 2000,
    feedbackFilterType: 'lowpass',
    wetLevel: 1.0,
    dryLevel: 0,
    modDepth: 0.005
  },

  tape: {
    syncLeft: '1/4',
    syncRight: '1/4t',
    pingPong: false,
    feedback: 0.5,
    feedbackFilterFreq: 3000,
    feedbackFilterType: 'lowpass',
    wetLevel: 1.0,
    dryLevel: 0,
    modRate: 0.5,
    modDepth: 0.008
  },

  ambient: {
    syncLeft: '1/2',
    syncRight: '1/4d',
    pingPong: true,
    feedback: 0.7,
    feedbackFilterFreq: 2500,
    feedbackFilterType: 'lowpass',
    wetLevel: 1.0,
    dryLevel: 0,
    modDepth: 0.004
  },

  rhythmic: {
    syncLeft: '1/8',
    syncRight: '1/8d',
    pingPong: true,
    feedback: 0.35,
    feedbackFilterFreq: 4500,
    feedbackFilterType: 'lowpass',
    wetLevel: 1.0,
    dryLevel: 0,
    modDepth: 0.002
  }
};

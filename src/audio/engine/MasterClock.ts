/**
 * MasterClock - Main thread wrapper for MasterClockProcessor
 *
 * Provides a clean API for controlling the clock and receiving tick events.
 */

export interface TickEvent {
  tick: number;      // Total ticks since start
  time: number;      // AudioContext time for this tick
  step: number;      // 16th note step
  beat: number;      // Beat number
  bar: number;       // Bar number
}

export type TickCallback = (event: TickEvent) => void;

export class MasterClock {
  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private tickCallbacks: Set<TickCallback> = new Set();
  private isInitialized = false;
  private _isRunning = false;
  private _bpm = 120;
  private _swing = 0;
  private _ppqn = 96;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    // Load the worklet module from public folder
    const base = import.meta.env.BASE_URL || '/';
    await this.audioContext.audioWorklet.addModule(`${base}worklets/master-clock-processor.js`);

    // Create the worklet node
    this.workletNode = new AudioWorkletNode(this.audioContext, 'master-clock-processor');

    // Handle messages from the worklet
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'tick') {
        this.handleTick(data as TickEvent);
      }
    };

    // Connect to destination (required for the worklet to process)
    // The clock doesn't produce audio, but needs to be in the graph
    this.workletNode.connect(this.audioContext.destination);

    this.isInitialized = true;
  }

  private handleTick(event: TickEvent) {
    for (const callback of this.tickCallbacks) {
      callback(event);
    }
  }

  onTick(callback: TickCallback): () => void {
    this.tickCallbacks.add(callback);
    return () => {
      this.tickCallbacks.delete(callback);
    };
  }

  start(): void {
    if (!this.workletNode) {
      throw new Error('MasterClock not initialized. Call init() first.');
    }
    this.workletNode.port.postMessage({ type: 'start' });
    this._isRunning = true;
  }

  stop(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'stop' });
    this._isRunning = false;
  }

  pause(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'pause' });
    this._isRunning = false;
  }

  resume(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'resume' });
    this._isRunning = true;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get bpm(): number {
    return this._bpm;
  }

  set bpm(value: number) {
    this._bpm = Math.max(20, Math.min(300, value));
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setTempo', bpm: this._bpm });
    }
  }

  get swing(): number {
    return this._swing;
  }

  set swing(value: number) {
    this._swing = Math.max(0, Math.min(1, value));
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setSwing', swing: this._swing });
    }
  }

  get ppqn(): number {
    return this._ppqn;
  }

  set ppqn(value: number) {
    this._ppqn = value;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setPpqn', ppqn: this._ppqn });
    }
  }

  /**
   * Get the audio context time for scheduling
   */
  get currentTime(): number {
    return this.audioContext.currentTime;
  }

  /**
   * Calculate samples per tick at current tempo
   */
  get samplesPerTick(): number {
    const ticksPerSecond = (this._bpm / 60) * this._ppqn;
    return this.audioContext.sampleRate / ticksPerSecond;
  }

  /**
   * Calculate seconds per step (16th note)
   */
  get secondsPerStep(): number {
    const stepsPerSecond = (this._bpm / 60) * 4; // 4 steps per beat
    return 1 / stepsPerSecond;
  }

  dispose(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.tickCallbacks.clear();
    this.isInitialized = false;
  }
}

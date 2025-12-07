/**
 * WAVRecorder - Records audio from a Web Audio node and exports as WAV
 *
 * Uses a ScriptProcessorNode to capture audio samples and encodes them
 * to WAV format for download.
 */

export interface RecorderState {
  isRecording: boolean;
  duration: number;
  sampleCount: number;
}

export class WAVRecorder {
  private audioContext: AudioContext;
  private sourceNode: AudioNode;
  private processorNode: ScriptProcessorNode | null = null;
  private recordedChunks: Float32Array[] = [];
  private recordedChunksRight: Float32Array[] = [];
  private _isRecording = false;
  private startTime = 0;
  private sampleRate: number;
  private stateListeners: Set<(state: RecorderState) => void> = new Set();

  constructor(audioContext: AudioContext, sourceNode: AudioNode) {
    this.audioContext = audioContext;
    this.sourceNode = sourceNode;
    this.sampleRate = audioContext.sampleRate;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  get duration(): number {
    if (!this._isRecording) return 0;
    return this.audioContext.currentTime - this.startTime;
  }

  get sampleCount(): number {
    return this.recordedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  /**
   * Start recording audio
   */
  start(): void {
    if (this._isRecording) return;

    // Clear previous recording
    this.recordedChunks = [];
    this.recordedChunksRight = [];

    // Create a ScriptProcessorNode to capture audio
    // Using 4096 buffer size for balance of latency and performance
    const bufferSize = 4096;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 2, 2);

    // Connect: source -> processor -> destination (pass-through)
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    // Capture audio data
    this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this._isRecording) return;

      const inputL = event.inputBuffer.getChannelData(0);
      const inputR = event.inputBuffer.getChannelData(1);

      // Copy the audio data (Float32Array is a view, need to copy)
      this.recordedChunks.push(new Float32Array(inputL));
      this.recordedChunksRight.push(new Float32Array(inputR));

      // Notify listeners
      this.notifyListeners();
    };

    this._isRecording = true;
    this.startTime = this.audioContext.currentTime;
    this.notifyListeners();
  }

  /**
   * Stop recording and return the recorded audio as a WAV blob
   */
  stop(): Blob | null {
    if (!this._isRecording) return null;

    this._isRecording = false;

    // Disconnect the processor
    if (this.processorNode) {
      this.sourceNode.disconnect(this.processorNode);
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    // No audio recorded
    if (this.recordedChunks.length === 0) {
      this.notifyListeners();
      return null;
    }

    // Merge all chunks into single buffers
    const totalSamples = this.sampleCount;
    const leftChannel = new Float32Array(totalSamples);
    const rightChannel = new Float32Array(totalSamples);

    let offset = 0;
    for (let i = 0; i < this.recordedChunks.length; i++) {
      leftChannel.set(this.recordedChunks[i], offset);
      rightChannel.set(this.recordedChunksRight[i], offset);
      offset += this.recordedChunks[i].length;
    }

    // Encode to WAV
    const wavBlob = this.encodeWAV(leftChannel, rightChannel);

    this.notifyListeners();
    return wavBlob;
  }

  /**
   * Cancel recording without saving
   */
  cancel(): void {
    if (!this._isRecording) return;

    this._isRecording = false;

    if (this.processorNode) {
      this.sourceNode.disconnect(this.processorNode);
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    this.recordedChunks = [];
    this.recordedChunksRight = [];
    this.notifyListeners();
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: RecorderState) => void): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  private notifyListeners(): void {
    const state: RecorderState = {
      isRecording: this._isRecording,
      duration: this.duration,
      sampleCount: this.sampleCount,
    };
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  /**
   * Encode stereo audio to WAV format
   */
  private encodeWAV(leftChannel: Float32Array, rightChannel: Float32Array): Blob {
    const numChannels = 2;
    const sampleRate = this.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const numSamples = leftChannel.length;
    const dataSize = numSamples * blockAlign;

    // Create buffer for WAV file
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');

    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true);  // audio format (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave and write audio samples
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      // Convert float [-1, 1] to 16-bit integer
      const leftSample = Math.max(-1, Math.min(1, leftChannel[i]));
      const rightSample = Math.max(-1, Math.min(1, rightChannel[i]));

      view.setInt16(offset, leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7FFF, true);
      view.setInt16(offset + 2, rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7FFF, true);
      offset += 4;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /**
   * Trigger download of a WAV blob
   */
  static downloadWAV(blob: Blob, filename?: string): void {
    const name = filename ?? `tQr4x-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.cancel();
    this.stateListeners.clear();
  }
}

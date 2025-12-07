/**
 * Mixer - Per-track mixing with send effects routing
 *
 * Features:
 * - Per-track direct level (volume)
 * - Per-track pan
 * - Per-track send levels (mimeophon, reverb)
 * - FX return routing
 * - Master bus processing
 */

import { Mimeophon, type MimeophonParams } from './Mimeophon';
import { Reverb, type ReverbParams } from './Reverb';
import { MasterBus, type MasterBusParams } from './MasterBus';
import { SaturationEffect, type SaturationParams, DEFAULT_SATURATION_PARAMS } from './SaturationEffect';
import { FilterEffect, type FilterParams, DEFAULT_FILTER_PARAMS } from './FilterEffect';

export interface ChannelParams {
  volume: number;       // 0-1 linear gain
  pan: number;          // -1 (left) to 1 (right)
  mute: boolean;        // Mute channel
  delaySend: number;    // 0-1 delay send level (Mimeophon 1)
  delaySend2: number;   // 0-1 Mimeophon 2 send level
  delaySend3: number;   // 0-1 Mimeophon 3 send level
  delaySend4: number;   // 0-1 Mimeophon 4 send level
  reverbSend: number;   // 0-1 reverb send level
  // Per-channel filter (before saturation)
  filter: FilterParams;
  // Per-channel saturation
  saturation: SaturationParams;
}

const DEFAULT_CHANNEL: ChannelParams = {
  volume: 0.8,
  pan: 0,
  mute: false,
  delaySend: 0,
  delaySend2: 0,
  delaySend3: 0,
  delaySend4: 0,
  reverbSend: 0,  // Default to 0 - user enables per track
  filter: { ...DEFAULT_FILTER_PARAMS },
  saturation: { ...DEFAULT_SATURATION_PARAMS }
};

interface MixerChannel {
  id: string;
  params: ChannelParams;
  inputNode: GainNode;
  filterEffect: FilterEffect;
  saturationEffect: SaturationEffect;
  volumeNode: GainNode;
  panNode: StereoPannerNode;
  delaySendNode: GainNode;
  delaySendNode2: GainNode;
  delaySendNode3: GainNode;
  delaySendNode4: GainNode;
  reverbSendNode: GainNode;
}

/**
 * FX Cross-send parameters - allows each effect to send to other effects
 * Note: Sending an effect to itself is not allowed (handled by the mixer)
 */
export interface FXCrossSends {
  // Mimeophon 1 sends
  mim1ToMim2: number;
  mim1ToMim3: number;
  mim1ToMim4: number;
  mim1ToReverb: number;
  // Mimeophon 2 sends
  mim2ToMim1: number;
  mim2ToMim3: number;
  mim2ToMim4: number;
  mim2ToReverb: number;
  // Mimeophon 3 sends
  mim3ToMim1: number;
  mim3ToMim2: number;
  mim3ToMim4: number;
  mim3ToReverb: number;
  // Mimeophon 4 sends
  mim4ToMim1: number;
  mim4ToMim2: number;
  mim4ToMim3: number;
  mim4ToReverb: number;
  // Reverb sends
  reverbToMim1: number;
  reverbToMim2: number;
  reverbToMim3: number;
  reverbToMim4: number;
}

export const DEFAULT_FX_CROSS_SENDS: FXCrossSends = {
  mim1ToMim2: 0, mim1ToMim3: 0, mim1ToMim4: 0, mim1ToReverb: 0,
  mim2ToMim1: 0, mim2ToMim3: 0, mim2ToMim4: 0, mim2ToReverb: 0,
  mim3ToMim1: 0, mim3ToMim2: 0, mim3ToMim4: 0, mim3ToReverb: 0,
  mim4ToMim1: 0, mim4ToMim2: 0, mim4ToMim3: 0, mim4ToReverb: 0,
  reverbToMim1: 0, reverbToMim2: 0, reverbToMim3: 0, reverbToMim4: 0,
};

export interface MixerState {
  channels: Record<string, ChannelParams>;
  mimeophon: MimeophonParams;
  mimeophon2: MimeophonParams;
  mimeophon3: MimeophonParams;
  mimeophon4: MimeophonParams;
  reverb: ReverbParams;
  master: MasterBusParams;
  mimeophonReturnLevel: number;
  mimeophonReturnLevel2: number;
  mimeophonReturnLevel3: number;
  mimeophonReturnLevel4: number;
  reverbReturnLevel: number;
  fxCrossSends: FXCrossSends;
}

export class Mixer {
  private ctx: AudioContext;

  // Channels
  private channels: Map<string, MixerChannel> = new Map();

  // Send buses
  private mimeophonSendBus: GainNode;
  private mimeophonSendBus2: GainNode;
  private mimeophonSendBus3: GainNode;
  private mimeophonSendBus4: GainNode;
  private reverbSendBus: GainNode;

  // Effects - 4 Mimeophon instances
  private mimeophon: Mimeophon;
  private mimeophon2: Mimeophon;
  private mimeophon3: Mimeophon;
  private mimeophon4: Mimeophon;
  private reverb: Reverb;

  // Effect return levels
  private mimeophonReturn: GainNode;
  private mimeophonReturn2: GainNode;
  private mimeophonReturn3: GainNode;
  private mimeophonReturn4: GainNode;
  private reverbReturn: GainNode;
  private mimeophonReturnLevel: number = 1.0;
  private mimeophonReturnLevel2: number = 1.0;
  private mimeophonReturnLevel3: number = 1.0;
  private mimeophonReturnLevel4: number = 1.0;
  private reverbReturnLevel: number = 1.0;

  // Master
  private masterBus: MasterBus;
  private preEffectBus: GainNode; // Direct signal before master
  private recordingTap: GainNode; // Recording tap point (after master, before destination)

  // Filter worklet initialization state
  private filterWorkletsRegistered = false;

  // FX Cross-send gain nodes
  private fxCrossSends: FXCrossSends = { ...DEFAULT_FX_CROSS_SENDS };
  // Mimeophon 1 cross-sends
  private mim1ToMim2Send: GainNode;
  private mim1ToMim3Send: GainNode;
  private mim1ToMim4Send: GainNode;
  private mim1ToReverbSend: GainNode;
  // Mimeophon 2 cross-sends
  private mim2ToMim1Send: GainNode;
  private mim2ToMim3Send: GainNode;
  private mim2ToMim4Send: GainNode;
  private mim2ToReverbSend: GainNode;
  // Mimeophon 3 cross-sends
  private mim3ToMim1Send: GainNode;
  private mim3ToMim2Send: GainNode;
  private mim3ToMim4Send: GainNode;
  private mim3ToReverbSend: GainNode;
  // Mimeophon 4 cross-sends
  private mim4ToMim1Send: GainNode;
  private mim4ToMim2Send: GainNode;
  private mim4ToMim3Send: GainNode;
  private mim4ToReverbSend: GainNode;
  // Reverb cross-sends
  private reverbToMim1Send: GainNode;
  private reverbToMim2Send: GainNode;
  private reverbToMim3Send: GainNode;
  private reverbToMim4Send: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // Create send buses for all 4 Mimeophons
    this.mimeophonSendBus = ctx.createGain();
    this.mimeophonSendBus2 = ctx.createGain();
    this.mimeophonSendBus3 = ctx.createGain();
    this.mimeophonSendBus4 = ctx.createGain();
    this.reverbSendBus = ctx.createGain();

    // Create effects - as send effects, they should be 100% wet (mix = 1)
    this.mimeophon = new Mimeophon(ctx);
    this.mimeophon.setParams({ mix: 1.0 });

    this.mimeophon2 = new Mimeophon(ctx);
    this.mimeophon2.setParams({ mix: 1.0 });

    this.mimeophon3 = new Mimeophon(ctx);
    this.mimeophon3.setParams({ mix: 1.0 });

    this.mimeophon4 = new Mimeophon(ctx);
    this.mimeophon4.setParams({ mix: 1.0 });

    this.reverb = new Reverb(ctx);
    this.reverb.setParams({ dryLevel: 0, wetLevel: 1.0 });

    // Create return gains for all 4 Mimeophons
    this.mimeophonReturn = ctx.createGain();
    this.mimeophonReturn.gain.value = this.mimeophonReturnLevel;
    this.mimeophonReturn2 = ctx.createGain();
    this.mimeophonReturn2.gain.value = this.mimeophonReturnLevel2;
    this.mimeophonReturn3 = ctx.createGain();
    this.mimeophonReturn3.gain.value = this.mimeophonReturnLevel3;
    this.mimeophonReturn4 = ctx.createGain();
    this.mimeophonReturn4.gain.value = this.mimeophonReturnLevel4;
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = this.reverbReturnLevel;

    // Create pre-effect bus (direct signals go here)
    this.preEffectBus = ctx.createGain();

    // Create recording tap (after master, before destination)
    this.recordingTap = ctx.createGain();
    this.recordingTap.gain.value = 1.0;

    // Create master bus (connects to recording tap, not directly to destination)
    this.masterBus = new MasterBus(ctx);
    this.masterBus.output.connect(this.recordingTap);
    this.recordingTap.connect(ctx.destination);

    // Create FX cross-send gain nodes (all start at 0)
    // Mimeophon 1 cross-sends
    this.mim1ToMim2Send = ctx.createGain();
    this.mim1ToMim2Send.gain.value = 0;
    this.mim1ToMim3Send = ctx.createGain();
    this.mim1ToMim3Send.gain.value = 0;
    this.mim1ToMim4Send = ctx.createGain();
    this.mim1ToMim4Send.gain.value = 0;
    this.mim1ToReverbSend = ctx.createGain();
    this.mim1ToReverbSend.gain.value = 0;
    // Mimeophon 2 cross-sends
    this.mim2ToMim1Send = ctx.createGain();
    this.mim2ToMim1Send.gain.value = 0;
    this.mim2ToMim3Send = ctx.createGain();
    this.mim2ToMim3Send.gain.value = 0;
    this.mim2ToMim4Send = ctx.createGain();
    this.mim2ToMim4Send.gain.value = 0;
    this.mim2ToReverbSend = ctx.createGain();
    this.mim2ToReverbSend.gain.value = 0;
    // Mimeophon 3 cross-sends
    this.mim3ToMim1Send = ctx.createGain();
    this.mim3ToMim1Send.gain.value = 0;
    this.mim3ToMim2Send = ctx.createGain();
    this.mim3ToMim2Send.gain.value = 0;
    this.mim3ToMim4Send = ctx.createGain();
    this.mim3ToMim4Send.gain.value = 0;
    this.mim3ToReverbSend = ctx.createGain();
    this.mim3ToReverbSend.gain.value = 0;
    // Mimeophon 4 cross-sends
    this.mim4ToMim1Send = ctx.createGain();
    this.mim4ToMim1Send.gain.value = 0;
    this.mim4ToMim2Send = ctx.createGain();
    this.mim4ToMim2Send.gain.value = 0;
    this.mim4ToMim3Send = ctx.createGain();
    this.mim4ToMim3Send.gain.value = 0;
    this.mim4ToReverbSend = ctx.createGain();
    this.mim4ToReverbSend.gain.value = 0;
    // Reverb cross-sends
    this.reverbToMim1Send = ctx.createGain();
    this.reverbToMim1Send.gain.value = 0;
    this.reverbToMim2Send = ctx.createGain();
    this.reverbToMim2Send.gain.value = 0;
    this.reverbToMim3Send = ctx.createGain();
    this.reverbToMim3Send.gain.value = 0;
    this.reverbToMim4Send = ctx.createGain();
    this.reverbToMim4Send.gain.value = 0;

    // Build FX routing
    this.buildGraph();
  }

  private buildGraph(): void {
    // Send buses -> Effects (all 4 Mimeophons)
    this.mimeophonSendBus.connect(this.mimeophon.input);
    this.mimeophonSendBus2.connect(this.mimeophon2.input);
    this.mimeophonSendBus3.connect(this.mimeophon3.input);
    this.mimeophonSendBus4.connect(this.mimeophon4.input);
    this.reverbSendBus.connect(this.reverb.input);

    // Effect outputs -> Returns (all 4 Mimeophons)
    this.mimeophon.output.connect(this.mimeophonReturn);
    this.mimeophon2.output.connect(this.mimeophonReturn2);
    this.mimeophon3.output.connect(this.mimeophonReturn3);
    this.mimeophon4.output.connect(this.mimeophonReturn4);
    this.reverb.output.connect(this.reverbReturn);

    // FX Cross-sends: Effect outputs -> Cross-send gains -> Other effect inputs
    // Mimeophon 1 cross-sends
    this.mimeophon.output.connect(this.mim1ToMim2Send);
    this.mim1ToMim2Send.connect(this.mimeophon2.input);
    this.mimeophon.output.connect(this.mim1ToMim3Send);
    this.mim1ToMim3Send.connect(this.mimeophon3.input);
    this.mimeophon.output.connect(this.mim1ToMim4Send);
    this.mim1ToMim4Send.connect(this.mimeophon4.input);
    this.mimeophon.output.connect(this.mim1ToReverbSend);
    this.mim1ToReverbSend.connect(this.reverb.input);

    // Mimeophon 2 cross-sends
    this.mimeophon2.output.connect(this.mim2ToMim1Send);
    this.mim2ToMim1Send.connect(this.mimeophon.input);
    this.mimeophon2.output.connect(this.mim2ToMim3Send);
    this.mim2ToMim3Send.connect(this.mimeophon3.input);
    this.mimeophon2.output.connect(this.mim2ToMim4Send);
    this.mim2ToMim4Send.connect(this.mimeophon4.input);
    this.mimeophon2.output.connect(this.mim2ToReverbSend);
    this.mim2ToReverbSend.connect(this.reverb.input);

    // Mimeophon 3 cross-sends
    this.mimeophon3.output.connect(this.mim3ToMim1Send);
    this.mim3ToMim1Send.connect(this.mimeophon.input);
    this.mimeophon3.output.connect(this.mim3ToMim2Send);
    this.mim3ToMim2Send.connect(this.mimeophon2.input);
    this.mimeophon3.output.connect(this.mim3ToMim4Send);
    this.mim3ToMim4Send.connect(this.mimeophon4.input);
    this.mimeophon3.output.connect(this.mim3ToReverbSend);
    this.mim3ToReverbSend.connect(this.reverb.input);

    // Mimeophon 4 cross-sends
    this.mimeophon4.output.connect(this.mim4ToMim1Send);
    this.mim4ToMim1Send.connect(this.mimeophon.input);
    this.mimeophon4.output.connect(this.mim4ToMim2Send);
    this.mim4ToMim2Send.connect(this.mimeophon2.input);
    this.mimeophon4.output.connect(this.mim4ToMim3Send);
    this.mim4ToMim3Send.connect(this.mimeophon3.input);
    this.mimeophon4.output.connect(this.mim4ToReverbSend);
    this.mim4ToReverbSend.connect(this.reverb.input);

    // Reverb cross-sends
    this.reverb.output.connect(this.reverbToMim1Send);
    this.reverbToMim1Send.connect(this.mimeophon.input);
    this.reverb.output.connect(this.reverbToMim2Send);
    this.reverbToMim2Send.connect(this.mimeophon2.input);
    this.reverb.output.connect(this.reverbToMim3Send);
    this.reverbToMim3Send.connect(this.mimeophon3.input);
    this.reverb.output.connect(this.reverbToMim4Send);
    this.reverbToMim4Send.connect(this.mimeophon4.input);

    // Returns -> Master bus (all 4 Mimeophons)
    this.mimeophonReturn.connect(this.masterBus.input);
    this.mimeophonReturn2.connect(this.masterBus.input);
    this.mimeophonReturn3.connect(this.masterBus.input);
    this.mimeophonReturn4.connect(this.masterBus.input);
    this.reverbReturn.connect(this.masterBus.input);

    // Direct signal -> Master bus
    this.preEffectBus.connect(this.masterBus.input);
  }

  /**
   * Initialize filter worklets for all existing channels
   * Must be called after filter worklet module is registered with AudioContext
   */
  async initFilterWorklets(): Promise<void> {
    if (this.filterWorkletsRegistered) return;

    // Initialize filter worklets for all existing channels
    const initPromises: Promise<void>[] = [];
    for (const channel of this.channels.values()) {
      initPromises.push(channel.filterEffect.initWorklets());
    }

    await Promise.all(initPromises);
    this.filterWorkletsRegistered = true;
  }

  /**
   * Create a mixer channel for a track
   */
  createChannel(id: string, params?: Partial<ChannelParams>): GainNode {
    // Remove existing channel if present
    if (this.channels.has(id)) {
      this.removeChannel(id);
    }

    const channelParams: ChannelParams = { ...DEFAULT_CHANNEL, ...params };

    // Create channel nodes
    const inputNode = this.ctx.createGain();
    const filterEffect = new FilterEffect(this.ctx, channelParams.filter);
    const saturationEffect = new SaturationEffect(this.ctx, channelParams.saturation);
    const volumeNode = this.ctx.createGain();
    const panNode = this.ctx.createStereoPanner();
    const delaySendNode = this.ctx.createGain();
    const delaySendNode2 = this.ctx.createGain();
    const delaySendNode3 = this.ctx.createGain();
    const delaySendNode4 = this.ctx.createGain();
    const reverbSendNode = this.ctx.createGain();

    // Initialize send gains to 0 immediately to prevent audio leakage
    // before updateChannel() applies the actual channel params
    delaySendNode.gain.value = 0;
    delaySendNode2.gain.value = 0;
    delaySendNode3.gain.value = 0;
    delaySendNode4.gain.value = 0;
    reverbSendNode.gain.value = 0;

    // Build channel routing
    // Input -> Filter -> Saturation -> Volume -> Pan -> Direct bus
    inputNode.connect(filterEffect.input);
    filterEffect.output.connect(saturationEffect.input);
    saturationEffect.output.connect(volumeNode);
    volumeNode.connect(panNode);
    panNode.connect(this.preEffectBus);

    // Pre-fader sends (from input, before volume)
    // Uncomment for pre-fader sends:
    // inputNode.connect(delaySendNode);
    // inputNode.connect(reverbSendNode);

    // Post-fader sends (from volume, after fader)
    volumeNode.connect(delaySendNode);
    volumeNode.connect(delaySendNode2);
    volumeNode.connect(delaySendNode3);
    volumeNode.connect(delaySendNode4);
    volumeNode.connect(reverbSendNode);

    // Sends -> Send buses (all 4 Mimeophons)
    delaySendNode.connect(this.mimeophonSendBus);
    delaySendNode2.connect(this.mimeophonSendBus2);
    delaySendNode3.connect(this.mimeophonSendBus3);
    delaySendNode4.connect(this.mimeophonSendBus4);
    reverbSendNode.connect(this.reverbSendBus);

    // Store channel
    const channel: MixerChannel = {
      id,
      params: channelParams,
      inputNode,
      filterEffect,
      saturationEffect,
      volumeNode,
      panNode,
      delaySendNode,
      delaySendNode2,
      delaySendNode3,
      delaySendNode4,
      reverbSendNode
    };

    this.channels.set(id, channel);

    // Initialize filter worklets if already registered
    if (this.filterWorkletsRegistered) {
      filterEffect.initWorklets().catch(err => {
        console.error(`[Mixer] Failed to init filter worklets for channel ${id}:`, err);
      });
    }

    // Apply initial parameters
    this.updateChannel(id, channelParams);

    // Return input node for voice connection
    return inputNode;
  }

  /**
   * Get the input node for a channel (for connecting voices)
   */
  getChannelInput(id: string): GainNode | null {
    return this.channels.get(id)?.inputNode ?? null;
  }

  /**
   * Update channel parameters
   */
  updateChannel(id: string, params: Partial<ChannelParams>): void {
    const channel = this.channels.get(id);
    if (!channel) return;

    // Deep merge for nested objects (filter, saturation) to preserve sub-params
    const mergedParams = { ...channel.params, ...params };
    if (params.filter) {
      mergedParams.filter = { ...channel.params.filter, ...params.filter };
    }
    if (params.saturation) {
      mergedParams.saturation = { ...channel.params.saturation, ...params.saturation };
    }
    channel.params = mergedParams;
    const t = this.ctx.currentTime;

    // Apply parameters
    // Use very short smoothing (2ms) for channel params to minimize p-lock bleed between steps
    // This is a compromise between instant (which can click) and too slow (which causes audible bleed)
    const smoothTime = 0.002;
    const volume = channel.params.mute ? 0 : channel.params.volume;
    channel.volumeNode.gain.setTargetAtTime(volume, t, smoothTime);
    channel.panNode.pan.setTargetAtTime(channel.params.pan, t, smoothTime);
    channel.delaySendNode.gain.setTargetAtTime(channel.params.delaySend, t, smoothTime);
    channel.delaySendNode2.gain.setTargetAtTime(channel.params.delaySend2, t, smoothTime);
    channel.delaySendNode3.gain.setTargetAtTime(channel.params.delaySend3, t, smoothTime);
    channel.delaySendNode4.gain.setTargetAtTime(channel.params.delaySend4, t, smoothTime);
    channel.reverbSendNode.gain.setTargetAtTime(channel.params.reverbSend, t, smoothTime);

    // Apply filter parameters
    if (params.filter) {
      channel.filterEffect.setParams(channel.params.filter);
    }

    // Apply saturation parameters
    if (params.saturation) {
      channel.saturationEffect.setParams(channel.params.saturation);
    }
  }

  /**
   * Get channel parameters
   */
  getChannelParams(id: string): ChannelParams | null {
    return this.channels.get(id)?.params ?? null;
  }

  /**
   * Remove a channel
   */
  removeChannel(id: string): void {
    const channel = this.channels.get(id);
    if (!channel) return;

    channel.inputNode.disconnect();
    channel.filterEffect.destroy();
    channel.saturationEffect.destroy();
    channel.volumeNode.disconnect();
    channel.panNode.disconnect();
    channel.delaySendNode.disconnect();
    channel.delaySendNode2.disconnect();
    channel.delaySendNode3.disconnect();
    channel.delaySendNode4.disconnect();
    channel.reverbSendNode.disconnect();

    this.channels.delete(id);
  }

  /**
   * Set mimeophon return level
   */
  setMimeophonReturnLevel(level: number): void {
    this.mimeophonReturnLevel = Math.max(0, Math.min(1, level));
    this.mimeophonReturn.gain.setTargetAtTime(
      this.mimeophonReturnLevel,
      this.ctx.currentTime, 0.02
    );
  }

  /**
   * Set mimeophon 2 return level
   */
  setMimeophonReturnLevel2(level: number): void {
    this.mimeophonReturnLevel2 = Math.max(0, Math.min(1, level));
    this.mimeophonReturn2.gain.setTargetAtTime(
      this.mimeophonReturnLevel2,
      this.ctx.currentTime, 0.02
    );
  }

  /**
   * Set mimeophon 3 return level
   */
  setMimeophonReturnLevel3(level: number): void {
    this.mimeophonReturnLevel3 = Math.max(0, Math.min(1, level));
    this.mimeophonReturn3.gain.setTargetAtTime(
      this.mimeophonReturnLevel3,
      this.ctx.currentTime, 0.02
    );
  }

  /**
   * Set mimeophon 4 return level
   */
  setMimeophonReturnLevel4(level: number): void {
    this.mimeophonReturnLevel4 = Math.max(0, Math.min(1, level));
    this.mimeophonReturn4.gain.setTargetAtTime(
      this.mimeophonReturnLevel4,
      this.ctx.currentTime, 0.02
    );
  }

  /**
   * Set reverb return level
   */
  setReverbReturnLevel(level: number): void {
    this.reverbReturnLevel = Math.max(0, Math.min(1, level));
    this.reverbReturn.gain.setTargetAtTime(
      this.reverbReturnLevel,
      this.ctx.currentTime, 0.02
    );
  }

  /**
   * Get mimeophon return level
   */
  getMimeophonReturnLevel(): number {
    return this.mimeophonReturnLevel;
  }

  /**
   * Get mimeophon 2 return level
   */
  getMimeophonReturnLevel2(): number {
    return this.mimeophonReturnLevel2;
  }

  /**
   * Get mimeophon 3 return level
   */
  getMimeophonReturnLevel3(): number {
    return this.mimeophonReturnLevel3;
  }

  /**
   * Get mimeophon 4 return level
   */
  getMimeophonReturnLevel4(): number {
    return this.mimeophonReturnLevel4;
  }

  /**
   * Get reverb return level
   */
  getReverbReturnLevel(): number {
    return this.reverbReturnLevel;
  }

  /**
   * Get the mimeophon effect instance
   */
  getMimeophon(): Mimeophon {
    return this.mimeophon;
  }

  /**
   * Get the mimeophon 2 effect instance
   */
  getMimeophon2(): Mimeophon {
    return this.mimeophon2;
  }

  /**
   * Get the mimeophon 3 effect instance
   */
  getMimeophon3(): Mimeophon {
    return this.mimeophon3;
  }

  /**
   * Get the mimeophon 4 effect instance
   */
  getMimeophon4(): Mimeophon {
    return this.mimeophon4;
  }

  /**
   * Get the reverb effect instance
   */
  getReverb(): Reverb {
    return this.reverb;
  }

  /**
   * Get the master bus instance
   */
  getMasterBus(): MasterBus {
    return this.masterBus;
  }

  /**
   * Get the recording tap node (for connecting WAV recorder)
   * This is positioned after the master bus, before the destination
   */
  getRecordingTap(): GainNode {
    return this.recordingTap;
  }

  /**
   * Update mimeophon parameters
   */
  setMimeophonParams(params: Partial<MimeophonParams>): void {
    this.mimeophon.setParams(params);
  }

  /**
   * Update mimeophon 2 parameters
   */
  setMimeophonParams2(params: Partial<MimeophonParams>): void {
    this.mimeophon2.setParams(params);
  }

  /**
   * Update mimeophon 3 parameters
   */
  setMimeophonParams3(params: Partial<MimeophonParams>): void {
    this.mimeophon3.setParams(params);
  }

  /**
   * Update mimeophon 4 parameters
   */
  setMimeophonParams4(params: Partial<MimeophonParams>): void {
    this.mimeophon4.setParams(params);
  }

  /**
   * Update reverb parameters
   */
  setReverbParams(params: Partial<ReverbParams>): void {
    this.reverb.setParams(params);
  }

  /**
   * Update master bus parameters
   */
  setMasterParams(params: Partial<MasterBusParams>): void {
    this.masterBus.setParams(params);
  }

  /**
   * Set tempo (for future tempo-synced effects)
   */
  setBpm(_bpm: number): void {
    // Mimeophon uses absolute time, not tempo sync
    // Keep method for API compatibility
  }

  /**
   * Set FX cross-send levels
   */
  setFXCrossSends(params: Partial<FXCrossSends>): void {
    const t = this.ctx.currentTime;
    this.fxCrossSends = { ...this.fxCrossSends, ...params };

    // Apply cross-send levels with smoothing
    if (params.mim1ToMim2 !== undefined) {
      this.mim1ToMim2Send.gain.setTargetAtTime(params.mim1ToMim2, t, 0.02);
    }
    if (params.mim1ToMim3 !== undefined) {
      this.mim1ToMim3Send.gain.setTargetAtTime(params.mim1ToMim3, t, 0.02);
    }
    if (params.mim1ToMim4 !== undefined) {
      this.mim1ToMim4Send.gain.setTargetAtTime(params.mim1ToMim4, t, 0.02);
    }
    if (params.mim1ToReverb !== undefined) {
      this.mim1ToReverbSend.gain.setTargetAtTime(params.mim1ToReverb, t, 0.02);
    }
    if (params.mim2ToMim1 !== undefined) {
      this.mim2ToMim1Send.gain.setTargetAtTime(params.mim2ToMim1, t, 0.02);
    }
    if (params.mim2ToMim3 !== undefined) {
      this.mim2ToMim3Send.gain.setTargetAtTime(params.mim2ToMim3, t, 0.02);
    }
    if (params.mim2ToMim4 !== undefined) {
      this.mim2ToMim4Send.gain.setTargetAtTime(params.mim2ToMim4, t, 0.02);
    }
    if (params.mim2ToReverb !== undefined) {
      this.mim2ToReverbSend.gain.setTargetAtTime(params.mim2ToReverb, t, 0.02);
    }
    if (params.mim3ToMim1 !== undefined) {
      this.mim3ToMim1Send.gain.setTargetAtTime(params.mim3ToMim1, t, 0.02);
    }
    if (params.mim3ToMim2 !== undefined) {
      this.mim3ToMim2Send.gain.setTargetAtTime(params.mim3ToMim2, t, 0.02);
    }
    if (params.mim3ToMim4 !== undefined) {
      this.mim3ToMim4Send.gain.setTargetAtTime(params.mim3ToMim4, t, 0.02);
    }
    if (params.mim3ToReverb !== undefined) {
      this.mim3ToReverbSend.gain.setTargetAtTime(params.mim3ToReverb, t, 0.02);
    }
    if (params.mim4ToMim1 !== undefined) {
      this.mim4ToMim1Send.gain.setTargetAtTime(params.mim4ToMim1, t, 0.02);
    }
    if (params.mim4ToMim2 !== undefined) {
      this.mim4ToMim2Send.gain.setTargetAtTime(params.mim4ToMim2, t, 0.02);
    }
    if (params.mim4ToMim3 !== undefined) {
      this.mim4ToMim3Send.gain.setTargetAtTime(params.mim4ToMim3, t, 0.02);
    }
    if (params.mim4ToReverb !== undefined) {
      this.mim4ToReverbSend.gain.setTargetAtTime(params.mim4ToReverb, t, 0.02);
    }
    if (params.reverbToMim1 !== undefined) {
      this.reverbToMim1Send.gain.setTargetAtTime(params.reverbToMim1, t, 0.02);
    }
    if (params.reverbToMim2 !== undefined) {
      this.reverbToMim2Send.gain.setTargetAtTime(params.reverbToMim2, t, 0.02);
    }
    if (params.reverbToMim3 !== undefined) {
      this.reverbToMim3Send.gain.setTargetAtTime(params.reverbToMim3, t, 0.02);
    }
    if (params.reverbToMim4 !== undefined) {
      this.reverbToMim4Send.gain.setTargetAtTime(params.reverbToMim4, t, 0.02);
    }
  }

  /**
   * Get FX cross-send levels
   */
  getFXCrossSends(): FXCrossSends {
    return { ...this.fxCrossSends };
  }

  /**
   * Get all channel IDs
   */
  getChannelIds(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Serialize mixer state
   */
  getState(): MixerState {
    const channels: Record<string, ChannelParams> = {};
    for (const [id, channel] of this.channels) {
      channels[id] = { ...channel.params };
    }

    return {
      channels,
      mimeophon: this.mimeophon.getParams(),
      mimeophon2: this.mimeophon2.getParams(),
      mimeophon3: this.mimeophon3.getParams(),
      mimeophon4: this.mimeophon4.getParams(),
      reverb: this.reverb.getParams(),
      master: this.masterBus.getParams(),
      mimeophonReturnLevel: this.mimeophonReturnLevel,
      mimeophonReturnLevel2: this.mimeophonReturnLevel2,
      mimeophonReturnLevel3: this.mimeophonReturnLevel3,
      mimeophonReturnLevel4: this.mimeophonReturnLevel4,
      reverbReturnLevel: this.reverbReturnLevel,
      fxCrossSends: { ...this.fxCrossSends }
    };
  }

  /**
   * Restore mixer state
   */
  setState(state: Partial<MixerState>): void {
    if (state.channels) {
      for (const [id, params] of Object.entries(state.channels)) {
        if (this.channels.has(id)) {
          this.updateChannel(id, params);
        }
      }
    }

    if (state.mimeophon) {
      this.mimeophon.setParams(state.mimeophon);
    }

    if (state.mimeophon2) {
      this.mimeophon2.setParams(state.mimeophon2);
    }

    if (state.mimeophon3) {
      this.mimeophon3.setParams(state.mimeophon3);
    }

    if (state.mimeophon4) {
      this.mimeophon4.setParams(state.mimeophon4);
    }

    if (state.reverb) {
      this.reverb.setParams(state.reverb);
    }

    if (state.master) {
      this.masterBus.setParams(state.master);
    }

    if (state.mimeophonReturnLevel !== undefined) {
      this.setMimeophonReturnLevel(state.mimeophonReturnLevel);
    }

    if (state.mimeophonReturnLevel2 !== undefined) {
      this.setMimeophonReturnLevel2(state.mimeophonReturnLevel2);
    }

    if (state.mimeophonReturnLevel3 !== undefined) {
      this.setMimeophonReturnLevel3(state.mimeophonReturnLevel3);
    }

    if (state.mimeophonReturnLevel4 !== undefined) {
      this.setMimeophonReturnLevel4(state.mimeophonReturnLevel4);
    }

    if (state.reverbReturnLevel !== undefined) {
      this.setReverbReturnLevel(state.reverbReturnLevel);
    }

    if (state.fxCrossSends) {
      this.setFXCrossSends(state.fxCrossSends);
    }
  }

  /**
   * Get limiter gain reduction for metering
   */
  getLimiterGainReduction(): number {
    return this.masterBus.getGainReduction();
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    // Remove all channels
    for (const id of this.channels.keys()) {
      this.removeChannel(id);
    }

    // Disconnect buses (all 4 Mimeophons)
    this.mimeophonSendBus.disconnect();
    this.mimeophonSendBus2.disconnect();
    this.mimeophonSendBus3.disconnect();
    this.mimeophonSendBus4.disconnect();
    this.reverbSendBus.disconnect();
    this.mimeophonReturn.disconnect();
    this.mimeophonReturn2.disconnect();
    this.mimeophonReturn3.disconnect();
    this.mimeophonReturn4.disconnect();
    this.reverbReturn.disconnect();
    this.preEffectBus.disconnect();
    this.recordingTap.disconnect();

    // Disconnect FX cross-sends
    this.mim1ToMim2Send.disconnect();
    this.mim1ToMim3Send.disconnect();
    this.mim1ToMim4Send.disconnect();
    this.mim1ToReverbSend.disconnect();
    this.mim2ToMim1Send.disconnect();
    this.mim2ToMim3Send.disconnect();
    this.mim2ToMim4Send.disconnect();
    this.mim2ToReverbSend.disconnect();
    this.mim3ToMim1Send.disconnect();
    this.mim3ToMim2Send.disconnect();
    this.mim3ToMim4Send.disconnect();
    this.mim3ToReverbSend.disconnect();
    this.mim4ToMim1Send.disconnect();
    this.mim4ToMim2Send.disconnect();
    this.mim4ToMim3Send.disconnect();
    this.mim4ToReverbSend.disconnect();
    this.reverbToMim1Send.disconnect();
    this.reverbToMim2Send.disconnect();
    this.reverbToMim3Send.disconnect();
    this.reverbToMim4Send.disconnect();

    // Dispose effects (all 4 Mimeophons)
    this.mimeophon.dispose();
    this.mimeophon2.dispose();
    this.mimeophon3.dispose();
    this.mimeophon4.dispose();
    this.reverb.dispose();
    this.masterBus.dispose();
  }
}

/**
 * MixerView - Classic mixer interface with faders and knobs
 *
 * Displays all tracks in a horizontal mixer layout with:
 * - Volume fader (vertical)
 * - Pan knob
 * - Send knobs (4 delays + reverb)
 * - Solo/Mute buttons
 *
 * Solo/Mute are global (not per-pattern)
 * Volume, pan, and sends are per-pattern (stored in slot configs)
 */

import { useState, useEffect, useCallback } from 'react';
import { engine } from '../audio/engine';
import type { ChannelParams } from '../audio/fx/Mixer';
import './MixerView.css';

interface TrackInfo {
  id: string;
  name: string;
}

interface MixerViewProps {
  tracks: TrackInfo[];
  /** Key to force refresh when pattern changes */
  refreshKey?: number;
}

interface ChannelState {
  volume: number;
  pan: number;
  delaySend: number;
  delaySend2: number;
  delaySend3: number;
  delaySend4: number;
  reverbSend: number;
  muted: boolean;
  solo: boolean;
}

export function MixerView({ tracks, refreshKey }: MixerViewProps) {
  const [channelStates, setChannelStates] = useState<Map<string, ChannelState>>(new Map());

  // Load channel states from engine
  const loadChannelStates = useCallback(() => {
    const states = new Map<string, ChannelState>();

    for (const track of tracks) {
      const channelParams = engine.getChannelParams(track.id);
      const trackData = engine.getTrack(track.id);

      if (channelParams && trackData) {
        states.set(track.id, {
          volume: channelParams.volume,
          pan: channelParams.pan,
          delaySend: channelParams.delaySend,
          delaySend2: channelParams.delaySend2,
          delaySend3: channelParams.delaySend3,
          delaySend4: channelParams.delaySend4,
          reverbSend: channelParams.reverbSend,
          muted: trackData.muted,
          solo: trackData.solo,
        });
      }
    }

    setChannelStates(states);
  }, [tracks]);

  // Load on mount and when refreshKey changes (pattern switch)
  useEffect(() => {
    loadChannelStates();
  }, [loadChannelStates, refreshKey]);

  // Update volume
  const handleVolumeChange = useCallback((trackId: string, volume: number) => {
    engine.updateChannelParams(trackId, { volume });
    setChannelStates(prev => {
      const next = new Map(prev);
      const state = next.get(trackId);
      if (state) {
        next.set(trackId, { ...state, volume });
      }
      return next;
    });
  }, []);

  // Update pan
  const handlePanChange = useCallback((trackId: string, pan: number) => {
    engine.updateChannelParams(trackId, { pan });
    setChannelStates(prev => {
      const next = new Map(prev);
      const state = next.get(trackId);
      if (state) {
        next.set(trackId, { ...state, pan });
      }
      return next;
    });
  }, []);

  // Update sends
  const handleSendChange = useCallback((trackId: string, sendKey: keyof ChannelParams, value: number) => {
    engine.updateChannelParams(trackId, { [sendKey]: value });
    setChannelStates(prev => {
      const next = new Map(prev);
      const state = next.get(trackId);
      if (state) {
        next.set(trackId, { ...state, [sendKey]: value });
      }
      return next;
    });
  }, []);

  // Toggle mute (global, not per-pattern)
  const handleMuteToggle = useCallback((trackId: string) => {
    const state = channelStates.get(trackId);
    if (state) {
      const newMuted = !state.muted;
      engine.setTrackMuted(trackId, newMuted);
      setChannelStates(prev => {
        const next = new Map(prev);
        const s = next.get(trackId);
        if (s) {
          next.set(trackId, { ...s, muted: newMuted });
        }
        return next;
      });
    }
  }, [channelStates]);

  // Toggle solo (global, not per-pattern)
  const handleSoloToggle = useCallback((trackId: string) => {
    const state = channelStates.get(trackId);
    if (state) {
      const newSolo = !state.solo;
      engine.setTrackSolo(trackId, newSolo);
      setChannelStates(prev => {
        const next = new Map(prev);
        const s = next.get(trackId);
        if (s) {
          next.set(trackId, { ...s, solo: newSolo });
        }
        return next;
      });
    }
  }, [channelStates]);

  // Format pan display
  const formatPan = (pan: number): string => {
    if (pan === 0) return 'C';
    if (pan < 0) return `L${Math.abs(Math.round(pan * 100))}`;
    return `R${Math.round(pan * 100)}`;
  };

  // Format dB display for volume
  const formatDb = (volume: number): string => {
    if (volume === 0) return '-∞';
    const db = 20 * Math.log10(volume);
    if (db <= -60) return '-∞';
    return `${db.toFixed(1)}`;
  };

  return (
    <div className="mixer-view">
      <div className="mixer-channels">
        {tracks.map((track) => {
          const state = channelStates.get(track.id);
          if (!state) return null;

          return (
            <div key={track.id} className="mixer-channel">
              {/* Track name */}
              <div className="channel-name">{track.name}</div>

              {/* Solo/Mute buttons */}
              <div className="channel-buttons">
                <button
                  className={`channel-btn solo-btn ${state.solo ? 'active' : ''}`}
                  onClick={() => handleSoloToggle(track.id)}
                  title="Solo"
                >
                  S
                </button>
                <button
                  className={`channel-btn mute-btn ${state.muted ? 'active' : ''}`}
                  onClick={() => handleMuteToggle(track.id)}
                  title="Mute"
                >
                  M
                </button>
              </div>

              {/* Send knobs */}
              <div className="channel-sends">
                <div className="send-knob">
                  <label>D1</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={state.delaySend}
                    onChange={(e) => handleSendChange(track.id, 'delaySend', parseFloat(e.target.value))}
                    className="knob-input"
                  />
                  <span className="send-value">{Math.round(state.delaySend * 100)}</span>
                </div>
                <div className="send-knob">
                  <label>D2</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={state.delaySend2}
                    onChange={(e) => handleSendChange(track.id, 'delaySend2', parseFloat(e.target.value))}
                    className="knob-input"
                  />
                  <span className="send-value">{Math.round(state.delaySend2 * 100)}</span>
                </div>
                <div className="send-knob">
                  <label>D3</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={state.delaySend3}
                    onChange={(e) => handleSendChange(track.id, 'delaySend3', parseFloat(e.target.value))}
                    className="knob-input"
                  />
                  <span className="send-value">{Math.round(state.delaySend3 * 100)}</span>
                </div>
                <div className="send-knob">
                  <label>D4</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={state.delaySend4}
                    onChange={(e) => handleSendChange(track.id, 'delaySend4', parseFloat(e.target.value))}
                    className="knob-input"
                  />
                  <span className="send-value">{Math.round(state.delaySend4 * 100)}</span>
                </div>
                <div className="send-knob reverb">
                  <label>REV</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={state.reverbSend}
                    onChange={(e) => handleSendChange(track.id, 'reverbSend', parseFloat(e.target.value))}
                    className="knob-input"
                  />
                  <span className="send-value">{Math.round(state.reverbSend * 100)}</span>
                </div>
              </div>

              {/* Pan knob */}
              <div className="channel-pan">
                <label>PAN</label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={state.pan}
                  onChange={(e) => handlePanChange(track.id, parseFloat(e.target.value))}
                  className="pan-input"
                />
                <span className="pan-value">{formatPan(state.pan)}</span>
              </div>

              {/* Volume fader */}
              <div className="channel-fader">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={state.volume}
                  onChange={(e) => handleVolumeChange(track.id, parseFloat(e.target.value))}
                  className="fader-input"
                />
                <span className="fader-value">{formatDb(state.volume)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

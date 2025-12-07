# Sample Voice Implementation Plan

## Overview

Add a new voice type `sample` with two modes:
1. **Standard Sampler Mode** - Play samples with traditional sound shaping
2. **Granular Mode** - Granular synthesis for texture and experimentation

Add 2 new tracks: `Sample 1` and `Sample 2`

---

## Architecture

### Files to Create

```
src/audio/voices/SampleVoice.ts         - Main voice class
public/worklets/sample-processor.js      - AudioWorklet for granular processing
src/ui/SamplePanel.tsx                   - UI panel for sample controls
src/ui/SamplePanel.css                   - Styling
```

### Files to Modify

```
src/audio/voices/VoiceManager.ts         - Add 'sample' voice type
src/audio/voices/index.ts                - Export new types
src/audio/engine/index.ts                - Export SampleVoiceParams
src/ui/VoicePanel.tsx                    - Add Sample to voice type selector
src/ui/index.ts                          - Export SamplePanel
src/App.tsx                              - Add Sample 1/2 tracks, import panel
```

---

## Data Structures

### SampleVoiceParams Interface

```typescript
export type SampleMode = 'standard' | 'granular';
export type PlayDirection = 'forward' | 'reverse';

export interface SampleVoiceParams {
  // Mode
  mode: SampleMode;

  // Sample buffer (loaded externally, stored as AudioBuffer)
  // Note: The actual buffer is managed separately, not serialized

  // === STANDARD MODE PARAMS ===
  startPoint: number;      // 0-1 normalized position in sample
  pitch: number;           // Semitones (-24 to +24), 0 = original pitch
  direction: PlayDirection;

  // Envelope (ADSR)
  attack: number;          // seconds (0.001 - 2)
  decay: number;           // seconds (0.001 - 2)
  sustain: number;         // 0-1
  release: number;         // seconds (0.001 - 5)

  // Filters
  lpEnabled: boolean;
  lpCutoff: number;        // Hz (20 - 20000)
  lpResonance: number;     // 0-20
  hpEnabled: boolean;
  hpCutoff: number;        // Hz (20 - 20000)
  hpResonance: number;     // 0-20

  // === GRANULAR MODE PARAMS ===
  scanSpeed: number;       // 0-8 (0 = frozen, 1 = normal, 8 = 8x speed)
  grainLength: number;     // seconds (0.001 - 1.0)
  grainDensity: number;    // grains per second (1 - 100)
  spread: number;          // 0-1 (shifts starting point variance)
  grainPan: number;        // -1 to 1 (stereo spread for grains)

  // Output
  gain: number;            // 0-1
}
```

### Default Parameters

```typescript
const DEFAULT_PARAMS: SampleVoiceParams = {
  mode: 'standard',

  // Standard
  startPoint: 0,
  pitch: 0,
  direction: 'forward',
  attack: 0.001,
  decay: 0.1,
  sustain: 1,
  release: 0.1,
  lpEnabled: false,
  lpCutoff: 20000,
  lpResonance: 0,
  hpEnabled: false,
  hpCutoff: 20,
  hpResonance: 0,

  // Granular
  scanSpeed: 1,
  grainLength: 0.05,
  grainDensity: 20,
  spread: 0,
  grainPan: 0,

  gain: 0.8
};
```

---

## Implementation Details

### 1. SampleVoice.ts (Main Thread)

**Standard Mode Implementation:**
- Use `AudioBufferSourceNode` for sample playback
- Apply pitch via `playbackRate` property
- For reverse, create reversed buffer copy or use negative playback rate
- Use `BiquadFilterNode` for LP/HP filters
- Use `GainNode` with envelope automation for ADSR

**Granular Mode Implementation:**
- Requires AudioWorklet for sample-accurate grain scheduling
- Main thread sends sample data to worklet once loaded
- Parameters sent via port messages
- Each grain is a small slice of the sample with windowing (Hanning)

**Sample Loading:**
- `loadSample(audioBuffer: AudioBuffer)` method
- `loadSampleFromUrl(url: string)` method using fetch + decodeAudioData
- `loadSampleFromFile(file: File)` method using FileReader

**Trigger Method:**
```typescript
trigger(time: number, velocity: number, paramLocks?: Partial<SampleVoiceParams>): void
```

### 2. sample-processor.js (AudioWorklet)

Only used for granular mode. Standard mode uses native Web Audio nodes.

**Grain Structure:**
```javascript
{
  startSample: number,    // Where in buffer to read from
  currentSample: number,  // Current read position
  length: number,         // Grain length in samples
  pan: number,            // -1 to 1
  envelope: number,       // Current envelope value (0-1)
  active: boolean
}
```

**Processing Loop:**
- Maintain pool of grain objects
- Schedule new grains based on density
- Apply Hanning window to each grain
- Mix all active grains to output
- Advance scan position based on scanSpeed

### 3. SamplePanel.tsx (UI)

**Layout:**
```
[Mode Toggle: Standard | Granular]

=== SAMPLE SECTION ===
[Load Sample Button] [Drop Zone]
[Waveform Display]

=== STANDARD MODE (visible when mode=standard) ===
[Start Point slider + waveform marker]
[Pitch slider: -24 to +24 semitones]
[Direction: Forward | Reverse toggle]

[Attack] [Decay] [Sustain] [Release]

[LP Enable] [LP Cutoff] [LP Resonance]
[HP Enable] [HP Cutoff] [HP Resonance]

=== GRANULAR MODE (visible when mode=granular) ===
[Start Position slider + waveform marker]
[Scan Speed: 0 - 8x]
[Grain Length: 1ms - 1000ms]
[Density: 1 - 100 grains/sec]
[Spread: 0 - 100%]
[Pan: -100% to +100%]

=== OUTPUT ===
[Gain slider]
```

**Waveform Display:**
- Canvas-based waveform visualization
- Show start point marker
- For granular, show scan region

### 4. VoiceManager Integration

Add to `VoiceType`:
```typescript
export type VoiceType = 'fm-drum' | 'fm-melodic' | 'noise' | 'complex-morph' | 'sample';
```

Add to `assignVoice()` switch:
```typescript
case 'sample':
  voice = new SampleVoice(this.ctx, destination);
  if (config.preset && config.preset in SAMPLE_PRESETS) {
    (voice as SampleVoice).loadPreset(config.preset as keyof typeof SAMPLE_PRESETS);
  }
  if (config.params) {
    (voice as SampleVoice).setParams(config.params as Partial<SampleVoiceParams>);
  }
  break;
```

### 5. App.tsx Changes

Add tracks:
```typescript
const DEFAULT_TRACKS: TrackInfo[] = [
  { id: 'kick', name: 'Kick' },
  { id: 'snare', name: 'Snare' },
  { id: 'hat', name: 'Hi-Hat' },
  { id: 'perc', name: 'Perc' },
  { id: 'bass', name: 'Bass' },
  { id: 'morph1', name: 'Morph 1' },
  { id: 'morph2', name: 'Morph 2' },
  { id: 'sample1', name: 'Sample 1' },  // NEW
  { id: 'sample2', name: 'Sample 2' },  // NEW
];
```

Initialize sample tracks:
```typescript
case 'sample1':
case 'sample2':
  voiceType = 'sample';
  preset = 'default';
  break;
```

---

## Presets

```typescript
export const SAMPLE_PRESETS: Record<string, Partial<SampleVoiceParams>> = {
  default: {
    mode: 'standard',
    startPoint: 0,
    pitch: 0,
    direction: 'forward',
    attack: 0.001,
    decay: 0.1,
    sustain: 1,
    release: 0.1,
  },

  oneShot: {
    mode: 'standard',
    attack: 0.001,
    decay: 0.5,
    sustain: 0,
    release: 0.01,
  },

  pad: {
    mode: 'standard',
    attack: 0.3,
    decay: 0.5,
    sustain: 0.7,
    release: 0.5,
    lpEnabled: true,
    lpCutoff: 3000,
  },

  granularFreeze: {
    mode: 'granular',
    scanSpeed: 0,
    grainLength: 0.1,
    grainDensity: 30,
    spread: 0.2,
  },

  granularTexture: {
    mode: 'granular',
    scanSpeed: 0.5,
    grainLength: 0.05,
    grainDensity: 50,
    spread: 0.5,
    grainPan: 0.7,
  },

  granularStutter: {
    mode: 'granular',
    scanSpeed: 2,
    grainLength: 0.02,
    grainDensity: 80,
    spread: 0.1,
  },

  reverse: {
    mode: 'standard',
    direction: 'reverse',
    attack: 0.05,
    release: 0.3,
  },

  filtered: {
    mode: 'standard',
    lpEnabled: true,
    lpCutoff: 800,
    lpResonance: 8,
    hpEnabled: true,
    hpCutoff: 200,
  },
};
```

---

## Implementation Order

1. **SampleVoice.ts** - Core voice class
   - Start with standard mode only (simpler)
   - Implement sample loading
   - Implement trigger with envelope
   - Add filters
   - Add pitch/direction control

2. **sample-processor.js** - Granular AudioWorklet
   - Grain scheduling
   - Windowing
   - Scan position management
   - Parameter updates via port

3. **SampleVoice.ts granular mode**
   - Load worklet
   - Transfer sample data
   - Route trigger to worklet

4. **VoiceManager.ts** - Integration
   - Add sample case
   - Handle preset loading

5. **SamplePanel.tsx** - UI
   - Mode toggle
   - Sample loading UI
   - Waveform display
   - Standard mode controls
   - Granular mode controls

6. **App.tsx** - Tracks
   - Add Sample 1/2 tracks
   - Initialize with default sample voice
   - Render SamplePanel for sample tracks

---

## Notes

- Sample data is NOT serialized (too large). User must reload samples after page refresh.
- Consider adding a built-in default sample (short click/transient) so tracks aren't silent.
- Waveform display is optional but highly desirable for UX.
- Drag-and-drop sample loading would be nice but not required for v1.

# tQr4x User Manual

## A Browser-Based Groovebox for Exploratory Sound Design

*Welcome! This manual will walk you through the tQr4x groovebox like we're sitting together in a studio. I'll explain not just what each feature does, but how to use it creatively.*

---

## Table of Contents

1. [First Steps](#first-steps)
2. [Understanding the Interface](#understanding-the-interface)
3. [Voice Types: Your Sound Palette](#voice-types-your-sound-palette)
4. [The Sequencer: Making Patterns](#the-sequencer-making-patterns)
5. [Effects: Shaping Your Sound](#effects-shaping-your-sound)
6. [Modulation: Bringing Things to Life](#modulation-bringing-things-to-life)
7. [Pattern Management: Building Arrangements](#pattern-management-building-arrangements)
8. [Recording and Exporting](#recording-and-exporting)
9. [Creative Recipes](#creative-recipes)
10. [Troubleshooting](#troubleshooting)

---

## First Steps

### Starting the Transport

When you first open tQr4x, nothing plays automatically. Click the **Play** button in the transport section to start the sequencer. You'll see step indicators advancing through your pattern.

**Quick orientation:**
- **BPM** controls your tempo (20-300)
- **Swing** adds groove by delaying every other step (0 = straight, 0.5 = heavy shuffle)
- **Scale/Root** determines which notes your melodic tracks use

### Your First Sound

1. Select **Track 1** by clicking its row
2. In the Voice panel, choose **FM Drum**
3. Select the **kick** preset
4. Click a few steps in the pattern grid to add triggers
5. Hit Play

You should hear a punchy kick drum pattern. Congratulations—you're making music!

---

## Understanding the Interface

### The Main Layout

Think of the screen in three zones:

**Left Side: Transport & Global Controls**
- Play/Stop buttons
- Tempo and swing
- Scale selection for melodic content
- Recording controls

**Center: The Pattern Grid**
- Each row represents one of 12 tracks
- Each column represents one step in your pattern
- Click cells to add/remove triggers
- Selected track is highlighted

**Right Side: Track Details (Tabbed)**
- **Voice**: Choose and configure your sound source
- **Channel**: Volume, pan, filters, saturation, effect sends
- **FX**: Global effects (delays and reverb)
- **Modulation**: LFOs, envelopes, and routing
- **Arrangement**: Pattern bank and song structure

### Selecting and Editing Tracks

Click any track row to select it. The right panel updates to show that track's settings. You can have different voice types on each track—maybe kicks on Track 1, hi-hats on Track 2, a bass line on Track 3.

---

## Voice Types: Your Sound Palette

Each track can use one of many synthesis engines. Here's what makes each special and how to get the most from them.

### FM Drum

*The workhorse for percussion. Capable of everything from soft thuds to harsh metallic hits.*

**What it does:** Uses frequency modulation (FM) synthesis to create complex, punchy drum sounds. Two modulator operators shape a carrier oscillator, with a pitch envelope for that characteristic "drop" at the start of drums.

**Key parameters to explore:**
- **Pitch**: Base frequency. Lower (30-60 Hz) for kicks, higher (100-300 Hz) for toms and percussion
- **Pitch Env Amount**: How much the pitch drops at the start. Higher values = more "thwack"
- **Pitch Env Decay**: How fast the pitch drop happens. Shorter = snappier
- **Op1/Op2 Index**: FM intensity. Low (0-2) = warm and round. High (4-8) = bright and harsh
- **Noise Mix**: Blend in filtered noise for snares, adding organic texture
- **Amp Decay**: Sound length. 0.05s for tight kicks, 0.5s+ for booming toms

**Creative ideas:**
- Start with the **kick** preset, then increase Op1 Index gradually to hear the sound become more aggressive
- For an 808-style kick, set a low pitch (35 Hz), long decay (0.3s), and minimal modulation
- For industrial percussion, max out both FM indices and add noise

### FM Melodic

*Your go-to for bass lines, leads, and melodic content.*

**What it does:** A 3-operator FM synth with ADSR envelope, optional filter, and glide (portamento). Supports multiple notes simultaneously.

**Key parameters:**
- **Op Ratios**: Frequency relationships between operators. Integer ratios (1, 2, 3) = harmonic. Non-integer (1.414, 2.76) = bell-like/inharmonic
- **Op2/Op3 Index**: Modulation depth. Automate these for evolving timbres
- **Filter Enabled**: Turn on for subtractive-style filtering
- **Filter Freq/Q**: Cutoff and resonance. Q above 5 gets aggressive
- **Glide Time**: When enabled, notes slide into each other. Essential for acid bass

**Creative ideas:**
- Classic FM electric piano: Ratios of 1:1:1, moderate indices (2-3), fast attack, medium decay
- Acid bass: Enable glide (150ms), enable filter with high resonance, modulate cutoff with an LFO
- Evolving pad: Long attack/release, slow LFO modulating indices

### Noise Voice

*Your hi-hat and texture machine.*

**What it does:** Filtered noise with optional FM "metallic" layer for pitched, shimmering textures. Perfect for cymbals, hi-hats, and percussive textures.

**Key parameters:**
- **Noise Type**: White (bright), pink (balanced), brown (dark/rumbling)
- **Filter Type/Freq/Q**: Highpass makes hi-hats. Bandpass creates focused textures
- **Metallic Enabled**: Adds FM oscillators for that 808/909 hi-hat shimmer
- **Metallic Freq/Ratios**: Control the pitch of the metallic layer
- **Click Enabled**: Adds a transient "tick" at the start

**Creative ideas:**
- **Closed hi-hat**: Highpass at 8000 Hz, decay 0.05s, metallic enabled
- **Open hi-hat**: Same but decay 0.3s+
- **Cymbal wash**: Bandpass around 3000 Hz, high Q, long decay, metallic layer with non-integer ratios
- **Industrial texture**: Brown noise, lowpass, slow decay, heavy metallic with high indices

### Complex Morph ("The Structuralist")

*For those who want sounds that evolve and breathe.*

**What it does:** Multi-operator FM with drawable, looping envelopes for every parameter. The sound continuously morphs according to your envelope shapes.

**Architecture:** Four FM operators in a chain, plus a notch filter, each controlled by multi-breakpoint envelopes that can loop infinitely.

**Key parameters:**
- **Carrier/Op Frequencies**: Base pitches
- **Envelope Breakpoints**: Click and drag to shape how parameters change over time
- **Period**: How long each envelope cycle takes
- **Loop Mode**: "cycle" for infinite looping, "oneshot" for single plays
- **Notch Freq/Q**: Post-FM filtering for spectral shaping

**Creative ideas:**
- Start with the **evolving** preset and just listen
- Try drawing sharp zigzag patterns in the pitch envelope for glitchy, arpeggiated textures
- Use the notch filter envelope to create vowel-like formant sweeps
- Set different periods for each envelope so they go in and out of phase

### Sample Voice

*Load and manipulate audio samples.*

**What it does:** Plays back samples with pitch shifting, start point control, and optional granular mode.

**Standard mode parameters:**
- **Start Point**: Where playback begins (0-1). Great for p-locking different slices
- **Pitch**: ±24 semitones of pitch shift
- **Direction**: Forward or reverse
- **ADSR**: Shape the volume envelope
- **LP/HP Filters**: Tone shaping

**Granular mode parameters:**
- **Scan Speed**: How fast the playhead moves (0 = frozen texture)
- **Grain Length**: Size of each grain
- **Grain Density**: How many grains per second
- **Spread**: Randomization of grain start positions

**Creative ideas:**
- **Drum hits**: Load a one-shot, short envelope, p-lock different start points per step
- **Frozen texture**: Granular mode, scan speed 0, creates static, evolving ambience from any sample
- **Time stretch**: Granular mode, slow scan speed, stretches audio without pitch change
- **Glitch**: Fast grain density, short grains, high spread

### Ocean Voice

*Dedicated granular synthesizer for atmospheric textures.*

**What it does:** Pure granular synthesis with fine control over all grain parameters. Named for the wave-like, oceanic textures it can create.

**Key parameters:**
- **Position**: Where in the sample the grains are read from
- **Spread**: Random variation around that position
- **Grain Size**: 10-4000ms. Small = buzzy/pitched. Large = smooth/atmospheric
- **Density**: Grains per second
- **Grain Shape**: Envelope applied to each grain (hanning = smooth, rectangle = clicky)
- **Pitch**: Transpose the output

**Creative ideas:**
- **Drone pad**: Large grain size (500-2000ms), low density, slow position modulation
- **Granular rhythm**: Small grains (20-50ms), high density, rapid position changes
- **Spectral freeze**: Set position manually, zero spread, to isolate one moment of sound

### Plaits Engines (0-15)

*Eight melodic and eight percussive engines from the legendary Mutable Instruments Plaits module.*

**Melodic Engines (0-7):**

| Engine | Character | Best For |
|--------|-----------|----------|
| 0 - Virtual Analog | Warm, detuned oscillators | Bass, leads, classic synth sounds |
| 1 - Waveshaper | Triangle through wavefolder | Harmonically rich, West Coast-style |
| 2 - FM | 2-op FM synthesis | Bells, keys, plucks |
| 3 - Formant | Vocal-like resonant filters | Vowel sounds, speech textures |
| 4 - Additive | 24-harmonic synthesis | Organs, evolving timbres |
| 5 - Wavetable | 4 banks of wavetables | Modern digital sounds |
| 6 - Chords | Chord generator | Instant pads and chord stabs |
| 7 - Speech | Vowel synthesis | Robotic speech, weird vocals |

**Percussion Engines (8-15):**

| Engine | Character | Best For |
|--------|-----------|----------|
| 8 - Grain Cloud | Pitched granular | Textural hits, pitched noise |
| 9 - Filtered Noise | Clocked resonant noise | Snares, hi-hats, metallic |
| 10 - Particle Noise | 8-layer dust | Organic textures, rain |
| 11 - Inharmonic String | Karplus-Strong | Plucked sounds, mallets |
| 12 - Modal Resonator | Modal synthesis | Bells, metallic percussion |
| 13 - Analog Kick | Synthesized kick | Punchy, tunable kicks |
| 14 - Analog Snare | Synthesized snare | Classic snare sounds |
| 15 - Analog Hi-Hat | Synthesized hat | Clean, digital hats |

**Universal Plaits parameters:**
- **Harmonics**: Harmonic richness
- **Timbre**: Tonal character (engine-specific)
- **Morph**: Blend/crossfade (engine-specific)
- **FM**: Frequency modulation amount
- **Decay**: Envelope decay time
- **Fade**: Additional control (engine-specific)

**Creative ideas:**
- Modal Resonator + long decay + reverb = beautiful metallic textures
- Chord engine with slow attack = instant pad sounds
- Grain Cloud with modulated timbre = evolving textural percussion

---

## The Sequencer: Making Patterns

### Basic Pattern Editing

**Adding triggers:**
- Click empty cells to add a trigger (step turns on)
- Click again to remove

**Pattern length:**
- Default is 16 steps
- Adjustable from 1-64 steps per track

**Step division:**
- 0.5 = 32nd note steps (double speed)
- 1 = 16th note steps (default)
- 2 = 8th note steps (half speed)

### Step Properties

Right-click any step to access detailed editing:

**Velocity (0-1):** How hard the step hits. 0.1 = soft, 1.0 = full force. Lower velocities are quieter and often trigger softer timbres.

**MicroTime (-0.5 to +0.5):** Shift the step timing. Negative = earlier, positive = later. Use sparingly to add human feel or create flamming effects.

**Probability (0-1):** Chance the step actually triggers. 1 = always, 0.5 = half the time. Perfect for evolving patterns that don't repeat exactly.

**Ratchets (0-4):** Subdivide the step into rapid-fire repeats. 2 = two hits, 4 = machine-gun roll. Great for hi-hat fills.

**Note (melodic tracks):** Which pitch to play. Set per-step for melodies.

### Conditional Triggers (Elektron-style)

One of the most powerful features for creating evolving patterns.

**Format: A:B** means "play on the Ath repetition of every B cycles"

| Condition | Behavior |
|-----------|----------|
| 1:2 | Every other cycle (cycles 1, 3, 5...) |
| 2:2 | The alternate cycles (cycles 2, 4, 6...) |
| 1:4 | Only first of every 4 cycles |
| 3:4 | Only third of every 4 cycles |

**Creative uses:**
- Put your snare on 1:2, create a fill snare on 2:2
- Have a crash only hit on 1:4 (every 4 bars)
- Create variations that emerge over time

### Parameter Locks (P-Locks)

*This is where the magic happens.*

P-locks let you set different parameter values on specific steps. The parameter "snaps" to that value when the step triggers, then holds until the next trigger.

**How to use:**
1. Select a step
2. Enter p-lock edit mode
3. Adjust any voice or channel parameter
4. That parameter is now "locked" to that step

**Example:** Make a filter sweep across 4 steps:
- Step 1: p-lock filter cutoff to 500 Hz
- Step 4: p-lock filter cutoff to 8000 Hz
- Steps 2 and 3 will interpolate between these values

**What you can p-lock:**
- All voice parameters (pitch, decay, FM indices, etc.)
- Channel parameters (filter, saturation, pan)
- Effect sends

**Pro tip:** P-locks take priority over modulation. If a parameter is p-locked, LFOs won't affect it on that step.

### Track Clock Division

Each track can run at a different speed:

| Division | Speed | Useful For |
|----------|-------|------------|
| 1/8 | 8× slower | Long, evolving parts |
| 1/4 | 4× slower | Half-time feels |
| 1/2 | 2× slower | Polyrhythmic patterns |
| 1/1 | Normal | Standard timing |
| 2/1 | 2× faster | Double-time, rapid patterns |
| 4/1 | 4× faster | Hi-hat rolls, fast textures |

**Polyrhythm example:**
- Track 1 (kick): 1/1, 4-step pattern = loops every 4 beats
- Track 2 (snare): 1/1, 3-step pattern = loops every 3 beats
- They realign every 12 beats, creating evolving rhythm

### Fill Control

A global parameter (-1 to 1) that affects trigger density:
- **-1**: Nothing triggers (mute)
- **0**: Normal (as programmed)
- **+1**: Every step triggers

Use for live fills or automation-controlled density changes.

### Drift (Note Variation)

For melodic tracks, drift adds randomness to note selection:
- **0**: Exact notes as programmed
- **0.5**: 50% variation within your scale
- **1.0**: Fully random from available scale notes

Creates generative melodies that stay in key.

---

## Effects: Shaping Your Sound

### Per-Track Channel Strip

Every track has its own channel with:
- **Volume**: Output level
- **Pan**: Stereo position
- **Filter**: Tone shaping
- **Saturation**: Drive and color
- **Sends**: To the 4 delays and reverb

### Filter Types

Choose the filter character that suits your sound:

**Bypass:** No filtering. Use when you want the raw voice.

**Three Sisters (Mannequins-style):**
A multi-mode state variable filter with unique character.
- **Freq**: Center frequency
- **Span**: Separation between low/high outputs
- **Quality**: Resonance character
- **Mode**: Crossover vs formant behavior
- **Output**: Choose low, centre, high, or all combined

*Best for: Complex spectral shaping, unusual filter sounds*

**Wasp (EDP-style):**
Dirty CMOS filter with character.
- **Cutoff/Resonance**: Standard filter controls
- **Mode**: LP/BP/HP/Notch
- **Drive**: Input saturation
- **Chaos**: CMOS nonlinearity (grit and instability)

*Best for: Gritty, analog-sounding filtering*

**SEM (Oberheim-style):**
Classic state variable with smooth morph.
- **Cutoff/Resonance**: Standard controls
- **Morph**: Smoothly blend from LP through Notch to HP
- **Drive**: Pre-filter saturation

*Best for: Warm, musical filtering with smooth transitions*

**Moog (Ladder-style):**
The classic 24dB/octave transistor ladder.
- **Cutoff/Resonance**: At high resonance, self-oscillates
- **Drive/Warmth**: Analog character

*Best for: Bass, anything needing that Moog sound*

### Saturation

Add harmonic color and drive:
- **Mode**: tape (warm), triode (smooth), pentode (aggressive), transformer (colored)
- **Drive**: Intensity (0 = clean, 1 = heavy)
- **Bias**: Asymmetric clipping character
- **Mix**: Blend with clean signal
- **Harmonics**: Even, odd, or both

**Tips:**
- Light tape saturation (drive 0.1-0.3) warms up any sound
- Pentode mode with high drive for industrial sounds
- Use mix < 1 for parallel saturation (keeps dynamics)

### Mimeophon Delays (×4)

Four independent delay units inspired by the Make Noise Mimeophon.

**Time Zones:**
| Zone | Range | Character |
|------|-------|-----------|
| A | 5-50ms | Flanging, Karplus-Strong, metallic |
| B | 50-400ms | Chorus, slapback, short delay |
| C | 400ms-2s | Standard delay, echo |
| D | 2-10s | Long delay, ambient loops |

**Key parameters:**
- **Rate**: Position within the zone
- **Micro Rate/Freq**: LFO modulation of delay time (chorus effects)
- **Skew**: Offset between left and right delay times
- **Repeats**: Feedback (>1.0 for self-oscillation)
- **Color**: Feedback tone (dark to bright)
- **Halo**: Smear/diffusion of repeats
- **Hold**: Freeze the buffer for looping
- **Flip**: Reverse playback
- **Ping-Pong**: Stereo bounce

**Effect chain sends:**
Each Mimeophon can send to the other Mimeophons and reverb, creating complex cascading effects.

**Creative uses:**
- Zone A + high repeats = metallic resonances and Karplus-Strong textures
- Zone C + ping-pong = classic stereo delay
- Zone D + Halo + Flip = ambient sound-on-sound
- Hold = live looping and texture freezing

### Zita Reverb

Natural-sounding algorithmic reverb:
- **Size**: Room dimensions (affects character and pre-delay)
- **Decay**: Tail length
- **Wet/Dry Level**: Balance

*This reverb excels at natural spaces. For metallic or unusual reverb, use the Mimeophons.*

### Master Bus

Final stage processing:
- **Saturation**: Glue and color
- **Tone**: Overall EQ balance

---

## Modulation: Bringing Things to Life

Static sounds are boring. Modulation makes everything move.

### LFOs (×4)

Low Frequency Oscillators continuously vary parameters.

**Shapes:**
- **Sine**: Smooth, musical modulation
- **Triangle**: Linear ramps, good for filter sweeps
- **Square**: Binary switching (on/off effects)
- **Sawtooth**: Ramp up, snap down (rhythmic pumping)
- **Sample & Hold**: Random steps (classic synth randomness)
- **Random**: Smooth random walk

**Rate options:**
- **Free**: Set in Hz (0.01-100 Hz)
- **Tempo Sync**: Lock to song tempo (1/2, 1/4, 1/8, etc.)

**Other parameters:**
- **Phase**: Starting point in the cycle
- **Depth**: How much the destination changes
- **Bipolar**: On = oscillates negative and positive. Off = 0 to positive only

### Envelope Modulators (×6)

Triggered envelopes that can loop.
- **Period**: Cycle time
- **Depth**: Modulation amount
- **Phase**: Starting point
- Tempo syncable

*Use for rhythmic modulation that resets with your pattern.*

### Slow Randomizers (×2)

Gentle, wandering modulation:
- **Rate**: How often values change
- **Smoothing**: How gradually values transition

*Perfect for subtle, organic movement in pads and textures.*

### The Modulation Matrix

This is where you connect sources to destinations.

**Setting up a route:**
1. Choose a **source** (LFO1, Env2, Randomizer1, etc.)
2. Choose a **destination** (filter cutoff, delay send, voice parameter, etc.)
3. Set **depth** (-1 to +1, negative inverts)
4. Optionally target specific track or "all"

**Available destinations include:**
- All voice parameters (varies by voice type)
- Filter cutoff, resonance, drive
- Saturation parameters
- Effect sends
- Effect parameters themselves
- Pan, volume
- Other modulation sources (modulate the modulators!)

**Pro tips:**
- Modulate LFO rate with another LFO for complex, evolving motion
- Use envelope modulators synced to tempo for rhythmic filter sweeps
- Randomizers on delay sends create organic space variation
- Stack multiple modulation sources on one destination (they add together)

---

## Pattern Management: Building Arrangements

### The 16-Pattern Bank

Like Elektron instruments, you have 16 pattern slots. Each track stores its own pattern in each slot.

**Switching patterns:**
Click a pattern slot (1-16) to switch all tracks to that pattern.

**Pattern operations (right-click):**
- **Copy Engines**: Copy voice types and parameters (not sequences)
- **Copy All**: Copy everything including sequences
- **Paste**: Paste clipboard contents
- **Clear**: Reset all sequences in that slot

**Workflow example:**
1. Build your main groove in Pattern 1
2. Copy All to Pattern 2
3. Modify Pattern 2 (different melody, add fills)
4. Switch between them for variation

### Pattern Sequencer (Arranger)

Chain patterns into a song structure:

1. Enable the **Pattern Sequencer**
2. Each cell represents a pattern to play
3. Set which pattern (1-16) goes in each cell
4. Set how many times each pattern repeats (cycles)

**Example arrangement:**
- Cell 1: Pattern 1, 4 cycles (intro)
- Cell 2: Pattern 2, 4 cycles (verse)
- Cell 3: Pattern 3, 2 cycles (fill)
- Cell 4: Pattern 2, 4 cycles (verse)
- Cell 5: Pattern 4, 8 cycles (outro)

The sequencer automatically advances through your arrangement.

---

## Recording and Exporting

### Recording Audio

1. Click **Record** in the transport
2. Play your performance
3. Click **Stop** when finished
4. Click **Download WAV** to save

**Recording includes:**
- All tracks
- All effects
- Master bus processing
- Full stereo audio

### Saving Presets

**Save:** Exports your entire session as a JSON file
- All voice configurations
- All patterns and sequences
- All effects settings
- Modulation routing
- Arrangement

**Load:** Import a saved JSON to restore complete state

*Presets are portable—share them with others!*

---

## Creative Recipes

### Recipe 1: Evolving Acid Line

**Setup:**
- Track 1: FM Melodic
- Filter: Moog, cutoff 1500 Hz, resonance 0.7
- Glide enabled, 120ms

**Sequencer:**
- 16-step pattern with notes on steps 1, 5, 9, 13
- Different notes, some octave jumps
- Varying velocities

**Modulation:**
- LFO1: Triangle, 1/2 tempo sync, to filter cutoff, depth 0.6
- P-lock filter cutoff on steps 1 and 9 for accents

**Effect:**
- Light reverb send (0.2)
- Mimeophon 1, Zone B, moderate repeats for slapback

### Recipe 2: Generative Ambient Texture

**Setup:**
- Track 1: Ocean Voice (granular)
- Track 2: Complex Morph
- Track 3: Plaits Modal Resonator (Engine 12)

**Sequencer:**
- Long patterns (32+ steps)
- Sparse triggers with probability 0.5-0.7
- Conditional trigs for variation
- High drift on melodic tracks

**Modulation:**
- Randomizer1 to Ocean position, depth 0.4
- Randomizer2 to Complex Morph notch freq
- Slow LFO to Plaits decay

**Effects:**
- Heavy Mimeophon (Zone D) with Halo
- Large reverb (size 0.8, decay 0.7)

### Recipe 3: Industrial Rhythm

**Setup:**
- Track 1: FM Drum (kick), aggressive settings
- Track 2: FM Drum (snare), high noise mix
- Track 3: Noise Voice, metallic enabled
- Track 4: Sample Voice with industrial sample

**Sequencer:**
- Off-grid rhythms using microTime
- Ratchets on some hits
- Conditional trigs for fills

**Processing:**
- Wasp filters with chaos
- Pentode saturation on everything
- Parallel compression via saturation mix

**Effects:**
- Short, aggressive Mimeophon (Zone A)
- Minimal reverb

### Recipe 4: Polyrhythmic Groove

**Setup:**
- Track 1: FM Drum kick, 4-step pattern, 1/1 division
- Track 2: FM Drum percussion, 3-step pattern, 1/1 division
- Track 3: Noise hi-hat, 5-step pattern, 1/1 division
- Track 4: FM Melodic bass, 7-step pattern, 1/1 division

**Result:** Patterns align every 420 steps (LCM of 4,3,5,7), creating constantly shifting but cohesive rhythm.

**Enhancements:**
- Different velocities per step
- Light swing on some tracks, none on others
- Drift on melodic track for note variation

---

## Troubleshooting

**No sound?**
1. Check that transport is playing (Play button)
2. Verify track isn't muted
3. Check volume on track and master
4. Ensure you have triggers in your pattern
5. Check browser console for audio errors (F12)

**Pattern not triggering?**
1. Check Fill control (if -1, nothing plays)
2. Verify pattern has steps with triggers
3. Check probability settings on steps

**Modulation not working?**
1. Confirm route exists in mod matrix
2. Check that source is enabled with non-zero depth
3. Verify destination matches your voice type
4. Check if parameter is p-locked (p-locks override modulation)

**Recording issues?**
1. Make sure audio is actually playing first
2. Check browser permissions
3. Try a shorter recording to test
4. Check browser console for errors

---

## Final Thoughts

tQr4x is designed for exploration. There's no "right way" to use it. Some suggestions:

**Start simple:** Get a basic beat going before diving into complex modulation.

**Listen actively:** Turn one knob at a time and really hear what it does.

**Embrace accidents:** Some of the best sounds come from mistakes and happy accidents.

**Save often:** When you find something you like, save a preset.

**Experiment with p-locks:** They're the key to making patterns feel alive and dynamic.

**Layer carefully:** Less is often more. Try getting a great sound from 3-4 tracks before filling all 12.

**Use modulation subtly at first:** Small modulation depths often sound more musical than extreme ones.

Happy sound designing!

---

*tQr4x: A browser-based groovebox for exploratory electronic music.*

# Claude Code Instructions

## Project Overview

tQr4x is an Autechre-inspired browser groovebox built with TypeScript, React, Vite, and Web Audio API.

## Development

```bash
npm run dev      # Start dev server
npm run build    # Build for production (outputs to docs/)
npm run lint     # Run ESLint
npx tsc --noEmit # Type check without emitting
```

## Git & Deployment Workflow

**Deployment is automatic.** GitHub Actions builds and deploys on every push to main.

### Before pushing changes:

1. Run TypeScript check: `npx tsc --noEmit`
2. Commit and push

The workflow will automatically:
- Install dependencies
- Build the project
- Deploy to GitHub Pages from the `docs/` folder

### Commit message format

Use conventional commits with descriptive messages:
- `Fix: description` for bug fixes
- `Add: description` for new features
- `Docs: description` for documentation
- `Refactor: description` for code restructuring
- `Build: description` for build/deployment changes

## Architecture

- `src/audio/` - Web Audio engine, voices, effects, sequencer
- `src/ui/` - React components
- `docs/` - Built output for GitHub Pages (do not edit directly)
- `public/worklets/` - AudioWorklet processors
- `.github/workflows/deploy.yml` - GitHub Actions deployment workflow

## Key Audio Components

- **GrooveboxEngine** (`src/audio/engine/`) - Main audio engine orchestrator
- **VoiceManager** (`src/audio/voices/`) - Voice allocation and p-lock handling
- **Mixer** (`src/audio/fx/Mixer.ts`) - Per-track mixing with sends
- **Sequencer** (`src/audio/engine/Sequencer.ts`) - Pattern sequencing

## P-Lock System

Parameter locks allow per-step automation. When updating channel params:
- The mixer is updated immediately
- The slot config is saved for pattern recall
- The base channel state is captured for p-lock restoration

This ensures changes persist across sequencer steps.

## Chord Mode

Melodic voices can trigger chords instead of single notes:
- Toggle in TrackControls for melodic tracks (after DRIFT control)
- 21 chord types in 6 categories (triads, sevenths, extended, power, voicings, clusters)
- Chords are scale-aware (built from scale degrees, always fit current scale)
- Per-slot storage (settings saved per pattern slot)
- Per-step chord type override via `step.chordType`

Key files:
- `src/audio/music/Scale.ts` - `CHORD_DEGREES`, `generateChord()`
- `src/audio/engine/Sequencer.ts` - `TrackPerformance.chordMode/chordType`, `TriggerEvent.notes`
- `src/audio/voices/VoiceManager.ts` - Multi-note triggering logic
- `src/ui/TrackControls.tsx` - Chord mode UI

## Pattern Slot System

Each pattern slot (1-16) stores independent configurations:
- Voice configs (voice type, params including sample URLs)
- Channel configs (filter, saturation, sends, volume, pan)
- Performance configs (drift, fill, octave, chord mode/type, clock division)
- FX configs (4x Mimeophon, reverb, master bus, cross-sends)

When switching patterns or using the arranger:
- Current slot state is captured before switching
- New slot state is applied (voice reassignment, sample reloading, etc.)
- UI callbacks refresh to reflect new state

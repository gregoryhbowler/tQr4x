/**
 * EnvelopePresets - Zadar-inspired envelope shape presets
 *
 * Based on the XAOC Zadar's 260 envelope shapes across 26 banks (A-Z).
 * Each preset defines breakpoints that create specific envelope curves.
 *
 * Categories:
 * - Basic: Traditional AD/AR/ADSR shapes
 * - Exponential: Various exponential curves
 * - Multi-Stage: Complex multi-peak shapes
 * - LFO: Cycling waveforms
 * - Organic: Natural, evolving shapes
 * - Glitch: Random, stepped, digital
 * - Percussion: Designed for drums/transients
 */

import type { EnvBreakpoint, CurveType } from './ComplexMorphVoice';

export interface EnvelopePreset {
  id: string;
  name: string;
  category: string;
  breakpoints: EnvBreakpoint[];
  defaultPeriod: number;
  description?: string;
}

// Helper to create breakpoints
function bp(time: number, value: number, curve: CurveType = 'linear'): EnvBreakpoint {
  return { time, value, curve };
}

// ============================================
// BASIC SHAPES (Bank A/D/T/U inspired)
// ============================================

const basicPresets: EnvelopePreset[] = [
  {
    id: 'flat',
    name: 'Flat',
    category: 'Basic',
    breakpoints: [bp(0, 0.5), bp(1, 0.5)],
    defaultPeriod: 1,
    description: 'No movement'
  },
  {
    id: 'attack-decay',
    name: 'Attack-Decay',
    category: 'Basic',
    breakpoints: [bp(0, 0, 'linear'), bp(0.15, 1, 'exp'), bp(1, 0, 'exp')],
    defaultPeriod: 0.5,
    description: 'Classic AD envelope'
  },
  {
    id: 'attack-decay-sharp',
    name: 'AD Sharp',
    category: 'Basic',
    breakpoints: [bp(0, 0), bp(0.05, 1, 'punch'), bp(1, 0, 'exp')],
    defaultPeriod: 0.3,
    description: 'Sharp attack AD'
  },
  {
    id: 'attack-decay-slow',
    name: 'AD Slow',
    category: 'Basic',
    breakpoints: [bp(0, 0), bp(0.4, 1, 'swell'), bp(1, 0, 'exp')],
    defaultPeriod: 2,
    description: 'Slow attack AD'
  },
  {
    id: 'ramp-up',
    name: 'Ramp Up',
    category: 'Basic',
    breakpoints: [bp(0, 0), bp(1, 1, 'linear')],
    defaultPeriod: 1,
    description: 'Linear ascending ramp'
  },
  {
    id: 'ramp-down',
    name: 'Ramp Down',
    category: 'Basic',
    breakpoints: [bp(0, 1), bp(1, 0, 'linear')],
    defaultPeriod: 1,
    description: 'Linear descending ramp'
  },
  {
    id: 'triangle',
    name: 'Triangle',
    category: 'Basic',
    breakpoints: [bp(0, 0), bp(0.5, 1, 'linear'), bp(1, 0, 'linear')],
    defaultPeriod: 1,
    description: 'Triangle wave shape'
  },
  {
    id: 'decay-only',
    name: 'Decay Only',
    category: 'Basic',
    breakpoints: [bp(0, 1), bp(1, 0, 'exp')],
    defaultPeriod: 0.5,
    description: 'Start high, decay down'
  },
  {
    id: 'hold-decay',
    name: 'Hold + Decay',
    category: 'Basic',
    breakpoints: [bp(0, 1), bp(0.3, 1, 'linear'), bp(1, 0, 'exp')],
    defaultPeriod: 1,
    description: 'Hold then decay'
  },
  {
    id: 'delay-attack',
    name: 'Delayed Attack',
    category: 'Basic',
    breakpoints: [bp(0, 0), bp(0.3, 0, 'linear'), bp(0.5, 1, 'exp'), bp(1, 0, 'exp')],
    defaultPeriod: 1,
    description: 'Delayed then attack'
  }
];

// ============================================
// EXPONENTIAL SHAPES (Bank D/E/P inspired)
// ============================================

const exponentialPresets: EnvelopePreset[] = [
  {
    id: 'exp-attack',
    name: 'Exp Attack',
    category: 'Exponential',
    breakpoints: [bp(0, 0), bp(1, 1, 'exp')],
    defaultPeriod: 1,
    description: 'Exponential rise'
  },
  {
    id: 'exp-decay',
    name: 'Exp Decay',
    category: 'Exponential',
    breakpoints: [bp(0, 1), bp(1, 0, 'exp')],
    defaultPeriod: 1,
    description: 'Exponential fall'
  },
  {
    id: 'log-attack',
    name: 'Log Attack',
    category: 'Exponential',
    breakpoints: [bp(0, 0), bp(1, 1, 'sharp')],
    defaultPeriod: 1,
    description: 'Logarithmic rise (fast start)'
  },
  {
    id: 'punch-decay',
    name: 'Punch Decay',
    category: 'Exponential',
    breakpoints: [bp(0, 1), bp(1, 0, 'punch')],
    defaultPeriod: 0.3,
    description: 'Punch curve decay'
  },
  {
    id: 'swell',
    name: 'Swell',
    category: 'Exponential',
    breakpoints: [bp(0, 0), bp(0.8, 1, 'swell'), bp(1, 0.8, 'linear')],
    defaultPeriod: 2,
    description: 'Slow swell rise'
  },
  {
    id: 'exp-bump',
    name: 'Exp Bump',
    category: 'Exponential',
    breakpoints: [bp(0, 0.3), bp(0.3, 1, 'exp'), bp(0.7, 0.6, 'exp'), bp(1, 0.3, 'exp')],
    defaultPeriod: 1,
    description: 'Exponential bump shape'
  },
  {
    id: 'reverse-swell',
    name: 'Reverse Swell',
    category: 'Exponential',
    breakpoints: [bp(0, 1), bp(0.2, 0.8, 'linear'), bp(1, 0, 'swell')],
    defaultPeriod: 1,
    description: 'Accelerating decay'
  },
  {
    id: 'double-exp',
    name: 'Double Exp',
    category: 'Exponential',
    breakpoints: [bp(0, 0), bp(0.3, 1, 'exp'), bp(0.5, 0.4, 'exp'), bp(0.8, 0.9, 'exp'), bp(1, 0, 'exp')],
    defaultPeriod: 1,
    description: 'Two exponential peaks'
  }
];

// ============================================
// MULTI-STAGE SHAPES (Bank B/C/E/N/O inspired)
// ============================================

const multiStagePresets: EnvelopePreset[] = [
  {
    id: 'double-peak',
    name: 'Double Peak',
    category: 'Multi-Stage',
    breakpoints: [bp(0, 0), bp(0.2, 1, 'exp'), bp(0.4, 0.3, 'exp'), bp(0.6, 0.9, 'exp'), bp(1, 0, 'exp')],
    defaultPeriod: 1,
    description: 'Two peaks'
  },
  {
    id: 'triple-peak',
    name: 'Triple Peak',
    category: 'Multi-Stage',
    breakpoints: [
      bp(0, 0), bp(0.15, 1, 'exp'), bp(0.25, 0.2, 'exp'),
      bp(0.45, 0.85, 'exp'), bp(0.55, 0.15, 'exp'),
      bp(0.75, 0.7, 'exp'), bp(1, 0, 'exp')
    ],
    defaultPeriod: 1,
    description: 'Three peaks'
  },
  {
    id: 'staircase-up',
    name: 'Staircase Up',
    category: 'Multi-Stage',
    breakpoints: [
      bp(0, 0), bp(0.2, 0.25, 'step'), bp(0.4, 0.5, 'step'),
      bp(0.6, 0.75, 'step'), bp(0.8, 1, 'step'), bp(1, 0.25, 'step')
    ],
    defaultPeriod: 1,
    description: 'Ascending steps'
  },
  {
    id: 'staircase-down',
    name: 'Staircase Down',
    category: 'Multi-Stage',
    breakpoints: [
      bp(0, 1), bp(0.2, 0.75, 'step'), bp(0.4, 0.5, 'step'),
      bp(0.6, 0.25, 'step'), bp(0.8, 0, 'step'), bp(1, 0.75, 'step')
    ],
    defaultPeriod: 1,
    description: 'Descending steps'
  },
  {
    id: 'bumpy-decay',
    name: 'Bumpy Decay',
    category: 'Multi-Stage',
    breakpoints: [
      bp(0, 1), bp(0.15, 0.6, 'exp'), bp(0.25, 0.8, 'exp'),
      bp(0.4, 0.4, 'exp'), bp(0.55, 0.55, 'exp'),
      bp(0.7, 0.2, 'exp'), bp(1, 0, 'exp')
    ],
    defaultPeriod: 1,
    description: 'Decay with bumps'
  },
  {
    id: 'attack-sustain-decay',
    name: 'ASD',
    category: 'Multi-Stage',
    breakpoints: [bp(0, 0), bp(0.1, 1, 'exp'), bp(0.6, 0.7, 'linear'), bp(1, 0, 'exp')],
    defaultPeriod: 1,
    description: 'Attack-Sustain-Decay'
  },
  {
    id: 'plateau',
    name: 'Plateau',
    category: 'Multi-Stage',
    breakpoints: [bp(0, 0), bp(0.1, 1, 'exp'), bp(0.9, 1, 'linear'), bp(1, 0, 'exp')],
    defaultPeriod: 1,
    description: 'Attack, hold, quick release'
  },
  {
    id: 'valley',
    name: 'Valley',
    category: 'Multi-Stage',
    breakpoints: [bp(0, 1), bp(0.3, 0.2, 'exp'), bp(0.7, 0.2, 'linear'), bp(1, 1, 'exp')],
    defaultPeriod: 1,
    description: 'Inverted plateau'
  },
  {
    id: 'bounce',
    name: 'Bounce',
    category: 'Multi-Stage',
    breakpoints: [
      bp(0, 1), bp(0.2, 0.1, 'exp'), bp(0.35, 0.6, 'exp'),
      bp(0.5, 0.1, 'exp'), bp(0.65, 0.35, 'exp'),
      bp(0.8, 0.1, 'exp'), bp(1, 0.15, 'exp')
    ],
    defaultPeriod: 0.8,
    description: 'Bouncing ball decay'
  },
  {
    id: 'wave-decay',
    name: 'Wave Decay',
    category: 'Multi-Stage',
    breakpoints: [
      bp(0, 1), bp(0.1, 0.5, 'exp'), bp(0.2, 0.9, 'exp'),
      bp(0.35, 0.35, 'exp'), bp(0.5, 0.7, 'exp'),
      bp(0.7, 0.2, 'exp'), bp(0.85, 0.4, 'exp'), bp(1, 0, 'exp')
    ],
    defaultPeriod: 1,
    description: 'Damped oscillation'
  }
];

// ============================================
// LFO SHAPES (Bank I/K/Y inspired)
// ============================================

const lfoPresets: EnvelopePreset[] = [
  {
    id: 'sine',
    name: 'Sine',
    category: 'LFO',
    breakpoints: [
      bp(0, 0.5), bp(0.25, 1, 'exp'), bp(0.5, 0.5, 'exp'),
      bp(0.75, 0, 'exp'), bp(1, 0.5, 'exp')
    ],
    defaultPeriod: 1,
    description: 'Sine wave'
  },
  {
    id: 'square',
    name: 'Square',
    category: 'LFO',
    breakpoints: [bp(0, 1), bp(0.5, 0, 'step'), bp(1, 1, 'step')],
    defaultPeriod: 1,
    description: 'Square wave'
  },
  {
    id: 'saw-up',
    name: 'Saw Up',
    category: 'LFO',
    breakpoints: [bp(0, 0), bp(0.99, 1, 'linear'), bp(1, 0, 'step')],
    defaultPeriod: 1,
    description: 'Ascending sawtooth'
  },
  {
    id: 'saw-down',
    name: 'Saw Down',
    category: 'LFO',
    breakpoints: [bp(0, 1), bp(0.99, 0, 'linear'), bp(1, 1, 'step')],
    defaultPeriod: 1,
    description: 'Descending sawtooth'
  },
  {
    id: 'pulse-narrow',
    name: 'Pulse Narrow',
    category: 'LFO',
    breakpoints: [bp(0, 1), bp(0.1, 1, 'linear'), bp(0.11, 0, 'step'), bp(1, 0, 'linear')],
    defaultPeriod: 1,
    description: 'Narrow pulse (10% duty)'
  },
  {
    id: 'pulse-wide',
    name: 'Pulse Wide',
    category: 'LFO',
    breakpoints: [bp(0, 1), bp(0.75, 1, 'linear'), bp(0.76, 0, 'step'), bp(1, 0, 'linear')],
    defaultPeriod: 1,
    description: 'Wide pulse (75% duty)'
  },
  {
    id: 'tremolo-fast',
    name: 'Tremolo Fast',
    category: 'LFO',
    breakpoints: [
      bp(0, 0.3), bp(0.125, 1, 'exp'), bp(0.25, 0.3, 'exp'),
      bp(0.375, 1, 'exp'), bp(0.5, 0.3, 'exp'),
      bp(0.625, 1, 'exp'), bp(0.75, 0.3, 'exp'),
      bp(0.875, 1, 'exp'), bp(1, 0.3, 'exp')
    ],
    defaultPeriod: 0.5,
    description: 'Fast 4x tremolo'
  },
  {
    id: 'wobble',
    name: 'Wobble',
    category: 'LFO',
    breakpoints: [
      bp(0, 0), bp(0.15, 0.8, 'exp'), bp(0.35, 0.2, 'exp'),
      bp(0.5, 0.9, 'exp'), bp(0.65, 0.3, 'exp'),
      bp(0.85, 0.7, 'exp'), bp(1, 0, 'exp')
    ],
    defaultPeriod: 1,
    description: 'Wobbling shape'
  },
  {
    id: 'stepped-4',
    name: '4 Steps',
    category: 'LFO',
    breakpoints: [
      bp(0, 0.2), bp(0.25, 0.8, 'step'), bp(0.5, 0.4, 'step'),
      bp(0.75, 1, 'step'), bp(1, 0.2, 'step')
    ],
    defaultPeriod: 1,
    description: '4-step sequence'
  },
  {
    id: 'stepped-8',
    name: '8 Steps',
    category: 'LFO',
    breakpoints: [
      bp(0, 0.1), bp(0.125, 0.6, 'step'), bp(0.25, 0.3, 'step'),
      bp(0.375, 0.9, 'step'), bp(0.5, 0.2, 'step'),
      bp(0.625, 0.7, 'step'), bp(0.75, 0.5, 'step'),
      bp(0.875, 1, 'step'), bp(1, 0.1, 'step')
    ],
    defaultPeriod: 1,
    description: '8-step sequence'
  }
];

// ============================================
// ORGANIC SHAPES (Bank N/O/V/W inspired)
// ============================================

const organicPresets: EnvelopePreset[] = [
  {
    id: 'breath',
    name: 'Breath',
    category: 'Organic',
    breakpoints: [
      bp(0, 0.1), bp(0.2, 0.5, 'swell'), bp(0.4, 0.85, 'swell'),
      bp(0.6, 0.75, 'exp'), bp(0.8, 0.3, 'exp'), bp(1, 0.1, 'exp')
    ],
    defaultPeriod: 3,
    description: 'Natural breathing shape'
  },
  {
    id: 'drift',
    name: 'Drift',
    category: 'Organic',
    breakpoints: [
      bp(0, 0.5), bp(0.2, 0.65, 'exp'), bp(0.35, 0.4, 'exp'),
      bp(0.55, 0.7, 'exp'), bp(0.7, 0.55, 'exp'),
      bp(0.85, 0.6, 'exp'), bp(1, 0.5, 'exp')
    ],
    defaultPeriod: 4,
    description: 'Gentle drifting'
  },
  {
    id: 'sigh',
    name: 'Sigh',
    category: 'Organic',
    breakpoints: [
      bp(0, 0), bp(0.15, 0.7, 'swell'), bp(0.25, 0.9, 'exp'),
      bp(0.4, 0.6, 'exp'), bp(0.6, 0.4, 'exp'),
      bp(0.8, 0.15, 'exp'), bp(1, 0, 'exp')
    ],
    defaultPeriod: 2,
    description: 'Sigh-like release'
  },
  {
    id: 'ripple',
    name: 'Ripple',
    category: 'Organic',
    breakpoints: [
      bp(0, 0.5), bp(0.1, 0.75, 'exp'), bp(0.2, 0.45, 'exp'),
      bp(0.3, 0.65, 'exp'), bp(0.45, 0.5, 'exp'),
      bp(0.6, 0.58, 'exp'), bp(0.75, 0.48, 'exp'),
      bp(0.9, 0.52, 'exp'), bp(1, 0.5, 'exp')
    ],
    defaultPeriod: 2,
    description: 'Water ripple decay'
  },
  {
    id: 'wave-rise',
    name: 'Wave Rise',
    category: 'Organic',
    breakpoints: [
      bp(0, 0), bp(0.2, 0.2, 'swell'), bp(0.35, 0.35, 'exp'),
      bp(0.5, 0.55, 'swell'), bp(0.65, 0.7, 'exp'),
      bp(0.85, 0.9, 'swell'), bp(1, 1, 'exp')
    ],
    defaultPeriod: 4,
    description: 'Organic wave rising'
  },
  {
    id: 'flutter',
    name: 'Flutter',
    category: 'Organic',
    breakpoints: [
      bp(0, 0.5), bp(0.05, 0.7, 'exp'), bp(0.1, 0.45, 'exp'),
      bp(0.18, 0.8, 'exp'), bp(0.26, 0.4, 'exp'),
      bp(0.35, 0.65, 'exp'), bp(0.5, 0.5, 'exp'),
      bp(0.7, 0.55, 'exp'), bp(1, 0.5, 'exp')
    ],
    defaultPeriod: 0.8,
    description: 'Flutter effect'
  },
  {
    id: 'morph-slow',
    name: 'Morph Slow',
    category: 'Organic',
    breakpoints: [
      bp(0, 0.3), bp(0.15, 0.5, 'swell'), bp(0.3, 0.8, 'exp'),
      bp(0.45, 0.55, 'exp'), bp(0.6, 0.75, 'swell'),
      bp(0.8, 0.45, 'exp'), bp(1, 0.3, 'exp')
    ],
    defaultPeriod: 6,
    description: 'Slow morphing'
  },
  {
    id: 'wind',
    name: 'Wind',
    category: 'Organic',
    breakpoints: [
      bp(0, 0.2), bp(0.12, 0.5, 'swell'), bp(0.2, 0.3, 'exp'),
      bp(0.35, 0.7, 'swell'), bp(0.45, 0.45, 'exp'),
      bp(0.6, 0.8, 'swell'), bp(0.75, 0.55, 'exp'),
      bp(0.9, 0.4, 'exp'), bp(1, 0.2, 'exp')
    ],
    defaultPeriod: 5,
    description: 'Wind gusts'
  }
];

// ============================================
// GLITCH SHAPES (Bank Q/X/Z inspired)
// ============================================

const glitchPresets: EnvelopePreset[] = [
  {
    id: 'glitch-random',
    name: 'Glitch Random',
    category: 'Glitch',
    breakpoints: [
      bp(0, 0.2), bp(0.1, 0.9, 'step'), bp(0.15, 0.1, 'step'),
      bp(0.25, 0.7, 'step'), bp(0.3, 0.3, 'step'),
      bp(0.45, 1, 'step'), bp(0.5, 0, 'step'),
      bp(0.6, 0.6, 'step'), bp(0.75, 0.4, 'step'),
      bp(0.85, 0.8, 'step'), bp(1, 0.2, 'step')
    ],
    defaultPeriod: 0.5,
    description: 'Random stepped'
  },
  {
    id: 'glitch-burst',
    name: 'Glitch Burst',
    category: 'Glitch',
    breakpoints: [
      bp(0, 0), bp(0.02, 1, 'step'), bp(0.05, 0, 'step'),
      bp(0.08, 0.8, 'step'), bp(0.12, 0.2, 'step'),
      bp(0.18, 0.9, 'step'), bp(0.22, 0, 'step'),
      bp(0.5, 0, 'linear'), bp(1, 0, 'linear')
    ],
    defaultPeriod: 0.3,
    description: 'Burst of glitches'
  },
  {
    id: 'digital-decay',
    name: 'Digital Decay',
    category: 'Glitch',
    breakpoints: [
      bp(0, 1), bp(0.1, 0.8, 'step'), bp(0.2, 0.65, 'step'),
      bp(0.3, 0.5, 'step'), bp(0.45, 0.35, 'step'),
      bp(0.6, 0.2, 'step'), bp(0.8, 0.1, 'step'), bp(1, 0, 'step')
    ],
    defaultPeriod: 0.5,
    description: 'Stepped digital decay'
  },
  {
    id: 'bitcrush',
    name: 'Bitcrush',
    category: 'Glitch',
    breakpoints: [
      bp(0, 0), bp(0.125, 0.5, 'step'), bp(0.25, 0.25, 'step'),
      bp(0.375, 0.75, 'step'), bp(0.5, 0, 'step'),
      bp(0.625, 1, 'step'), bp(0.75, 0.5, 'step'),
      bp(0.875, 0.125, 'step'), bp(1, 0, 'step')
    ],
    defaultPeriod: 0.25,
    description: 'Low-bit pattern'
  },
  {
    id: 'sample-hold',
    name: 'Sample & Hold',
    category: 'Glitch',
    breakpoints: [
      bp(0, 0.35), bp(0.1, 0.7, 'step'), bp(0.2, 0.15, 'step'),
      bp(0.3, 0.9, 'step'), bp(0.4, 0.45, 'step'),
      bp(0.5, 0.8, 'step'), bp(0.6, 0.25, 'step'),
      bp(0.7, 0.6, 'step'), bp(0.8, 0.1, 'step'),
      bp(0.9, 0.55, 'step'), bp(1, 0.35, 'step')
    ],
    defaultPeriod: 0.8,
    description: 'Classic S&H'
  },
  {
    id: 'stutter',
    name: 'Stutter',
    category: 'Glitch',
    breakpoints: [
      bp(0, 1), bp(0.05, 0, 'step'), bp(0.1, 1, 'step'),
      bp(0.15, 0, 'step'), bp(0.2, 1, 'step'),
      bp(0.25, 0, 'step'), bp(0.35, 0.7, 'step'),
      bp(0.4, 0, 'step'), bp(0.5, 0.5, 'step'),
      bp(1, 0, 'exp')
    ],
    defaultPeriod: 0.4,
    description: 'Stuttering effect'
  },
  {
    id: 'corrupt',
    name: 'Corrupt',
    category: 'Glitch',
    breakpoints: [
      bp(0, 0.5), bp(0.03, 1, 'step'), bp(0.08, 0.1, 'step'),
      bp(0.15, 0.8, 'exp'), bp(0.22, 0.2, 'step'),
      bp(0.35, 0.95, 'step'), bp(0.4, 0.05, 'step'),
      bp(0.55, 0.6, 'exp'), bp(0.7, 0.7, 'step'),
      bp(0.85, 0.3, 'step'), bp(1, 0.5, 'step')
    ],
    defaultPeriod: 0.6,
    description: 'Corrupted data'
  },
  {
    id: 'binary',
    name: 'Binary',
    category: 'Glitch',
    breakpoints: [
      bp(0, 1), bp(0.125, 0, 'step'), bp(0.25, 1, 'step'),
      bp(0.375, 1, 'step'), bp(0.5, 0, 'step'),
      bp(0.625, 1, 'step'), bp(0.75, 0, 'step'),
      bp(0.875, 0, 'step'), bp(1, 1, 'step')
    ],
    defaultPeriod: 0.5,
    description: 'Binary pattern'
  }
];

// ============================================
// PERCUSSION SHAPES (Bank A/F/R/S inspired)
// ============================================

const percussionPresets: EnvelopePreset[] = [
  {
    id: 'kick',
    name: 'Kick',
    category: 'Percussion',
    breakpoints: [bp(0, 1), bp(0.02, 0.7, 'punch'), bp(0.15, 0.2, 'exp'), bp(1, 0, 'exp')],
    defaultPeriod: 0.3,
    description: 'Kick drum shape'
  },
  {
    id: 'snare',
    name: 'Snare',
    category: 'Percussion',
    breakpoints: [
      bp(0, 1), bp(0.03, 0.8, 'punch'),
      bp(0.08, 0.6, 'exp'), bp(0.2, 0.3, 'exp'),
      bp(1, 0, 'exp')
    ],
    defaultPeriod: 0.25,
    description: 'Snare drum shape'
  },
  {
    id: 'hihat-closed',
    name: 'Hi-Hat Closed',
    category: 'Percussion',
    breakpoints: [bp(0, 1), bp(0.03, 0.4, 'punch'), bp(0.1, 0, 'exp'), bp(1, 0, 'linear')],
    defaultPeriod: 0.1,
    description: 'Closed hi-hat'
  },
  {
    id: 'hihat-open',
    name: 'Hi-Hat Open',
    category: 'Percussion',
    breakpoints: [bp(0, 1), bp(0.05, 0.7, 'punch'), bp(0.4, 0.2, 'exp'), bp(1, 0, 'exp')],
    defaultPeriod: 0.5,
    description: 'Open hi-hat'
  },
  {
    id: 'clap',
    name: 'Clap',
    category: 'Percussion',
    breakpoints: [
      bp(0, 0.8), bp(0.02, 0.3, 'punch'), bp(0.04, 0.9, 'punch'),
      bp(0.06, 0.4, 'punch'), bp(0.08, 1, 'punch'),
      bp(0.15, 0.5, 'exp'), bp(1, 0, 'exp')
    ],
    defaultPeriod: 0.3,
    description: 'Hand clap'
  },
  {
    id: 'tom',
    name: 'Tom',
    category: 'Percussion',
    breakpoints: [bp(0, 1), bp(0.05, 0.75, 'punch'), bp(0.25, 0.35, 'exp'), bp(1, 0, 'exp')],
    defaultPeriod: 0.4,
    description: 'Tom drum'
  },
  {
    id: 'rim',
    name: 'Rimshot',
    category: 'Percussion',
    breakpoints: [bp(0, 1), bp(0.01, 0.6, 'punch'), bp(0.05, 0, 'exp'), bp(1, 0, 'linear')],
    defaultPeriod: 0.08,
    description: 'Rimshot snap'
  },
  {
    id: 'click',
    name: 'Click',
    category: 'Percussion',
    breakpoints: [bp(0, 1), bp(0.005, 0, 'punch'), bp(1, 0, 'linear')],
    defaultPeriod: 0.05,
    description: 'Pure click'
  },
  {
    id: 'zap',
    name: 'Zap',
    category: 'Percussion',
    breakpoints: [bp(0, 1), bp(0.03, 0.1, 'punch'), bp(0.08, 0, 'exp'), bp(1, 0, 'linear')],
    defaultPeriod: 0.1,
    description: 'Electronic zap'
  },
  {
    id: 'noise-burst',
    name: 'Noise Burst',
    category: 'Percussion',
    breakpoints: [
      bp(0, 0), bp(0.01, 1, 'punch'), bp(0.08, 0.6, 'exp'),
      bp(0.2, 0.2, 'exp'), bp(1, 0, 'exp')
    ],
    defaultPeriod: 0.2,
    description: 'Noise burst'
  }
];

// ============================================
// COMPLEX SHAPES (Bank G/H/M/P inspired)
// ============================================

const complexPresets: EnvelopePreset[] = [
  {
    id: 'complex-a',
    name: 'Complex A',
    category: 'Complex',
    breakpoints: [
      bp(0, 0), bp(0.08, 1, 'punch'), bp(0.15, 0.4, 'exp'),
      bp(0.25, 0.7, 'exp'), bp(0.35, 0.3, 'sharp'),
      bp(0.5, 0.6, 'swell'), bp(0.65, 0.25, 'exp'),
      bp(0.8, 0.45, 'exp'), bp(1, 0, 'exp')
    ],
    defaultPeriod: 1.5,
    description: 'Complex evolution'
  },
  {
    id: 'complex-b',
    name: 'Complex B',
    category: 'Complex',
    breakpoints: [
      bp(0, 0.5), bp(0.1, 0.9, 'exp'), bp(0.18, 0.3, 'sharp'),
      bp(0.3, 0.75, 'swell'), bp(0.4, 0.55, 'exp'),
      bp(0.55, 0.85, 'punch'), bp(0.7, 0.2, 'exp'),
      bp(0.85, 0.6, 'swell'), bp(1, 0.5, 'exp')
    ],
    defaultPeriod: 2,
    description: 'Complex morphing'
  },
  {
    id: 'gate-sequence',
    name: 'Gate Sequence',
    category: 'Complex',
    breakpoints: [
      bp(0, 0), bp(0.05, 1, 'punch'), bp(0.15, 0, 'step'),
      bp(0.2, 0, 'linear'), bp(0.25, 1, 'punch'),
      bp(0.35, 0, 'step'), bp(0.4, 0, 'linear'),
      bp(0.45, 0.6, 'punch'), bp(0.55, 0, 'step'),
      bp(0.75, 0, 'linear'), bp(0.8, 1, 'punch'),
      bp(0.9, 0, 'step'), bp(1, 0, 'linear')
    ],
    defaultPeriod: 0.5,
    description: 'Gated rhythm'
  },
  {
    id: 'trapezoid',
    name: 'Trapezoid',
    category: 'Complex',
    breakpoints: [
      bp(0, 0), bp(0.15, 1, 'linear'), bp(0.35, 1, 'linear'),
      bp(0.5, 0, 'linear'), bp(0.65, 0, 'linear'),
      bp(0.8, 0.7, 'linear'), bp(1, 0, 'linear')
    ],
    defaultPeriod: 1,
    description: 'Trapezoid shape'
  },
  {
    id: 'harmonic',
    name: 'Harmonic',
    category: 'Complex',
    breakpoints: [
      bp(0, 0.5), bp(0.0833, 1, 'exp'), bp(0.1667, 0.5, 'exp'),
      bp(0.25, 0, 'exp'), bp(0.3333, 0.5, 'exp'),
      bp(0.4167, 0.85, 'exp'), bp(0.5, 0.5, 'exp'),
      bp(0.5833, 0.15, 'exp'), bp(0.6667, 0.5, 'exp'),
      bp(0.75, 0.75, 'exp'), bp(0.8333, 0.5, 'exp'),
      bp(0.9167, 0.25, 'exp'), bp(1, 0.5, 'exp')
    ],
    defaultPeriod: 1,
    description: 'Harmonic series'
  },
  {
    id: 'ratchet',
    name: 'Ratchet',
    category: 'Complex',
    breakpoints: [
      bp(0, 1), bp(0.08, 0.1, 'exp'), bp(0.12, 0.85, 'punch'),
      bp(0.22, 0.08, 'exp'), bp(0.28, 0.7, 'punch'),
      bp(0.4, 0.06, 'exp'), bp(0.48, 0.55, 'punch'),
      bp(0.65, 0.04, 'exp'), bp(0.75, 0.4, 'punch'),
      bp(1, 0, 'exp')
    ],
    defaultPeriod: 0.4,
    description: 'Ratcheting decay'
  },
  {
    id: 'granular',
    name: 'Granular',
    category: 'Complex',
    breakpoints: [
      bp(0, 0), bp(0.02, 0.7, 'punch'), bp(0.05, 0.1, 'exp'),
      bp(0.1, 0.5, 'punch'), bp(0.15, 0.15, 'exp'),
      bp(0.22, 0.8, 'punch'), bp(0.27, 0.2, 'exp'),
      bp(0.35, 0.6, 'punch'), bp(0.42, 0.1, 'exp'),
      bp(0.52, 0.4, 'punch'), bp(0.6, 0.05, 'exp'),
      bp(1, 0, 'linear')
    ],
    defaultPeriod: 0.3,
    description: 'Granular texture'
  },
  {
    id: 'feedback',
    name: 'Feedback',
    category: 'Complex',
    breakpoints: [
      bp(0, 0.2), bp(0.1, 0.6, 'exp'), bp(0.15, 0.25, 'exp'),
      bp(0.25, 0.75, 'exp'), bp(0.32, 0.3, 'exp'),
      bp(0.45, 0.85, 'exp'), bp(0.55, 0.35, 'exp'),
      bp(0.7, 0.9, 'exp'), bp(0.82, 0.4, 'exp'),
      bp(0.95, 0.7, 'exp'), bp(1, 0.2, 'exp')
    ],
    defaultPeriod: 2,
    description: 'Feedback buildup'
  }
];

// ============================================
// COMBINE ALL PRESETS
// ============================================

export const ENVELOPE_PRESETS: EnvelopePreset[] = [
  ...basicPresets,
  ...exponentialPresets,
  ...multiStagePresets,
  ...lfoPresets,
  ...organicPresets,
  ...glitchPresets,
  ...percussionPresets,
  ...complexPresets
];

// Create a map for quick lookup
export const ENVELOPE_PRESET_MAP = new Map<string, EnvelopePreset>(
  ENVELOPE_PRESETS.map(p => [p.id, p])
);

// Get presets by category
export function getPresetsByCategory(category: string): EnvelopePreset[] {
  return ENVELOPE_PRESETS.filter(p => p.category === category);
}

// Get all categories
export function getPresetCategories(): string[] {
  const categories = new Set(ENVELOPE_PRESETS.map(p => p.category));
  return Array.from(categories);
}

// Get preset by ID
export function getPresetById(id: string): EnvelopePreset | undefined {
  return ENVELOPE_PRESET_MAP.get(id);
}

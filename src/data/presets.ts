// Built-in design presets — complete DesignState snapshots that can be
// loaded into the active design with one click. Unlike saved projects
// (Dexie/IndexedDB, per-browser) these live in the bundle and survive
// across devices.
//
// Kudos X2 (Joachims 3-vejs): real, measured cabinet. Outer dimensions
// 720 (H) × 165 (W) × 205 (D) mm, port Ø70 × 250 mm. Driver positions are
// measured on the physical cabinet (center of unit):
//   - Vifa BC25TG15-04 tweeter: front baffle, 65 mm from the top → y = 655 mm
//   - Wavecor WF146WA02 (8Ω) mid: front baffle, 185 mm from the top → y = 535 mm
//   - ScanSpeak 18W/4424G00 woofer: RIGHT SIDE panel, 360 mm from the bottom
//     (side-mounted: excluded from front-baffle edge diffraction and CAD,
//     uses the generic baffle-step shelf — documented approximation).
//
// Port tuning: Vb ≈ 13 L net internal volume (estimated from outer dims,
// 18 mm walls, minus port/driver/bracing) with fb = 54 Hz reproduces the
// physical Ø70 × 250 mm port through the app's own port model
// (portLengthForTuning → 251 mm). Tweeter pad -6 dB matches the
// sensitivity gap to the Wavecor (93.9 vs 87.5 dB); crossovers 300 Hz
// (low, side-mounted → cross low) and 2800 Hz (below Wavecor's 3.5 kHz
// breakup limit) LR4 as starting points — tune to taste.

import type { DesignState } from '@/types';

export interface DesignPreset {
  id: string;
  name: string;
  /** Short human description shown in the UI */
  description: string;
  design: DesignState;
}

const KUDOS_X2_DESIGN: DesignState = {
  ways: 3,
  bands: [
    {
      driverId: 'seed-scanspeak-18w-4424g00',
      role: 'low',
      lowpassFreq: 300,
      lowpassType: 'LR4',
      highpassFreq: 0,
      highpassType: 'LR4',
      gain: 0,
      polarity: 0,
      delay: 0,
      mount: { placement: 'side', yMm: 360 },
    },
    {
      driverId: 'seed-wavecor-wf146wa02',
      role: 'mid',
      lowpassFreq: 2800,
      lowpassType: 'LR4',
      highpassFreq: 300,
      highpassType: 'LR4',
      gain: 0,
      polarity: 0,
      delay: 0,
      mount: { placement: 'front', yMm: 535 },
    },
    {
      driverId: 'seed-vifa-bc25tg15-04',
      role: 'high',
      lowpassFreq: 0,
      lowpassType: 'LR4',
      highpassFreq: 2800,
      highpassType: 'LR4',
      gain: -6,
      polarity: 0,
      delay: 0,
      mount: { placement: 'front', yMm: 655 },
    },
  ],
  baffleWidth: 165,
  baffleHeight: 720,
  roundoverRadius: 0,
  roomParams: {
    dimensions: { length: 5.0, width: 4.5, height: 2.4 },
    rt60: 0.5,
    speakerDistanceFromFront: 0.6,
    speakerDistanceFromSide: 1.0,
    speakerHeight: 1.0,
    listeningDistance: 3.5,
  },
  smoothingFraction: 3,
  cabinetType: 'ported',
  portFb: 54,
  portVb: 13,
  portDiameter: 70,
  numPorts: 1,
};

export const KUDOS_X2_PRESET: DesignPreset = {
  id: 'preset-kudos-x2-joachim',
  name: 'Kudos X2 (3-vejs)',
  description:
    'Kudos X2-kabinet 720×165×205 mm, port Ø70×250 mm (Vb ≈ 13 L / fb 54 Hz estimeret). ' +
    'Vifa BC25TG15-04 diskant 65 mm fra top, Wavecor WF146WA02 (8Ω) mellemtone 185 mm fra top, ' +
    'ScanSpeak 18W/4424G00 sidemonteret højre 360 mm fra bund. Faste positioner indgår i kantdiffraktionsmodellen.',
  design: KUDOS_X2_DESIGN,
};

// Mk3 reference (Joachims aktive 3-vejs reference): alle mål fra
// mk3-reference-loudspeaker-repoet (cad/cabinet.scad er single source of
// truth, parset af repoets egne simuleringer). Kabinet 300 (B) × 420 (D) ×
// 1180 (H) mm, 22 mm birkekrydsfiner, R19 lodrette roundovers på fronten.
// Positioner (centrum, y målt fra bund som i cabinet.scad):
//   - 2× GRS 12SW-4HE push-push, SIDEMONTERET (én pr. side), woofer_z = 520 mm
//   - ScanSpeak 18W/4424G00 mellemtone: front, mid_z = 1065 mm (nær toppen)
//   - SB26STAC-C000-4 diskant i waveguide UNDER midten: tw_z = 1065 − 164 = 901 mm
// Lukket bas ~75 L netto → med Vas×2 (push-push) giver appens sealed-model
// Fc ≈ 39 Hz / Qtc ≈ 0.76, som matcher repoets alignment. Mid-kammeret
// (~13 L separat) modelleres ikke — appen har ét kabinetvolumen; mid'ens
// målte kurve + HP 200 Hz gør afvigelsen lille. XO 200 Hz BW4 / 1100 Hz LR4
// og DSP-gains 0 / −4 / −9 dB er repoets Harman-optimerede værdier.
// Ikke modelleret: waveguide-loading (+2.5 dB HF) og Linkwitz Transform
// 41→28 Hz (repoets DSP-trin) — begge dokumenteret i mk3-repoet.

const MK3_REFERENCE_DESIGN: DesignState = {
  ways: 3,
  bands: [
    {
      driverId: 'seed-grs-12sw-4he',
      role: 'low',
      driverCount: 2,
      lowpassFreq: 200,
      lowpassType: 'BW4',
      highpassFreq: 18,
      highpassType: 'BW4',
      gain: 0,
      polarity: 0,
      delay: 0,
      mount: { placement: 'side', yMm: 520 },
    },
    {
      driverId: 'seed-scanspeak-18w-4424g00',
      role: 'mid',
      lowpassFreq: 1100,
      lowpassType: 'LR4',
      highpassFreq: 200,
      highpassType: 'BW4',
      gain: -4,
      polarity: 0,
      delay: 0,
      mount: { placement: 'front', yMm: 1065 },
    },
    {
      driverId: 'seed-sb26stac-c000-4',
      role: 'high',
      lowpassFreq: 0,
      lowpassType: 'LR4',
      highpassFreq: 1100,
      highpassType: 'LR4',
      gain: -9,
      polarity: 0,
      delay: 0,
      mount: { placement: 'front', yMm: 901 },
    },
  ],
  baffleWidth: 300,
  baffleHeight: 1180,
  roundoverRadius: 19,
  roomParams: {
    // Repoets in-room simuleringer: 4.5 × 4 × 2.4 m, RT60 0.4 s
    dimensions: { length: 4.5, width: 4.0, height: 2.4 },
    rt60: 0.4,
    speakerDistanceFromFront: 0.6,
    speakerDistanceFromSide: 1.0,
    speakerHeight: 1.0,
    listeningDistance: 3.5,
  },
  smoothingFraction: 3,
  cabinetType: 'sealed',
  portFb: null,
  portVb: 75,
  portDiameter: 70,
  numPorts: 1,
};

export const MK3_REFERENCE_PRESET: DesignPreset = {
  id: 'preset-mk3-reference-joachim',
  name: 'Mk3 Reference (3-vejs aktiv)',
  description:
    'Mk3-reference: 300×420×1180 mm, 22 mm birk, R19 roundover, lukket ~75 L (Fc ≈ 39 Hz, Qtc ≈ 0.76). ' +
    '2× GRS 12SW-4HE push-push sidemonteret (520 mm), ScanSpeak 18W/4424G00 front 1065 mm, ' +
    'SB26STAC-C000-4 i waveguide under midten (901 mm). XO 200 BW4 / 1100 LR4, gains 0/−4/−9 dB. ' +
    'Mid-kammer 13 L, waveguide og Linkwitz Transform modelleres ikke (se mk3-repoet).',
  design: MK3_REFERENCE_DESIGN,
};

export const DESIGN_PRESETS: DesignPreset[] = [KUDOS_X2_PRESET, MK3_REFERENCE_PRESET];

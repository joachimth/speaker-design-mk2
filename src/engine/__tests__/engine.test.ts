// Physics sanity tests for the engine (SPEC §10: analytiske + egenskabstests).
// These invariants are exactly the ones the first engine draft violated:
// HF asymptotes, DC cancellation, resonances at the right frequencies.

import { describe, it, expect } from 'vitest';
import { deriveDriverModel, checkTsConsistency } from '../driver';
import { pistonRadiationImpedance, RHO0, C0, besselJ1 } from '../acoustics';
import { simulateSealedBox } from '../enclosure/sealed';
import {
  simulateVentedBox,
  portLengthForTuning,
  portPipeResonance,
} from '../enclosure/vented';
import { simulatePassiveRadiator } from '../enclosure/passiveRadiator';
import { simulateBandpass4 } from '../enclosure/bandpass';
import { simulateTransmissionLine, quarterWaveLength } from '../enclosure/transmissionLine';
import { simulateHorn } from '../enclosure/horn';
import { simulateOpenBaffle } from '../enclosure/openBaffle';
import { displacementLimitedSpl, maxSplFromSimulation } from '../maxSpl';
import type { ThieleSmallParams } from '@/types';

// Consistent 6.5" test woofer (Qes·Qms/(Qes+Qms) = 0.35 = Qts)
const WOOFER: ThieleSmallParams = {
  fs: 35,
  re: 6.2,
  qms: 2.8,
  qes: 0.4,
  qts: 0.35,
  vas: 40,
  sensitivity: 88,
  xmax: 5,
  sd: 140,
  imp: 8,
  pe: 80,
};

// B4-alignment woofer: Qts = 0.383 → Vb = Vas, Fb = Fs is maximally flat
const B4_WOOFER: ThieleSmallParams = {
  ...WOOFER,
  qes: 0.44,
  qms: 2.96,
  qts: 0.383,
};

function logFreqs(f0: number, f1: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(f0 * Math.pow(f1 / f0, i / (n - 1)));
  }
  return out;
}

function splAt(freqs: number[], spl: number[], f: number): number {
  let best = 0;
  for (let i = 1; i < freqs.length; i++) {
    if (Math.abs(freqs[i]! - f) < Math.abs(freqs[best]! - f)) best = i;
  }
  return spl[best]!;
}

describe('driver model derivation', () => {
  it('round-trips Fs from derived Mms·Cms', () => {
    const dm = deriveDriverModel(WOOFER);
    const fsDerived = 1 / (2 * Math.PI * Math.sqrt(dm.mms * dm.cms));
    expect(fsDerived).toBeCloseTo(WOOFER.fs, 1);
  });

  it('round-trips Qes and Qms from derived BL and Rms', () => {
    const dm = deriveDriverModel(WOOFER);
    const ws = 2 * Math.PI * dm.fs;
    const qesDerived = (ws * dm.mms * dm.re) / (dm.bl * dm.bl);
    const qmsDerived = (ws * dm.mms) / dm.rms;
    expect(qesDerived).toBeCloseTo(WOOFER.qes, 2);
    expect(qmsDerived).toBeCloseTo(WOOFER.qms, 2);
  });

  it('flags inconsistent datasheet values', () => {
    const bad: ThieleSmallParams = { ...WOOFER, qts: 0.6 }; // ≠ Qes·Qms/(Qes+Qms)
    const issues = checkTsConsistency(bad);
    expect(issues.some((i) => i.field === 'qts')).toBe(true);
    expect(checkTsConsistency(WOOFER).length).toBe(0);
  });
});

describe('piston radiation impedance', () => {
  const area = 0.014; // 140 cm²

  it('resistance ∝ f² at low ka', () => {
    const z50 = pistonRadiationImpedance(50, area);
    const z100 = pistonRadiationImpedance(100, area);
    expect(z100.re / z50.re).toBeCloseTo(4, 1);
  });

  it('resistance approaches ρ₀c/S at high ka', () => {
    const z = pistonRadiationImpedance(20000, area);
    expect(z.re).toBeGreaterThan((0.8 * RHO0 * C0) / area);
    expect(z.re).toBeLessThan((1.2 * RHO0 * C0) / area);
  });

  it('besselJ1 matches known values', () => {
    expect(besselJ1(0)).toBeCloseTo(0, 6);
    expect(besselJ1(1)).toBeCloseTo(0.4400505857, 5);
    expect(besselJ1(3.8317)).toBeCloseTo(0, 3); // first zero
  });
});

describe('sealed box', () => {
  const freqs = logFreqs(10, 20000, 400);

  it('system resonance follows Fc = Fs·√(1+α)', () => {
    const res = simulateSealedBox(WOOFER, 20, freqs);
    const alpha = 40 / 20;
    expect(res.fc).toBeCloseTo(35 * Math.sqrt(1 + alpha), 0);
  });

  it('impedance peaks at Fc', () => {
    const res = simulateSealedBox(WOOFER, 20, freqs);
    let peakIdx = 0;
    for (let i = 0; i < freqs.length; i++) {
      if (res.impedance[i]! > res.impedance[peakIdx]!) peakIdx = i;
    }
    expect(freqs[peakIdx]!).toBeGreaterThan(res.fc * 0.85);
    expect(freqs[peakIdx]!).toBeLessThan(res.fc * 1.15);
  });

  it('HF response is flat (mass-controlled), NOT rolling off', () => {
    const res = simulateSealedBox(WOOFER, 20, freqs);
    const at500 = splAt(freqs, res.spl, 500);
    const at2k = splAt(freqs, res.spl, 2000);
    expect(Math.abs(at2k - at500)).toBeLessThan(1.5);
  });

  it('rolls off ~12 dB/oct below Fc', () => {
    const res = simulateSealedBox(WOOFER, 20, freqs);
    const slope = splAt(freqs, res.spl, 30) - splAt(freqs, res.spl, 15);
    expect(slope).toBeGreaterThan(9);
    expect(slope).toBeLessThan(15);
  });

  it('excursion is flat below resonance and falls above', () => {
    const res = simulateSealedBox(WOOFER, 20, freqs);
    const x15 = splAt(freqs, res.excursionMm, 15);
    const x25 = splAt(freqs, res.excursionMm, 25);
    expect(Math.abs(20 * Math.log10(x25 / x15))).toBeLessThan(3);
    const x500 = splAt(freqs, res.excursionMm, 500);
    expect(x500).toBeLessThan(x15 / 50);
  });

  it('larger box → lower Fc (monotonicity, SPEC §10)', () => {
    const small = simulateSealedBox(WOOFER, 10, freqs);
    const large = simulateSealedBox(WOOFER, 60, freqs);
    expect(large.fc).toBeLessThan(small.fc);
  });

  it('stuffing (fill factor) lowers Fc', () => {
    const empty = simulateSealedBox(WOOFER, 20, freqs, { fillFactor: 1.0 });
    const stuffed = simulateSealedBox(WOOFER, 20, freqs, { fillFactor: 1.2 });
    expect(stuffed.fc).toBeLessThan(empty.fc);
  });
});

describe('vented box', () => {
  const freqs = logFreqs(10, 20000, 400);
  const vb = 40; // = Vas → B4
  const fb = 35; // = Fs → B4
  const portArea = 50; // cm²
  const lenMm = portLengthForTuning(fb, vb / 1e3, portArea / 1e4) * 1e3;

  it('port geometry hits the requested tuning', () => {
    const res = simulateVentedBox(B4_WOOFER, vb, portArea, lenMm, freqs);
    expect(res.fbActual).toBeGreaterThan(fb * 0.93);
    expect(res.fbActual).toBeLessThan(fb * 1.07);
  });

  it('B4 alignment is maximally flat (±1.5 dB above Fb)', () => {
    const res = simulateVentedBox(B4_WOOFER, vb, portArea, lenMm, freqs);
    const ref = splAt(freqs, res.spl, 500);
    for (const f of [60, 100, 200, 400, 800]) {
      expect(Math.abs(splAt(freqs, res.spl, f) - ref)).toBeLessThan(1.5);
    }
  });

  it('output cancels toward DC (≥30 dB below passband at 10 Hz)', () => {
    const res = simulateVentedBox(B4_WOOFER, vb, portArea, lenMm, freqs);
    const passband = splAt(freqs, res.spl, 500);
    expect(passband - splAt(freqs, res.spl, 10)).toBeGreaterThan(30);
  });

  it('slope below Fb is steeper than sealed (≈24 dB/oct)', () => {
    const res = simulateVentedBox(B4_WOOFER, vb, portArea, lenMm, freqs);
    const slope = splAt(freqs, res.spl, 24) - splAt(freqs, res.spl, 12);
    expect(slope).toBeGreaterThan(18);
  });

  it('impedance has double peak with minimum at Fb', () => {
    const res = simulateVentedBox(B4_WOOFER, vb, portArea, lenMm, freqs);
    const iFb = freqs.findIndex((f) => f >= res.fbActual);
    const zFb = res.impedance[iFb]!;
    // Find peaks below and above Fb
    let zBelow = 0;
    let zAbove = 0;
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i]! < res.fbActual && res.impedance[i]! > zBelow) zBelow = res.impedance[i]!;
      if (freqs[i]! > res.fbActual && freqs[i]! < res.fbActual * 4 && res.impedance[i]! > zAbove)
        zAbove = res.impedance[i]!;
    }
    expect(zBelow).toBeGreaterThan(zFb * 1.3);
    expect(zAbove).toBeGreaterThan(zFb * 1.3);
  });

  it('cone excursion has a minimum near Fb', () => {
    const res = simulateVentedBox(B4_WOOFER, vb, portArea, lenMm, freqs);
    const xFb = splAt(freqs, res.excursionMm, res.fbActual);
    const xBelow = splAt(freqs, res.excursionMm, res.fbActual * 0.55);
    const xAbove = splAt(freqs, res.excursionMm, res.fbActual * 1.8);
    expect(xBelow).toBeGreaterThan(xFb * 2);
    expect(xAbove).toBeGreaterThan(xFb * 1.2);
  });

  it('port velocity peaks near Fb', () => {
    const res = simulateVentedBox(B4_WOOFER, vb, portArea, lenMm, freqs);
    let peakIdx = 0;
    for (let i = 0; i < freqs.length; i++) {
      if (res.portVelocity[i]! > res.portVelocity[peakIdx]!) peakIdx = i;
    }
    expect(freqs[peakIdx]!).toBeGreaterThan(res.fbActual * 0.7);
    expect(freqs[peakIdx]!).toBeLessThan(res.fbActual * 1.3);
  });

  it('smaller port area → higher port velocity', () => {
    const lenSmall = portLengthForTuning(fb, vb / 1e3, 20 / 1e4) * 1e3;
    const small = simulateVentedBox(B4_WOOFER, vb, 20, lenSmall, freqs);
    const large = simulateVentedBox(B4_WOOFER, vb, portArea, lenMm, freqs);
    const vSmall = Math.max(...small.portVelocity);
    const vLarge = Math.max(...large.portVelocity);
    expect(vSmall).toBeGreaterThan(vLarge * 1.5);
  });

  it('port pipe resonance = c/(2L)', () => {
    expect(portPipeResonance(0.343)).toBeCloseTo(500, 0);
  });
});

describe('passive radiator', () => {
  const freqs = logFreqs(10, 20000, 400);
  const pr = { fp: 18, vap: 60, sdp: 210, qmp: 5, xmaxPr: 12 };

  it('has the characteristic notch at the PR free resonance', () => {
    const res = simulatePassiveRadiator(WOOFER, 30, pr, freqs);
    const atNotch = splAt(freqs, res.spl, pr.fp);
    const passband = splAt(freqs, res.spl, 500);
    expect(passband - atNotch).toBeGreaterThan(15);
  });

  it('HF response matches driver mass-controlled asymptote (flat)', () => {
    const res = simulatePassiveRadiator(WOOFER, 30, pr, freqs);
    const at500 = splAt(freqs, res.spl, 500);
    const at2k = splAt(freqs, res.spl, 2000);
    expect(Math.abs(at2k - at500)).toBeLessThan(1.5);
  });

  it('system tuning sits between PR resonance and sealed Fc', () => {
    const res = simulatePassiveRadiator(WOOFER, 30, pr, freqs);
    expect(res.fbActual).toBeGreaterThan(pr.fp);
    expect(res.fbActual).toBeLessThan(90);
  });
});

describe('bandpass 4th order', () => {
  const freqs = logFreqs(10, 20000, 400);

  it('output is bandpass-shaped (falls at both ends)', () => {
    const res = simulateBandpass4(WOOFER, 25, 15, 50, 100, freqs);
    let peak = -Infinity;
    let peakF = 0;
    for (let i = 0; i < freqs.length; i++) {
      if (res.spl[i]! > peak) {
        peak = res.spl[i]!;
        peakF = freqs[i]!;
      }
    }
    expect(peakF).toBeGreaterThan(20);
    expect(peakF).toBeLessThan(300);
    expect(peak - splAt(freqs, res.spl, 10)).toBeGreaterThan(15);
    expect(peak - splAt(freqs, res.spl, 5000)).toBeGreaterThan(20);
  });

  it('front tuning follows Helmholtz for the front chamber', () => {
    const res = simulateBandpass4(WOOFER, 25, 15, 50, 100, freqs);
    expect(res.fbFront).toBeGreaterThan(30);
    expect(res.fbFront).toBeLessThan(150);
  });
});

describe('transmission line', () => {
  const freqs = logFreqs(10, 20000, 500);
  // Straight unstuffed pipe: L = 1.715 m → quarter wave at ~50 Hz
  const straight = [{ length: 1.715, areaStart: 0.014, areaEnd: 0.014, stuffingDensity: 0 }];

  it('reports the quarter-wave frequency', () => {
    const res = simulateTransmissionLine(WOOFER, straight, freqs);
    expect(res.fQuarterWave).toBeCloseTo(50, 0);
  });

  it('terminus output peaks near the quarter-wave frequency', () => {
    const res = simulateTransmissionLine(WOOFER, straight, freqs);
    let peakIdx = 0;
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i]! < 120 && res.splTerminus[i]! > res.splTerminus[peakIdx]!) peakIdx = i;
    }
    expect(freqs[peakIdx]!).toBeGreaterThan(35);
    expect(freqs[peakIdx]!).toBeLessThan(70);
  });

  it('output cancels toward DC (open duct): sum ≪ driver alone at 10 Hz', () => {
    const res = simulateTransmissionLine(WOOFER, straight, freqs);
    const cancellation = splAt(freqs, res.splDriver, 10) - splAt(freqs, res.spl, 10);
    expect(cancellation).toBeGreaterThan(15);
  });

  it('driver HF response does NOT roll off to -∞ (the old bug)', () => {
    const res = simulateTransmissionLine(WOOFER, straight, freqs);
    const at1k = splAt(freqs, res.splDriver, 1000);
    const at5k = splAt(freqs, res.splDriver, 5000);
    expect(Math.abs(at5k - at1k)).toBeLessThan(6);
  });

  it('stuffing damps the terminus output at mid frequencies (band average)', () => {
    // Single-frequency comparison is meaningless here: the empty pipe combs
    // and stuffing shifts the comb (cEff drops). Compare 300–1000 Hz averages.
    const stuffed = [{ ...straight[0]!, stuffingDensity: 15 }];
    const resEmpty = simulateTransmissionLine(WOOFER, straight, freqs);
    const resStuffed = simulateTransmissionLine(WOOFER, stuffed, freqs);
    let sumEmpty = 0;
    let sumStuffed = 0;
    let n = 0;
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i]! >= 300 && freqs[i]! <= 1000) {
        sumEmpty += resEmpty.splTerminus[i]!;
        sumStuffed += resStuffed.splTerminus[i]!;
        n++;
      }
    }
    expect((sumEmpty - sumStuffed) / n).toBeGreaterThan(4);
  });

  it('stuffing lowers the quarter-wave frequency', () => {
    expect(quarterWaveLength(50, 15)).toBeLessThan(quarterWaveLength(50, 0));
  });

  it('offset driver changes the response (stub comb filtering)', () => {
    const resClosed = simulateTransmissionLine(WOOFER, straight, freqs, { driverOffsetFraction: 0 });
    const resOffset = simulateTransmissionLine(WOOFER, straight, freqs, {
      driverOffsetFraction: 0.3,
    });
    let maxDiff = 0;
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i]! > 50 && freqs[i]! < 1000) {
        maxDiff = Math.max(maxDiff, Math.abs(resClosed.spl[i]! - resOffset.spl[i]!));
      }
    }
    expect(maxDiff).toBeGreaterThan(2);
  });
});

describe('horn', () => {
  const freqs = logFreqs(20, 20000, 400);
  // Mid-bass front-loaded horn: fc ≈ 100 Hz needs m = 4π·100/343 ≈ 3.66
  // With St=50 cm², L=1 m → Sm = St·e^m ≈ 50·39 ≈ 1950 cm²
  const horn = {
    profile: 'exponential' as const,
    throatAreaCm2: 50,
    mouthAreaCm2: 1950,
    lengthM: 1.0,
    rearChamberLiters: 8,
    topology: 'front' as const,
  };

  it('computes the exponential cutoff from the flare', () => {
    const res = simulateHorn(WOOFER, horn, freqs);
    expect(res.cutoffHz).toBeGreaterThan(80);
    expect(res.cutoffHz).toBeLessThan(120);
  });

  it('output falls off below cutoff', () => {
    const res = simulateHorn(WOOFER, horn, freqs);
    const passband = splAt(freqs, res.spl, 300);
    const below = splAt(freqs, res.spl, 40);
    expect(passband - below).toBeGreaterThan(10);
  });

  it('horn loading raises passband output vs the same driver sealed', () => {
    const res = simulateHorn(WOOFER, horn, freqs);
    const sealed = simulateSealedBox(WOOFER, 20, freqs);
    const hornMid = splAt(freqs, res.spl, 250);
    const sealedMid = splAt(freqs, sealed.spl, 250);
    expect(hornMid).toBeGreaterThan(sealedMid + 3);
  });

  it('flags a too-small mouth', () => {
    const tiny = { ...horn, mouthAreaCm2: 300, lengthM: 0.5 };
    const res = simulateHorn(WOOFER, tiny, freqs);
    expect(res.mouthTooSmall).toBe(true);
  });
});

describe('open baffle', () => {
  const freqs = logFreqs(10, 20000, 400);

  it('dipole peak at c/(2·Deff)', () => {
    const res = simulateOpenBaffle(WOOFER, 0.4, 0.6, freqs);
    expect(res.dipolePeakHz).toBeCloseTo(C0 / (2 * res.dEff), 0);
  });

  it('rolls off ~6 dB/oct below the dipole peak vs monopole', () => {
    const res = simulateOpenBaffle(WOOFER, 0.4, 0.6, freqs);
    const fPeak = res.dipolePeakHz;
    const lossAtQuarter =
      splAt(freqs, res.splMonopole, fPeak / 4) - splAt(freqs, res.spl, fPeak / 4);
    const lossAtHalf = splAt(freqs, res.splMonopole, fPeak / 2) - splAt(freqs, res.spl, fPeak / 2);
    // Dipole loss grows toward DC at ≈6 dB/oct
    expect(lossAtQuarter - lossAtHalf).toBeGreaterThan(3);
    expect(lossAtQuarter - lossAtHalf).toBeLessThan(9);
  });
});

describe('analytical golden tests (SPEC §10)', () => {
  const freqs = logFreqs(15, 5000, 300);

  it('sealed Qtc=0.707 matches 2nd-order Butterworth within ±0.8 dB', () => {
    // Qtc = Qts·√(1+α) = 0.707 → α = (0.707/0.35)² − 1 ≈ 3.08 → Vb ≈ 12.99 L
    const alpha = Math.pow(0.707 / 0.35, 2) - 1;
    const vb = 40 / alpha;
    const res = simulateSealedBox(WOOFER, vb, freqs, { qa: 1e9 });
    const fc = res.fc;
    const qtc = res.qtc;
    expect(qtc).toBeCloseTo(0.707, 2);

    // Analytic 2nd-order highpass: |H| = fn²/√((1−fn²)² + (fn/Q)²)
    const analytic = (f: number): number => {
      const fn = f / fc;
      const fn2 = fn * fn;
      return (20 * Math.log10(fn2)) - 10 * Math.log10((1 - fn2) ** 2 + fn2 / (qtc * qtc));
    };

    // Normalize both to 2 kHz and compare across 0.5×Fc … 20×Fc
    const refSim = splAt(freqs, res.spl, 2000);
    const refAna = analytic(2000);
    for (const f of [fc * 0.5, fc * 0.7, fc, fc * 1.5, fc * 2, fc * 4, fc * 8]) {
      const sim = splAt(freqs, res.spl, f) - refSim;
      const ana = analytic(f) - refAna;
      expect(Math.abs(sim - ana)).toBeLessThan(0.8);
    }
  });

  it('vented B4 matches 4th-order Butterworth within ±2 dB', () => {
    const vb = 40;
    const fbTarget = 35;
    const lenMm = portLengthForTuning(fbTarget, vb / 1e3, 50 / 1e4) * 1e3;
    const res = simulateVentedBox(B4_WOOFER, vb, 50, lenMm, freqs, { ql: 1e9 });

    // True tuning = cone excursion minimum (radiation mass on the port
    // lowers it slightly below the lossless Helmholtz value)
    let minIdx = -1;
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i]! > 20 && freqs[i]! < 60) {
        if (minIdx === -1 || res.excursionMm[i]! < res.excursionMm[minIdx]!) minIdx = i;
      }
    }
    const fb = freqs[minIdx]!;
    expect(fb).toBeGreaterThan(fbTarget * 0.9);
    expect(fb).toBeLessThan(fbTarget * 1.05);

    // Analytic B4: |H| = fn⁴/√(1+fn⁸) → 80·log10(fn) − 10·log10(1+fn⁸)
    const analytic = (f: number): number => {
      const fn = f / fb;
      return 80 * Math.log10(fn) - 10 * Math.log10(1 + Math.pow(fn, 8));
    };

    const refSim = splAt(freqs, res.spl, 1000);
    const refAna = analytic(1000);
    for (const f of [fb * 0.5, fb * 0.7, fb, fb * 1.4, fb * 2, fb * 4, fb * 8]) {
      const sim = splAt(freqs, res.spl, f) - refSim;
      const ana = analytic(f) - refAna;
      expect(Math.abs(sim - ana)).toBeLessThan(2);
    }
  });
});

describe('max SPL', () => {
  it('displacement-limited SPL follows the SPEC formula', () => {
    // p = ρ₀·2π·f²·Sd·Xmax at f=50, Sd=140cm², Xmax=5mm
    const p = RHO0 * 2 * Math.PI * 50 * 50 * 0.014 * 0.005;
    const expected = 20 * Math.log10(p / 20e-6);
    expect(displacementLimitedSpl(50, 140, 5)).toBeCloseTo(expected, 4);
  });

  it('max SPL is the min of displacement and thermal limits', () => {
    const freqs = logFreqs(20, 1000, 50);
    const spl = freqs.map(() => 88);
    const exc = freqs.map((f) => (f < 100 ? 4 : 0.5));
    const res = maxSplFromSimulation(freqs, spl, exc, WOOFER);
    for (let i = 0; i < freqs.length; i++) {
      expect(res.maxSpl[i]!).toBeLessThanOrEqual(res.displacementLimited[i]! + 1e-9);
      expect(res.maxSpl[i]!).toBeLessThanOrEqual(res.thermalLimited + 1e-9);
    }
    // Low-f (high excursion) → displacement-limited below thermal
    expect(res.displacementLimited[0]!).toBeLessThan(res.thermalLimited);
  });
});

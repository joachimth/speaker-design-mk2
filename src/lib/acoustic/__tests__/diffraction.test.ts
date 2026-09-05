// Tests for the position-aware edge-diffraction model

import { describe, it, expect } from 'vitest';
import { calcBaffleDiffraction } from '../baffle';
import { layoutBandPositions } from '../baffleLayout';
import { simulateOnAxisWithBands } from '../simulateBands';
import { generateFrequencies } from '../thieleSmall';
import type { DesignBand, Driver } from '@/types';

const FREQS = generateFrequencies(20, 20000, 24);

function maxAbsIn(resp: number[], lo: number, hi: number): number {
  let m = 0;
  for (let i = 0; i < FREQS.length; i++) {
    const f = FREQS[i]!;
    if (f < lo || f > hi) continue;
    m = Math.max(m, Math.abs(resp[i]!));
  }
  return m;
}

describe('calcBaffleDiffraction', () => {
  it('approaches -6 dB at low frequencies (4π radiation)', () => {
    const r = calcBaffleDiffraction(320, 900, 160, 700, 0, FREQS);
    expect(r[0]!).toBeGreaterThan(-6.5);
    expect(r[0]!).toBeLessThan(-5.5);
  });

  it('ripples around 0 dB at high frequencies (2π reference)', () => {
    const r = calcBaffleDiffraction(320, 900, 160, 700, 0, FREQS);
    const hf = FREQS.map((f, i) => ({ f, v: r[i]! })).filter((p) => p.f > 5000);
    const mean = hf.reduce((s, p) => s + p.v, 0) / hf.length;
    expect(Math.abs(mean)).toBeLessThan(1.5);
  });

  it('produces real ripple, not a smooth 6 dB shelf', () => {
    // Centered driver on a square baffle: coherent edge distances → visible
    // peaks/dips in the transition region — this is what the old model lacked
    const r = calcBaffleDiffraction(400, 400, 200, 200, 0, FREQS);
    let maxV = -99;
    let minV = 99;
    for (let i = 0; i < FREQS.length; i++) {
      const f = FREQS[i]!;
      if (f < 400 || f > 8000) continue;
      maxV = Math.max(maxV, r[i]!);
      minV = Math.min(minV, r[i]!);
    }
    expect(maxV).toBeGreaterThan(0.8);   // constructive peak above the 2π ref
    expect(maxV - minV).toBeGreaterThan(2); // clear ripple structure
  });

  it('driver placement changes the response — offset flattens the ripple', () => {
    const centered = calcBaffleDiffraction(400, 400, 200, 200, 0, FREQS);
    const offset = calcBaffleDiffraction(400, 400, 130, 260, 0, FREQS);
    // Different positions → different curves
    let diff = 0;
    for (let i = 0; i < FREQS.length; i++) diff = Math.max(diff, Math.abs(centered[i]! - offset[i]!));
    expect(diff).toBeGreaterThan(0.5);
    // Classic result: off-center mounting spreads the edge distances and
    // reduces the worst-case ripple in the transition region
    expect(maxAbsIn(offset, 800, 10000)).toBeLessThan(maxAbsIn(centered, 800, 10000));
  });

  it('roundover damps the HF ripple but keeps the LF step', () => {
    const sharp = calcBaffleDiffraction(320, 900, 160, 700, 0, FREQS);
    const round = calcBaffleDiffraction(320, 900, 160, 700, 40, FREQS);
    expect(round[0]!).toBeCloseTo(sharp[0]!, 0); // -6 dB stays
    expect(maxAbsIn(round, 4000, 20000)).toBeLessThan(maxAbsIn(sharp, 4000, 20000));
  });

  it('is deterministic and cached', () => {
    const a = calcBaffleDiffraction(320, 900, 160, 700, 40, FREQS);
    const b = calcBaffleDiffraction(320, 900, 160, 700, 40, FREQS);
    expect(b).toBe(a); // same cached array
  });
});

describe('position-aware simulation integration', () => {
  const woofer: Driver = {
    id: 'w', manufacturer: 'T', model: 'W', type: 'woofer',
    tsParams: { fs: 30, re: 6, qms: 3, qes: 0.5, qts: 0.4, vas: 50, sensitivity: 88, xmax: 5, sd: 200, imp: 8 },
    dimensions: { overallDiameter: 180, cutoutDiameter: 146, mountingDepth: 80 },
    createdAt: 0, updatedAt: 0,
  };
  const tweeter: Driver = {
    id: 't', manufacturer: 'T', model: 'T', type: 'tweeter',
    tsParams: { fs: 800, re: 4.8, qms: 1.5, qes: 0.9, qts: 0.56, vas: 0.02, sensitivity: 90, xmax: 0.5, sd: 8, imp: 4 },
    dimensions: { overallDiameter: 104, cutoutDiameter: 72, mountingDepth: 30 },
    frequencyResponse: FREQS.map((f) => ({ freq: f, magnitude: 90 })),
    createdAt: 0, updatedAt: 0,
  };
  const bands: DesignBand[] = [
    { driverId: 'w', role: 'low', lowpassFreq: 2000, lowpassType: 'LR4', highpassFreq: 0, highpassType: 'LR4', gain: 0, polarity: 0, delay: 0 },
    { driverId: 't', role: 'high', lowpassFreq: 0, lowpassType: 'LR4', highpassFreq: 2000, highpassType: 'LR4', gain: 0, polarity: 0, delay: 0 },
  ];

  it('layout provides per-band positions matching the CAD stack', () => {
    const pos = layoutBandPositions(bands, [woofer, tweeter], 320, 900);
    expect(pos).not.toBeNull();
    const tw = pos!.find((p) => p.bandIndex === 1)!;
    const wf = pos!.find((p) => p.bandIndex === 0)!;
    expect(tw.yMm).toBeGreaterThan(wf.yMm); // tweeter above woofer
  });

  it('tweeter band now carries diffraction ripple (flat driver ≠ flat curve)', () => {
    const { processedBands } = simulateOnAxisWithBands(
      bands, [woofer, tweeter], FREQS, 320, 900, 'sealed', 0, 0, 60, 1, 0,
    );
    const twCurve = processedBands.find((pb) => pb.driverId === 't')!.curve;
    // Above the HP, in the passband: response must vary (edge ripple)
    const pass = twCurve.filter((p) => p.freq > 4000);
    const mags = pass.map((p) => p.magnitude);
    const spread = Math.max(...mags) - Math.min(...mags);
    expect(spread).toBeGreaterThan(0.5);
  });

  it('roundover changes the summed response', () => {
    const sharp = simulateOnAxisWithBands(bands, [woofer, tweeter], FREQS, 320, 900, 'sealed', 0, 0, 60, 1, 0).summed;
    const round = simulateOnAxisWithBands(bands, [woofer, tweeter], FREQS, 320, 900, 'sealed', 0, 0, 60, 1, 40).summed;
    let diff = 0;
    for (let i = 0; i < FREQS.length; i++) diff = Math.max(diff, Math.abs(sharp[i]!.magnitude - round[i]!.magnitude));
    expect(diff).toBeGreaterThan(0.3);
  });

  it('falls back to the shelf model when the stack cannot fit', () => {
    // 200 mm tall baffle cannot hold the stack → layout null → old model
    const res = simulateOnAxisWithBands(bands, [woofer, tweeter], FREQS, 320, 200, 'sealed', 0, 0, 60, 1, 0);
    expect(res.summed.length).toBe(FREQS.length);
    expect(res.summed.every((p) => Number.isFinite(p.magnitude))).toBe(true);
  });
});

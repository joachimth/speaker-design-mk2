// Tests for akustiske mål-slopes (SPEC §5.4)

import { describe, it, expect } from 'vitest';
import {
  rawBandCurve,
  filterMagnitudeDb,
  passbandReferenceDb,
  acousticTargetCurve,
  fitElectricalToTarget,
  type RawCurveOpts,
} from '../targetSlopes';
import { generateFrequencies } from '../thieleSmall';
import type { DesignBand, Driver, FrequencyDataPoint } from '@/types';

const FREQS = generateFrequencies(20, 20000, 24);

function flatCurve(levelDb: number): FrequencyDataPoint[] {
  return FREQS.map((f) => ({ freq: f, magnitude: levelDb }));
}

/** Flat tweeter — no cabinet model, no baffle step in processBand. */
function flatTweeter(): Driver {
  return {
    id: 'tw',
    manufacturer: 'Test',
    model: 'Flat',
    type: 'tweeter',
    tsParams: { fs: 800, re: 4.8, qms: 1.5, qes: 0.9, qts: 0.56, vas: 0.02, sensitivity: 90, xmax: 0.5, sd: 8, imp: 4 },
    frequencyResponse: flatCurve(90),
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Tweeter with a natural 2nd-order rolloff below fs=1 kHz. */
function rolloffTweeter(): Driver {
  const resp = FREQS.map((f) => {
    const r = f / 1000;
    const mag = (r * r) / Math.sqrt((1 - r * r) ** 2 + (r / 0.7) ** 2);
    return { freq: f, magnitude: 90 + 20 * Math.log10(Math.max(mag, 1e-6)) };
  });
  return { ...flatTweeter(), id: 'tw-roll', model: 'Rolloff', frequencyResponse: resp };
}

function band(patch: Partial<DesignBand> = {}): DesignBand {
  return {
    driverId: 'tw',
    role: 'high',
    lowpassFreq: 0,
    lowpassType: 'LR4',
    highpassFreq: 2000,
    highpassType: 'LR4',
    gain: -4,
    polarity: 180,
    delay: 0.5,
    ...patch,
  };
}

const OPTS: RawCurveOpts = {
  baffleWidth: 320,
  baffleHeight: 900,
  cabinetType: 'sealed',
  portFb: 0,
  portVb: 0,
  portDiameter: 60,
  numPorts: 1,
};

describe('rawBandCurve', () => {
  it('strips filters, gain and polarity from the band', () => {
    const raw = rawBandCurve(band(), flatTweeter(), OPTS, FREQS);
    expect(raw).not.toBeNull();
    // Flat 90 dB tweeter with HP@2k stripped: stays 90 dB everywhere
    for (const p of raw!) {
      expect(p.magnitude).toBeCloseTo(90, 5);
    }
  });

  it('returns null without a driver', () => {
    expect(rawBandCurve(band(), undefined, OPTS, FREQS)).toBeNull();
  });
});

describe('filterMagnitudeDb', () => {
  it('LR4 is -6 dB at fc', () => {
    const mags = filterMagnitudeDb('LR4', 2000, false, FREQS);
    const i = FREQS.findIndex((f) => Math.abs(f - 2000) / 2000 < 0.03);
    expect(i).toBeGreaterThan(-1);
    expect(mags[i]!).toBeGreaterThan(-7.5);
    expect(mags[i]!).toBeLessThan(-4.5);
  });

  it('BW4 matches LR4 (documented simplification in crossover.ts)', () => {
    // crossover.ts implements BW4 as two cascaded Q=0.707 sections — identical
    // to LR4 (-6 dB at fc), not the textbook single 4th-order Butterworth.
    const bw4 = filterMagnitudeDb('BW4', 2000, false, FREQS);
    const lr4 = filterMagnitudeDb('LR4', 2000, false, FREQS);
    for (let i = 0; i < FREQS.length; i += 30) {
      expect(bw4[i]!).toBeCloseTo(lr4[i]!, 9);
    }
  });
});

describe('passbandReferenceDb / acousticTargetCurve', () => {
  it('flat curve reference equals the level', () => {
    expect(passbandReferenceDb(flatCurve(88), { type: 'LR4', fc: 2000, isHighpass: false })).toBeCloseTo(88, 6);
  });

  it('target sits at ref in passband and rolls off in stopband', () => {
    const { target, passbandRefDb } = acousticTargetCurve(flatCurve(90), { type: 'LR4', fc: 1000, isHighpass: false }, FREQS);
    expect(passbandRefDb).toBeCloseTo(90, 6);
    const at100 = target.find((p) => Math.abs(p.freq - 100) / 100 < 0.03)!;
    const at8k = target.find((p) => Math.abs(p.freq - 8000) / 8000 < 0.03)!;
    expect(at100.magnitude).toBeGreaterThan(89);
    expect(at8k.magnitude).toBeLessThan(90 - 60); // LR4: 24 dB/okt, 3 octaves ≈ -72
  });
});

describe('fitElectricalToTarget', () => {
  it('flat driver + acoustic LR4 target → electrical LR4 at the target fc', () => {
    const raw = flatCurve(90);
    const res = fitElectricalToTarget(raw, { type: 'LR4', fc: 2000, isHighpass: false }, FREQS);
    expect(res.best.type).toBe('LR4');
    expect(res.best.fc).toBeGreaterThan(1900);
    expect(res.best.fc).toBeLessThan(2100);
    expect(res.best.errorDb).toBeLessThan(0.1);
  });

  it('flat driver highpass fit also lands on the target', () => {
    const raw = flatCurve(90);
    const res = fitElectricalToTarget(raw, { type: 'LR4', fc: 2000, isHighpass: true }, FREQS);
    expect(res.best.type).toBe('LR4');
    expect(res.best.errorDb).toBeLessThan(0.1);
  });

  it('driver with natural rolloff needs a SHALLOWER electrical HP than the acoustic target', () => {
    const driver = rolloffTweeter();
    const raw = driver.frequencyResponse!;
    const res = fitElectricalToTarget(raw, { type: 'LR4', fc: 2000, isHighpass: true }, FREQS);
    // The driver already contributes 2nd-order rolloff below 1 kHz, so a full
    // electrical LR4 @ 2000 would overshoot the acoustic slope.
    const orderOf: Record<string, number> = { first_order: 1, BW1: 1, BW2: 2, LR2: 2, BW4: 4, LR4: 4, LR8: 8 };
    expect(orderOf[res.best.type]!).toBeLessThanOrEqual(4);
    expect(res.best.errorDb).toBeLessThan(2.5);
    // And the fit must beat the naive choice (electrical LR4 @ exactly 2000)
    const naive = res.perType.find((p) => p.type === 'LR4')!;
    expect(res.best.errorDb).toBeLessThanOrEqual(naive.errorDb + 1e-9);
  });

  it('perType is sorted by error and covers all candidate types', () => {
    const res = fitElectricalToTarget(flatCurve(90), { type: 'LR2', fc: 1000, isHighpass: false }, FREQS);
    expect(res.perType.length).toBe(6);
    for (let i = 1; i < res.perType.length; i++) {
      expect(res.perType[i]!.errorDb).toBeGreaterThanOrEqual(res.perType[i - 1]!.errorDb);
    }
  });

  it('achieved curve equals raw + best electrical filter', () => {
    const raw = flatCurve(90);
    const res = fitElectricalToTarget(raw, { type: 'LR4', fc: 2000, isHighpass: false }, FREQS);
    const mags = filterMagnitudeDb(res.best.type, res.best.fc, false, FREQS);
    for (let i = 0; i < FREQS.length; i += 40) {
      expect(res.achieved[i]!.magnitude).toBeCloseTo(90 + mags[i]!, 6);
    }
  });

  it('is deterministic', () => {
    const raw = rolloffTweeter().frequencyResponse!;
    const a = fitElectricalToTarget(raw, { type: 'LR4', fc: 2500, isHighpass: true }, FREQS);
    const b = fitElectricalToTarget(raw, { type: 'LR4', fc: 2500, isHighpass: true }, FREQS);
    expect(a.best).toEqual(b.best);
  });
});

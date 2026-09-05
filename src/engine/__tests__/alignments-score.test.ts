// Tests for alignment presets, the numeric flat optimizer, and driver scoring.
import { describe, it, expect } from 'vitest';
import type { Driver, ThieleSmallParams } from '@/types';
import {
  ventedAlignments,
  tuningForVolume,
  optimizeVentedFlat,
} from '../enclosure/alignments';
import { scoreDriverInBox, rankDriversForBox, rankDriversAutoBox } from '../score';

const WOOFER: ThieleSmallParams = {
  fs: 35, re: 6.2, qms: 2.8, qes: 0.4, qts: 0.35, vas: 40,
  sensitivity: 88, xmax: 5, sd: 140, imp: 8, pe: 80,
};

const B4_WOOFER: ThieleSmallParams = {
  ...WOOFER, qts: 0.383, qes: 0.444, qms: 2.79,
};

function mkDriver(id: string, ts: ThieleSmallParams): Driver {
  return {
    id,
    manufacturer: 'Test',
    model: id,
    type: 'woofer',
    tsParams: ts,
    createdAt: 0,
    updatedAt: 0,
  } as Driver;
}

describe('ventedAlignments (SPEC §4.4)', () => {
  it('QB3 passes through the B4 point at Qts = 0.383: Vb ≈ Vas, Fb ≈ fs', () => {
    const a = ventedAlignments(B4_WOOFER);
    const qb3 = a.find((x) => x.id === 'qb3')!;
    expect(qb3.vbL).toBeGreaterThan(0.85 * B4_WOOFER.vas);
    expect(qb3.vbL).toBeLessThan(1.1 * B4_WOOFER.vas);
    expect(qb3.fbHz).toBeGreaterThan(0.93 * B4_WOOFER.fs);
    expect(qb3.fbHz).toBeLessThan(1.07 * B4_WOOFER.fs);
  });

  it('SBB4 tunes exactly at fs and B4 is flagged applicable only near Qts 0.38', () => {
    const a383 = ventedAlignments(B4_WOOFER);
    expect(a383.find((x) => x.id === 'sbb4')!.fbHz).toBe(B4_WOOFER.fs);
    expect(a383.find((x) => x.id === 'b4')!.applicable).toBe(true);
    const a25 = ventedAlignments({ ...WOOFER, qts: 0.25 });
    expect(a25.find((x) => x.id === 'b4')!.applicable).toBe(false);
  });

  it('higher Qts → bigger QB3 box and lower tuning (monotonic)', () => {
    const lo = ventedAlignments({ ...WOOFER, qts: 0.25 }).find((x) => x.id === 'qb3')!;
    const hi = ventedAlignments({ ...WOOFER, qts: 0.4 }).find((x) => x.id === 'qb3')!;
    expect(hi.vbL).toBeGreaterThan(lo.vbL);
    expect(hi.fbHz).toBeLessThan(lo.fbHz);
  });

  it('EBS is a bigger box tuned lower than QB3', () => {
    const a = ventedAlignments(WOOFER);
    const qb3 = a.find((x) => x.id === 'qb3')!;
    const ebs = a.find((x) => x.id === 'ebs')!;
    expect(ebs.vbL).toBeGreaterThan(1.5 * qb3.vbL);
    expect(ebs.fbHz).toBeLessThan(qb3.fbHz);
  });

  it('tuningForVolume reproduces the QB3 pair and clamps sanely', () => {
    const a = ventedAlignments(WOOFER).find((x) => x.id === 'qb3')!;
    const fb = tuningForVolume(WOOFER, a.vbL);
    expect(Math.abs(fb - a.fbHz) / a.fbHz).toBeLessThan(0.08);
    // Tiny box → clamped at 1.4×fs, huge box → clamped at 0.5×fs
    expect(tuningForVolume(WOOFER, 0.5)).toBeLessThanOrEqual(1.4 * WOOFER.fs);
    expect(tuningForVolume(WOOFER, 4000)).toBeGreaterThanOrEqual(0.5 * WOOFER.fs);
  });
});

describe('optimizeVentedFlat (SPEC §5.B)', () => {
  it('lands near the B4 point for a Qts 0.383 driver, with a flat result', () => {
    const r = optimizeVentedFlat(B4_WOOFER);
    // Generous window: the real (lossy, radiation-mass) optimum is near but
    // not exactly at the lossless B4 point.
    expect(r.vbL).toBeGreaterThan(0.4 * B4_WOOFER.vas);
    expect(r.vbL).toBeLessThan(2.5 * B4_WOOFER.vas);
    expect(r.fbHz).toBeGreaterThan(0.6 * B4_WOOFER.fs);
    expect(r.fbHz).toBeLessThan(1.4 * B4_WOOFER.fs);
    expect(r.humpDb).toBeLessThan(1.5);
    expect(r.f3).toBeGreaterThan(15);
    expect(r.f3).toBeLessThan(90);
  });

  it('respects a volume ceiling', () => {
    const r = optimizeVentedFlat(B4_WOOFER, { maxVbL: 20 });
    expect(r.vbL).toBeLessThanOrEqual(20.5);
  });

  it('is deterministic', () => {
    const a = optimizeVentedFlat(WOOFER);
    const b = optimizeVentedFlat(WOOFER);
    expect(a.vbL).toBe(b.vbL);
    expect(a.fbHz).toBe(b.fbHz);
  });
});

describe('scoreDriverInBox (SPEC §5.A)', () => {
  const goals = { bassDepth: 0.5, maxSpl: 0.5, allowPorted: true };

  it('returns a 0–100 total with named explainable parts', () => {
    const s = scoreDriverInBox(mkDriver('a', WOOFER), { type: 'sealed', vbL: 30 }, goals)!;
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
    expect(s.parts.length).toBeGreaterThanOrEqual(6);
    for (const p of s.parts) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
      expect(p.weight).toBeGreaterThan(0);
      expect(p.note.length).toBeGreaterThan(0);
    }
  });

  it('a right-sized box beats a far-too-small box for the same driver', () => {
    const good = scoreDriverInBox(mkDriver('a', WOOFER), { type: 'sealed', vbL: 30 }, goals)!;
    const cramped = scoreDriverInBox(mkDriver('a', WOOFER), { type: 'sealed', vbL: 3 }, goals)!;
    expect(good.total).toBeGreaterThan(cramped.total);
  });

  it('missing Xmax/BL/Le lowers the data-quality part', () => {
    const bare: ThieleSmallParams = { ...WOOFER, xmax: 0, bl: undefined, le: undefined } as ThieleSmallParams;
    const s = scoreDriverInBox(mkDriver('a', bare), { type: 'sealed', vbL: 30 }, goals)!;
    const dq = s.parts.find((p) => p.id === 'data_quality')!;
    expect(dq.score).toBeLessThan(60);
  });

  it('bassDepth goal shifts weight toward extension', () => {
    const deep = scoreDriverInBox(mkDriver('a', WOOFER), { type: 'sealed', vbL: 30 }, { ...goals, bassDepth: 1 })!;
    const shallow = scoreDriverInBox(mkDriver('a', WOOFER), { type: 'sealed', vbL: 30 }, { ...goals, bassDepth: 0 })!;
    const wDeep = deep.parts.find((p) => p.id === 'bass_extension')!.weight;
    const wShallow = shallow.parts.find((p) => p.id === 'bass_extension')!.weight;
    expect(wDeep).toBeGreaterThan(wShallow);
  });
});

describe('ranking (wizard flows)', () => {
  const goals = { bassDepth: 0.7, maxSpl: 0.3, allowPorted: true };
  const sub: ThieleSmallParams = {
    fs: 22, re: 3.5, qms: 6, qes: 0.45, qts: 0.42, vas: 90,
    sensitivity: 85, xmax: 12, sd: 500, imp: 4, pe: 200,
  };
  const tweeterish: ThieleSmallParams = {
    fs: 90, re: 6, qms: 2, qes: 0.5, qts: 0.4, vas: 3,
    sensitivity: 90, xmax: 1, sd: 30, imp: 8, pe: 30,
  };

  it('rankDriversForBox ranks the subwoofer above the small driver for deep bass in 60 L', () => {
    const ranked = rankDriversForBox(
      [mkDriver('small', tweeterish), mkDriver('sub', sub)],
      60,
      goals,
    );
    expect(ranked.length).toBe(2);
    expect(ranked[0]!.driverId).toBe('sub');
    expect(ranked[0]!.total).toBeGreaterThan(ranked[1]!.total);
  });

  it('rankDriversAutoBox respects the volume ceiling', () => {
    const ranked = rankDriversAutoBox([mkDriver('sub', sub)], goals, 40);
    expect(ranked.length).toBe(1);
    expect(ranked[0]!.box.vbL).toBeLessThanOrEqual(40.5);
  });

  it('drivers without usable T/S are skipped, not crashed', () => {
    const broken = mkDriver('broken', { ...WOOFER, vas: 0 });
    const ranked = rankDriversForBox([broken, mkDriver('ok', WOOFER)], 30, goals);
    expect(ranked.length).toBe(1);
    expect(ranked[0]!.driverId).toBe('ok');
  });
});

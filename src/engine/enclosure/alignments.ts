// Vented-box alignment starting points (SPEC §4.4) + numeric flat optimizer
// (SPEC §5.B, Nelder–Mead over (Vb, Fb) on the real lumped-element model).
//
// Closed-form presets use the classic Small/Keele power-law fits that
// WinISD-class tools use as starting points:
//
//   QB3  (quasi-Butterworth):  Vb = 15·Vas·Qts^2.87,  Fb = 0.42·fs·Qts^−0.9
//   SBB4 (super boom box):     Vb = 20·Vas·Qts^3.3,   Fb = fs
//   B4   (Butterworth):        exists only near Qts ≈ 0.383, where the QB3
//                              fit passes through the exact B4 point
//                              (Vb ≈ 0.96·Vas, Fb ≈ fs)
//   EBS  (extended bass shelf): rule of thumb — double the QB3 box tuned
//                              ~20 % lower; trades flatness for extension
//   C4   (Chebyshev, Qts > ~0.4) has no simple closed form → covered by
//                              the numeric optimizer instead.
//
// The numeric optimizer is the honest generalisation: it minimises
// (passband hump + suckout + extension penalty) computed with the REAL
// vented-box simulation, so it lands on B4/QB3/C4-like alignments by itself
// depending on Qts. Deterministic (fixed start simplex), no randomness.

import type { ThieleSmallParams } from '@/types';
import { simulateVentedBox, portLengthForTuning } from './vented';

export interface AlignmentSuggestion {
  id: 'qb3' | 'sbb4' | 'b4' | 'ebs';
  label: string;
  vbL: number;
  fbHz: number;
  /** true when the driver's Qts is inside the alignment's sweet spot */
  applicable: boolean;
  note: string;
}

/** Classic alignment starting points from T/S parameters (SPEC §4.4). */
export function ventedAlignments(ts: ThieleSmallParams): AlignmentSuggestion[] {
  const { fs, qts, vas } = ts;
  if (!fs || !qts || !vas) return [];

  const vbQb3 = 15 * vas * Math.pow(qts, 2.87);
  const fbQb3 = 0.42 * fs * Math.pow(qts, -0.9);

  return [
    {
      id: 'qb3',
      label: 'QB3',
      vbL: vbQb3,
      fbHz: fbQb3,
      applicable: qts >= 0.18 && qts <= 0.45,
      note: 'Kvasi-Butterworth: flattest kompromis for lav Qts. Standard-startpunkt.',
    },
    {
      id: 'sbb4',
      label: 'SBB4',
      vbL: 20 * vas * Math.pow(qts, 3.3),
      fbHz: fs,
      applicable: qts >= 0.25 && qts <= 0.45,
      note: 'Tunet præcis på fs. Blødere rolloff, god transientkontrol, mindre kasse.',
    },
    {
      id: 'b4',
      label: 'B4',
      vbL: vbQb3,
      fbHz: fbQb3,
      applicable: qts >= 0.35 && qts <= 0.42,
      note:
        qts >= 0.35 && qts <= 0.42
          ? 'Ægte 4. ordens Butterworth — din Qts er i B4-vinduet (≈0,38).'
          : 'Kræver Qts ≈ 0,35–0,42. Uden for vinduet er QB3/numerisk bedre.',
    },
    {
      id: 'ebs',
      label: 'EBS',
      vbL: 2.0 * vbQb3,
      fbHz: 0.8 * fbQb3,
      applicable: qts >= 0.25 && qts <= 0.5,
      note: 'Extended bass shelf: dobbelt volumen, lavere tuning. Dybere bas, let shelf-fald.',
    },
  ];
}

/** QB3-familiens tuning for et FAST volumen: Fb ≈ fs·(Vas/Vb)^0.31 (klassisk fit). */
export function tuningForVolume(ts: ThieleSmallParams, vbL: number): number {
  const raw = ts.fs * Math.pow(ts.vas / Math.max(vbL, 0.1), 0.31);
  return Math.min(Math.max(raw, 0.5 * ts.fs), 1.4 * ts.fs);
}

// ---------------------------------------------------------------------------
// Numeric "flattest response" optimizer (SPEC §5.B)
// ---------------------------------------------------------------------------

export interface FlatAlignmentResult {
  vbL: number;
  fbHz: number;
  /** -3 dB point of the optimised response [Hz] */
  f3: number;
  /** Max deviation above reference level (bass hump) [dB] */
  humpDb: number;
  /** Number of cost evaluations used */
  evaluations: number;
}

interface CostBreakdown {
  cost: number;
  f3: number;
  hump: number;
}

function logFreqs(f0: number, f1: number, perOct: number): number[] {
  const n = Math.ceil(perOct * Math.log2(f1 / f0)) + 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(f0 * Math.pow(f1 / f0, i / (n - 1)));
  return out;
}

function evaluateVented(
  ts: ThieleSmallParams,
  vbL: number,
  fbHz: number,
  freqs: number[],
  extensionWeight: number,
): CostBreakdown {
  // Fixed sensible port: area ~12 % of Sd, clamped 15–220 cm².
  const portAreaCm2 = Math.min(Math.max(0.12 * (ts.sd || 200), 15), 220);
  const portLenM = portLengthForTuning(fbHz, vbL / 1000, portAreaCm2 / 1e4);
  const sim = simulateVentedBox(ts, vbL, portAreaCm2, portLenM * 1000, freqs, {
    voltage: 2.83,
  });

  // Reference = mean level 300–800 Hz
  let refSum = 0;
  let refN = 0;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! >= 300 && freqs[i]! <= 800) {
      refSum += sim.spl[i]!;
      refN++;
    }
  }
  const ref = refSum / Math.max(refN, 1);

  // f3: walk down from the top, find the last crossing below ref−3
  let f3 = freqs[0]!;
  for (let i = freqs.length - 1; i >= 1; i--) {
    if (sim.spl[i]! >= ref - 3 && sim.spl[i - 1]! < ref - 3) {
      // log-interpolate the crossing
      const a = sim.spl[i - 1]!;
      const b = sim.spl[i]!;
      const t = (ref - 3 - a) / (b - a);
      f3 = freqs[i - 1]! * Math.pow(freqs[i]! / freqs[i - 1]!, t);
      break;
    }
  }

  // Bass hump: any level above ref anywhere
  let hump = 0;
  for (let i = 0; i < freqs.length; i++) {
    hump = Math.max(hump, sim.spl[i]! - ref);
  }

  // Midbass suckout: below ref inside the passband [2.5·f3, 800]
  let sag = 0;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! >= 2.5 * f3 && freqs[i]! <= 800) {
      sag = Math.max(sag, ref - sim.spl[i]!);
    }
  }

  const cost = extensionWeight * f3 + 2.0 * hump + 1.5 * sag;
  return { cost, f3, hump };
}

/**
 * Find the flattest vented alignment for a driver with Nelder–Mead over
 * (log Vb, log Fb) on the real simulation. Deterministic. ~60–90 sims.
 *
 * @param maxVbL optional volume ceiling [L] (wizard "max size")
 */
export function optimizeVentedFlat(
  ts: ThieleSmallParams,
  opts: { maxVbL?: number; extensionWeight?: number } = {},
): FlatAlignmentResult {
  const freqs = logFreqs(15, 800, 24);
  const extensionWeight = opts.extensionWeight ?? 0.12;
  const vbCap = opts.maxVbL ?? 6 * ts.vas;
  let evaluations = 0;

  // Parameters: x = [ln(Vb/Vas), ln(Fb/fs)], clamped inside f()
  const clamp = (x: number[]): number[] => [
    Math.min(Math.max(x[0]!, Math.log(0.15)), Math.log(Math.min(5, vbCap / ts.vas))),
    Math.min(Math.max(x[1]!, Math.log(0.45)), Math.log(1.5)),
  ];
  const f = (xRaw: number[]): number => {
    const x = clamp(xRaw);
    const vb = ts.vas * Math.exp(x[0]!);
    const fb = ts.fs * Math.exp(x[1]!);
    evaluations++;
    return evaluateVented(ts, vb, fb, freqs, extensionWeight).cost;
  };

  // Start simplex around the QB3 point (deterministic)
  const vb0 = Math.min(15 * ts.vas * Math.pow(ts.qts, 2.87), vbCap);
  const fb0 = 0.42 * ts.fs * Math.pow(ts.qts, -0.9);
  let simplex: { x: number[]; fx: number }[] = [
    [Math.log(vb0 / ts.vas), Math.log(fb0 / ts.fs)],
    [Math.log(vb0 / ts.vas) + 0.4, Math.log(fb0 / ts.fs)],
    [Math.log(vb0 / ts.vas), Math.log(fb0 / ts.fs) + 0.25],
  ].map((x) => ({ x, fx: f(x) }));

  for (let iter = 0; iter < 40; iter++) {
    simplex.sort((a, b) => a.fx - b.fx);
    const best = simplex[0]!;
    const worst = simplex[2]!;
    if (Math.abs(worst.fx - best.fx) < 0.02) break;

    // Centroid of the two best
    const c = [
      (simplex[0]!.x[0]! + simplex[1]!.x[0]!) / 2,
      (simplex[0]!.x[1]! + simplex[1]!.x[1]!) / 2,
    ];
    // Reflection
    const xr = [2 * c[0]! - worst.x[0]!, 2 * c[1]! - worst.x[1]!];
    const fr = f(xr);
    if (fr < best.fx) {
      // Expansion
      const xe = [3 * c[0]! - 2 * worst.x[0]!, 3 * c[1]! - 2 * worst.x[1]!];
      const fe = f(xe);
      simplex[2] = fe < fr ? { x: xe, fx: fe } : { x: xr, fx: fr };
    } else if (fr < simplex[1]!.fx) {
      simplex[2] = { x: xr, fx: fr };
    } else {
      // Contraction
      const xc = [(c[0]! + worst.x[0]!) / 2, (c[1]! + worst.x[1]!) / 2];
      const fc = f(xc);
      if (fc < worst.fx) {
        simplex[2] = { x: xc, fx: fc };
      } else {
        // Shrink toward best
        simplex = simplex.map((p, i) =>
          i === 0
            ? p
            : (() => {
                const x = [
                  (p.x[0]! + best.x[0]!) / 2,
                  (p.x[1]! + best.x[1]!) / 2,
                ];
                return { x, fx: f(x) };
              })(),
        );
      }
    }
  }

  simplex.sort((a, b) => a.fx - b.fx);
  const xBest = clamp(simplex[0]!.x);
  const vbL = ts.vas * Math.exp(xBest[0]!);
  const fbHz = ts.fs * Math.exp(xBest[1]!);
  const finalEval = evaluateVented(ts, vbL, fbHz, freqs, extensionWeight);

  return { vbL, fbHz, f3: finalEval.f3, humpDb: finalEval.hump, evaluations };
}

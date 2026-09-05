// Driver-in-box scoring (SPEC §5.A): explainable 0–100 score with named
// sub-scores, computed on the REAL lumped-element simulation — no lookup
// tables. Deterministic. Used by the wizard flows to rank drivers for a
// given cabinet (Flow A) and to rank auto-boxed drivers from scratch
// (Flow B).
//
// Weights adapt to the user's word-slider goals (bass depth vs. max SPL),
// and every part carries a human-readable note so the ranking is
// explainable in the UI ("Hvorfor ser det sådan ud?", SPEC §7.4).

import type { Driver, ThieleSmallParams } from '@/types';
import { simulateSealedBox } from './enclosure/sealed';
import { simulateVentedBox, portLengthForTuning, PORT_VELOCITY_RECOMMENDED, PORT_VELOCITY_CHUFFING } from './enclosure/vented';
import { tuningForVolume } from './enclosure/alignments';
import { maxSplFromSimulation } from './maxSpl';

export interface ScoreGoals {
  /** 0 = don't care about deep bass, 1 = deep bass is the top priority */
  bassDepth: number;
  /** 0 = background levels, 1 = party/max-SPL priority */
  maxSpl: number;
  /** Allow ported alignments (false = sealed only) */
  allowPorted: boolean;
}

export interface ScorePart {
  id: string;
  label: string;
  /** 0–100 */
  score: number;
  /** Relative weight used in the total */
  weight: number;
  note: string;
}

export interface BoxUsed {
  type: 'sealed' | 'ported';
  vbL: number;
  fbHz?: number;
  f3: number;
  qtc?: number;
  portLengthMm?: number;
}

export interface DriverScore {
  driverId: string;
  total: number;
  parts: ScorePart[];
  box: BoxUsed;
}

// ---------------------------------------------------------------------------

function logFreqs(f0: number, f1: number, perOct: number): number[] {
  const n = Math.ceil(perOct * Math.log2(f1 / f0)) + 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(f0 * Math.pow(f1 / f0, i / (n - 1)));
  return out;
}

/** Map x linearly from [x0 → 0, x1 → 100], clamped. Works descending too. */
function mapScore(x: number, x0: number, x1: number): number {
  const t = (x - x0) / (x1 - x0);
  return Math.min(Math.max(t * 100, 0), 100);
}

interface SimSummary {
  f3: number;
  humpDb: number;
  sagDb: number;
  minMaxSpl: number;
  maxPortVelocity: number;
  qtc?: number;
}

function summarize(
  freqs: number[],
  spl: number[],
  excursionMm: number[],
  ts: ThieleSmallParams,
  portVelocity?: number[],
  qtc?: number,
): SimSummary {
  let refSum = 0;
  let refN = 0;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! >= 300 && freqs[i]! <= 700) {
      refSum += spl[i]!;
      refN++;
    }
  }
  const ref = refSum / Math.max(refN, 1);

  let f3 = freqs[0]!;
  for (let i = freqs.length - 1; i >= 1; i--) {
    if (spl[i]! >= ref - 3 && spl[i - 1]! < ref - 3) {
      const a = spl[i - 1]!;
      const b = spl[i]!;
      const t = (ref - 3 - a) / (b - a);
      f3 = freqs[i - 1]! * Math.pow(freqs[i]! / freqs[i - 1]!, t);
      break;
    }
  }

  let hump = 0;
  let sag = 0;
  for (let i = 0; i < freqs.length; i++) {
    hump = Math.max(hump, spl[i]! - ref);
    if (freqs[i]! >= 2.5 * f3 && freqs[i]! <= 700) sag = Math.max(sag, ref - spl[i]!);
  }

  // Displacement/thermally limited max SPL, worst case in the power band
  const limits = maxSplFromSimulation(freqs, spl, excursionMm, ts);
  let minMaxSpl = Infinity;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! >= 45 && freqs[i]! <= 120) {
      minMaxSpl = Math.min(minMaxSpl, limits.maxSpl[i]!);
    }
  }
  if (!Number.isFinite(minMaxSpl)) minMaxSpl = 90;

  let maxV = 0;
  if (portVelocity) {
    for (let i = 0; i < freqs.length; i++) {
      // Only count velocity where there is real drive (above 0.5×f3)
      if (freqs[i]! >= 0.5 * f3) maxV = Math.max(maxV, portVelocity[i]!);
    }
  }

  return { f3, humpDb: hump, sagDb: sag, minMaxSpl, maxPortVelocity: maxV, qtc };
}

// ---------------------------------------------------------------------------

/**
 * Score one driver in one specific box. The box is given (Flow A: the user's
 * cabinet). Sub-scores + weights are returned for explainability.
 */
export function scoreDriverInBox(
  driver: Driver,
  box: { type: 'sealed' | 'ported'; vbL: number; fbHz?: number },
  goals: ScoreGoals,
): DriverScore | null {
  const ts = driver.tsParams;
  if (!ts?.fs || !ts.qts || !ts.vas || !ts.sd) return null;

  const freqs = logFreqs(15, 800, 24);
  const voltage = 2.83;

  let summary: SimSummary;
  let boxUsed: BoxUsed;

  if (box.type === 'ported') {
    const fb = box.fbHz ?? tuningForVolume(ts, box.vbL);
    const portAreaCm2 = Math.min(Math.max(0.12 * ts.sd, 15), 220);
    const portLenM = portLengthForTuning(fb, box.vbL / 1000, portAreaCm2 / 1e4);
    const sim = simulateVentedBox(ts, box.vbL, portAreaCm2, portLenM * 1000, freqs, { voltage });
    summary = summarize(freqs, sim.spl, sim.excursionMm, ts, sim.portVelocity);
    boxUsed = { type: 'ported', vbL: box.vbL, fbHz: fb, f3: summary.f3, portLengthMm: portLenM * 1000 };
  } else {
    const sim = simulateSealedBox(ts, box.vbL, freqs, { voltage });
    summary = summarize(freqs, sim.spl, sim.excursionMm, ts, undefined, sim.qtc);
    boxUsed = { type: 'sealed', vbL: box.vbL, f3: summary.f3, qtc: sim.qtc };
  }

  const parts: ScorePart[] = [];

  // 1. Bass extension (f3). 25 Hz → 100, 90 Hz → 0 on a log scale.
  const f3Score = mapScore(Math.log2(summary.f3), Math.log2(90), Math.log2(25));
  parts.push({
    id: 'bass_extension',
    label: 'Basdybde (F3)',
    score: f3Score,
    weight: 12 + 18 * goals.bassDepth,
    note: `F3 ≈ ${summary.f3.toFixed(0)} Hz i denne kasse.`,
  });

  // 2. Response flatness (hump + sag).
  const flatScore = mapScore(summary.humpDb + summary.sagDb, 7, 0.5);
  parts.push({
    id: 'flatness',
    label: 'Flathed',
    score: flatScore,
    weight: 12,
    note: `Puk +${summary.humpDb.toFixed(1)} dB, sug −${summary.sagDb.toFixed(1)} dB mod reference.`,
  });

  // 3. Max SPL in the power band (displacement + thermal limits).
  const splScore = mapScore(summary.minMaxSpl, 88, 116);
  parts.push({
    id: 'max_spl',
    label: 'Maks SPL',
    score: splScore,
    weight: 10 + 18 * goals.maxSpl,
    note: `Begrænset til ≈ ${summary.minMaxSpl.toFixed(0)} dB (45–120 Hz, Xmax/termisk).`,
  });

  // 4. Efficiency (datasheet sensitivity).
  const sensScore = mapScore(ts.sensitivity || 84, 80, 95);
  parts.push({
    id: 'efficiency',
    label: 'Følsomhed',
    score: sensScore,
    weight: 10,
    note: `${(ts.sensitivity || 0).toFixed(1)} dB/2,83 V/1 m fra databladet.`,
  });

  // 5. Box fit: sealed → Qtc window around 0.707; ported → Vb vs QB3-Vb.
  let fitScore: number;
  let fitNote: string;
  if (boxUsed.type === 'sealed') {
    const qtc = boxUsed.qtc ?? 1;
    fitScore = mapScore(Math.abs(qtc - 0.72), 0.45, 0.03);
    fitNote = `Qtc = ${qtc.toFixed(2)} (mål ≈ 0,71).`;
  } else {
    const vbQb3 = 15 * ts.vas * Math.pow(ts.qts, 2.87);
    const ratio = box.vbL / vbQb3;
    fitScore = mapScore(Math.abs(Math.log2(ratio)), 1.6, 0.1);
    fitNote = `Volumen er ${ratio.toFixed(2)}× driverens QB3-volumen.`;
  }
  parts.push({ id: 'box_fit', label: 'Kasse-match', score: fitScore, weight: 15, note: fitNote });

  // 6. Port practicality (ported only): length + velocity at listening drive.
  if (boxUsed.type === 'ported') {
    const lenScore = mapScore(boxUsed.portLengthMm ?? 0, 800, 120);
    // Port velocity at a harder drive: scale from 2.83 V small-signal sim
    // (velocity scales linearly with voltage → ×5 ≈ 40 W @ 8 Ω).
    const vAt40W = summary.maxPortVelocity * 5;
    const vScore = mapScore(vAt40W, PORT_VELOCITY_CHUFFING, PORT_VELOCITY_RECOMMENDED * 0.5);
    const portScore = Math.min(lenScore, vScore);
    parts.push({
      id: 'port',
      label: 'Port-praktik',
      score: portScore,
      weight: 8,
      note: `Portlængde ${(boxUsed.portLengthMm ?? 0).toFixed(0)} mm, ~${vAt40W.toFixed(1)} m/s ved 40 W.`,
    });
  }

  // 7. Xmax reserve (linear excursion capability).
  const xmaxScore = mapScore(ts.xmax || 0, 1, 9);
  parts.push({
    id: 'xmax',
    label: 'Xmax-reserve',
    score: xmaxScore,
    weight: 6 + 6 * goals.bassDepth,
    note: `Xmax ${(ts.xmax || 0).toFixed(1)} mm.`,
  });

  // 8. Data quality: how complete are the driver's parameters?
  const missing: string[] = [];
  if (!ts.xmax) missing.push('Xmax');
  if (!ts.bl) missing.push('BL');
  if (!ts.mms && !ts.vas) missing.push('Mms/Vas');
  if (!ts.le) missing.push('Le');
  if (!ts.imp) missing.push('Z');
  const dataScore = Math.max(0, 100 - missing.length * 22);
  parts.push({
    id: 'data_quality',
    label: 'Datakvalitet',
    score: dataScore,
    weight: 5,
    note: missing.length ? `Mangler: ${missing.join(', ')}.` : 'Alle nøgleparametre til stede.',
  });

  const wSum = parts.reduce((s, p) => s + p.weight, 0);
  const total = parts.reduce((s, p) => s + p.score * p.weight, 0) / wSum;

  return { driverId: driver.id, total, parts, box: boxUsed };
}

/**
 * Flow A: rank every candidate driver for a FIXED box volume. Tries sealed
 * and (if allowed and Qts is vented-friendly) ported in the same volume and
 * keeps the better of the two per driver. Returns descending by score.
 */
export function rankDriversForBox(
  drivers: Driver[],
  vbL: number,
  goals: ScoreGoals,
): DriverScore[] {
  const out: DriverScore[] = [];
  for (const d of drivers) {
    const ts = d.tsParams;
    if (!ts?.fs || !ts.qts || !ts.vas || !ts.sd) continue;
    const candidates: DriverScore[] = [];
    const sealed = scoreDriverInBox(d, { type: 'sealed', vbL }, goals);
    if (sealed) candidates.push(sealed);
    if (goals.allowPorted && ts.qts <= 0.55) {
      const ported = scoreDriverInBox(d, { type: 'ported', vbL }, goals);
      if (ported) candidates.push(ported);
    }
    if (candidates.length) {
      candidates.sort((a, b) => b.total - a.total);
      out.push(candidates[0]!);
    }
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

/**
 * Flow B: rank drivers where each driver gets its OWN best simple box
 * (sealed Qtc≈0.707 or QB3 ported), optionally under a volume ceiling.
 */
export function rankDriversAutoBox(
  drivers: Driver[],
  goals: ScoreGoals,
  maxVbL?: number,
): DriverScore[] {
  const out: DriverScore[] = [];
  for (const d of drivers) {
    const ts = d.tsParams;
    if (!ts?.fs || !ts.qts || !ts.vas || !ts.sd) continue;

    const candidates: DriverScore[] = [];

    // Sealed Qtc ≈ 0.707 (only exists for qts < target)
    if (ts.qts < 0.69) {
      let vbSealed = ts.vas / (Math.pow(0.707 / ts.qts, 2) - 1);
      if (maxVbL) vbSealed = Math.min(vbSealed, maxVbL);
      const s = scoreDriverInBox(d, { type: 'sealed', vbL: vbSealed }, goals);
      if (s) candidates.push(s);
    } else {
      // High-Qts driver: score it in Vas-sized sealed box (Qtc high, EBS-ish)
      let vb = ts.vas;
      if (maxVbL) vb = Math.min(vb, maxVbL);
      const s = scoreDriverInBox(d, { type: 'sealed', vbL: vb }, goals);
      if (s) candidates.push(s);
    }

    if (goals.allowPorted && ts.qts <= 0.5) {
      let vbQb3 = 15 * ts.vas * Math.pow(ts.qts, 2.87);
      if (maxVbL) vbQb3 = Math.min(vbQb3, maxVbL);
      const fb = tuningForVolume(ts, vbQb3);
      const s = scoreDriverInBox(d, { type: 'ported', vbL: vbQb3, fbHz: fb }, goals);
      if (s) candidates.push(s);
    }

    if (candidates.length) {
      candidates.sort((a, b) => b.total - a.total);
      out.push(candidates[0]!);
    }
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

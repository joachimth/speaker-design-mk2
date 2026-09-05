// Akustiske mål-slopes (SPEC §5.4)
//
// The user specifies an ACOUSTIC target (e.g. acoustic LR4 @ 2 kHz). The
// driver's raw, baffle-corrected curve already rolls off on its own, so the
// electrical filter that achieves the acoustic target is generally NOT the
// same type/frequency as the target. Per spec: start from the analytic
// solution (target slope inverted against the raw driver curve), then local
// optimization. Always fit against baffle-corrected driver curves.
//
// Pure module — no UI. The electrical candidate search reuses the exact
// filter implementations from crossover.ts, so a fitted filter reproduces
// identically in simulation and export.

import type {
  DesignBand,
  Driver,
  FrequencyDataPoint,
  CrossoverType,
} from '@/types';
import { buildCrossoverFilter, applyCrossover } from './crossover';
import { calcBaffleStep, calcBaffleStepCompensation } from './baffle';
import { processBand, SHARED_SAMPLE_RATE } from './simulateBands';

// ---------------------------------------------------------------------------
// Raw (unfiltered) band curve
// ---------------------------------------------------------------------------

export interface RawCurveOpts {
  baffleWidth: number;
  baffleHeight: number;
  cabinetType: string;
  portFb: number;
  portVb: number;
  portDiameter: number;
  numPorts: number;
  /** Position-aware edge-diffraction curve for this band (dB per freq). */
  diffractionDb?: number[] | null;
}

/**
 * The band's driver curve through cabinet + baffle step + compensation, but
 * WITHOUT crossover filters, EQ, gain and polarity — the curve the acoustic
 * target must be fitted against.
 */
export function rawBandCurve(
  band: DesignBand,
  driver: Driver | undefined,
  opts: RawCurveOpts,
  freqs: number[],
): FrequencyDataPoint[] | null {
  if (!driver) return null;
  const stripped: DesignBand = {
    ...band,
    lowpassFreq: 0,
    highpassFreq: 0,
    gain: 0,
    polarity: 0,
    delay: 0,
    eqFilters: [],
  };
  const baffleStepResult = calcBaffleStep(opts.baffleWidth, opts.baffleHeight, freqs);
  const fStep = 343000 / (2 * opts.baffleWidth);
  const fStep3x = fStep * 3;
  const baffleCompDb = Math.abs(baffleStepResult.response[0] ?? 6);
  const baffleComp = calcBaffleStepCompensation(fStep, baffleCompDb, freqs);
  const result = processBand(
    stripped, driver, freqs,
    baffleStepResult, baffleComp,
    fStep, fStep3x,
    opts.cabinetType, opts.portFb, opts.portVb, opts.portDiameter, opts.numPorts,
    opts.baffleWidth,
    opts.diffractionDb,
  );
  return result?.curve ?? null;
}

// ---------------------------------------------------------------------------
// Target curve
// ---------------------------------------------------------------------------

export interface TargetSlopeSpec {
  /** Acoustic target slope type (LR4, LR2, BW4, ...) */
  type: CrossoverType;
  /** Acoustic target frequency [Hz] */
  fc: number;
  /** True = the band is above the XO (highpass side) */
  isHighpass: boolean;
}

/** Magnitude response of a standard filter, in dB, on the given grid. */
export function filterMagnitudeDb(
  type: CrossoverType,
  fc: number,
  isHighpass: boolean,
  freqs: number[],
): number[] {
  const filter = buildCrossoverFilter(type, fc, isHighpass, SHARED_SAMPLE_RATE);
  const zero = freqs.map((f) => ({ freq: f, magnitude: 0 }));
  return applyCrossover(filter, zero, SHARED_SAMPLE_RATE).map((p) => p.magnitude);
}

/** Mean raw level in the target's passband — the target's reference level. */
export function passbandReferenceDb(
  raw: FrequencyDataPoint[],
  spec: TargetSlopeSpec,
): number {
  const lo = spec.isHighpass ? spec.fc * 2 : Math.max(20, spec.fc / 8);
  const hi = spec.isHighpass ? Math.min(20000, spec.fc * 8) : spec.fc / 2;
  const pts = raw.filter((p) => p.freq >= lo && p.freq <= hi);
  const use = pts.length > 0 ? pts : raw;
  return use.reduce((s, p) => s + p.magnitude, 0) / use.length;
}

/**
 * The acoustic target curve: passband reference level + ideal slope of the
 * requested type/frequency.
 */
export function acousticTargetCurve(
  raw: FrequencyDataPoint[],
  spec: TargetSlopeSpec,
  freqs: number[],
): { target: FrequencyDataPoint[]; passbandRefDb: number } {
  const passbandRefDb = passbandReferenceDb(raw, spec);
  const slope = filterMagnitudeDb(spec.type, spec.fc, spec.isHighpass, freqs);
  return {
    target: freqs.map((f, i) => ({ freq: f, magnitude: passbandRefDb + slope[i]! })),
    passbandRefDb,
  };
}

// ---------------------------------------------------------------------------
// Fit
// ---------------------------------------------------------------------------

export interface ElectricalFit {
  type: CrossoverType;
  fc: number;
  /** Weighted RMS deviation from the acoustic target in the fit window [dB] */
  errorDb: number;
}

export interface TargetSlopeFitResult {
  best: ElectricalFit;
  /** Best fc per candidate type, sorted by error (best first) */
  perType: ElectricalFit[];
  target: FrequencyDataPoint[];
  /** Raw curve + best electrical filter (the achieved acoustic response) */
  achieved: FrequencyDataPoint[];
  passbandRefDb: number;
}

const CANDIDATE_TYPES: CrossoverType[] = ['first_order', 'BW2', 'LR2', 'BW4', 'LR4', 'LR8'];

/**
 * Weighted RMS error between achieved and target inside the fit window
 * [fc/4, fc·4]. Frequencies within ±1 octave of the target fc weigh double —
 * the XO region is where slope accuracy matters for summation.
 */
function fitError(
  raw: FrequencyDataPoint[],
  electricalDb: number[],
  target: FrequencyDataPoint[],
  fc: number,
  passbandRefDb: number,
): number {
  const lo = Math.max(20, fc / 4);
  const hi = Math.min(20000, fc * 4);
  let sum = 0;
  let wSum = 0;
  for (let i = 0; i < raw.length; i++) {
    const f = raw[i]!.freq;
    if (f < lo || f > hi) continue;
    // Ignore the deep stopband — more than 50 dB under the passband the
    // deviation is inaudible and dominated by numerical noise (matters for
    // steep targets like LR8 near the window edges).
    if (target[i]!.magnitude < passbandRefDb - 50) continue;
    const achieved = raw[i]!.magnitude + electricalDb[i]!;
    const diff = achieved - target[i]!.magnitude;
    const w = f >= fc / 2 && f <= fc * 2 ? 2 : 1;
    sum += w * diff * diff;
    wSum += w;
  }
  return wSum > 0 ? Math.sqrt(sum / wSum) : Infinity;
}

/**
 * Find the electrical filter (type + fc) whose combination with the raw
 * driver curve best matches the acoustic target. Deterministic: coarse
 * log-grid per type, then a fine scan around each type's best candidate.
 */
export function fitElectricalToTarget(
  raw: FrequencyDataPoint[],
  spec: TargetSlopeSpec,
  freqs: number[],
): TargetSlopeFitResult {
  const { target, passbandRefDb } = acousticTargetCurve(raw, spec, freqs);

  const perType: ElectricalFit[] = [];
  for (const type of CANDIDATE_TYPES) {
    // Coarse: 2 octaves each side of the target fc, 25 log-spaced points
    let bestFc = spec.fc;
    let bestErr = Infinity;
    for (let i = 0; i < 25; i++) {
      const fc = (spec.fc / 4) * Math.pow(16, i / 24);
      const err = fitError(raw, filterMagnitudeDb(type, fc, spec.isHighpass, freqs), target, spec.fc, passbandRefDb);
      if (err < bestErr) { bestErr = err; bestFc = fc; }
    }
    // Fine: ±20% around the coarse winner, 17 points
    const coarseFc = bestFc;
    for (let i = 0; i < 17; i++) {
      const fc = coarseFc * (0.8 + (0.4 * i) / 16);
      const err = fitError(raw, filterMagnitudeDb(type, fc, spec.isHighpass, freqs), target, spec.fc, passbandRefDb);
      if (err < bestErr) { bestErr = err; bestFc = fc; }
    }
    perType.push({ type, fc: Math.round(bestFc), errorDb: bestErr });
  }

  // Tie-break: on equal error prefer the target's own type (BW4 is
  // implemented identically to LR4 in crossover.ts, so exact ties happen).
  perType.sort((a, b) =>
    (a.errorDb - b.errorDb)
    || (a.type === spec.type ? -1 : b.type === spec.type ? 1 : 0),
  );
  const best = perType[0]!;
  const bestDb = filterMagnitudeDb(best.type, best.fc, spec.isHighpass, freqs);
  const achieved = raw.map((p, i) => ({ freq: p.freq, magnitude: p.magnitude + bestDb[i]! }));

  return { best, perType, target, achieved, passbandRefDb };
}

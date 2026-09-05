// Transmission line on the shared lumped-element core (SPEC §4.6).
// 1D waveguide: the line is segmented; each segment gets a COMPLEX
// transfer matrix with propagation constant Γ = α + jk where α models
// stuffing damping and cEff models the stuffing's velocity reduction
// (King/Augspurger approach). The driver can sit at an offset along the
// line (mass-loaded TL): the section behind the driver acts as a closed
// stub in parallel with the main line to the terminus.
//
// The driver load is the ACTUAL line input impedance from the T-matrix —
// not an approximation — so line resonances load the cone correctly.
//
// Stuffing coefficients are empirical approximations (marked below) and
// are calibration targets for Hornresp golden tests (SPEC §10).

import { RHO0, C0, pistonRadiationImpedance, pressureMagHalfSpace, pascalsToDbSpl } from '../acoustics';
import {
  solveDriver,
  zParallel,
  ductSegmentT,
  tMultiply,
  tInputImpedance,
  tOutputVolumeVelocity,
  IDENTITY_T,
  type TMatrix,
} from '../lumped';
import { cmag, cdiv, cmul, csub, type Complex } from '../complex';
import { deriveDriverModel } from '../driver';
import type { ThieleSmallParams } from '@/types';

export interface TLSegment {
  length: number; // [m]
  areaStart: number; // [m²]
  areaEnd: number; // [m²]
  /** Stuffing density [kg/m³]: 0 = empty, 5–10 = light, 15–30 = heavy */
  stuffingDensity: number;
}

export interface TLResult {
  freqs: number[];
  /** Summed system response [dB SPL @1 m half-space] */
  spl: number[];
  splDriver: number[];
  splTerminus: number[];
  excursionMm: number[];
  impedance: number[];
  /** First quarter-wave resonance of the stuffed line [Hz] */
  fQuarterWave: number;
}

export interface TLOptions {
  /**
   * Driver position as fraction of total line length from the closed end.
   * 0 = at the closed end (classic TL), 0.2–0.35 typical offset (ML-TL).
   */
  driverOffsetFraction?: number;
  voltage?: number;
}

// Empirical stuffing model (calibration targets, SPEC §10):
// velocity reduction ~1–2 %/(kg/m³), damping grows with density and √f.
function stuffingCEff(density: number): number {
  return C0 / (1 + 0.018 * density);
}
function stuffingAlpha(density: number, f: number): number {
  return 0.0012 * density * Math.sqrt(f); // [1/m]
}

function segmentTMatrix(f: number, seg: TLSegment): TMatrix {
  const avgArea = (seg.areaStart + seg.areaEnd) / 2;
  const cEff = stuffingCEff(seg.stuffingDensity);
  const alpha = stuffingAlpha(seg.stuffingDensity, f);
  return ductSegmentT(f, seg.length, avgArea, alpha, cEff, RHO0);
}

/** Split segments at a fractional position along the total length */
function splitSegments(segments: TLSegment[], fraction: number): { stub: TLSegment[]; main: TLSegment[] } {
  const total = segments.reduce((s, seg) => s + seg.length, 0);
  const splitAt = total * Math.min(Math.max(fraction, 0), 0.95);
  const stub: TLSegment[] = [];
  const main: TLSegment[] = [];
  let acc = 0;
  for (const seg of segments) {
    if (acc + seg.length <= splitAt) {
      stub.push(seg);
    } else if (acc >= splitAt) {
      main.push(seg);
    } else {
      const stubLen = splitAt - acc;
      const tArea = seg.areaStart + (seg.areaEnd - seg.areaStart) * (stubLen / seg.length);
      stub.push({ ...seg, length: stubLen, areaEnd: tArea });
      main.push({ ...seg, length: seg.length - stubLen, areaStart: tArea });
    }
    acc += seg.length;
  }
  return { stub, main };
}

export function simulateTransmissionLine(
  ts: ThieleSmallParams,
  segments: TLSegment[],
  freqs: number[],
  opts: TLOptions = {},
): TLResult {
  const dm = deriveDriverModel(ts);
  const voltage = opts.voltage ?? 2.83;
  const offset = opts.driverOffsetFraction ?? 0;

  const { stub, main } = splitSegments(segments, offset);
  const terminusArea = segments[segments.length - 1]!.areaEnd;

  // Effective quarter-wave frequency (stuffing-slowed average c)
  const totalLen = segments.reduce((s, seg) => s + seg.length, 0);
  const cAvg =
    segments.reduce((s, seg) => s + stuffingCEff(seg.stuffingDensity) * seg.length, 0) / totalLen;
  const fQuarterWave = cAvg / (4 * totalLen);

  const spl: number[] = [];
  const splDriver: number[] = [];
  const splTerminus: number[] = [];
  const excursionMm: number[] = [];
  const impedance: number[] = [];

  for (const f of freqs) {
    // Main line T-matrix (driver → terminus), terminated by radiation
    let tMain = IDENTITY_T;
    for (const seg of main) {
      tMain = tMultiply(tMain, segmentTMatrix(f, seg));
    }
    const zTerm = pistonRadiationImpedance(f, terminusArea);
    const zMainIn = tInputImpedance(tMain, zTerm);

    // Closed stub behind the driver (if offset): Z = A/C (Z_L = ∞)
    let zaRear: Complex;
    let zStub: Complex | null = null;
    if (stub.length > 0) {
      let tStub = IDENTITY_T;
      for (const seg of stub) {
        tStub = tMultiply(tStub, segmentTMatrix(f, seg));
      }
      zStub = cdiv(tStub.a, tStub.c); // closed-end input impedance
      zaRear = zParallel(zStub, zMainIn);
    } else {
      zaRear = zMainIn;
    }

    const zaFront = pistonRadiationImpedance(f, dm.sd);
    const sol = solveDriver(dm, f, zaFront, zaRear, voltage);

    // Volume velocity into the main line: current divider between stub and main
    let uIntoMain: Complex;
    if (zStub) {
      // p_rear = Zrear·Ud ; U_main = p_rear / Z_main
      const pRear = cmul(zaRear, sol.ud);
      uIntoMain = cdiv(pRear, zMainIn);
    } else {
      uIntoMain = sol.ud;
    }

    // Terminus volume velocity through the chain
    const uTerm = tOutputVolumeVelocity(tMain, uIntoMain, zTerm);

    // Net radiated: cone front − terminus (cancels at DC like an open duct)
    const uNet = csub(sol.ud, uTerm);

    spl.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(uNet), 1)));
    splDriver.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(sol.ud), 1)));
    splTerminus.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(uTerm), 1)));
    excursionMm.push(cmag(sol.x) * 1e3);
    impedance.push(cmag(sol.ze));
  }

  return { freqs, spl, splDriver, splTerminus, excursionMm, impedance, fQuarterWave };
}

/** Seed geometry (SPEC §4.6): quarter-wave length for a target frequency */
export function quarterWaveLength(fTarget: number, stuffingDensity: number = 8): number {
  return stuffingCEff(stuffingDensity) / (4 * fTarget);
}

export { stuffingCEff, stuffingAlpha };

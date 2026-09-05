// Horn model on the shared lumped-element core (SPEC §4.7).
// Webster's horn equation solved by complex T-matrix over profile
// segments. Mouth radiation impedance is the full piston-in-baffle
// model (resistive + reactive, Bessel/Struve) — this is what creates
// the below-cutoff reflection and mouth-size ripple.
//
// Supports front-loaded (sealed rear chamber, horn on the cone front,
// optional front compression chamber) and back-loaded (driver front
// radiates directly, rear drives the horn) topologies.

import { RHO0, C0, pistonRadiationImpedance, pressureMagHalfSpace, pascalsToDbSpl } from '../acoustics';
import {
  acousticCompliance,
  complianceImpedance,
  solveDriver,
  zParallel,
  ductSegmentT,
  tMultiply,
  tInputImpedance,
  tOutputVolumeVelocity,
  IDENTITY_T,
} from '../lumped';
import { cmag, cdiv, cmul, csub, type Complex } from '../complex';
import { deriveDriverModel } from '../driver';
import type { ThieleSmallParams } from '@/types';

export type HornProfile = 'exponential' | 'conical' | 'tractrix' | 'hyperbolic';

export interface HornParams {
  profile: HornProfile;
  throatAreaCm2: number;
  mouthAreaCm2: number;
  lengthM: number;
  /** Rear chamber volume [L] (sealed). 0 = none (back-loaded uses this as coupling chamber). */
  rearChamberLiters: number;
  /** Front compression chamber volume [L] between cone and throat. 0 = none. */
  frontChamberLiters?: number;
  /** 'front' = front-loaded horn, 'back' = back-loaded (driver also radiates directly) */
  topology?: 'front' | 'back';
  /** Hyperbolic T parameter (0.5–1). Only for profile 'hyperbolic'. */
  hyperbolicT?: number;
}

export interface HornResult {
  freqs: number[];
  /** System output [dB SPL @1 m half-space] */
  spl: number[];
  splMouth: number[];
  /** Direct driver radiation (back-loaded only; -∞ pattern for front-loaded) */
  splDirect: number[];
  excursionMm: number[];
  impedance: number[];
  /** Exponential cutoff fc = m·c/(4π) [Hz] (flare-based estimate for all profiles) */
  cutoffHz: number;
  /** True when mouth circumference < λ at fc (expect ripple, SPEC §4.7) */
  mouthTooSmall: boolean;
}

/** Area at position x for the chosen profile */
function areaAt(params: HornParams, x: number): number {
  const st = params.throatAreaCm2 / 1e4;
  const sm = params.mouthAreaCm2 / 1e4;
  const L = params.lengthM;
  const t = Math.min(Math.max(x / L, 0), 1);

  switch (params.profile) {
    case 'conical': {
      // Linear radius growth → quadratic area
      const rt = Math.sqrt(st / Math.PI);
      const rm = Math.sqrt(sm / Math.PI);
      const r = rt + (rm - rt) * t;
      return Math.PI * r * r;
    }
    case 'hyperbolic': {
      const m = Math.log(sm / st) / L;
      const T = params.hyperbolicT ?? 0.7;
      const xm = (m / 2) * x;
      const g = Math.cosh(xm) + T * Math.sinh(xm);
      return st * g * g;
    }
    case 'tractrix': {
      // Tractrix mouth radius defines the curve; approximate by blending
      // exponential growth with faster terminal flare.
      const m = Math.log(sm / st) / L;
      const expArea = st * Math.exp(m * x);
      const blend = t * t; // accelerate flare toward the mouth
      return expArea * (1 - blend) + sm * blend;
    }
    case 'exponential':
    default:
      return st * Math.exp((Math.log(sm / st) / L) * x);
  }
}

const N_SEGMENTS = 40;

export function simulateHorn(
  ts: ThieleSmallParams,
  params: HornParams,
  freqs: number[],
  voltage: number = 2.83,
): HornResult {
  const dm = deriveDriverModel(ts);
  const topology = params.topology ?? 'front';
  const st = params.throatAreaCm2 / 1e4;
  const sm = params.mouthAreaCm2 / 1e4;

  // Flare constant + cutoff (exponential definition as shared estimate)
  const m = Math.log(sm / st) / params.lengthM;
  const cutoffHz = (m * C0) / (4 * Math.PI);

  // Mouth-size check: circumference ≥ λ at fc for clean loading
  const mouthCircumference = 2 * Math.PI * Math.sqrt(sm / Math.PI);
  const lambdaAtFc = C0 / Math.max(cutoffHz, 1);
  const mouthTooSmall = mouthCircumference < lambdaAtFc;

  const cabRear = params.rearChamberLiters > 0
    ? acousticCompliance(params.rearChamberLiters / 1e3, RHO0, C0)
    : 0;
  const cabFront = (params.frontChamberLiters ?? 0) > 0
    ? acousticCompliance((params.frontChamberLiters ?? 0) / 1e3, RHO0, C0)
    : 0;

  const spl: number[] = [];
  const splMouth: number[] = [];
  const splDirect: number[] = [];
  const excursionMm: number[] = [];
  const impedance: number[] = [];

  for (const f of freqs) {
    // Horn T-matrix: chain of duct segments following the profile
    let tHorn = IDENTITY_T;
    const dx = params.lengthM / N_SEGMENTS;
    for (let i = 0; i < N_SEGMENTS; i++) {
      const aAvg = (areaAt(params, i * dx) + areaAt(params, (i + 1) * dx)) / 2;
      tHorn = tMultiply(tHorn, ductSegmentT(f, dx, aAvg, 0, C0, RHO0));
    }

    const zMouth = pistonRadiationImpedance(f, sm);
    const zThroat = tInputImpedance(tHorn, zMouth);

    let sol;
    let uIntoHorn: Complex;
    let uDirect: Complex;

    if (topology === 'front') {
      // Front-loaded: rear = sealed chamber, front = (front chamber ∥ horn throat)
      const zaRear = cabRear > 0 ? complianceImpedance(f, cabRear) : { re: 0, im: 0 };
      const zaFront = cabFront > 0 ? zParallel(complianceImpedance(f, cabFront), zThroat) : zThroat;
      sol = solveDriver(dm, f, zaFront, zaRear, voltage);

      if (cabFront > 0) {
        const pFront = cmul(zaFront, sol.ud);
        uIntoHorn = cdiv(pFront, zThroat);
      } else {
        uIntoHorn = sol.ud;
      }
      uDirect = { re: 0, im: 0 }; // cone is buried
    } else {
      // Back-loaded: front radiates directly; rear chamber couples cone → horn
      const zRearNetwork = cabRear > 0
        ? zParallel(complianceImpedance(f, cabRear), zThroat)
        : zThroat;
      const zaFront = pistonRadiationImpedance(f, dm.sd);
      sol = solveDriver(dm, f, zaFront, zRearNetwork, voltage);

      if (cabRear > 0) {
        const pRear = cmul(zRearNetwork, sol.ud);
        uIntoHorn = cdiv(pRear, zThroat);
      } else {
        uIntoHorn = sol.ud;
      }
      uDirect = sol.ud;
    }

    const uMouth = tOutputVolumeVelocity(tHorn, uIntoHorn, zMouth);

    // Back-loaded: net = direct − mouth (DC cancellation through the open horn).
    // Front-loaded: mouth only.
    const uNet = topology === 'back' ? csub(uDirect, uMouth) : uMouth;

    spl.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(uNet), 1)));
    splMouth.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(uMouth), 1)));
    splDirect.push(
      topology === 'back'
        ? pascalsToDbSpl(pressureMagHalfSpace(f, cmag(uDirect), 1))
        : -120,
    );
    excursionMm.push(cmag(sol.x) * 1e3);
    impedance.push(cmag(sol.ze));
  }

  return { freqs, spl, splMouth, splDirect, excursionMm, impedance, cutoffHz, mouthTooSmall };
}


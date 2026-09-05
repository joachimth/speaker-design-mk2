// 4th-order bandpass box on the shared lumped-element core (SPEC §4.5).
// Rear chamber sealed (Cab_r), front chamber (Cab_f) vented to the outside.
// Radiated output is the FRONT PORT only — the cone is buried.
// Output is bandpass-shaped: sealed rear rolls off the bottom, front
// chamber low-passes the top. Both emerge from the circuit.

import { RHO0, C0, pistonRadiationImpedance, pressureMagHalfSpace, pascalsToDbSpl } from '../acoustics';
import {
  acousticCompliance,
  complianceImpedance,
  massImpedance,
  solveDriver,
  zParallel,
  zSeries,
} from '../lumped';
import { cmag, cdiv, cmul, cplx } from '../complex';
import { deriveDriverModel } from '../driver';
import { portEndCorrection } from './vented';
import type { ThieleSmallParams } from '@/types';

export interface Bandpass4Result {
  freqs: number[];
  /** System output (front port) [dB SPL @1 m, half-space] */
  spl: number[];
  /** Cone excursion [mm peak] */
  excursionMm: number[];
  /** Front port air velocity [m/s peak] */
  portVelocity: number[];
  impedance: number[];
  /** Front chamber Helmholtz tuning [Hz] */
  fbFront: number;
  /** Rear chamber driver resonance [Hz] */
  fcRear: number;
}

export function simulateBandpass4(
  ts: ThieleSmallParams,
  vRearLiters: number,
  vFrontLiters: number,
  portAreaCm2: number,
  portLengthMm: number,
  freqs: number[],
  voltage: number = 2.83,
): Bandpass4Result {
  const dm = deriveDriverModel(ts);
  const vr = vRearLiters / 1e3;
  const vf = vFrontLiters / 1e3;
  const sp = portAreaCm2 / 1e4;
  const lEff = portLengthMm / 1e3 + portEndCorrection(sp, false);

  const cabR = acousticCompliance(vr, RHO0, C0);
  const cabF = acousticCompliance(vf, RHO0, C0);
  const map = (RHO0 * lEff) / sp;

  const fbFront = (1 / (2 * Math.PI)) * Math.sqrt(1 / (map * cabF));
  const alphaR = dm.vas / vr;
  const fcRear = dm.fs * Math.sqrt(1 + alphaR);

  const wbF = 2 * Math.PI * fbFront;
  const rap = 1 / (wbF * cabF * 20); // port loss QP≈20
  const ralF = 7 / (wbF * cabF); // front leak QL≈7

  const spl: number[] = [];
  const excursionMm: number[] = [];
  const portVelocity: number[] = [];
  const impedance: number[] = [];

  for (const f of freqs) {
    // Rear load: sealed chamber
    const zaRear = complianceImpedance(f, cabR);

    // Front load: chamber compliance ∥ leak ∥ (port mass + loss + radiation)
    const zPortBranch = zSeries(massImpedance(f, map), cplx(rap, 0), pistonRadiationImpedance(f, sp));
    const zCabF = complianceImpedance(f, cabF);
    const zaFront = zParallel(zCabF, cplx(ralF, 0), zPortBranch);

    const sol = solveDriver(dm, f, zaFront, zaRear, voltage);

    // Front chamber pressure → port volume velocity (the only radiator)
    const pFront = cmul(zaFront, sol.ud);
    const uPort = cdiv(pFront, zPortBranch);

    spl.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(uPort), 1)));
    excursionMm.push(cmag(sol.x) * 1e3);
    portVelocity.push(cmag(uPort) / sp);
    impedance.push(cmag(sol.ze));
  }

  return { freqs, spl, excursionMm, portVelocity, impedance, fbFront, fcRear };
}

// Passive radiator box on the shared lumped-element core (SPEC §4.4).
// Same circuit as vented, but the port branch is replaced by the PR's
// mass–compliance–loss branch. The characteristic response notch at the
// PR's own free resonance emerges from the circuit (not hardcoded).

import { RHO0, C0, pistonRadiationImpedance, pressureMagHalfSpace, pascalsToDbSpl } from '../acoustics';
import {
  acousticCompliance,
  complianceImpedance,
  solveDriver,
  zParallel,
  zSeries,
} from '../lumped';
import { cmag, cdiv, cmul, csub, cplx, type Complex } from '../complex';
import { deriveDriverModel } from '../driver';
import type { ThieleSmallParams } from '@/types';

export interface PassiveRadiatorParams {
  /** PR free-air resonance [Hz] (with any added mass already included) */
  fp: number;
  /** PR equivalent volume [L] (Vap = Cmp·Sdp²·ρ₀c²) */
  vap: number;
  /** PR effective area [cm²] */
  sdp: number;
  /** PR mechanical Q (typically 2–10). Default 5. */
  qmp?: number;
  /** PR max linear excursion [mm] for the excursion check */
  xmaxPr?: number;
}

export interface PassiveRadiatorResult {
  freqs: number[];
  spl: number[];
  splCone: number[];
  splPr: number[];
  excursionMm: number[];
  /** PR diaphragm excursion [mm peak] */
  prExcursionMm: number[];
  impedance: number[];
  /** System tuning (box + PR) [Hz] */
  fbActual: number;
  /** The PR's own free resonance [Hz] — response notch here */
  notchFreq: number;
  /** True if PR displacement volume ≥ 2× driver displacement volume (SPEC §4.4) */
  prDisplacementOk: boolean;
}

export function simulatePassiveRadiator(
  ts: ThieleSmallParams,
  vbLiters: number,
  pr: PassiveRadiatorParams,
  freqs: number[],
  voltage: number = 2.83,
): PassiveRadiatorResult {
  const dm = deriveDriverModel(ts);
  const vb = vbLiters / 1e3;
  const sdp = pr.sdp / 1e4; // cm² → m²
  const qmp = pr.qmp ?? 5;

  // PR acoustic elements from fp + Vap
  const vap = pr.vap / 1e3;
  const capPr = acousticCompliance(vap, RHO0, C0); // [m⁵/N] acoustic compliance
  const wp = 2 * Math.PI * pr.fp;
  const mapPr = 1 / (wp * wp * capPr); // acoustic mass [kg/m⁴]
  const rapPr = (wp * mapPr) / qmp; // acoustic loss

  const cab = acousticCompliance(vb, RHO0, C0);

  // System tuning: PR mass against series combination of box + PR compliances
  const cSeries = (cab * capPr) / (cab + capPr);
  const fbActual = (1 / (2 * Math.PI)) * Math.sqrt(1 / (mapPr * cSeries));

  const spl: number[] = [];
  const splCone: number[] = [];
  const splPr: number[] = [];
  const excursionMm: number[] = [];
  const prExcursionMm: number[] = [];
  const impedance: number[] = [];

  for (const f of freqs) {
    const w = 2 * Math.PI * f;

    // PR branch: mass + loss + own compliance + radiation load
    const zPrRad = pistonRadiationImpedance(f, sdp);
    const zPrBranch = zSeries(
      cplx(rapPr, w * mapPr - 1 / (w * capPr)),
      zPrRad,
    );

    // Rear network: Cab ∥ PR branch (leak loss QL=7 like vented)
    const zCab = complianceImpedance(f, cab);
    const wb = 2 * Math.PI * fbActual;
    const ral = 7 / (wb * cab);
    const zaRear = zParallel(zCab, cplx(ral, 0), zPrBranch);

    const zaFront = pistonRadiationImpedance(f, dm.sd);
    const sol = solveDriver(dm, f, zaFront, zaRear, voltage);

    const pBox = cmul(zaRear, sol.ud);
    const uPr = cdiv(pBox, zPrBranch);
    const uNet: Complex = csub(sol.ud, uPr);

    spl.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(uNet), 1)));
    splCone.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(sol.ud), 1)));
    splPr.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(uPr), 1)));
    excursionMm.push(cmag(sol.x) * 1e3);
    prExcursionMm.push((cmag(uPr) / (w * sdp)) * 1e3);
    impedance.push(cmag(sol.ze));
  }

  // SPEC §4.4: PR displacement volume should be ≥ 2× driver's Vd
  const vdDriver = dm.sd * dm.xmax;
  const vdPr = sdp * ((pr.xmaxPr ?? 10) / 1e3);
  const prDisplacementOk = vdPr >= 2 * vdDriver;

  return {
    freqs,
    spl,
    splCone,
    splPr,
    excursionMm,
    prExcursionMm,
    impedance,
    fbActual,
    notchFreq: pr.fp,
    prDisplacementOk,
  };
}

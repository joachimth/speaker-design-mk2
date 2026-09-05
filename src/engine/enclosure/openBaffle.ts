// Open baffle / dipole on the shared lumped-element core (SPEC §4.8).
// The driver works in free air (radiation load both sides, no box), and
// the far-field response is the monopole response times the dipole
// path-difference factor |1 − e^(−jkD)| where D is the effective
// front-to-back path around the baffle.
//
// Dipole peak at f ≈ c/(2·D_eff); 6 dB/oct roll-off below; comb ripple
// above (physical, from the path difference).

import { RHO0, C0, pistonRadiationImpedance, pressureMagHalfSpace, pascalsToDbSpl } from '../acoustics';
import { solveDriver } from '../lumped';
import { cmag, csub, cplx, cmul, fromPolar, type Complex } from '../complex';
import { deriveDriverModel } from '../driver';
import type { ThieleSmallParams } from '@/types';

export interface OpenBaffleResult {
  freqs: number[];
  /** On-axis dipole response [dB SPL @1 m] */
  spl: number[];
  /** Monopole (baffle-less driver) reference [dB SPL] */
  splMonopole: number[];
  excursionMm: number[];
  impedance: number[];
  /** Dipole peak frequency c/(2·Deff) [Hz] */
  dipolePeakHz: number;
  /** Effective acoustic path front→back [m] */
  dEff: number;
}

/**
 * Effective path length around a rectangular baffle for a driver at
 * (x, y) measured from the baffle centre. Averages the four edge
 * distances (simple geometric model; the numerical edge-diffraction
 * model in SPEC §4.10 refines this per angle).
 */
export function effectivePathLength(
  baffleWidthM: number,
  baffleHeightM: number,
  driverX: number = 0,
  driverY: number = 0,
): number {
  const dLeft = baffleWidthM / 2 + driverX;
  const dRight = baffleWidthM / 2 - driverX;
  const dTop = baffleHeightM / 2 - driverY;
  const dBottom = baffleHeightM / 2 + driverY;
  // Path = distance to edge + wrap to the rear (≈ same distance back)
  const avgEdge = (dLeft + dRight + dTop + dBottom) / 4;
  return 2 * avgEdge;
}

export function simulateOpenBaffle(
  ts: ThieleSmallParams,
  baffleWidthM: number,
  baffleHeightM: number,
  freqs: number[],
  voltage: number = 2.83,
  driverX: number = 0,
  driverY: number = 0,
): OpenBaffleResult {
  const dm = deriveDriverModel(ts);
  const dEff = effectivePathLength(baffleWidthM, baffleHeightM, driverX, driverY);
  const dipolePeakHz = C0 / (2 * dEff);

  const spl: number[] = [];
  const splMonopole: number[] = [];
  const excursionMm: number[] = [];
  const impedance: number[] = [];

  for (const f of freqs) {
    // Free-air driver: radiation load on both sides, no enclosure
    const zaRad = pistonRadiationImpedance(f, dm.sd);
    const sol = solveDriver(dm, f, zaRad, zaRad, voltage);

    const k = (2 * Math.PI * f) / C0;
    // Dipole factor: front minus delayed rear |1 − e^(−jkD)|
    const rearPhase: Complex = fromPolar(1, -k * dEff);
    const dipoleFactor = csub(cplx(1, 0), rearPhase);

    const uMono = cmag(sol.ud);
    const uDipole = cmag(cmul(sol.ud, dipoleFactor));

    splMonopole.push(pascalsToDbSpl(pressureMagHalfSpace(f, uMono, 1)));
    spl.push(pascalsToDbSpl(pressureMagHalfSpace(f, uDipole, 1)));
    excursionMm.push(cmag(sol.x) * 1e3);
    impedance.push(cmag(sol.ze));
  }

  return { freqs, spl, splMonopole, excursionMm, impedance, dipolePeakHz, dEff };
}

export const OPEN_BAFFLE_NOTE =
  'Excursion-krav for åben baffel er langt større end lukket kasse (SPEC §4.8) — tjek excursion-kurven ved ønsket lydtryk.';
export { RHO0 };

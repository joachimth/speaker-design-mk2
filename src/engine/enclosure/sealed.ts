// Sealed (closed) box model on the shared lumped-element core (SPEC §4.2).
// Vb corrected for stuffing (isothermal ↔ adiabatic: ×1.0–1.25).

import { RHO0, C0, pistonRadiationImpedance, pressureMagHalfSpace, pascalsToDbSpl } from '../acoustics';
import { acousticCompliance, complianceImpedance, solveDriver } from '../lumped';
import { cmag, cadd, cplx, type Complex } from '../complex';
import { deriveDriverModel } from '../driver';
import type { ThieleSmallParams } from '@/types';

export interface SealedBoxResult {
  freqs: number[];
  /** SPL [dB re 20 µPa] at 1 m, half-space, at the given drive voltage */
  spl: number[];
  /** Cone excursion [mm] peak at the given drive voltage */
  excursionMm: number[];
  /** Electrical impedance magnitude [Ω] */
  impedance: number[];
  /** System resonance [Hz] (α-derived) */
  fc: number;
  /** System Q */
  qtc: number;
}

export interface SealedBoxOptions {
  /** Fill factor: 1.0 = empty … 1.25 = heavily stuffed (effective Vb multiplier) */
  fillFactor?: number;
  /** Box loss Q (absorption); Infinity = lossless. Default 30. */
  qa?: number;
  voltage?: number;
}

export function simulateSealedBox(
  ts: ThieleSmallParams,
  vbLiters: number,
  freqs: number[],
  opts: SealedBoxOptions = {},
): SealedBoxResult {
  const dm = deriveDriverModel(ts);
  const fill = opts.fillFactor ?? 1.0;
  const voltage = opts.voltage ?? 2.83;
  const vb = (vbLiters / 1e3) * fill; // effective volume [m³]

  const cab = acousticCompliance(vb, RHO0, C0);
  const alpha = dm.vas / vb;
  const fc = dm.fs * Math.sqrt(1 + alpha);
  const qtc = dm.qts * Math.sqrt(1 + alpha);

  // Absorption loss as a resistance in series with the compliance branch
  const qa = opts.qa ?? 30;
  const wc = 2 * Math.PI * fc;
  const ra = 1 / (wc * cab * qa);

  const spl: number[] = [];
  const excursionMm: number[] = [];
  const impedance: number[] = [];

  for (const f of freqs) {
    const zaRear: Complex = cadd(complianceImpedance(f, cab), cplx(ra, 0));
    const zaFront = pistonRadiationImpedance(f, dm.sd);
    const sol = solveDriver(dm, f, zaFront, zaRear, voltage);

    const p = pressureMagHalfSpace(f, cmag(sol.ud), 1);
    spl.push(pascalsToDbSpl(p));
    excursionMm.push(cmag(sol.x) * 1e3);
    impedance.push(cmag(sol.ze));
  }

  return { freqs, spl, excursionMm, impedance, fc, qtc };
}

// Vented (bass reflex) box on the shared lumped-element core (SPEC §4.3).
// 4th-order model (Small 1973) via the acoustic circuit:
//
//   cone rear → [ Cab ∥ leak-loss ∥ (port mass + port loss → radiation) ]
//
// Net radiated output = cone front output − port output (signs such that
// output cancels at DC and approaches the driver alone at HF).
// Port velocity, cone excursion and electrical impedance come from the
// same solution — one circuit, all channels (SPEC §4: "ekstra kanaler").

import { RHO0, C0, pistonRadiationImpedance, pressureMagHalfSpace, pascalsToDbSpl } from '../acoustics';
import {
  acousticCompliance,
  complianceImpedance,
  massImpedance,
  solveDriver,
  zParallel,
  zSeries,
} from '../lumped';
import { cmag, cdiv, cmul, csub, cplx, type Complex } from '../complex';
import { deriveDriverModel } from '../driver';
import type { ThieleSmallParams } from '@/types';

export interface VentedBoxResult {
  freqs: number[];
  /** Total system SPL [dB re 20 µPa] @1 m half-space at drive voltage */
  spl: number[];
  /** Cone-only contribution [dB SPL] */
  splCone: number[];
  /** Port-only contribution [dB SPL] */
  splPort: number[];
  /** Cone excursion [mm peak] */
  excursionMm: number[];
  /** Port air velocity [m/s peak] */
  portVelocity: number[];
  /** Electrical impedance magnitude [Ω] */
  impedance: number[];
  /** Actual Helmholtz tuning [Hz] from the port geometry */
  fbActual: number;
  /** Effective port length incl. end correction [m] */
  portLengthEff: number;
}

export interface VentedBoxOptions {
  /** Leakage Q, standard 7 (SPEC §4.3) */
  ql?: number;
  voltage?: number;
  /** Number of identical ports (area = n·portArea, mass scales accordingly) */
  portCount?: number;
  /** Both ends flanged (0.85·r each) vs one free end (0.85+0.61)·r. Default flanged+free. */
  bothEndsFlanged?: boolean;
}

/** Helmholtz end correction for a round port [m] */
export function portEndCorrection(portAreaM2: number, bothFlanged: boolean): number {
  const r = Math.sqrt(portAreaM2 / Math.PI);
  return bothFlanged ? 2 * 0.85 * r : (0.85 + 0.61) * r;
}

/** Physical port length needed for tuning fb with volume vb [m] */
export function portLengthForTuning(
  fb: number,
  vbM3: number,
  portAreaM2: number,
  bothFlanged: boolean = false,
): number {
  // Fb = (c/2π)·√(S/(V·Leff))  →  Leff = S·c²/(4π²·Fb²·V)
  const leff = (portAreaM2 * C0 * C0) / (4 * Math.PI * Math.PI * fb * fb * vbM3);
  return Math.max(leff - portEndCorrection(portAreaM2, bothFlanged), 0.005);
}

export function simulateVentedBox(
  ts: ThieleSmallParams,
  vbLiters: number,
  portAreaCm2: number,
  portLengthMm: number,
  freqs: number[],
  opts: VentedBoxOptions = {},
): VentedBoxResult {
  const dm = deriveDriverModel(ts);
  const voltage = opts.voltage ?? 2.83;
  const ql = opts.ql ?? 7;
  const nPorts = opts.portCount ?? 1;

  const vb = vbLiters / 1e3;
  const sp = (portAreaCm2 / 1e4) * nPorts; // total port area [m²]
  const lPhys = portLengthMm / 1e3;
  const lEff = lPhys + portEndCorrection(sp / nPorts, opts.bothEndsFlanged ?? false);

  const cab = acousticCompliance(vb, RHO0, C0);
  const map = (RHO0 * lEff) / sp; // port acoustic mass [kg/m⁴]
  const fbActual = (1 / (2 * Math.PI)) * Math.sqrt(1 / (map * cab));
  const wb = 2 * Math.PI * fbActual;

  // Leakage loss: resistance in PARALLEL with Cab, Ral = QL/(ωb·Cab)
  const ral = ql / (wb * cab);
  // Port loss: series resistance in the port branch (QP ~ 20 typical)
  const qp = 20;
  const rap = 1 / (wb * cab * qp);

  const spl: number[] = [];
  const splCone: number[] = [];
  const splPort: number[] = [];
  const excursionMm: number[] = [];
  const portVelocity: number[] = [];
  const impedance: number[] = [];

  for (const f of freqs) {
    // Port branch: mass + loss + terminus radiation
    const zPortRad = pistonRadiationImpedance(f, sp);
    const zPortBranch = zSeries(massImpedance(f, map), cplx(rap, 0), zPortRad);

    // Rear network: Cab ∥ Ral ∥ port branch
    const zCab = complianceImpedance(f, cab);
    const zaRear = zParallel(zCab, cplx(ral, 0), zPortBranch);

    const zaFront = pistonRadiationImpedance(f, dm.sd);
    const sol = solveDriver(dm, f, zaFront, zaRear, voltage);

    // Box pressure = Zrear · Ud; port volume velocity = p_box / Z_portbranch
    const pBox = cmul(zaRear, sol.ud);
    const uPort = cdiv(pBox, zPortBranch);

    // Net radiated volume velocity: cone − port (cancels at DC ✓)
    const uNet: Complex = csub(sol.ud, uPort);

    spl.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(uNet), 1)));
    splCone.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(sol.ud), 1)));
    splPort.push(pascalsToDbSpl(pressureMagHalfSpace(f, cmag(uPort), 1)));
    excursionMm.push(cmag(sol.x) * 1e3);
    portVelocity.push(cmag(uPort) / sp);
    impedance.push(cmag(sol.ze));
  }

  return {
    freqs,
    spl,
    splCone,
    splPort,
    excursionMm,
    portVelocity,
    impedance,
    fbActual,
    portLengthEff: lEff,
  };
}

/** SPEC §4.3 port-velocity limits [m/s] */
export const PORT_VELOCITY_RECOMMENDED = 10;
export const PORT_VELOCITY_CHUFFING = 17;

/** Port pipe resonance c/(2·L) — should sit outside the passband (SPEC §4.3) */
export function portPipeResonance(portLengthPhysM: number): number {
  return C0 / (2 * Math.max(portLengthPhysM, 0.005));
}

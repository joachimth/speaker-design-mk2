// Shared lumped-element solver: a driver working against arbitrary complex
// acoustic loads on front and rear. Every enclosure model (sealed, vented,
// PR, bandpass, TL, horn) is expressed as acoustic impedances and solved
// here, so all models share one correct electromechanical core.
//
// Domain discipline (see memory: speaker-impedance-model):
//   - Acoustic impedances Za [Pa·s/m³] converted to mechanical via ×Sd².
//   - Electrical side reflected into mechanical as BL²/(Re + jωLe).
//
// Cone velocity (voltage drive V):
//   u = (BL·V / Ze_coil) / (Zm + BL²/Ze_coil + Sd²·(Za_front + Za_rear))
// Electrical input impedance:
//   Ze = Ze_coil + BL² / (Zm + Sd²·(Za_front + Za_rear))

import { cplx, cadd, cmul, cdiv, cscale, type Complex } from './complex';
import type { DriverModel } from './driver';

export interface LumpedSolution {
  /** Cone velocity [m/s] (complex) */
  u: Complex;
  /** Cone volume velocity Ud = u·Sd [m³/s] (complex) */
  ud: Complex;
  /** Electrical input impedance [Ω] (complex) */
  ze: Complex;
  /** Cone excursion [m] (complex, x = u/(jω)) */
  x: Complex;
}

/**
 * Solve the driver at one frequency against complex acoustic loads.
 *
 * @param dm       Driver electromechanical model
 * @param f        Frequency [Hz]
 * @param zaFront  Acoustic impedance loading the cone front [Pa·s/m³]
 * @param zaRear   Acoustic impedance loading the cone rear [Pa·s/m³]
 * @param voltage  Drive voltage [V] (2.83 V ≈ 1 W @ 8 Ω)
 */
export function solveDriver(
  dm: DriverModel,
  f: number,
  zaFront: Complex,
  zaRear: Complex,
  voltage: number = 2.83,
): LumpedSolution {
  const w = 2 * Math.PI * f;

  // Voice coil electrical impedance
  const zeCoil = cplx(dm.re, w * dm.le);

  // Driver mechanical impedance: jωMms + Rms + 1/(jωCms)
  const zm = cplx(dm.rms, w * dm.mms - 1 / (w * dm.cms));

  // Acoustic loads reflected to mechanical domain: ×Sd²
  const sd2 = dm.sd * dm.sd;
  const zaMech = cscale(cadd(zaFront, zaRear), sd2);

  // Electrical damping reflected to mechanical: BL²/Ze_coil
  const blSq = dm.bl * dm.bl;
  const zElecMech = cdiv(cplx(blSq, 0), zeCoil);

  // Total mechanical impedance seen by the driving force
  const zTotal = cadd(cadd(zm, zElecMech), zaMech);

  // Driving force F = BL·I_blocked = BL·V/Ze_coil
  const force = cdiv(cplx(dm.bl * voltage, 0), zeCoil);

  // Cone velocity
  const u = cdiv(force, zTotal);
  const ud = cscale(u, dm.sd);

  // Electrical input impedance: Ze = Ze_coil + BL²/(Zm + Sd²·Za)
  const zMotional = cdiv(cplx(blSq, 0), cadd(zm, zaMech));
  const ze = cadd(zeCoil, zMotional);

  // Excursion x = u/(jω)
  const x = cdiv(u, cplx(0, w));

  return { u, ud, ze, x };
}

/** Acoustic compliance of an air volume [m³]: Ca = V/(ρ₀c²) */
export function acousticCompliance(volumeM3: number, rho0: number, c0: number): number {
  return volumeM3 / (rho0 * c0 * c0);
}

/** Impedance of an acoustic compliance: 1/(jωCa) */
export function complianceImpedance(f: number, ca: number): Complex {
  return cplx(0, -1 / (2 * Math.PI * f * ca));
}

/** Impedance of an acoustic mass: jωMa */
export function massImpedance(f: number, ma: number): Complex {
  return cplx(0, 2 * Math.PI * f * ma);
}

/** Series combination */
export function zSeries(...zs: Complex[]): Complex {
  return zs.reduce((acc, z) => cadd(acc, z), cplx(0, 0));
}

/** Parallel combination of acoustic impedances via admittance sum */
export function zParallel(...zs: Complex[]): Complex {
  let yRe = 0;
  let yIm = 0;
  for (const z of zs) {
    const d = z.re * z.re + z.im * z.im || 1e-300;
    yRe += z.re / d;
    yIm += -z.im / d;
  }
  const d = yRe * yRe + yIm * yIm || 1e-300;
  return { re: yRe / d, im: -yIm / d };
}

/** Multiply two 2×2 complex matrices (T-matrix chains for TL/horn) */
export interface TMatrix {
  a: Complex;
  b: Complex;
  c: Complex;
  d: Complex;
}

export const IDENTITY_T: TMatrix = {
  a: { re: 1, im: 0 },
  b: { re: 0, im: 0 },
  c: { re: 0, im: 0 },
  d: { re: 1, im: 0 },
};

export function tMultiply(m1: TMatrix, m2: TMatrix): TMatrix {
  return {
    a: cadd(cmul(m1.a, m2.a), cmul(m1.b, m2.c)),
    b: cadd(cmul(m1.a, m2.b), cmul(m1.b, m2.d)),
    c: cadd(cmul(m1.c, m2.a), cmul(m1.d, m2.c)),
    d: cadd(cmul(m1.c, m2.b), cmul(m1.d, m2.d)),
  };
}

/**
 * T-matrix of a uniform duct segment with complex propagation constant.
 *   [p1]   [cosh(ΓL)      Z0·sinh(ΓL)] [p2]
 *   [U1] = [sinh(ΓL)/Z0   cosh(ΓL)   ] [U2]
 * Γ = α + jk (α = damping [1/m]), Z0 = ρ₀c/S (acoustic).
 */
export function ductSegmentT(
  f: number,
  lengthM: number,
  areaM2: number,
  alpha: number,
  cEff: number,
  rho0: number,
): TMatrix {
  const w = 2 * Math.PI * f;
  const k = w / cEff;
  const gammaL: Complex = { re: alpha * lengthM, im: k * lengthM };
  const z0 = (rho0 * cEff) / areaM2;

  // cosh/sinh of complex argument
  const coshGL: Complex = {
    re: Math.cosh(gammaL.re) * Math.cos(gammaL.im),
    im: Math.sinh(gammaL.re) * Math.sin(gammaL.im),
  };
  const sinhGL: Complex = {
    re: Math.sinh(gammaL.re) * Math.cos(gammaL.im),
    im: Math.cosh(gammaL.re) * Math.sin(gammaL.im),
  };

  return {
    a: coshGL,
    b: cscale(sinhGL, z0),
    c: cscale(sinhGL, 1 / z0),
    d: coshGL,
  };
}

/**
 * Input impedance of a T-matrix chain terminated by load Z_L:
 *   Z_in = (A·Z_L + B) / (C·Z_L + D)
 */
export function tInputImpedance(t: TMatrix, zLoad: Complex): Complex {
  const num = cadd(cmul(t.a, zLoad), t.b);
  const den = cadd(cmul(t.c, zLoad), t.d);
  return cdiv(num, den);
}

/**
 * Output volume velocity of a T-matrix chain given input volume velocity
 * and load: U2 = U1 / (C·Z_L + D)
 */
export function tOutputVolumeVelocity(t: TMatrix, u1: Complex, zLoad: Complex): Complex {
  const den = cadd(cmul(t.c, zLoad), t.d);
  return cdiv(u1, den);
}

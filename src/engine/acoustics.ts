// Physical constants and radiation acoustics shared by all enclosure models.
// SI units throughout (SPEC §2.1). No UI imports.

import { cplx, type Complex } from './complex';

export const RHO0 = 1.204; // air density [kg/m³] at 20°C
export const C0 = 343; // speed of sound [m/s] at 20°C
export const P_REF = 20e-6; // reference pressure [Pa] for dB SPL

/**
 * Radiation impedance of a rigid piston in an infinite baffle (acoustic ohms).
 * Z_ar = (ρ₀c/S) · [R1(2ka) + j·X1(2ka)]
 *   R1(x) = 1 − 2·J1(x)/x
 *   X1(x) = 2·H1(x)/x  (struve), approximated per Beranek.
 *
 * Valid across ka: R → ρ₀c/S for ka ≫ 1, R ∝ f² for ka ≪ 1.
 */
export function pistonRadiationImpedance(f: number, area: number): Complex {
  const a = Math.sqrt(area / Math.PI); // effective radius
  const k = (2 * Math.PI * f) / C0;
  const x = 2 * k * a;
  const z0 = (RHO0 * C0) / area;

  // R1(x) = 1 - 2·J1(x)/x  (series for small x, asymptotic for large)
  let r1: number;
  if (x < 1e-6) {
    r1 = (x * x) / 8;
  } else {
    r1 = 1 - (2 * besselJ1(x)) / x;
  }

  // X1(x) ≈ 2·H1(x)/x. Struve H1 approximation (Aarts & Janssen 2003):
  // H1(x) ≈ 2/π − J0(x) + (16/π − 5)·sin(x)/x + (12 − 36/π)·(1 − cos(x))/x²
  let x1: number;
  if (x < 1e-6) {
    x1 = (4 * x) / (3 * Math.PI);
  } else {
    const h1 =
      2 / Math.PI -
      besselJ0(x) +
      ((16 / Math.PI - 5) * Math.sin(x)) / x +
      ((12 - 36 / Math.PI) * (1 - Math.cos(x))) / (x * x);
    x1 = (2 * h1) / x;
  }

  return cplx(z0 * r1, z0 * x1);
}

/**
 * Sound pressure magnitude at distance r from a monopole source with
 * volume velocity U (half-space / 2π load): |p| = ρ₀·f·|U| / r
 * (from p = jωρ₀U/(2πr)).
 */
export function pressureMagHalfSpace(f: number, uMag: number, r: number = 1): number {
  return (RHO0 * f * uMag) / r;
}

/** Convert pressure magnitude [Pa] to dB SPL re 20 µPa. */
export function pascalsToDbSpl(p: number): number {
  return 20 * Math.log10(Math.max(p, 1e-12) / P_REF);
}

// ---------------------------------------------------------------------------
// Bessel function approximations (Abramowitz & Stegun polynomial fits)
// ---------------------------------------------------------------------------

export function besselJ0(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const p1 =
      57568490574.0 +
      y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))));
    const p2 =
      57568490411.0 +
      y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
    return p1 / p2;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 0.785398164;
  const p1 =
    1.0 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const p2 =
    -0.1562499995e-1 +
    y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 + y * -0.934935152e-7)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2);
}

export function besselJ1(x: number): number {
  const ax = Math.abs(x);
  let result: number;
  if (ax < 8) {
    const y = x * x;
    const p1 =
      x *
      (72362614232.0 +
        y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))));
    const p2 =
      144725228442.0 +
      y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    result = p1 / p2;
  } else {
    const z = 8 / ax;
    const y = z * z;
    const xx = ax - 2.356194491;
    const p1 =
      1.0 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
    const p2 =
      0.04687499995 +
      y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
    result = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2);
    if (x < 0) result = -result;
  }
  return result;
}

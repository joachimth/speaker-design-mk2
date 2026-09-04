// Port velocity, cone excursion, and maximum SPL calculations.
// These are critical for real-world speaker design validation.

import type { ThieleSmallParams } from '@/types';

const RHO_0 = 1.225; // air density [kg/m³]

const P_REF = 20e-6; // reference pressure [Pa]

/**
 * Calculate cone excursion x(f) at a given voltage for a ported enclosure.
 * Uses the 4th-order system transfer function.
 *
 * @param ts     Thiele/Small parameters
 * @param vb     Box volume [m³]
 * @param fb     Tuning frequency [Hz]
 * @param ql     Leakage Q (default 7)
 * @param freqs  Frequency array [Hz]
 * @param voltage  Input voltage [V] (default 2.83 = 1W/8Ω)
 * @returns excursion in meters at each frequency
 */
export function coneExcursionPorted(
  ts: ThieleSmallParams,
  vb: number,
  fb: number,
  freqs: number[],
  voltage: number = 2.83,
  ql: number = 7,
): number[] {
  const ws = 2 * Math.PI * ts.fs;
  const wb = 2 * Math.PI * fb;
  const alpha = ts.vas / vb;

  // System parameters (Small 1973)
  const h = wb / ws;
   // damping from leakage

  return freqs.map((f) => {
    const w = 2 * Math.PI * f;
    const s2 = (w / ws) ** 2;

    // 4th-order transfer function for displacement
    // x = (Bl * V) / (Re * Mms * ws²) * |H(s)|
    // where H(s) = s² / (s⁴ + a3*s³ + a2*s² + a1*s + a0)
    // Simplified: use the normalized form
    const fn2 = s2;
    const fn4 = fn2 * fn2;

    const denom =
      fn4 +
      (1 / ql + alpha / ts.qts) * Math.sqrt(fn4 / h / h) +
      (1 + alpha + (alpha * h * h) / ts.qts + (1 / (ql * ql))) * fn2 +
      (alpha / (ql * h * h)) * Math.sqrt(fn2) +
      (alpha * alpha * h * h) / (ts.qts * ts.qts);

    if (denom < 1e-30) return 0;

    // Displacement (simplified, normalized)
    const displacement_norm = fn2 / denom;

    // Scale to real units
    const bl = ts.bl ?? 1;
    const re = ts.re ?? 4;
    const mms = (ts.mms ?? 10) / 1000; // g to kg
    const xMax = (bl * voltage) / (re * mms * ws * ws);

    return Math.abs(xMax * displacement_norm);
  });
}

/**
 * Calculate port air velocity at a given input voltage.
 * Port velocity = (Vd_port / S_port) where Vd_port is the volume velocity
 * through the port.
 *
 * @param ts        Thiele/Small parameters
 * @param vb        Box volume [m³]
 * @param fb        Tuning frequency [Hz]
 * @param portArea  Port cross-sectional area [m²]
 * @param freqs     Frequency array [Hz]
 * @param voltage   Input voltage [V]
 * @returns Port velocity [m/s] at each frequency
 */
export function portVelocity(
  ts: ThieleSmallParams,
  vb: number,
  fb: number,
  portArea: number,
  freqs: number[],
  voltage: number = 2.83,
): number[] {
  // At and near Fb, the port does most of the radiation work.
  // Port velocity peaks at Fb. We use the ratio of port volume velocity
  // to cone volume velocity from the 4th-order system.
  const ws = 2 * Math.PI * ts.fs;
  const wb = 2 * Math.PI * fb;
  const alpha = ts.vas / vb;
  const sd = ts.sd / 10000; // cm² to m²

  return freqs.map((f) => {
    const w = 2 * Math.PI * f;
    const s2 = (w / ws) ** 2;
    const h2 = (wb / ws) ** 2;

    // Port-to-cone volume velocity ratio (from Small's equations)
    // U_port/U_cone = alpha * h² / (s² - h²)  (simplified reactive)
    // More complete: include damping
    const ratio = (alpha * h2) / Math.abs(s2 - h2 + 1e-30);

    // Cone velocity from excursion (simplified)
    const excursion = coneExcursionPorted(ts, vb, fb, [f], voltage)[0]!;
    const coneVel = 2 * Math.PI * f * excursion; // m/s
    const coneVolVel = coneVel * sd; // m³/s

    const portVolVel = coneVolVel * ratio;
    return Math.abs(portVolVel / portArea); // m/s
  });
}

/**
 * Calculate maximum SPL (displacement-limited) for a driver.
 * SPL = 20*log10(p / p_ref) where p = rho_0 * 2*pi*f² * Sd * Xmax (half-space, 1m)
 *
 * @param ts    Thiele/Small parameters
 * @param f     Frequency [Hz]
 * @returns Max SPL [dB] (half-space, 1m, peak)
 */
export function maxSplDisplacement(
  ts: ThieleSmallParams,
  f: number,
): number {
  const sd = ts.sd / 10000; // cm² to m²
  const xmax = ts.xmax / 1000; // mm to m
  const p = RHO_0 * 2 * Math.PI * f * f * sd * xmax;
  return 20 * Math.log10(p / P_REF);
}

/**
 * Calculate maximum SPL (thermally limited) from nominal power.
 * SPL = sensitivity + 10*log10(Pe)
 *
 * @param sensitivity  Sensitivity [dB/2.83V/1m] or [dB/W/1m]
 * @param pe            Nominal power [W]
 */
export function maxSplThermal(
  sensitivity: number,
  pe: number,
): number {
  return sensitivity + 10 * Math.log10(pe);
}

/**
 * Check port velocity against chuffing threshold.
 * @returns { velocity, status } where status is 'ok' | 'warning' | 'danger'
 */
export function portVelocityStatus(velocity: number): {
  status: 'ok' | 'warning' | 'danger';
  message: string;
} {
  if (velocity < 10) return { status: 'ok', message: `${velocity.toFixed(1)} m/s — OK` };
  if (velocity < 17) return { status: 'warning', message: `${velocity.toFixed(1)} m/s — overvej større port` };
  return { status: 'danger', message: `${velocity.toFixed(1)} m/s — chuffing risiko!` };
}

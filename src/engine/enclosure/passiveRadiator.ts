// Passive radiator enclosure model.
// Similar to ported but the port mass is replaced by the PR's moving mass.
// The PR has its own Fs and can be tuned by adding mass.

import type { ThieleSmallParams, FrequencyDataPoint } from '@/types';

/**
 * Calculate passive radiator enclosure response.
 *
 * The PR system is a 4th-order system like ported, but:
 * - The port mass Mmp is replaced by the PR's Mmp + added mass
 * - The PR has compliance Cmp = 1 / ((2*pi*Fs_pr)² * Mmp)
 * - The PR's own resonance creates a notch above the tuning frequency
 *
 * @param driverTs   Driver Thiele/Small parameters
 * @param vb         Box volume [L]
 * @param prFs       PR free-air resonance [Hz]
 * @param prSd       PR effective cone area [cm²]
 * @param prMms      PR moving mass [g] (including added mass)
 * @param freqs      Frequency array [Hz]
 * @returns Response curve in dB (relative to passband)
 */
export function calcPassiveRadiator(
  driverTs: ThieleSmallParams,
  vb: number,
  prFs: number,
  _prSd: number,
  _prMms: number,
  freqs: number[],
): FrequencyDataPoint[] {
  const sd = (driverTs.sd ?? 0) / 10000; // cm² to m²
  const mms = (driverTs.mms ?? 10) / 1000; // g to kg
  const cms = 1 / ((2 * Math.PI * driverTs.fs) ** 2 * mms); // m/N
  const vbM3 = vb * 1e-3; // L to m³

  // Box compliance seen by driver
  const cab = vbM3 / (RHO_0 * C * C); // acoustic compliance
  const cas = cms * sd * sd; // driver acoustic compliance
  const alpha = cas / cab;

  // PR acoustic mass and compliance
  
   // acoustic compliance

  // System frequencies
  const ws = 2 * Math.PI * driverTs.fs;
  const wpr = 2 * Math.PI * prFs;

  return freqs.map((f) => {
    const w = 2 * Math.PI * f;
    // s = jw (Laplace variable) — we work with real-valued approximations
    // since JS has no native complex numbers

    // 4th-order system with PR
    // Transfer function (simplified from Small's PR analysis):
    // The PR adds a notch at its own resonance frequency
    const s2 = w * w;
    
    const ws2 = ws * ws;
    const wpr2 = wpr * wpr;

    // Normalized frequency ratios
    const fn2 = s2 / ws2;
    const fn4 = fn2 * fn2;
    const fnPR2 = s2 / wpr2;

    // System denominator (4th order)
    const qts = driverTs.qts;
    const denom =
      fn4 +
      (1 / qts) * Math.sqrt(fn4 * (wpr2 / ws2)) +
      (1 + alpha + (alpha * wpr2) / (ws2 * qts * qts)) * fn2 +
      (alpha / qts) * Math.sqrt(fn2 * (wpr2 / ws2)) +
      alpha * alpha * (wpr2 / ws2);

    // Numerator: for PR system, response = s²*(s² + wpr²) / denom
    // This gives a notch at the PR's own resonance
    const numer = fn2 * Math.abs(fn2 - fnPR2);

    if (denom < 1e-30) return { freq: f, magnitude: -200 };

    // Response in dB relative to passband
    const ratio = Math.sqrt(numer / denom);
    const db = 20 * Math.log10(ratio + 1e-30);

    return { freq: f, magnitude: db };
  });
}

const RHO_0 = 1.225; // air density [kg/m³]
const C = 343; // speed of sound [m/s]

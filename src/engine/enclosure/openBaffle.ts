// Open baffle / dipole response model.
// A driver on an open baffle radiates from both sides, creating a
// dipole pattern with 6 dB/octave roll-off below the dipole peak.
//
// The dipole peak frequency: f_peak = c / (2 * D_eff)
// where D_eff is the effective path length around the baffle.
// For a rectangular baffle with driver at center:
//   D_eff ≈ sqrt((W/2)² + (H/2)²) (average half-baffle dimension)
//
// Below f_peak, response falls at 6 dB/oct.
// Above f_peak, the response approaches the driver's normal response
// (with baffle step still present).

import type { FrequencyDataPoint } from '@/types';

const C = 343000; // speed of sound [mm/s]

/**
 * Calculate the dipole roll-off for an open baffle.
 *
 * @param baffleWidth   Baffle width [mm]
 * @param baffleHeight  Baffle height [mm]
 * @param driverXOffset Horizontal offset from center [mm] (0 = center)
 * @param driverYPos    Vertical position from top [mm] (optional)
 * @param freqs         Frequency array [Hz]
 * @returns Dipole transfer function in dB (0 dB at HF, rolls off below f_peak)
 */
export function calcDipoleResponse(
  baffleWidth: number,
  baffleHeight: number,
  freqs: number[],
  driverXOffset: number = 0,
  driverYPos?: number,
): FrequencyDataPoint[] {
  // Effective path length: average distance from driver to baffle edge
  // through the shortest path around the baffle
  const halfW = baffleWidth / 2;
  const halfH = baffleHeight / 2;

  let dEff: number;
  if (driverXOffset !== 0 && driverYPos !== undefined) {
    // Use minimum distance to any edge
    const distLeft = halfW + driverXOffset;
    const distRight = halfW - driverXOffset;
    const distTop = driverYPos;
    const distBottom = baffleHeight - driverYPos;
    dEff = Math.min(distLeft, distRight, distTop, distBottom) * 2;
  } else if (driverXOffset !== 0) {
    const distLeft = halfW + driverXOffset;
    const distRight = halfW - driverXOffset;
    dEff = Math.min(distLeft, distRight) * 2;
  } else {
    // Centered driver: use diagonal average
    dEff = Math.sqrt(halfW * halfW + halfH * halfH);
  }

  // Dipole peak frequency
  const fPeak = C / (2 * dEff);

  return freqs.map((f) => {
    // Dipole transfer: |H(f)| = |sin(pi * f * D_eff / c)| / (pi * f * D_eff / c)
    // Simplified first-order approximation:
    // Below f_peak: -6 dB/oct roll-off (like a 1st-order high-pass)
    // At f_peak: 0 dB (flat transition)
    // Above f_peak: 0 dB (full dipole radiation)
    const ratio = f / fPeak;
    if (ratio < 1) {
      // -6 dB/oct below peak: -20*log10(1/ratio) = 20*log10(ratio)
      return { freq: f, magnitude: 20 * Math.log10(ratio + 1e-30) };
    }
    return { freq: f, magnitude: 0 };
  });
}

/**
 * Calculate the full open-baffle system response.
 * Combines driver response + dipole roll-off + baffle step.
 *
 * @param driverResponse  Driver on-axis frequency response
 * @param baffleWidth     Baffle width [mm]
 * @param baffleHeight    Baffle height [mm]
 * @param freqs           Frequency array [Hz]
 * @returns Combined open-baffle response
 */
export function calcOpenBaffleResponse(
  driverResponse: FrequencyDataPoint[],
  baffleWidth: number,
  baffleHeight: number,
  freqs: number[],
): FrequencyDataPoint[] {
  const dipole = calcDipoleResponse(baffleWidth, baffleHeight, freqs);

  // For open baffle, baffle step is different: the front radiation
  // still transitions from 4π to 2π, but the dipole cancellation
  // dominates at low frequencies.

  return freqs.map((f, i) => ({
    freq: f,
    magnitude: (driverResponse[i]?.magnitude ?? 0) + dipole[i]!.magnitude,
  }));
}

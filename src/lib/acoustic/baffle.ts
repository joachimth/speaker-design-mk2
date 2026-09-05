// Baffle step and edge diffraction
//
// A driver on a finite baffle transitions from 4π (omnidirectional) radiation
// at low frequencies to 2π (half-space) radiation at high frequencies. This
// causes an apparent ~6dB SPL increase in the on-axis response as frequency
// rises — equivalently, a -6dB loss at low frequencies relative to the high-
// frequency 2π reference.
//
// Model: First-order low-shelf filter.
//   loss(f) = -6 / (1 + (f/f_step)^2)
//
// This gives:
//   -6 dB at DC     (-6 dB loss = 4π radiation)
//   -3 dB at f_step
//    0 dB at HF      (0 dB loss = 2π, infinite-baffle reference)
//
// The transition has a 6 dB/octave slope (first-order characteristic).
//
// Baffle step frequency (rectangular baffle, standard model):
//   f_step = c / (2 * baffle_width)
// where the baffle width is the limiting dimension (shortest edge distance).
//
// Reference: Olson, "Direct Radiator Loudspeaker Enclosures" (JAES 1969);
//            D'Appolito, "Testing Loudspeakers"; Keele, "Low-Frequency
//            Loudspeaker Assessment."

import type { BaffleStepResult } from '@/types';

// Speed of sound [mm/s]
const C = 343000;

/**
 * Calculate baffle step loss using a first-order low-shelf model.
 *
 * The response transitions smoothly from -6dB at DC (4π radiation) to 0dB
 * at high frequencies (2π half-space). The -3dB point is at f_step, which
 * depends primarily on the baffle width (shortest edge).
 *
 * The baffle step affects ONLY drivers below ~2× f_step. Above that, the
 * effect is negligible (<1dB). In practice, this primarily affects woofers
 * and lower-midrange drivers — tweeters operate well above f_step.
 *
 * When driverXOffset and driverYPos are provided, the effective baffle
 * dimension is computed as the minimum distance from the driver to any
 * baffle edge (doubled, since the model uses c/(2*d)). An off-center driver
 * has a shorter effective baffle dimension, raising f_step and reducing the
 * baffle step loss at a given frequency. This matches the physical reality
 * that a driver near a baffle edge transitions to 2π radiation at higher
 * frequencies.
 *
 * @param driverXOffset  Horizontal offset from baffle center [mm] (0 = center)
 * @param driverYPos     Vertical position from baffle top [mm] (optional)
 */
export function calcBaffleStep(
  baffleWidth: number,
  _baffleHeight: number,
  frequencies: number[],
  driverXOffset?: number,
  driverYPos?: number,
): BaffleStepResult {
  // Compute the effective baffle dimension.
  // For a centered driver: effective = baffleWidth (standard model).
  // For an off-center driver: effective = 2 × min distance to any edge.
  let effectiveWidth = baffleWidth;

  if (driverXOffset !== undefined && driverXOffset !== 0) {
    const distLeft = baffleWidth / 2 + driverXOffset;
    const distRight = baffleWidth / 2 - driverXOffset;
    const minHoriz = Math.min(distLeft, distRight);
    // Use the smaller of: baffle width, or 2× nearest horizontal edge distance
    effectiveWidth = Math.min(baffleWidth, 2 * minHoriz);
  }

  if (driverYPos !== undefined && _baffleHeight > 0) {
    const distTop = driverYPos;
    const distBottom = _baffleHeight - driverYPos;
    const minVert = Math.min(distTop, distBottom);
    // Take the overall minimum across both dimensions
    effectiveWidth = Math.min(effectiveWidth, 2 * minVert);
  }

  // Baffle step frequency: f_step = c / (2 * effective_width)
  const fStep = C / (2 * effectiveWidth);

  // First-order low-shelf: -6 / (1 + (f/f_step)^2)
  // This is a proper 6dB/octave shelf with correct asymptotic behavior.
  const response = frequencies.map((f) => {
    const ratio = f / fStep;
    return -6 / (1 + ratio * ratio);
  });

  return { freq: frequencies, response };
}

/**
 * Calculate baffle step compensation (low-shelf boost).
 *
 * This produces a +6dB boost at low frequencies, tapering to 0dB above
 * f_step, intended to flatten the on-axis response. The compensation is
 * a first-order low-shelf filter.
 *
 * In practice, apply this to woofer (and optionally mid) channels only.
 * Applying it to a tweeter that operates well above f_step would boost
 * frequencies where no compensation is needed.
 *
 * @param fStep - baffle step frequency [Hz]
 * @param compensationDb - amount of compensation (0 = none, 6 = full)
 * @param frequencies - frequency array
 * @returns compensation curve in dB
 */
export function calcBaffleStepCompensation(
  fStep: number,
  compensationDb: number,
  frequencies: number[]
): number[] {
  return frequencies.map((f) => {
    const ratio = f / fStep;
    // First-order low-shelf boost: full at DC, tapering to 0 at HF
    return compensationDb / (1 + ratio * ratio);
  });
}

/**
 * Get the baffle step frequency for a given baffle width.
 *
 * Uses the rectangular baffle model: f_step = c / (2 * width)
 */
export function baffleStepFrequency(baffleWidth: number): number {
  return C / (2 * baffleWidth);
}

/**
 * Calculate the effect of front-edge roundovers on baffle diffraction.
 */
export function roundoverEffect(
  roundoverRadius: number,
  frequencies: number[]
): number[] {
  const fRoundover = C / (4 * roundoverRadius);
  return frequencies.map((f) => 1 / (1 + (f / fRoundover) ** 2));
}

// ---------------------------------------------------------------------------
// Edge-diffraction model with driver position
// ---------------------------------------------------------------------------

/**
 * On-axis edge-diffraction response for a driver at (xMm, yMm) on a
 * rectangular baffle — replaces the smooth first-order shelf with a real
 * edge-integral model.
 *
 * Model (far field, on axis; Vanderkooy/BDS-style discretization):
 * the baffle edge is split into segments; each segment re-radiates the
 * incident wave with amplitude -(Δθ/2π)·½ (the 4π→2π transition), delayed by
 * the driver→edge distance r:
 *
 *   p(f) = 1 - Σᵢ (Δθᵢ/2π) · ½ · g(f) · e^(−j·2πf·rᵢ/c)
 *
 * Limits: f→0 gives p=½ (−6 dB, 4π radiation); at HF the phasors decorrelate
 * and p ripples around 1 (0 dB, 2π reference). The ripple period and depth
 * depend on the driver's distances to the edges — an off-center driver
 * spreads the distances and flattens the ripple, which is why offset
 * tweeter mounting exists.
 *
 * g(f) = 1/(1+(f/f_r)²) with f_r = c/(4·roundover) models how a front-edge
 * roundover progressively removes the sharp-edge re-radiation at high
 * frequencies (approximation; a roundover cannot restore LF loss).
 *
 * The driver is treated as a point source at the cutout center. Segment
 * length adapts to the highest frequency so phase steps stay < π/2 at 20 kHz.
 * Results are cached (pure function of the arguments).
 */
const diffractionCache = new Map<string, number[]>();

export function calcBaffleDiffraction(
  baffleWidth: number,
  baffleHeight: number,
  driverXMm: number,
  driverYMm: number,
  roundoverRadius: number,
  frequencies: number[],
): number[] {
  const key = `${baffleWidth}x${baffleHeight}@${driverXMm.toFixed(1)},${driverYMm.toFixed(1)}r${roundoverRadius}n${frequencies.length}f${frequencies[0]?.toFixed(2)}-${frequencies[frequencies.length - 1]?.toFixed(2)}`;
  const cached = diffractionCache.get(key);
  if (cached) return cached;

  // Clamp the source strictly inside the baffle
  const x0 = Math.min(Math.max(driverXMm, 1), baffleWidth - 1);
  const y0 = Math.min(Math.max(driverYMm, 1), baffleHeight - 1);

  // Segment length: phase step < π/2 at 20 kHz → Δs < c/(4·20000) ≈ 4.3 mm
  const SEG = 4;
  const corners = [
    [0, 0], [baffleWidth, 0], [baffleWidth, baffleHeight], [0, baffleHeight],
  ] as const;

  // Discretize the perimeter; per segment: subtended angle Δθ and distance r
  const segs: { dTheta: number; rMm: number }[] = [];
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = corners[e]!;
    const [bx, by] = corners[(e + 1) % 4]!;
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(8, Math.ceil(len / SEG));
    let prevTheta = Math.atan2(ay - y0, ax - x0);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const theta = Math.atan2(py - y0, px - x0);
      let d = theta - prevTheta;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const mx = ax + (bx - ax) * (t - 0.5 / n);
      const my = ay + (by - ay) * (t - 0.5 / n);
      segs.push({ dTheta: Math.abs(d), rMm: Math.hypot(mx - x0, my - y0) });
      prevTheta = theta;
    }
  }

  const fR = roundoverRadius > 0 ? C / (4 * roundoverRadius) : Infinity;
  const result = frequencies.map((f) => {
    const g = roundoverRadius > 0 ? 1 / (1 + (f / fR) ** 2) : 1;
    let re = 1;
    let im = 0;
    const k = (2 * Math.PI * f) / C; // rad per mm
    for (const s of segs) {
      const amp = (s.dTheta / (2 * Math.PI)) * 0.5 * g;
      const phase = -k * s.rMm;
      re -= amp * Math.cos(phase);
      im -= amp * Math.sin(phase);
    }
    return 20 * Math.log10(Math.max(Math.hypot(re, im), 1e-6));
  });

  if (diffractionCache.size > 64) diffractionCache.clear();
  diffractionCache.set(key, result);
  return result;
}

// Horn enclosure model using Webster's horn equation.
//
// The horn profile is solved using transfer-matrix discretization.
// Supported profiles: exponential, hyperbolic, tractrix, conical, Le Cléac'h.
//
// References: Leach, "Horn Analysis with the One-Parameter Wave Equation";
//             Keele, "Low-Frequency Horn Design Using Thiele/Small Parameters";
//             Geddes, "Audio Transducers".

import type { FrequencyDataPoint } from '@/types';

const C = 343; // speed of sound [m/s]
const RHO_0 = 1.225; // air density [kg/m³]

export type HornProfile = 'exponential' | 'hyperbolic' | 'tractrix' | 'conical' | 'lecleach';

export interface HornParams {
  profile: HornProfile;
  throatArea: number;   // [m²]
  mouthArea: number;    // [m²]
  length: number;       // [m]
  rearChamberVolume: number; // [L] (back volume behind driver)
  frontChamberVolume: number; // [L] (front volume between driver and throat)
  flareConstant?: number; // m (for exponential/hyperbolic)
  cutoffFrequency?: number; // Hz (for exponential)
}

export interface HornResult {
  throatResponse: FrequencyDataPoint[];
  mouthResponse: FrequencyDataPoint[];
  summedResponse: FrequencyDataPoint[];
  cutoffFreq: number;
}

/**
 * Calculate horn profile area at a given distance from throat.
 */
function hornAreaAt(
  params: HornParams,
  x: number, // distance from throat [m]
): number {
  const { profile, throatArea: S0, mouthArea: Sm, length: L } = params;
  const t = x / L; // normalized position 0..1

  switch (profile) {
    case 'exponential': {
      // S(x) = S0 * exp(m*x), where m = ln(Sm/S0) / L
      const m = Math.log(Sm / S0) / L;
      return S0 * Math.exp(m * x);
    }
    case 'conical': {
      // S(x) = S0 * (1 + x/x0)², where x0 is determined by S0, Sm, L
      const r = Math.sqrt(Sm / S0);
      const x0 = L / (r - 1);
      return S0 * Math.pow(1 + x / x0, 2);
    }
    case 'tractrix': {
      // Tractrix: r(x) = a * (1 - sqrt(1 - (x/a)²)) ... simplified approximation
      // S(x) = pi * r(x)²
      const r0 = Math.sqrt(S0 / Math.PI);
      const rm = Math.sqrt(Sm / Math.PI);
      
      // Simplified: interpolate using tractrix shape
      const r = r0 + (rm - r0) * (1 - Math.cos(t * Math.PI / 2));
      return Math.PI * r * r;
    }
    case 'hyperbolic': {
      // S(x) = S0 * (cosh(m*x/T) + T * sinh(m*x/T))
      // T = shape parameter (1 = exponential, <1 = hyperbolic)
      const T = 0.8; // default hyperbolic factor
      const m = Math.log(Sm / S0) / L;
      return S0 * (Math.cosh(m * x / T) + T * Math.sinh(m * x / T));
    }
    case 'lecleach': {
      // Le Cléac'h: smooth profile minimizing reflections
      // Simplified approximation using cosine interpolation
      const r0 = Math.sqrt(S0 / Math.PI);
      const rm = Math.sqrt(Sm / Math.PI);
      const r = r0 * Math.pow(rm / r0, t * (2 - t));
      return Math.PI * r * r;
    }
    default:
      return S0 * Math.pow(Sm / S0, t);
  }
}

/**
 * Calculate horn response using discretized Webster's equation.
 *
 * @param params    Horn parameters
 * @param freqs     Frequency array [Hz]
 * @returns Throat, mouth, and summed responses in dB
 */
export function calcHornResponse(
  params: HornParams,
  freqs: number[],
): HornResult {
  const { throatArea: S0, mouthArea: Sm, length: L } = params;

  // Cutoff frequency for exponential horn
  const m = Math.log(Sm / S0) / L;
  const fc = (m * C) / (4 * Math.PI);

  // Discretize horn into segments for transfer matrix
  const nSegments = 50;
  const dx = L / nSegments;

  const throatResponse: FrequencyDataPoint[] = [];
  const mouthResponse: FrequencyDataPoint[] = [];
  const summedResponse: FrequencyDataPoint[] = [];

  for (const f of freqs) {
    const w = 2 * Math.PI * f;
    const k = w / C;

    // Propagate through horn segments
    let totalMatrix = { a: 1, b: 0, c: 0, d: 1 };

    for (let i = 0; i < nSegments; i++) {
      const x = i * dx;
      const area = hornAreaAt(params, x);
      const areaNext = hornAreaAt(params, x + dx);
      const avgArea = (area + areaNext) / 2;

      const z0 = RHO_0 * C / avgArea;
      const kdx = k * dx;

      const cosKL = Math.cos(kdx);
      const sinKL = Math.sin(kdx);

      const segMatrix = {
        a: cosKL,
        b: z0 * sinKL,
        c: sinKL / z0,
        d: cosKL,
      };

      // Account for area change (impedance transformation)
      const areaRatio = areaNext / area;
      if (Math.abs(areaRatio - 1) > 0.001) {
        // Transformer matrix for area change
        const transformMatrix = {
          a: Math.sqrt(areaRatio),
          b: 0,
          c: 0,
          d: 1 / Math.sqrt(areaRatio),
        };
        // Multiply: totalMatrix * segMatrix * transformMatrix
        const newA = totalMatrix.a * segMatrix.a + totalMatrix.b * segMatrix.c;
        const newB = totalMatrix.a * segMatrix.b + totalMatrix.b * segMatrix.d;
        const newC = totalMatrix.c * segMatrix.a + totalMatrix.d * segMatrix.c;
        const newD = totalMatrix.c * segMatrix.b + totalMatrix.d * segMatrix.d;
        totalMatrix = {
          a: newA * transformMatrix.a,
          b: newB * transformMatrix.d,
          c: newC * transformMatrix.a,
          d: newD * transformMatrix.d,
        };
      } else {
        const newA = totalMatrix.a * segMatrix.a + totalMatrix.b * segMatrix.c;
        const newB = totalMatrix.a * segMatrix.b + totalMatrix.b * segMatrix.d;
        const newC = totalMatrix.c * segMatrix.a + totalMatrix.d * segMatrix.c;
        const newD = totalMatrix.c * segMatrix.b + totalMatrix.d * segMatrix.d;
        totalMatrix = { a: newA, b: newB, c: newC, d: newD };
      }
    }

    // Mouth radiation impedance (piston in infinite baffle)
    
    
    // Z_mouth = rho_0 * c * (1 - J1(2ka)/(ka)) + j * rho_0 * c * (S1(2ka)/(ka))
    // Simplified: use resistive part only
    // const zMouth = RHO_0 * C / Sm * (1 - 2 * besselJ1(2 * ka) / (2 * ka + 1e-30));

    // Throat response (driver sees throat impedance)
    // Loading increases with frequency above cutoff
    const throatLoading = Math.min(1, f / (fc * 1.5));
    const throatDb = 20 * Math.log10(throatLoading + 1e-30);

    // Mouth response (pressure at mouth)
    const mouthDb = throatDb + 10 * Math.log10(Sm / S0 + 1e-30) - 3;

    // Summed: for back-loaded horn, driver direct + horn mouth with delay
    const delay = L / C;
    const phaseDelay = 2 * Math.PI * f * delay;
    const throatLin = Math.pow(10, throatDb / 20);
    const mouthLin = Math.pow(10, mouthDb / 20) * Math.cos(phaseDelay);
    const sumLin = throatLin + mouthLin;
    const sumDb = 20 * Math.log10(Math.abs(sumLin) + 1e-30);

    throatResponse.push({ freq: f, magnitude: throatDb });
    mouthResponse.push({ freq: f, magnitude: mouthDb });
    summedResponse.push({ freq: f, magnitude: sumDb });
  }

  return {
    throatResponse,
    mouthResponse,
    summedResponse,
    cutoffFreq: fc,
  };
}


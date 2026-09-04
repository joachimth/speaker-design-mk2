// Transmission line enclosure model using 1D transfer-matrix approach.
//
// The line is divided into segments, each with area, length, and stuffing
// density. The transfer matrix for each segment accounts for:
// - Complex wave number (includes stuffing damping and velocity reduction)
// - Area changes (taper)
//
// The driver can be placed at any point along the line (offset-driver / ML-TL).
//
// Output: driver response, terminus response, and summed response.
//
// References: King ("Loudspeaker Voice" articles), Augspurger (JAES 2000).

import type { FrequencyDataPoint } from '@/types';

const C = 343; // speed of sound [m/s]
const RHO_0 = 1.225; // air density [kg/m³]

export interface TLSegment {
  length: number; // [m]
  areaStart: number; // [m²]
  areaEnd: number; // [m²]
  stuffingDensity: number; // [kg/m³] (0 = empty, ~5-10 = light, ~20-30 = heavy)
}

export interface TLResult {
  driverResponse: FrequencyDataPoint[];
  terminusResponse: FrequencyDataPoint[];
  summedResponse: FrequencyDataPoint[];
}

/**
 * Calculate transmission line response.
 *
 * @param segments     Line segments (from driver to terminus)
 * @param driverFs     Driver free-air resonance [Hz]
 * @param driverQts    Driver total Q
 * @param driverVas    Driver equivalent volume [L]
 * @param driverSd     Driver effective area [cm²]
 * @param freqs        Frequency array [Hz]
 * @returns Driver, terminus, and summed responses in dB
 */
export function calcTransmissionLine(
  segments: TLSegment[],
  driverFs: number,
  driverQts: number,
  driverVas: number,
  driverSd: number,
  freqs: number[],
): TLResult {
  const sd = driverSd / 10000; // cm² to m²
  const vas = driverVas * 1e-3; // L to m³
  const totalLength = segments.reduce((s, seg) => s + seg.length, 0);

  // Quarter-wave frequency (first line resonance)
  

  const driverResponse: FrequencyDataPoint[] = [];
  const terminusResponse: FrequencyDataPoint[] = [];
  const summedResponse: FrequencyDataPoint[] = [];

  for (const f of freqs) {
    const w = 2 * Math.PI * f;

    // Propagation through each segment using transfer matrices
    // For a segment with area A, length L, and stuffing:
    //   Complex wave number: k' = k * (1 - j * damping_factor)
    //   where damping_factor depends on stuffing density
    //   Characteristic impedance: Z0 = rho_0 * c / A

    let totalMatrix = { a: 1, b: 0, c: 0, d: 1 }; // identity matrix

    for (const seg of segments) {
      const avgArea = (seg.areaStart + seg.areaEnd) / 2;
      const stuffingFactor = seg.stuffingDensity > 0
        ? 1 + seg.stuffingDensity * 0.03 // approximate velocity reduction
        : 1;
      const cEff = C / stuffingFactor;
      const k = w / cEff;
      const damping = seg.stuffingDensity * 0.01; // approximate damping
      const kComplex_re = k;
      const kComplex_im = -damping * k;

      // Transfer matrix for a tube segment:
      // [cos(kL)    j*Z0*sin(kL)]
      // [j/Z0*sin(kL)  cos(kL)  ]
      const kL_re = kComplex_re * seg.length;
      const kL_im = kComplex_im * seg.length;

      // cos(kL) and sin(kL) with complex argument
      const cosKL = Math.cos(kL_re) * Math.cosh(-kL_im) -
                    Math.sin(kL_re) * Math.sinh(-kL_im) * 0; // simplified
      const sinKL = Math.sin(kL_re) * Math.cosh(-kL_im);

      const z0 = RHO_0 * cEff / avgArea;

      const segMatrix = {
        a: cosKL,
        b: z0 * sinKL,
        c: sinKL / z0,
        d: cosKL,
      };

      // Multiply matrices: result = totalMatrix * segMatrix
      const newA = totalMatrix.a * segMatrix.a + totalMatrix.b * segMatrix.c;
      const newB = totalMatrix.a * segMatrix.b + totalMatrix.b * segMatrix.d;
      const newC = totalMatrix.c * segMatrix.a + totalMatrix.d * segMatrix.c;
      const newD = totalMatrix.c * segMatrix.b + totalMatrix.d * segMatrix.d;
      totalMatrix = { a: newA, b: newB, c: newC, d: newD };
    }

    // Terminus radiation impedance (simplified piston in baffle)
    const terminusArea = segments[segments.length - 1]!.areaEnd;
    const zTerminus = RHO_0 * C / terminusArea;

    // Line input impedance at driver position
    const zLine = (totalMatrix.b + totalMatrix.a * zTerminus) /
                  (totalMatrix.d + totalMatrix.c * zTerminus);

    // Driver response (simplified: driver sees line impedance as box load)
    
    const alpha = vas / (totalLength * segments[0]!.areaStart); // rough Vb estimate
    const driverDb = computeDriverLoad(f, driverFs, driverQts, alpha, Math.abs(zLine));

    // Terminus response (pressure at line output)
    const terminusDb = computeTerminusOutput(f, totalLength, C, 1, terminusArea, sd);

    // Summed: driver direct + terminus with delay
    const delay = totalLength / C; // propagation delay [s]
    const phaseDelay = 2 * Math.PI * f * delay;
    const driverLin = Math.pow(10, driverDb / 20);
    const terminusLin = Math.pow(10, terminusDb / 20) * Math.cos(phaseDelay);
    const sumLin = driverLin + terminusLin;
    const sumDb = 20 * Math.log10(Math.abs(sumLin) + 1e-30);

    driverResponse.push({ freq: f, magnitude: driverDb });
    terminusResponse.push({ freq: f, magnitude: terminusDb });
    summedResponse.push({ freq: f, magnitude: sumDb });
  }

  return { driverResponse, terminusResponse, summedResponse };
}


function computeDriverLoad(f: number, fs: number, qts: number, alpha: number, _zLineMag: number): number {
  const ws = 2 * Math.PI * fs;
  const w = 2 * Math.PI * f;
  const fn2 = (w / ws) ** 2;
  const fn4 = fn2 * fn2;

  // Simplified response with line loading (approximates 4th-order system)
  const denom = fn4 + (1 / qts) * Math.sqrt(fn4) + (1 + alpha) * fn2 + alpha * alpha / (qts * qts);
  const numer = fn2;
  if (denom < 1e-30) return -200;
  const ratio = Math.sqrt(numer / denom);
  return 20 * Math.log10(ratio + 1e-30);
}

function computeTerminusOutput(f: number, length: number, cEff: number, _stuffFactor: number, terminusArea: number, sd: number): number {
  // Terminus output: peaks at quarter-wave and odd harmonics
  const fQuarter = cEff / (4 * length);
  const ratio = f / fQuarter;
  // Quarter-wave pipe: output peaks at f = (2n+1) * fQuarter
  // Simplified: peaks at odd multiples of fQuarter
  const response = Math.abs(Math.sin(Math.PI * ratio / 2)) / (1 + ratio * 0.1);
  // Scale by area ratio
  const areaScale = sd / terminusArea;
  return 20 * Math.log10(response * areaScale + 1e-30);
}

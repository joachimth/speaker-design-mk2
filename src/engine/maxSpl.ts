// Excursion-limited and thermally-limited max SPL (SPEC §4.9).
//
// Displacement-limited SPL (half-space, 1 m, peak):
//   p = ρ₀·2π·f²·Sd·Xmax  →  dB re 20 µPa
// Thermal: sensitivity + 10·log10(Pe_nominal), with power compression
// estimated from voice-coil temperature rise (Re increases 0.4 %/K).
//
// The system max SPL is min(displacement-limited, thermal-limited).
// For enclosure-specific excursion (ported unloading below Fb etc.) the
// enclosure models' excursion channel is scaled: at drive voltage V the
// model gives x(f); max SPL(f) = SPL(f, V) + 20·log10(Xmax / x(f)).

import { RHO0, P_REF } from './acoustics';
import type { ThieleSmallParams } from '@/types';

/** Displacement-limited SPL for an unconstrained piston (SPEC formula) */
export function displacementLimitedSpl(f: number, sdCm2: number, xmaxMm: number): number {
  const sd = sdCm2 / 1e4;
  const xmax = xmaxMm / 1e3;
  const p = RHO0 * 2 * Math.PI * f * f * sd * xmax;
  return 20 * Math.log10(Math.max(p, 1e-12) / P_REF);
}

/** Thermally-limited SPL from nominal power handling */
export function thermalLimitedSpl(ts: ThieleSmallParams, powerCompressionDb: number = 0): number {
  const pe = ts.pe ?? 50;
  return ts.sensitivity + 10 * Math.log10(pe) - powerCompressionDb;
}

/**
 * Simple thermal model: voice-coil ΔT at a given input power based on
 * a thermal resistance estimate, and the resulting power compression
 * (Re rises 0.4 %/K → less current → less output).
 */
export function estimatePowerCompression(
  powerW: number,
  thermalResistanceKPerW: number = 2.5,
): { deltaT: number; compressionDb: number } {
  const deltaT = powerW * thermalResistanceKPerW;
  const reRatio = 1 + 0.004 * deltaT;
  // SPL loss ≈ 20·log10(I/I0) = -20·log10(reRatio) for voltage drive
  const compressionDb = 20 * Math.log10(reRatio);
  return { deltaT, compressionDb };
}

export interface MaxSplResult {
  freqs: number[];
  /** Displacement-limited SPL curve [dB] */
  displacementLimited: number[];
  /** Thermal limit [dB] (flat) */
  thermalLimited: number;
  /** System max SPL = min of the two [dB] */
  maxSpl: number[];
}

/**
 * Max SPL from an enclosure simulation's excursion channel.
 *
 * @param freqs        Frequency axis
 * @param splAtDrive   SPL curve at the reference drive voltage [dB]
 * @param excursionMm  Excursion curve at the same drive [mm]
 * @param ts           Driver T/S (Xmax, Pe, sensitivity)
 */
export function maxSplFromSimulation(
  freqs: number[],
  splAtDrive: number[],
  excursionMm: number[],
  ts: ThieleSmallParams,
): MaxSplResult {
  const pe = ts.pe ?? 50;
  const { compressionDb } = estimatePowerCompression(pe);
  const thermal = thermalLimitedSpl(ts, compressionDb);

  const displacementLimited: number[] = [];
  const maxSpl: number[] = [];

  for (let i = 0; i < freqs.length; i++) {
    const x = Math.max(excursionMm[i]!, 1e-6);
    const headroomDb = 20 * Math.log10(ts.xmax / x);
    const dispLimited = splAtDrive[i]! + headroomDb;
    displacementLimited.push(dispLimited);
    maxSpl.push(Math.min(dispLimited, thermal));
  }

  return { freqs, displacementLimited, thermalLimited: thermal, maxSpl };
}

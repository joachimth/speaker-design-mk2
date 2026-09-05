// Electromechanical driver model derived from Thiele/Small parameters.
// SI units. Follows the domain discipline that fixed the mk1 impedance model:
//   - Cms is ALWAYS derived from Fs and Mms (manufacturer Cms values are
//     frequently inconsistent with the stated Fs).
//   - If Mms is missing it is derived from Vas: Cms = Vas/(ρ₀c²Sd²),
//     Mms = 1/(ωs²·Cms).
//   - BL from Qes: BL = √(ωs·Mms·Re/Qes).
//   - Rms from Qms: Rms = ωs·Mms/Qms.

import { RHO0, C0 } from './acoustics';
import type { ThieleSmallParams } from '@/types';

export interface DriverModel {
  fs: number; // [Hz]
  re: number; // [Ω]
  le: number; // [H]
  mms: number; // [kg]
  cms: number; // [m/N]
  rms: number; // [kg/s]
  bl: number; // [T·m]
  sd: number; // [m²]
  qes: number;
  qms: number;
  qts: number;
  vas: number; // [m³]
  xmax: number; // [m]
  /** Which fields were derived rather than taken from the datasheet */
  derived: string[];
}

/**
 * Build a consistent electromechanical model from T/S parameters.
 * Priority: Fs, Qes, Qms, Re, Sd, Vas are authoritative; Mms/Cms/BL/Rms
 * are derived for internal consistency (SPEC §4.1 konsistens).
 */
export function deriveDriverModel(ts: ThieleSmallParams): DriverModel {
  const derived: string[] = [];
  const fs = ts.fs;
  const ws = 2 * Math.PI * fs;
  const re = ts.re > 0 ? ts.re : 4;
  const sd = ts.sd > 0 ? ts.sd / 1e4 : 0.005; // cm² → m²
  const vas = ts.vas > 0 ? ts.vas / 1e3 : 0.01; // L → m³

  const qms = ts.qms > 0 ? ts.qms : 3;
  const qes = ts.qes > 0 ? ts.qes : ts.qts > 0 ? ts.qts / (1 - ts.qts / qms) : 0.5;
  const qts = ts.qts > 0 ? ts.qts : (qms * qes) / (qms + qes);

  // Mms: from datasheet if present, else from Vas
  let mms: number;
  if (ts.mms && ts.mms > 0) {
    mms = ts.mms / 1e3; // g → kg
  } else {
    const cmsFromVas = vas / (RHO0 * C0 * C0 * sd * sd); // [m/N]
    mms = 1 / (ws * ws * cmsFromVas);
    derived.push('mms');
  }

  // Cms ALWAYS derived from Fs + Mms for consistency
  const cms = 1 / (ws * ws * mms);
  derived.push('cms');

  // BL from Qes (or datasheet)
  let bl: number;
  if (ts.bl && ts.bl > 0) {
    bl = ts.bl;
  } else {
    bl = Math.sqrt((ws * mms * re) / qes);
    derived.push('bl');
  }

  // Rms from Qms
  const rms = (ws * mms) / qms;
  derived.push('rms');

  const le = ts.le && ts.le > 0 ? ts.le / 1e3 : 0; // mH → H

  return {
    fs,
    re,
    le,
    mms,
    cms,
    rms,
    bl,
    sd,
    qes,
    qms,
    qts,
    vas,
    xmax: (ts.xmax > 0 ? ts.xmax : 4) / 1e3, // mm → m
    derived,
  };
}

/**
 * T/S consistency check (SPEC §4.1): derive Qts from Qes/Qms, Vas from
 * Cms·Sd² and compare against stated values. Deviation >10 % → flag.
 */
export interface ConsistencyIssue {
  field: string;
  stated: number;
  derived: number;
  deviationPct: number;
}

export function checkTsConsistency(ts: ThieleSmallParams): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  if (ts.qts > 0 && ts.qes > 0 && ts.qms > 0) {
    const qtsDerived = (ts.qes * ts.qms) / (ts.qes + ts.qms);
    const dev = Math.abs(qtsDerived - ts.qts) / ts.qts;
    if (dev > 0.1) {
      issues.push({ field: 'qts', stated: ts.qts, derived: qtsDerived, deviationPct: dev * 100 });
    }
  }

  if (ts.vas > 0 && ts.cms && ts.cms > 0 && ts.sd > 0) {
    const sd = ts.sd / 1e4;
    const cms = ts.cms / 1e3; // mm/N → m/N
    const vasDerived = cms * sd * sd * RHO0 * C0 * C0 * 1e3; // → L
    const dev = Math.abs(vasDerived - ts.vas) / ts.vas;
    if (dev > 0.1) {
      issues.push({ field: 'vas', stated: ts.vas, derived: vasDerived, deviationPct: dev * 100 });
    }
  }

  if (ts.fs > 0 && ts.mms && ts.mms > 0 && ts.cms && ts.cms > 0) {
    const fsDerived = 1 / (2 * Math.PI * Math.sqrt((ts.mms / 1e3) * (ts.cms / 1e3)));
    const dev = Math.abs(fsDerived - ts.fs) / ts.fs;
    if (dev > 0.1) {
      issues.push({ field: 'fs', stated: ts.fs, derived: fsDerived, deviationPct: dev * 100 });
    }
  }

  return issues;
}

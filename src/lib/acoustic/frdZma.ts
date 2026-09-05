// FRD/ZMA import + export (SPEC §6, §9)
//
// FRD: frequency response text format — lines of "freq  SPL_dB  [phase_deg]".
// ZMA: impedance text format — lines of "freq  ohms  [phase_deg]".
// Both are de-facto standards used by VituixCAD, REW, ARTA, WinISD etc.
//
// Unlike parseRewFile (which auto-detects SPL vs impedance from the value
// range), these parsers are EXPLICITLY typed by file kind — an 85 dB SPL
// curve must never be misread as an 85 Ω impedance curve.
//
// Tolerant of: comment lines (*, ;, #, //), blank lines, tab/space/semicolon
// separators, and European decimal commas ("85,3" → 85.3) as long as the
// separator is not also a comma.

import type { Driver, FrequencyDataPoint, ImpedanceDataPoint } from '@/types';

export interface FrdParseResult {
  points: FrequencyDataPoint[];
  hasPhase: boolean;
  /** Lines that looked like data but could not be parsed */
  skippedLines: number;
}

export interface ZmaParseResult {
  points: ImpedanceDataPoint[];
  hasPhase: boolean;
  skippedLines: number;
}

/** Parse one data line into up to 3 numbers. Returns null for comments/headers. */
function parseDataLine(rawLine: string): number[] | null {
  const line = rawLine.trim();
  if (!line) return null;
  if (line.startsWith('*') || line.startsWith(';') || line.startsWith('#') || line.startsWith('//')) {
    return null;
  }

  // Split on whitespace/tab/semicolon. Do NOT split on comma — commas may be
  // European decimal separators. If commas act as separators (i.e. tokens
  // would otherwise contain both digits around a comma AND spaces exist
  // elsewhere), whitespace splitting already isolated the tokens.
  let tokens = line.split(/[\s;]+/).filter((t) => t.length > 0);

  // If we got a single token containing commas ("20,0,85,3" style CSV), fall
  // back to comma splitting.
  if (tokens.length === 1 && tokens[0]!.includes(',')) {
    tokens = tokens[0]!.split(',').filter((t) => t.length > 0);
  }

  const nums: number[] = [];
  for (const tok of tokens.slice(0, 3)) {
    // European decimal comma: only when the token has a comma and no dot
    const normalized = tok.includes(',') && !tok.includes('.') ? tok.replace(',', '.') : tok;
    const v = Number(normalized);
    if (!Number.isFinite(v)) return null;
    nums.push(v);
  }
  return nums.length >= 2 ? nums : null;
}

/** Parse FRD text (freq, SPL dB, optional phase deg). */
export function parseFrdText(text: string): FrdParseResult {
  const points: FrequencyDataPoint[] = [];
  let hasPhase = false;
  let skippedLines = 0;

  for (const line of text.split(/\r?\n/)) {
    const nums = parseDataLine(line);
    if (nums === null) {
      // Count only lines that contained digits but failed parsing
      if (/\d/.test(line) && line.trim() && !/^[*;#/]/.test(line.trim())) skippedLines++;
      continue;
    }
    const [freq, mag, phase] = nums;
    if (freq! <= 0) { skippedLines++; continue; }
    const pt: FrequencyDataPoint = { freq: freq!, magnitude: mag! };
    if (phase !== undefined) {
      pt.phase = phase;
      hasPhase = true;
    }
    points.push(pt);
  }

  points.sort((a, b) => a.freq - b.freq);
  return { points, hasPhase, skippedLines };
}

/** Parse ZMA text (freq, |Z| ohms, optional phase deg). */
export function parseZmaText(text: string): ZmaParseResult {
  const points: ImpedancePointWithPhase[] = [];
  let hasPhase = false;
  let skippedLines = 0;

  for (const line of text.split(/\r?\n/)) {
    const nums = parseDataLine(line);
    if (nums === null) {
      if (/\d/.test(line) && line.trim() && !/^[*;#/]/.test(line.trim())) skippedLines++;
      continue;
    }
    const [freq, mag, phase] = nums;
    if (freq! <= 0 || mag! <= 0) { skippedLines++; continue; }
    const pt: ImpedancePointWithPhase = { freq: freq!, magnitude: mag! };
    if (phase !== undefined) {
      pt.phase = phase;
      hasPhase = true;
    }
    points.push(pt);
  }

  points.sort((a, b) => a.freq - b.freq);
  return { points, hasPhase, skippedLines };
}

type ImpedancePointWithPhase = ImpedanceDataPoint;

// ---------------------------------------------------------------------------
// Export (SPEC §9: FRD/ZMA of the simulated system response)
// ---------------------------------------------------------------------------

/** Generate FRD text from a frequency response curve. */
export function exportFrd(
  points: FrequencyDataPoint[],
  header: string = 'Speaker Design 4 All — simuleret respons',
): string {
  const lines = [`* ${header}`, `* Genereret ${new Date().toISOString()}`, '* Freq [Hz]  SPL [dB]  Fase [deg]'];
  for (const p of points) {
    const phase = p.phase ?? 0;
    lines.push(`${p.freq.toFixed(3)}\t${p.magnitude.toFixed(3)}\t${phase.toFixed(2)}`);
  }
  return lines.join('\n') + '\n';
}

/** Generate ZMA text from an impedance curve. */
export function exportZma(
  points: ImpedanceDataPoint[],
  header: string = 'Speaker Design 4 All — simuleret impedans',
): string {
  const lines = [`* ${header}`, `* Genereret ${new Date().toISOString()}`, '* Freq [Hz]  |Z| [ohm]  Fase [deg]'];
  for (const p of points) {
    const phase = p.phase ?? 0;
    lines.push(`${p.freq.toFixed(3)}\t${p.magnitude.toFixed(4)}\t${phase.toFixed(2)}`);
  }
  return lines.join('\n') + '\n';
}

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download a frequency response as .frd */
export function downloadFrd(points: FrequencyDataPoint[], name: string): void {
  downloadText(exportFrd(points, name), `${name}.frd`);
}

/** Download an impedance curve as .zma */
export function downloadZma(points: ImpedanceDataPoint[], name: string): void {
  downloadText(exportZma(points, name), `${name}.zma`);
}

// ---------------------------------------------------------------------------
// Driver data quality flag (SPEC §6)
// ---------------------------------------------------------------------------

export type QualityFlag = 'A' | 'B' | 'C';

export interface QualityResult {
  flag: QualityFlag;
  /** Human-readable reason (Danish, shown in UI) */
  reason: string;
}

/**
 * Data quality flag per SPEC §6:
 *   A — measured on-axis + off-axis response + measured impedance
 *   B — measured on-axis response + T/S parameters
 *   C — datasheet only (no measured curves)
 */
export function driverQuality(driver: Pick<Driver, 'frequencyResponse' | 'impedance' | 'offAxis'>): QualityResult {
  const hasFr = !!driver.frequencyResponse && driver.frequencyResponse.length >= 10;
  const hasZ = !!driver.impedance && driver.impedance.length >= 10;
  const hasOffAxis = !!driver.offAxis && driver.offAxis.length > 0;

  if (hasFr && hasZ && hasOffAxis) {
    return { flag: 'A', reason: 'Målt on/off-axis frekvensgang + målt impedans.' };
  }
  if (hasFr) {
    return {
      flag: 'B',
      reason: hasZ
        ? 'Målt on-axis frekvensgang + impedans, men ingen off-axis-målinger.'
        : 'Målt on-axis frekvensgang, men ingen målt impedans eller off-axis.',
    };
  }
  return { flag: 'C', reason: 'Kun datablads-parametre — simulering har bredere usikkerhed.' };
}

export const QUALITY_BADGE_COLOR: Record<QualityFlag, 'green' | 'blue' | 'orange'> = {
  A: 'green',
  B: 'blue',
  C: 'orange',
};

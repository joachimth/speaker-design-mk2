// Hypex FusionAmp + Analog Devices SigmaDSP (ADAU) export (SPEC §9)
//
// Both targets take cascaded biquad coefficients per output channel. We
// reuse the crossover decomposition from biquadExport (buildCrossoverFilter
// under the hood) and print the coefficients in the convention each tool
// expects — stated explicitly in the file header so nothing is ambiguous:
//
//   Academic:  H(z) = (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)
//   Feedback:  y[n] = b0·x + b1·x₁ + b2·x₂ + A1·y₁ + A2·y₂  med A1=-a1, A2=-a2
//
// Hypex Filter Design (HFD) custom biquads and SigmaStudio's general
// second-order blocks both use the feedback form (same sign convention as
// miniDSP). The sections from exportBiquads are already in feedback form.

import type { DesignState, Driver } from '@/types';
import { exportBiquads, type BandExport } from '@/lib/acoustic/biquadExport';

const ROLE_LABELS: Record<string, string> = {
  low: 'Bas',
  mid: 'Mellem',
  mid2: 'Mellem 2',
  high: 'Diskant',
};

const ROLE_ORDER: Record<string, number> = { low: 0, mid: 1, mid2: 2, high: 3 };

// ---------------------------------------------------------------------------
// SigmaDSP 5.23 fixed point
// ---------------------------------------------------------------------------

/**
 * Convert a float to SigmaDSP 5.23 fixed point as 8-digit hex
 * (32-bit two's complement). Range [-16, 16).
 */
export function to523Hex(value: number): string {
  const max = 16 - Math.pow(2, -23);
  const clamped = Math.max(-16, Math.min(max, value));
  const scaled = Math.round(clamped * 0x800000);
  const unsigned = scaled < 0 ? scaled + 0x100000000 : scaled;
  return '0x' + unsigned.toString(16).padStart(8, '0').toUpperCase();
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface Channel {
  role: string;
  label: string;
  driverName: string;
  entries: BandExport[];
  gainDb: number;
  polarity: 0 | 180;
  delayMs: number;
}

function groupChannels(design: DesignState, drivers: Driver[], sampleRate: number): Channel[] {
  const result = exportBiquads(design, sampleRate);
  const byRole = new Map<string, BandExport[]>();
  for (const b of result.bands) {
    const list = byRole.get(b.role) ?? [];
    list.push(b);
    byRole.set(b.role, list);
  }
  const channels: Channel[] = [];
  for (const [role, entries] of byRole) {
    const first = entries[0]!;
    const driver = drivers.find((d) => d.id === first.driverId);
    channels.push({
      role,
      label: ROLE_LABELS[role] ?? role,
      driverName: driver ? `${driver.manufacturer} ${driver.model}` : '(ingen enhed valgt)',
      entries,
      gainDb: first.gainDb,
      polarity: first.polarity,
      delayMs: first.delayMs,
    });
  }
  return channels.sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
}

function fmt(v: number): string {
  return v.toFixed(10);
}

// ---------------------------------------------------------------------------
// Hypex FusionAmp (HFD)
// ---------------------------------------------------------------------------

/**
 * Text sheet for manual entry in Hypex Filter Design (HFD).
 * One section per output channel with biquads in feedback form.
 */
export function exportHypexText(
  design: DesignState,
  drivers: Driver[],
  projectName: string,
  sampleRate = 48000,
): string {
  const channels = groupChannels(design, drivers, sampleRate);
  const lines: string[] = [];
  lines.push(`# Hypex FusionAmp opsætningsark — ${projectName}`);
  lines.push(`# Genereret af Speaker Design 4 All · fs = ${sampleRate} Hz`);
  lines.push('#');
  lines.push('# Koefficienterne er i tilbagekoblingsform (samme konvention som miniDSP):');
  lines.push('#   y[n] = b0·x[n] + b1·x[n-1] + b2·x[n-2] + a1·y[n-1] + a2·y[n-2]');
  lines.push('# Akademisk form har modsat fortegn på a1/a2.');
  lines.push('# Indtast hvert biquad som custom biquad i HFD på den angivne kanal.');
  lines.push('');

  for (const ch of channels) {
    lines.push(`## Kanal: ${ch.label} — ${ch.driverName}`);
    lines.push(`Gain: ${ch.gainDb.toFixed(1)} dB`);
    lines.push(`Polaritet: ${ch.polarity === 180 ? 'Inverteret (180°)' : 'Normal (0°)'}`);
    const delaySamples = (ch.delayMs / 1000) * sampleRate;
    lines.push(`Delay: ${ch.delayMs.toFixed(3)} ms (${delaySamples.toFixed(1)} samples @ ${sampleRate} Hz)`);
    let n = 1;
    for (const entry of ch.entries) {
      lines.push(`# ${entry.label} — ${entry.filterType} @ ${entry.fc.toFixed(0)} Hz (${entry.sections.length} biquad${entry.sections.length > 1 ? 's' : ''})`);
      for (const s of entry.sections) {
        lines.push(`biquad${n}:`);
        lines.push(`  b0 = ${fmt(s.b0)}`);
        lines.push(`  b1 = ${fmt(s.b1)}`);
        lines.push(`  b2 = ${fmt(s.b2)}`);
        lines.push(`  a1 = ${fmt(s.a1)}`);
        lines.push(`  a2 = ${fmt(s.a2)}`);
        n++;
      }
    }
    if (ch.entries.length === 0) lines.push('# (ingen filtre på denne kanal)');
    lines.push('');
  }

  lines.push('# NB: Gains er kun dæmpning i dette design (bas-kanalen er referencen på 0 dB).');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// ADAU / SigmaStudio
// ---------------------------------------------------------------------------

/**
 * Text sheet for SigmaStudio (ADAU1401/1701/145x). Coefficients in feedback
 * form as float + 5.23 hex (32-bit two's complement) for direct parameter
 * entry or safeload writes.
 */
export function exportAdauText(
  design: DesignState,
  drivers: Driver[],
  projectName: string,
  sampleRate = 48000,
): string {
  const channels = groupChannels(design, drivers, sampleRate);
  const lines: string[] = [];
  lines.push(`# ADAU / SigmaStudio parameterark — ${projectName}`);
  lines.push(`# Genereret af Speaker Design 4 All · fs = ${sampleRate} Hz · format 5.23 (32-bit two's complement)`);
  lines.push('#');
  lines.push('# Rækkefølge pr. biquad: B0, B1, B2, A1, A2 (tilbagekoblingsform — SigmaStudios konvention).');
  lines.push('# Akademisk form har modsat fortegn på A1/A2.');
  lines.push('');

  for (const ch of channels) {
    lines.push(`## Kanal: ${ch.label} — ${ch.driverName}`);
    const gainLin = Math.pow(10, ch.gainDb / 20) * (ch.polarity === 180 ? -1 : 1);
    lines.push(`Gain (lineær, inkl. polaritet): ${gainLin.toFixed(8)} = ${to523Hex(gainLin)}`);
    const delaySamples = Math.round((ch.delayMs / 1000) * sampleRate);
    lines.push(`Delay: ${ch.delayMs.toFixed(3)} ms = ${delaySamples} samples @ ${sampleRate} Hz`);
    let n = 1;
    for (const entry of ch.entries) {
      lines.push(`# ${entry.label} — ${entry.filterType} @ ${entry.fc.toFixed(0)} Hz`);
      for (const s of entry.sections) {
        lines.push(`biquad${n}:`);
        lines.push(`  B0 = ${fmt(s.b0)}  ${to523Hex(s.b0)}`);
        lines.push(`  B1 = ${fmt(s.b1)}  ${to523Hex(s.b1)}`);
        lines.push(`  B2 = ${fmt(s.b2)}  ${to523Hex(s.b2)}`);
        lines.push(`  A1 = ${fmt(s.a1)}  ${to523Hex(s.a1)}`);
        lines.push(`  A2 = ${fmt(s.a2)}  ${to523Hex(s.a2)}`);
        n++;
      }
    }
    if (ch.entries.length === 0) lines.push('# (ingen filtre på denne kanal)');
    lines.push('');
  }

  lines.push('# NB: 5.23-hex er koefficientens råværdi til parameter-RAM (value × 2^23).');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadHypex(
  design: DesignState,
  drivers: Driver[],
  projectName: string,
  sampleRate = 48000,
): void {
  downloadText(exportHypexText(design, drivers, projectName, sampleRate), `${projectName}-hypex.txt`);
}

export function downloadAdau(
  design: DesignState,
  drivers: Driver[],
  projectName: string,
  sampleRate = 48000,
): void {
  downloadText(exportAdauText(design, drivers, projectName, sampleRate), `${projectName}-adau.txt`);
}

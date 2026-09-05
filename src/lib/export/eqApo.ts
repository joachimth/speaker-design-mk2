// Equalizer APO config export (SPEC §9)
//
// Generates one config block per band for Equalizer APO (Windows).
// Crossover slopes are decomposed into cascaded 2nd-order sections using
// EqAPO's LPQ/HPQ filter types (low/high pass with explicit Q):
//
//   BW2 → 1 × Q 0.7071        LR2 → 1 × Q 0.5
//   BW4 → Q 0.5412 + Q 1.3066  LR4 → 2 × Q 0.7071
//   LR8 → 2 × (Q 0.5412 + Q 1.3066)
//
// 1st-order (6 dB/okt) has no native EqAPO GUI filter — it is emitted as a
// comment so the user can decide (EqAPO's plain LP/HP are 2nd order).
//
// Gain → "Preamp:", delay → "Delay:", polarity → "Copy: ch=-1*ch".
// EQ filters map 1:1 to PK/LS/HS (RBJ-compatible).

import type { DesignBand, Driver, CrossoverType } from '@/types';

const ROLE_CHANNEL_NAMES: Record<string, string> = {
  low: 'bass',
  mid: 'mid',
  mid2: 'mid2',
  high: 'treble',
};

/** Cascaded biquad Q values per crossover type (2nd-order sections) */
export function eqApoSectionQs(type: CrossoverType): number[] | null {
  switch (type) {
    case 'BW2': return [Math.SQRT1_2];
    case 'LR2': return [0.5];
    case 'BW4': return [0.5412, 1.3066];
    case 'LR4': return [Math.SQRT1_2, Math.SQRT1_2];
    case 'LR8': return [0.5412, 1.3066, 0.5412, 1.3066];
    case 'first_order':
    case 'BW1':
      return null; // 1st order — not representable as LPQ/HPQ
    default: return null;
  }
}

const XO_LABELS: Record<string, string> = {
  first_order: '1. ordens (6 dB/okt)',
  BW2: 'Butterworth 2. orden',
  LR2: 'Linkwitz-Riley 2. orden',
  BW4: 'Butterworth 4. orden',
  LR4: 'Linkwitz-Riley 4. orden',
  LR8: 'Linkwitz-Riley 8. orden',
};

function filterLines(kind: 'LPQ' | 'HPQ', fc: number, type: CrossoverType, startIndex: number): { lines: string[]; nextIndex: number } {
  const lines: string[] = [];
  let n = startIndex;
  const qs = eqApoSectionQs(type);
  if (qs === null) {
    lines.push(`# ${XO_LABELS[type] ?? type} ved ${fc} Hz kan ikke laves som LPQ/HPQ (1. ordens er ikke understøttet i EqAPO's GUI-filtre).`);
    lines.push(`# Brug en ekstern 6 dB/okt-løsning eller vælg BW2/LR2 i designet.`);
    return { lines, nextIndex: n };
  }
  for (const q of qs) {
    lines.push(`Filter ${n}: ON ${kind} Fc ${fc.toFixed(1)} Hz Q ${q.toFixed(4)}`);
    n++;
  }
  return { lines, nextIndex: n };
}

/**
 * Generate an Equalizer APO config text for the active bands.
 * Each band becomes a commented section — the user routes channels
 * themselves (EqAPO channel names depend on the device layout).
 */
export function exportEqAPO(
  bands: DesignBand[],
  ways: number,
  drivers: Driver[],
  projectName: string = 'speaker-design',
): string {
  const lines: string[] = [
    `# Equalizer APO konfiguration — ${projectName}`,
    `# Genereret af Speaker Design 4 All ${new Date().toISOString().slice(0, 10)}`,
    '#',
    '# HVER SEKTION = ÉN FORSTÆRKERKANAL i et aktivt system.',
    '# Erstat "Channel: L" med den fysiske udgang for vejen',
    '# (fx "Channel: L R" for stereo-bas eller kanalnavne fra dit lydkort).',
    '',
  ];

  const active = bands.slice(0, ways);
  active.forEach((band, i) => {
    const driver = drivers.find((d) => d.id === band.driverId);
    const chName = ROLE_CHANNEL_NAMES[band.role] ?? `way${i + 1}`;
    lines.push(`# ─── Vej ${i + 1}: ${chName.toUpperCase()}${driver ? ` — ${driver.manufacturer} ${driver.model}` : ''} ───`);
    lines.push(`Channel: L`);

    let idx = 1;

    // Polarity first (Copy with negative factor inverts)
    if (band.polarity === 180) {
      lines.push('Copy: L=-1*L');
    }

    // Gain
    if (band.gain !== 0) {
      lines.push(`Preamp: ${band.gain.toFixed(1)} dB`);
    }

    // Delay
    if (band.delay > 0) {
      lines.push(`Delay: ${band.delay.toFixed(2)} ms`);
    }

    // Highpass
    if (band.highpassFreq > 0 && i > 0) {
      const hp = filterLines('HPQ', band.highpassFreq, band.highpassType, idx);
      lines.push(...hp.lines);
      idx = hp.nextIndex;
    }

    // Lowpass
    if (band.lowpassFreq > 0 && band.lowpassFreq < 20000 && i < ways - 1) {
      const lp = filterLines('LPQ', band.lowpassFreq, band.lowpassType, idx);
      lines.push(...lp.lines);
      idx = lp.nextIndex;
    }

    // Per-band EQ
    for (const eq of band.eqFilters ?? []) {
      if (!eq.enabled) continue;
      const typeMap: Record<string, string> = { peaking: 'PK', low_shelf: 'LS', high_shelf: 'HS' };
      const apoType = typeMap[eq.kind];
      if (!apoType) continue;
      lines.push(`Filter ${idx}: ON ${apoType} Fc ${eq.freq.toFixed(1)} Hz Gain ${eq.gain.toFixed(1)} dB Q ${eq.q.toFixed(2)}`);
      idx++;
    }

    lines.push('');
  });

  return lines.join('\n');
}

export function downloadEqAPO(
  bands: DesignBand[],
  ways: number,
  drivers: Driver[],
  projectName: string = 'speaker-design',
): void {
  const text = exportEqAPO(bands, ways, drivers, projectName);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName}-eqapo.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

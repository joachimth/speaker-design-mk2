// CamillaDSP export: generate YAML configuration for CamillaDSP.
//
// CamillaDSP is an open-source DSP software that uses YAML config files
// with biquad filter definitions. This module exports the crossover
// and EQ filters as a CamillaDSP-compatible YAML.

import type { DesignBand, CrossoverType } from '@/types';
import { buildCrossoverFilter, buildEqBiquad, type BiquadCoeffs } from '@/lib/acoustic/crossover';

export interface CamillaDSPConfig {
  sampleRate: number;
  channels: {
    name: string;
    gain: number;
    delayMs: number;
    polarity: 0 | 180;
    biquads: BiquadCoeffs[];
  }[];
}

export function exportCamillaDSP(
  bands: DesignBand[],
  ways: 2 | 3 | 4,
  sampleRate: number = 48000,
): string {
  const config: CamillaDSPConfig = {
    sampleRate,
    channels: [],
  };

  // Channel names follow the band ROLE (a 2-way is bass/treble, not bass/mid)
  const roleNames: Record<string, string> = { low: 'bass', mid: 'mid', mid2: 'mid2', high: 'treble' };

  for (let i = 0; i < ways && i < bands.length; i++) {
    const band = bands[i]!;
    const biquads: BiquadCoeffs[] = [];

    // Highpass filter
    if (band.highpassFreq > 0) {
      const hp = buildCrossoverFilter(band.highpassType as CrossoverType, band.highpassFreq, true, sampleRate);
      // If the filter is cascaded (multiple biquad sections), export all
      if (hp.sections) {
        for (const section of hp.sections) {
          biquads.push(section);
        }
      }
    }

    // EQ filters
    const hasActiveXover = (band.lowpassFreq > 0 && band.lowpassFreq < 20000) || (band.highpassFreq > 0);
    if (hasActiveXover && band.eqFilters) {
      for (const eq of band.eqFilters) {
        if (!eq.enabled || eq.gain === 0) continue;
        const biquad = buildEqBiquad(eq.kind, eq.freq, eq.gain, eq.q, sampleRate);
        biquads.push(biquad);
      }
    }

    // Lowpass filter
    if (band.lowpassFreq > 0 && band.lowpassFreq < 20000) {
      const lp = buildCrossoverFilter(band.lowpassType as CrossoverType, band.lowpassFreq, false, sampleRate);
      if (lp.sections) {
        for (const section of lp.sections) {
          biquads.push(section);
        }
      }
    }

    config.channels.push({
      name: roleNames[band.role] ?? `ch${i}`,
      gain: band.gain,
      delayMs: band.delay,
      polarity: band.polarity,
      biquads,
    });
  }

  // Generate YAML
  let yaml = `# CamillaDSP configuration exported from Speaker Design 4 All\n`;
  yaml += `# Sample rate: ${sampleRate} Hz\n\n`;
  yaml += `devices:\n`;
  yaml += `  samplerate: ${sampleRate}\n`;
  yaml += `  chunksize: 1024\n\n`;
  yaml += `filters:\n`;

  for (const ch of config.channels) {
    for (let i = 0; i < ch.biquads.length; i++) {
      const bq = ch.biquads[i]!;
      yaml += `  ${ch.name}_biquad_${i + 1}:\n`;
      yaml += `    type: Biquad\n`;
      yaml += `    parameters:\n`;
      yaml += `      type: Generic\n`;
      yaml += `      a1: ${bq.a1}\n`;
      yaml += `      a2: ${bq.a2}\n`;
      yaml += `      b0: ${bq.b0}\n`;
      yaml += `      b1: ${bq.b1}\n`;
      yaml += `      b2: ${bq.b2}\n`;
    }
    // Gain
    if (ch.gain !== 0) {
      yaml += `  ${ch.name}_gain:\n`;
      yaml += `    type: Gain\n`;
      yaml += `    parameters:\n`;
      yaml += `      gain: ${ch.gain}\n`;
      yaml += `      inverted: ${ch.polarity === 180}\n`;
    }
    // Delay
    if (ch.delayMs > 0) {
      yaml += `  ${ch.name}_delay:\n`;
      yaml += `    type: Delay\n`;
      yaml += `    parameters:\n`;
      yaml += `      delay: ${(ch.delayMs / 1000).toFixed(6)}\n`;
      yaml += `      unit: seconds\n`;
    }
  }

  yaml += `\nmixers:\n`;
  yaml += `  crossover:\n`;
  yaml += `    type: Router\n`;
  yaml += `    channels:\n`;
  yaml += `      in: ${ways}\n`;
  yaml += `      out: ${ways}\n`;
  yaml += `    mapping:\n`;

  for (let i = 0; i < ways; i++) {
    yaml += `      - dest: ${i}\n`;
    yaml += `        sources:\n`;
    yaml += `          - channel: ${i}\n`;
    yaml += `            gain: 0\n`;
  }

  yaml += `\npipeline:\n`;
  for (let i = 0; i < ways; i++) {
    const ch = config.channels[i]!;
    yaml += `  - type: Filter\n`;
    yaml += `    channel: ${i}\n`;
    const names: string[] = [];
    for (let j = 0; j < ch.biquads.length; j++) {
      names.push(`${ch.name}_biquad_${j + 1}`);
    }
    if (ch.gain !== 0) names.push(`${ch.name}_gain`);
    if (ch.delayMs > 0) names.push(`${ch.name}_delay`);
    yaml += `    names: ${names.map((n) => `"${n}"`).join(', ')}\n`;
  }

  return yaml;
}

export function downloadCamillaDSP(
  bands: DesignBand[],
  ways: 2 | 3 | 4,
  sampleRate: number = 48000,
  projectName: string = 'speaker-design',
): void {
  const yaml = exportCamillaDSP(bands, ways, sampleRate);
  const blob = new Blob([yaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName.replace(/\s+/g, '-')}-camilladsp.yml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

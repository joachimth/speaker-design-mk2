// "Hvorfor ser det sådan ud?" — annotation layer (SPEC §7.4)
//
// Computes physically meaningful frequency markers for the active design so
// the response plot can explain itself: baffle step, edge diffraction,
// port/PR tuning, TL quarter-wave, horn length resonance, dipole peak,
// crossover points and F3. Pure module — no UI, fully testable.

import type { DesignState, Driver } from '@/types';

export interface DesignAnnotation {
  id: string;
  freqHz: number;
  /** Short marker label shown at the line */
  label: string;
  /** One-two sentence explanation in plain Danish */
  detail: string;
  kind: 'baffle' | 'diffraction' | 'port' | 'cabinet' | 'xo' | 'f3';
}

const C = 343; // speed of sound [m/s]

/**
 * Compute annotations for the active design.
 *
 * `effFb` is the effective port tuning (after the CabinetDesigner fallback
 * chain); `f3Hz` comes from designHealth metrics when available.
 */
export function designAnnotations(
  design: DesignState,
  _drivers: Driver[],
  opts: { f3Hz?: number | null; effFb?: number | null } = {},
): DesignAnnotation[] {
  const out: DesignAnnotation[] = [];

  // --- Baffle step + edge diffraction --------------------------------------
  const widthM = design.baffleWidth / 1000;
  if (widthM > 0.05) {
    const fBaffle = 115 / widthM;
    out.push({
      id: 'baffle-step',
      freqHz: fBaffle,
      label: 'Bafflestep',
      kind: 'baffle',
      detail:
        `Omkring ${fBaffle.toFixed(0)} Hz (115/bafflebredde ved ${design.baffleWidth} mm) går udstrålingen ` +
        'fra halvrum til fuldrum. Under overgangen taber on-axis-niveauet op til 6 dB — det er derfor kurven ' +
        'typisk falder mod bassen på en smal baffel.',
    });
    out.push({
      id: 'diffraction',
      freqHz: fBaffle * 2.6,
      label: 'Kantdiffraktion',
      kind: 'diffraction',
      detail:
        'Ripple på ±1-3 dB i dette område skyldes typisk refleksioner fra baflens kanter (kantdiffraktion). ' +
        'Større roundover-radius og asymmetrisk driverplacering udjævner det.',
    });
  }

  // --- Cabinet-specific markers --------------------------------------------
  const fb = opts.effFb ?? design.portFb;
  switch (design.cabinetType) {
    case 'ported': {
      if (fb && fb > 0) {
        out.push({
          id: 'port-tuning',
          freqHz: fb,
          label: `Port-tuning ${fb.toFixed(0)} Hz`,
          kind: 'port',
          detail:
            `Ved Fb = ${fb.toFixed(0)} Hz flytter porten arbejdet fra keglen (excursion-minimum). ` +
            'Under Fb falder outputtet stejlt (24 dB/oktav) og keglen mister portens aflastning — brug evt. subsonisk højpasfilter.',
        });
      }
      break;
    }
    case 'bandpass4': {
      const fbFront = design.bandpassParams?.fbFront;
      if (fbFront && fbFront > 0) {
        out.push({
          id: 'bp-tuning',
          freqHz: fbFront,
          label: `Frontkammer-tuning ${fbFront.toFixed(0)} Hz`,
          kind: 'port',
          detail:
            'Et 4. ordens bandpass spiller kun i et bånd omkring frontkammerets tuning — ' +
            'output-toppen ligger her, og responsen falder til begge sider.',
        });
      }
      break;
    }
    case 'passive_radiator': {
      const fp = design.prParams?.fp;
      if (fp && fp > 0) {
        out.push({
          id: 'pr-tuning',
          freqHz: fp,
          label: `PR-resonans ~${fp.toFixed(0)} Hz`,
          kind: 'port',
          detail:
            'Passivmembranen virker som en port uden strømningsstøj. Under systemtuningen har responsen ' +
            'et dybt hak (PR\u2019ens egen resonans) — stejlere rulning end en portet kasse.',
        });
      }
      break;
    }
    case 'transmission_line': {
      const lengthM = design.tlParams?.lengthM;
      if (lengthM && lengthM > 0) {
        const fQw = C / (4 * lengthM);
        out.push({
          id: 'tl-quarterwave',
          freqHz: fQw,
          label: `TL ¼-bølge ${fQw.toFixed(0)} Hz`,
          kind: 'cabinet',
          detail:
            `Linjens kvartbølgeresonans c/(4·${lengthM.toFixed(1)} m) forstærker outputtet omkring ${fQw.toFixed(0)} Hz. ` +
            'Ulige multipla (3×, 5×) giver ripple højere oppe — dæmpningsmateriale udjævner dem.',
        });
      }
      break;
    }
    case 'horn': {
      const lengthM = design.hornParams?.lengthM;
      if (lengthM && lengthM > 0) {
        const fLen = C / (4 * lengthM);
        out.push({
          id: 'horn-length',
          freqHz: fLen,
          label: `Hornlængde ~${fLen.toFixed(0)} Hz`,
          kind: 'cabinet',
          detail:
            `Hornets længde (${lengthM.toFixed(1)} m) sætter den nederste grænse omkring c/4L ≈ ${fLen.toFixed(0)} Hz. ` +
            'Er mundarealet for lille i forhold til bølgelængden, kommer der ripple over grænsen.',
        });
      }
      break;
    }
    case 'open_baffle': {
      if (widthM > 0.05) {
        const fDipole = C / (2 * widthM);
        out.push({
          id: 'dipole-peak',
          freqHz: fDipole,
          label: `Dipol-peak ${fDipole.toFixed(0)} Hz`,
          kind: 'cabinet',
          detail:
            `En åben baffel har sit dipol-maksimum ved c/(2·bredde) ≈ ${fDipole.toFixed(0)} Hz. ` +
            'Under det falder responsen 6 dB/oktav (akustisk kortslutning); over det kommer dybe kamfilter-nuller.',
        });
      }
      break;
    }
    default:
      break;
  }

  // --- Crossover points -----------------------------------------------------
  const active = design.bands.slice(0, design.ways);
  for (let i = 0; i < active.length - 1; i++) {
    const lp = active[i]?.lowpassFreq ?? 0;
    const hp = active[i + 1]?.highpassFreq ?? 0;
    if (lp > 0 && hp > 0) {
      const fXo = Math.sqrt(lp * hp);
      out.push({
        id: `xo-${i}`,
        freqHz: fXo,
        label: `Delefrekvens ${fXo.toFixed(0)} Hz`,
        kind: 'xo',
        detail:
          `Overgang mellem vej ${i + 1} og vej ${i + 2} (${active[i]?.lowpassType} LP ${lp.toFixed(0)} Hz / ` +
          `${active[i + 1]?.highpassType} HP ${hp.toFixed(0)} Hz). Små dyk eller pukler her kommer typisk fra ` +
          'faseforskel mellem enhederne — tjek reverse-null-testen i Delefilter.',
      });
    }
  }

  // --- F3 --------------------------------------------------------------------
  if (opts.f3Hz && opts.f3Hz > 0) {
    out.push({
      id: 'f3',
      freqHz: opts.f3Hz,
      label: `F3 ${opts.f3Hz.toFixed(0)} Hz`,
      kind: 'f3',
      detail:
        `Her er systemet faldet 3 dB under referenceniveauet — den praktiske nedre grænse. ` +
        'Rummets trykstøtte (room gain) løfter typisk 2-4 dB under 40 Hz i almindelige rum.',
    });
  }

  return out.sort((a, b) => a.freqHz - b.freqHz);
}

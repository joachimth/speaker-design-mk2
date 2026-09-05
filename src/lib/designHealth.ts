// Design health evaluation (SPEC §7.4 — design-dashboard)
//
// Aggregates all actionable warnings from the real engine simulations into
// one place, computes a status badge (Klar / Kræver opmærksomhed / Ikke
// realiserbar) and headline metrics (F3, maks-SPL, score).
//
// Every warning carries an optional declarative `apply` action so the
// dashboard can offer an "Anvend" button (SPEC: handlingsorienterede
// advarsler). Actions are plain data — the UI maps them to store calls and
// can undo them. This module stays UI-free and fully testable.

import type { DesignState, Driver, ThieleSmallParams } from '@/types';
import { simulateSealedBox } from '@/engine/enclosure/sealed';
import {
  simulateVentedBox,
  portLengthForTuning,
  PORT_VELOCITY_RECOMMENDED,
  PORT_VELOCITY_CHUFFING,
} from '@/engine/enclosure/vented';
import { simulatePassiveRadiator } from '@/engine/enclosure/passiveRadiator';
import { simulateBandpass4 } from '@/engine/enclosure/bandpass';
import { simulateHorn } from '@/engine/enclosure/horn';
import { simulateTransmissionLine } from '@/engine/enclosure/transmissionLine';
import { ventedAlignments, tuningForVolume } from '@/engine/enclosure/alignments';
import { maxSplFromSimulation } from '@/engine/maxSpl';
import { checkTsConsistency } from '@/engine/driver';
import { scoreDriverInBox } from '@/engine/score';
import { simulateOnAxis } from '@/lib/acoustic/simulateBands';
import { driverQuality } from '@/lib/acoustic/frdZma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DesignStatus = 'ready' | 'attention' | 'not_viable';

export type HealthAction =
  | { kind: 'setPort'; patch: { fb?: number | null; vb?: number | null; diameter?: number; numPorts?: number } }
  | { kind: 'updateDesign'; patch: Partial<DesignState> };

export interface HealthWarning {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  /** Which page fixes this manually */
  page?: '/cabinet' | '/crossover' | '/drivers' | '/system';
  apply?: {
    label: string;
    action: HealthAction;
  };
}

export interface DesignHealthMetrics {
  /** -3 dB point of the summed on-axis response [Hz] */
  f3Hz: number | null;
  /** Bass-region max SPL (min of the limit curve 50–250 Hz) [dB] */
  maxSplDb: number | null;
  /** Driver-in-box score 0–100 (sealed/ported only) */
  score: number | null;
  /** e.g. "32 L ported · Fb 33 Hz" */
  cabinetSummary: string;
  bassDriverName: string | null;
  /** Reference power used for the checks [W] */
  powerW: number;
}

export interface DesignHealth {
  status: DesignStatus;
  statusLabel: string;
  statusReason: string;
  metrics: DesignHealthMetrics;
  warnings: HealthWarning[];
}

export const STATUS_LABELS: Record<DesignStatus, string> = {
  ready: 'Klar til byggeri',
  attention: 'Kræver opmærksomhed',
  not_viable: 'Ikke realiserbar',
};

const CABINET_LABELS: Record<string, string> = {
  sealed: 'Lukket',
  ported: 'Ported (basrefleks)',
  passive_radiator: 'Passiv slave',
  bandpass4: 'Bandpass (4. orden)',
  transmission_line: 'Transmissionslinje',
  horn: 'Horn',
  open_baffle: 'Open baffle',
};

function logFreqs(f0: number, f1: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(f0 * Math.pow(f1 / f0, i / (n - 1)));
  return out;
}

function hasBassTs(ts: ThieleSmallParams | undefined): ts is ThieleSmallParams {
  return !!ts && !!ts.fs && !!ts.qts && !!ts.vas && !!ts.sd;
}

/** Peak value of arr restricted to freqs within [fLo, fHi] */
function peakInBand(freqs: number[], arr: number[], fLo: number, fHi: number): { value: number; freq: number } {
  let value = -Infinity;
  let freq = fLo;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! < fLo || freqs[i]! > fHi) continue;
    if (arr[i]! > value) {
      value = arr[i]!;
      freq = freqs[i]!;
    }
  }
  return { value, freq };
}

function minInBand(freqs: number[], arr: number[], fLo: number, fHi: number): number {
  let v = Infinity;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! < fLo || freqs[i]! > fHi) continue;
    if (arr[i]! < v) v = arr[i]!;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Main evaluation
// ---------------------------------------------------------------------------

export function evaluateDesign(
  design: DesignState,
  drivers: Driver[],
  opts: { powerW?: number } = {},
): DesignHealth {
  const powerW = opts.powerW ?? 20;
  const warnings: HealthWarning[] = [];

  const activeBands = design.bands.slice(0, design.ways);
  const bandDrivers = activeBands.map((b) => drivers.find((d) => d.id === b.driverId));

  // --- 1. Structural checks (errors → Ikke realiserbar) --------------------
  const ROLE_LABELS: Record<string, string> = { low: 'Bas', mid: 'Mellem', mid2: 'Mellem 2', high: 'Diskant' };
  activeBands.forEach((band, i) => {
    if (!bandDrivers[i]) {
      warnings.push({
        id: `missing-driver-${i}`,
        severity: 'error',
        title: `${ROLE_LABELS[band.role] ?? `Vej ${i + 1}`}-vejen mangler en enhed`,
        detail: 'Vælg en driver til vejen før designet kan simuleres og bygges.',
        page: '/crossover',
      });
    }
  });

  const bassDriver = bandDrivers[0];
  const ts = bassDriver?.tsParams;

  if (bassDriver && !hasBassTs(ts)) {
    warnings.push({
      id: 'missing-ts',
      severity: 'error',
      title: 'Bas-enheden mangler T/S-parametre',
      detail: 'Fs, Qts, Vas og Sd kræves for kabinetsimuleringen. Udfyld dem under Enheder.',
      page: '/drivers',
    });
  }

  // Effective box values — mirrors CabinetDesigner's fallback chain
  const qb3 = hasBassTs(ts) ? ventedAlignments(ts)[0] : undefined;
  const effVb = design.portVb ?? qb3?.vbL ?? 30;
  const effFb = design.portFb ?? qb3?.fbHz ?? (hasBassTs(ts) ? tuningForVolume(ts, effVb) : 35);

  if (effVb <= 0) {
    warnings.push({
      id: 'invalid-volume',
      severity: 'error',
      title: 'Kabinetvolumen er ugyldigt',
      detail: `Vb = ${effVb} L. Sæt et positivt volumen i Kabinetdesign.`,
      page: '/cabinet',
    });
  }

  // --- 2. Cabinet-type specific checks (real engine sims) ------------------
  const freqs = logFreqs(10, 2000, 200);
  const voltage = hasBassTs(ts) ? Math.sqrt(powerW * (ts.imp || 8)) : 2.83;
  let maxSplDb: number | null = null;
  let cabinetSummary = CABINET_LABELS[design.cabinetType] ?? design.cabinetType;

  if (hasBassTs(ts) && effVb > 0) {
    const xmax = ts.xmax || 5;
    try {
      switch (design.cabinetType) {
        case 'sealed': {
          const sim = simulateSealedBox(ts, effVb, freqs, { voltage });
          cabinetSummary = `${effVb.toFixed(0)} L lukket · Qtc ${sim.qtc.toFixed(2)}`;
          const exc = peakInBand(freqs, sim.excursionMm, 20, 200);
          if (exc.value > xmax) {
            warnings.push({
              id: 'sealed-excursion',
              severity: 'warning',
              title: `Excursion ${exc.value.toFixed(1)} mm over Xmax (${xmax} mm) ved ${exc.freq.toFixed(0)} Hz`,
              detail: `Ved ${powerW} W overskrider keglen Xmax. Reducér effekten, brug højpasfilter, eller vælg større kabinet.`,
              page: '/cabinet',
            });
          }
          if (sim.qtc > 1.1) {
            const vbFor0707 = ts.vas / (Math.pow(0.707 / ts.qts, 2) - 1);
            if (vbFor0707 > 0 && Number.isFinite(vbFor0707)) {
              warnings.push({
                id: 'sealed-qtc-high',
                severity: 'warning',
                title: `Qtc ${sim.qtc.toFixed(2)} er høj — buldrende bas`,
                detail: `Kassen er lille for enheden. Qtc 0,707 (Butterworth) kræver ca. ${vbFor0707.toFixed(0)} L.`,
                page: '/cabinet',
                apply: {
                  label: `Anvend: Vb = ${vbFor0707.toFixed(0)} L (Qtc 0,707)`,
                  action: { kind: 'setPort', patch: { vb: Math.round(vbFor0707 * 10) / 10 } },
                },
              });
            }
          }
          maxSplDb = bassMaxSpl(freqs, sim.spl, sim.excursionMm, ts);
          break;
        }

        case 'ported': {
          const perPortAreaCm2 = Math.PI * Math.pow(design.portDiameter / 2 / 10, 2);
          const totalAreaM2 = (perPortAreaCm2 * design.numPorts) / 1e4;
          const portLenM = portLengthForTuning(effFb, effVb / 1e3, totalAreaM2);
          const sim = simulateVentedBox(ts, effVb, perPortAreaCm2, portLenM * 1000, freqs, {
            voltage,
            portCount: design.numPorts,
          });
          cabinetSummary = `${effVb.toFixed(0)} L ported · Fb ${effFb.toFixed(0)} Hz · port ${design.numPorts}×⌀${design.portDiameter} mm`;

          const vel = peakInBand(freqs, sim.portVelocity, 15, 300);
          if (vel.value > PORT_VELOCITY_RECOMMENDED) {
            const isChuffing = vel.value > PORT_VELOCITY_CHUFFING;
            // Area scale to bring the peak down to ~9 m/s, diameter in 5 mm steps
            const scale = vel.value / 9;
            const newDiameter = Math.ceil((design.portDiameter * Math.sqrt(scale)) / 5) * 5;
            warnings.push({
              id: 'port-velocity',
              severity: 'warning',
              title: `Porthastighed ${vel.value.toFixed(1)} m/s ved ${vel.freq.toFixed(0)} Hz${isChuffing ? ' — hørbar chuffing' : ''}`,
              detail: isChuffing
                ? `Over ${PORT_VELOCITY_CHUFFING} m/s giver hørbar portstøj ved ${powerW} W. Større portareal kræves.`
                : `Over de anbefalede ${PORT_VELOCITY_RECOMMENDED} m/s ved ${powerW} W. Overvej større port.`,
              page: '/cabinet',
              apply: {
                label: `Anvend: port ⌀${newDiameter} mm`,
                action: { kind: 'setPort', patch: { diameter: newDiameter } },
              },
            });
          }

          const exc = peakInBand(freqs, sim.excursionMm, 15, 200);
          if (exc.value > xmax) {
            warnings.push({
              id: 'ported-excursion',
              severity: 'warning',
              title: `Excursion ${exc.value.toFixed(1)} mm over Xmax (${xmax} mm) ved ${exc.freq.toFixed(0)} Hz`,
              detail: `Typisk under Fb hvor porten aflaster ikke keglen. Brug subsonisk højpasfilter eller reducér effekten (${powerW} W).`,
              page: '/cabinet',
            });
          }

          maxSplDb = bassMaxSpl(freqs, sim.spl, sim.excursionMm, ts);
          break;
        }

        case 'passive_radiator': {
          if (!design.prParams) {
            warnings.push(configureFirst('pr-unconfigured', 'Passiv slave er ikke konfigureret', 'Åbn Kabinetdesign og sæt PR-parametre (Vb, Fp, Sd, Vap).'));
            break;
          }
          const p = design.prParams;
          const sim = simulatePassiveRadiator(ts, p.vb, p, freqs, voltage);
          cabinetSummary = `${p.vb.toFixed(0)} L + passiv slave · tuning ${sim.fbActual.toFixed(0)} Hz`;
          if (!sim.prDisplacementOk) {
            warnings.push({
              id: 'pr-displacement',
              severity: 'warning',
              title: 'PR-membranen er for lille (< 2× driverens Vd)',
              detail: 'SPEC §4.4: den passive slave skal kunne flytte mindst dobbelt så meget luft som driveren. Øg PR-areal eller Xmax.',
              page: '/cabinet',
              apply: {
                label: `Anvend: øg PR-areal til ${Math.round(p.sdp * 1.4)} cm²`,
                action: { kind: 'updateDesign', patch: { prParams: { ...p, sdp: Math.round(p.sdp * 1.4) } } },
              },
            });
          }
          const exc = peakInBand(freqs, sim.excursionMm, 15, 200);
          if (exc.value > xmax) {
            warnings.push({
              id: 'pr-excursion',
              severity: 'warning',
              title: `Excursion ${exc.value.toFixed(1)} mm over Xmax (${xmax} mm)`,
              detail: `Ved ${powerW} W. Reducér effekt eller brug højpasfilter under ${sim.fbActual.toFixed(0)} Hz.`,
              page: '/cabinet',
            });
          }
          maxSplDb = bassMaxSpl(freqs, sim.spl, sim.excursionMm, ts);
          break;
        }

        case 'bandpass4': {
          if (!design.bandpassParams) {
            warnings.push(configureFirst('bp-unconfigured', 'Bandpass er ikke konfigureret', 'Åbn Kabinetdesign og sæt kammervoluminer og porttuning.'));
            break;
          }
          const p = design.bandpassParams;
          const areaCm2 = Math.PI * Math.pow(p.portDiameter / 2 / 10, 2) * p.numPorts;
          const lenM = portLengthForTuning(p.fbFront, p.vFront / 1000, areaCm2 / 1e4);
          const sim = simulateBandpass4(ts, p.vRear, p.vFront, areaCm2, lenM * 1000, freqs, voltage);
          cabinetSummary = `Bandpass ${p.vRear.toFixed(0)}+${p.vFront.toFixed(0)} L · Fb ${sim.fbFront.toFixed(0)} Hz`;
          const vel = peakInBand(freqs, sim.portVelocity, 15, 300);
          if (vel.value > PORT_VELOCITY_RECOMMENDED) {
            const newDiameter = Math.ceil((p.portDiameter * Math.sqrt(vel.value / 9)) / 5) * 5;
            warnings.push({
              id: 'bp-port-velocity',
              severity: 'warning',
              title: `Porthastighed ${vel.value.toFixed(1)} m/s${vel.value > PORT_VELOCITY_CHUFFING ? ' — hørbar chuffing' : ''}`,
              detail: `Bandpass-porte bærer hele outputtet — hold hastigheden under ${PORT_VELOCITY_RECOMMENDED} m/s.`,
              page: '/cabinet',
              apply: {
                label: `Anvend: port ⌀${newDiameter} mm`,
                action: { kind: 'updateDesign', patch: { bandpassParams: { ...p, portDiameter: newDiameter } } },
              },
            });
          }
          maxSplDb = bassMaxSpl(freqs, sim.spl, sim.excursionMm, ts);
          break;
        }

        case 'horn': {
          if (!design.hornParams) {
            warnings.push(configureFirst('horn-unconfigured', 'Hornet er ikke konfigureret', 'Åbn Kabinetdesign og sæt hals/mund-areal, længde og bagkammer.'));
            break;
          }
          const p = design.hornParams;
          const sim = simulateHorn(ts, p, freqs, voltage);
          cabinetSummary = `${p.topology === 'back' ? 'Back-loaded' : 'Front-loaded'} horn · fc ${sim.cutoffHz.toFixed(0)} Hz`;
          if (sim.mouthTooSmall) {
            const lambdaFc = 343 / Math.max(sim.cutoffHz, 1);
            const mouthTargetCm2 = Math.round(((lambdaFc * lambdaFc) / (4 * Math.PI)) * 1e4);
            warnings.push({
              id: 'horn-mouth',
              severity: 'warning',
              title: `Hornmunden er for lille til fc ${sim.cutoffHz.toFixed(0)} Hz`,
              detail: `Mundens omkreds bør nå én bølgelængde ved fc (SPEC §4.7) — ellers ripple og tab. Kræver ca. ${mouthTargetCm2} cm².`,
              page: '/cabinet',
              apply: {
                label: `Anvend: mund ${mouthTargetCm2} cm²`,
                action: { kind: 'updateDesign', patch: { hornParams: { ...p, mouthAreaCm2: mouthTargetCm2 } } },
              },
            });
          }
          maxSplDb = bassMaxSpl(freqs, sim.spl, sim.excursionMm, ts);
          break;
        }

        case 'transmission_line': {
          if (!design.tlParams) {
            warnings.push(configureFirst('tl-unconfigured', 'Transmissionslinjen er ikke konfigureret', 'Åbn Kabinetdesign og sæt linjelængde, tværsnit og fyld.'));
            break;
          }
          const p = design.tlParams;
          const sim = simulateTransmissionLine(
            ts,
            [{ length: p.lengthM, areaStart: p.areaStartCm2 / 1e4, areaEnd: p.areaEndCm2 / 1e4, stuffingDensity: p.stuffingDensity }],
            freqs,
            { driverOffsetFraction: p.driverOffsetFraction, voltage },
          );
          cabinetSummary = `TL ${p.lengthM.toFixed(2)} m · ¼λ ${sim.fQuarterWave.toFixed(0)} Hz`;
          if (p.stuffingDensity < 3) {
            warnings.push({
              id: 'tl-stuffing',
              severity: 'warning',
              title: `TL-fyld ${p.stuffingDensity} kg/m³ er for lidt`,
              detail: 'Uden dæmpning giver linjen dybe kamfilter-nuller ved lige multipla af kvartbølgen. 8–12 kg/m³ er typisk.',
              page: '/cabinet',
              apply: {
                label: 'Anvend: 10 kg/m³ fyld',
                action: { kind: 'updateDesign', patch: { tlParams: { ...p, stuffingDensity: 10 } } },
              },
            });
          }
          const exc = peakInBand(freqs, sim.excursionMm, 15, 200);
          if (exc.value > xmax) {
            warnings.push({
              id: 'tl-excursion',
              severity: 'warning',
              title: `Excursion ${exc.value.toFixed(1)} mm over Xmax (${xmax} mm)`,
              detail: `Ved ${powerW} W. Reducér effekt eller flyt højpasfilteret op.`,
              page: '/cabinet',
            });
          }
          maxSplDb = bassMaxSpl(freqs, sim.spl, sim.excursionMm, ts);
          break;
        }

        case 'open_baffle': {
          cabinetSummary = `Open baffle · ${design.baffleWidth} mm baffel`;
          const fEq = 343000 / (2 * design.baffleWidth);
          warnings.push({
            id: 'ob-info',
            severity: 'info',
            title: `Dipol-tab under ${fEq.toFixed(0)} Hz (6 dB/okt)`,
            detail: 'Open baffle mister bas under dipol-frekvensen — kompensér med EQ eller stor baffel. Excursion stiger tilsvarende.',
            page: '/cabinet',
          });
          break;
        }
      }
    } catch {
      warnings.push({
        id: 'sim-failed',
        severity: 'error',
        title: 'Kabinetsimuleringen fejlede',
        detail: 'Tjek at alle kabinetparametre er udfyldt med gyldige værdier.',
        page: '/cabinet',
      });
    }
  }

  // --- 3. Driver data quality + T/S consistency (info) ---------------------
  bandDrivers.forEach((d, i) => {
    if (!d) return;
    const q = driverQuality(d);
    if (q.flag === 'C') {
      warnings.push({
        id: `quality-${i}`,
        severity: 'info',
        title: `${d.manufacturer} ${d.model}: datakvalitet C`,
        detail: q.reason + ' Importér FRD/ZMA-målinger under Enheder for bedre præcision.',
        page: '/drivers',
      });
    }
    if (d.tsParams) {
      const issues = checkTsConsistency(d.tsParams);
      if (issues.length > 0) {
        warnings.push({
          id: `ts-consistency-${i}`,
          severity: 'info',
          title: `${d.manufacturer} ${d.model}: T/S-parametre er ikke selvkonsistente`,
          detail: issues
            .map((iss) => `${iss.field.toUpperCase()} afviger ${iss.deviationPct.toFixed(0)} %`)
            .join(', ') + '. Typisk afrundede datablads-tal.',
          page: '/drivers',
        });
      }
    }
  });

  // --- 4. Crossover sanity (info) ------------------------------------------
  for (let i = 0; i < activeBands.length - 1; i++) {
    const lp = activeBands[i]!.lowpassFreq;
    const hp = activeBands[i + 1]!.highpassFreq;
    if (!lp || !hp || lp <= 0 || hp <= 0) continue;
    const ratio = hp / lp;
    if (ratio > 1.4) {
      warnings.push({
        id: `xo-gap-${i}`,
        severity: 'info',
        title: `Muligt hul mellem vej ${i + 1} og ${i + 2} (${lp.toFixed(0)} → ${hp.toFixed(0)} Hz)`,
        detail: 'Lavpas og højpas ligger langt fra hinanden — tjek summen i Delefilter.',
        page: '/crossover',
      });
    } else if (ratio < 0.7) {
      warnings.push({
        id: `xo-overlap-${i}`,
        severity: 'info',
        title: `Stort overlap mellem vej ${i + 1} og ${i + 2} (${lp.toFixed(0)} ← ${hp.toFixed(0)} Hz)`,
        detail: 'Begge veje spiller bredt i samme område — det kan give lobing og ujævn sum.',
        page: '/crossover',
      });
    }
  }

  // --- 5. Headline metrics ---------------------------------------------------
  let f3Hz: number | null = null;
  const validBands = activeBands.filter((_, i) => !!bandDrivers[i]);
  if (validBands.length > 0 && hasBassTs(ts)) {
    try {
      const sysFreqs = logFreqs(20, 20000, 240);
      const summed = simulateOnAxis(
        validBands, drivers, sysFreqs,
        design.baffleWidth, design.baffleHeight,
        design.cabinetType, effFb, effVb, design.portDiameter, design.numPorts,
      );
      // Reference = median in 300–3000 Hz, then walk down from 300 Hz
      const refVals = summed.filter((p) => p.freq >= 300 && p.freq <= 3000).map((p) => p.magnitude).sort((a, b) => a - b);
      if (refVals.length > 0) {
        const ref = refVals[Math.floor(refVals.length / 2)]!;
        for (let i = summed.length - 1; i >= 0; i--) {
          const p = summed[i]!;
          if (p.freq > 300) continue;
          if (p.magnitude < ref - 3) {
            f3Hz = p.freq;
            break;
          }
        }
        if (f3Hz === null) f3Hz = 20; // never dropped below ref-3 in range
      }
    } catch {
      f3Hz = null;
    }
  }

  let score: number | null = null;
  if (bassDriver && hasBassTs(ts) && (design.cabinetType === 'sealed' || design.cabinetType === 'ported')) {
    try {
      const s = scoreDriverInBox(
        bassDriver,
        { type: design.cabinetType, vbL: effVb, fbHz: design.cabinetType === 'ported' ? effFb : undefined },
        { bassDepth: 0.5, maxSpl: 0.5, allowPorted: design.cabinetType === 'ported' },
      );
      score = s ? Math.round(s.total) : null;
    } catch {
      score = null;
    }
  }

  // --- 6. Status -------------------------------------------------------------
  const hasError = warnings.some((w) => w.severity === 'error');
  const hasWarning = warnings.some((w) => w.severity === 'warning');
  const status: DesignStatus = hasError ? 'not_viable' : hasWarning ? 'attention' : 'ready';
  const firstIssue = warnings.find((w) => w.severity === (hasError ? 'error' : 'warning'));
  const statusReason = hasError || hasWarning
    ? firstIssue!.title
    : `Ingen advarsler ved ${powerW} W referenceeffekt.`;

  return {
    status,
    statusLabel: STATUS_LABELS[status],
    statusReason,
    metrics: {
      f3Hz,
      maxSplDb,
      score,
      cabinetSummary,
      bassDriverName: bassDriver ? `${bassDriver.manufacturer} ${bassDriver.model}` : null,
      powerW,
    },
    warnings,
  };
}

/** Bass-region max SPL: min of the displacement/thermal limit curve 50–250 Hz. */
function bassMaxSpl(freqs: number[], spl: number[], excursionMm: number[], ts: ThieleSmallParams): number | null {
  try {
    const res = maxSplFromSimulation(freqs, spl, excursionMm, ts);
    const v = minInBand(freqs, res.maxSpl, 50, 250);
    return Number.isFinite(v) ? Math.round(v) : null;
  } catch {
    return null;
  }
}

function configureFirst(id: string, title: string, detail: string): HealthWarning {
  return { id, severity: 'info', title, detail, page: '/cabinet' };
}

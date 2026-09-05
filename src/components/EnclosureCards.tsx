// Cards for the advanced cabinet types (SPEC §4.4–§4.7) + the vented
// alignment picker (SPEC §4.4 startpunkter). All cards run the REAL
// lumped-element / T-matrix models from engine/enclosure and persist their
// parameters in the design store so they survive save/load.

import { useMemo, useState } from 'react'
import { Card, NumberInput, StatCard, Button, Select } from '@/components/common/UI'
import { ResponsivePlot } from '@/components/charts/ResponsivePlot'
import { useDesignStore } from '@/store/designStore'
import { ventedAlignments, optimizeVentedFlat } from '@/engine/enclosure/alignments'
import { simulatePassiveRadiator } from '@/engine/enclosure/passiveRadiator'
import { simulateBandpass4 } from '@/engine/enclosure/bandpass'
import { simulateHorn } from '@/engine/enclosure/horn'
import { simulateTransmissionLine, quarterWaveLength } from '@/engine/enclosure/transmissionLine'
import { portLengthForTuning, PORT_VELOCITY_RECOMMENDED, PORT_VELOCITY_CHUFFING } from '@/engine/enclosure/vented'
import type {
  Driver,
  PassiveRadiatorParams,
  Bandpass4Params,
  HornDesignParams,
  TLDesignParams,
} from '@/types'

function logFreqs(f0: number, f1: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(f0 * Math.pow(f1 / f0, i / (n - 1)))
  return out
}

const FREQS = logFreqs(10, 2000, 220)

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-md p-3 text-sm text-amber-800 dark:text-amber-200">
      {children}
    </div>
  )
}

function PowerInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <NumberInput label="Effekt" unit="W" value={value} min={1} max={500} onChange={onChange} />
  )
}

// ---------------------------------------------------------------------------
// Vented alignment picker (SPEC §4.4): QB3/SBB4/B4/EBS + numeric flat
// ---------------------------------------------------------------------------

export function AlignmentPickerCard({
  driver,
  currentVb,
  currentFb,
  onApply,
}: {
  driver: Driver
  currentVb: number
  currentFb: number
  onApply: (vbL: number, fbHz: number) => void
}) {
  const ts = driver.tsParams
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const alignments = useMemo(() => (ts ? ventedAlignments(ts) : []), [ts])
  if (!ts) return null

  function applyNumeric() {
    setBusy(true)
    // Let the button render its busy state before the ~100 ms optimization
    setTimeout(() => {
      const r = optimizeVentedFlat(ts!)
      onApply(Math.round(r.vbL * 10) / 10, Math.round(r.fbHz * 10) / 10)
      setNote(
        `Numerisk optimeret på den fulde model: F3 ≈ ${r.f3.toFixed(1)} Hz, puk ${r.humpDb.toFixed(1)} dB (${r.evaluations} simuleringer).`,
      )
      setBusy(false)
    }, 30)
  }

  return (
    <Card title="Alignment-startpunkter">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {alignments.map((a) => {
          const active =
            Math.abs(a.vbL - currentVb) / Math.max(a.vbL, 0.1) < 0.03 &&
            Math.abs(a.fbHz - currentFb) / Math.max(a.fbHz, 0.1) < 0.03
          return (
            <button
              key={a.id}
              onClick={() => {
                onApply(Math.round(a.vbL * 10) / 10, Math.round(a.fbHz * 10) / 10)
                setNote(a.note)
              }}
              className={`px-2 py-2 rounded-md text-left border transition-colors ${
                active
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-brand-400'
              } ${a.applicable ? '' : 'opacity-50'}`}
              title={a.note}
            >
              <div className="text-sm font-semibold">{a.label}</div>
              <div className="text-xs text-gray-500">
                {a.vbL.toFixed(1)} L / {a.fbHz.toFixed(1)} Hz
              </div>
              {!a.applicable && <div className="text-[10px] text-amber-600">uden for Qts-vindue</div>}
            </button>
          )
        })}
        <button
          onClick={applyNumeric}
          disabled={busy}
          className="px-2 py-2 rounded-md text-left border border-gray-200 dark:border-gray-700 hover:border-brand-400 transition-colors"
        >
          <div className="text-sm font-semibold">{busy ? 'Optimerer…' : 'Numerisk flat'}</div>
          <div className="text-xs text-gray-500">Nelder–Mead på fuld model</div>
        </button>
      </div>
      {note && <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">{note}</p>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Passive radiator (SPEC §4.4)
// ---------------------------------------------------------------------------

export function PassiveRadiatorCard({ driver }: { driver: Driver }) {
  const ts = driver.tsParams
  const { design, updateDesign } = useDesignStore()
  const [powerW, setPowerW] = useState(20)

  const seed: PassiveRadiatorParams = useMemo(() => {
    const vbSealed =
      ts && ts.qts < 0.65 ? ts.vas / (Math.pow(0.707 / ts.qts, 2) - 1) : (ts?.vas ?? 20)
    return {
      vb: Math.round(Math.max(vbSealed * 1.3, 3) * 10) / 10,
      fp: Math.round((ts?.fs ?? 40) * 0.7),
      sdp: Math.round((ts?.sd ?? 100) * 1.4),
      vap: Math.round(Math.max(vbSealed * 1.3, 3) * 1.2 * 10) / 10,
      qmp: 5,
      xmaxPr: Math.round(((ts?.xmax ?? 4) * 1.6) * 10) / 10,
    }
  }, [ts])

  const p = design.prParams ?? seed
  const set = (patch: Partial<PassiveRadiatorParams>) =>
    updateDesign({ prParams: { ...p, ...patch } })

  const sim = useMemo(() => {
    if (!ts) return null
    const voltage = Math.sqrt(powerW * (ts.imp || 8))
    return simulatePassiveRadiator(ts, p.vb, p, FREQS, voltage)
  }, [ts, p, powerW])

  if (!ts || !sim) return null

  const xmax = ts.xmax || 5
  const end = FREQS.length - 1

  return (
    <Card title="Passiv slave (PR)">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <NumberInput label="Vb (volumen)" unit="L" value={p.vb} min={1} onChange={(v) => set({ vb: v })} />
        <NumberInput label="PR fp (m. masse)" unit="Hz" value={p.fp} min={5} onChange={(v) => set({ fp: v })} />
        <NumberInput label="PR Sd" unit="cm²" value={p.sdp} min={10} onChange={(v) => set({ sdp: v })} />
        <NumberInput label="PR Vap" unit="L" value={p.vap} min={1} onChange={(v) => set({ vap: v })} />
        <NumberInput label="PR Qmp" value={p.qmp} min={1} max={15} onChange={(v) => set({ qmp: v })} />
        <NumberInput label="PR Xmax" unit="mm" value={p.xmaxPr} min={1} onChange={(v) => set({ xmaxPr: v })} />
        <PowerInput value={powerW} onChange={setPowerW} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        <StatCard label="Systemtuning Fb" value={sim.fbActual.toFixed(1)} unit="Hz" />
        <StatCard label="PR-notch" value={sim.notchFreq.toFixed(1)} unit="Hz" />
        <StatCard label="PR Vd ≥ 2× driver" value={sim.prDisplacementOk ? 'OK' : 'NEJ'} />
      </div>

      {!sim.prDisplacementOk && (
        <div className="mt-3">
          <Warning>
            PR'ens displacement-volumen er under 2× driverens (SPEC §4.4). Vælg en PR med større
            Sd eller Xmax — ellers begrænser slaven systemets maks-SPL.{' '}
            <button
              className="underline font-medium"
              onClick={() => set({ sdp: Math.round(((2.2 * (ts.sd || 100) * xmax) / p.xmaxPr) * 10) / 10 })}
            >
              Anvend: øg PR Sd
            </button>
          </Warning>
        </div>
      )}

      <div className="mt-4 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Respons [dB SPL @ 1 m]</div>
      <ResponsivePlot
        data={[
          { x: FREQS, y: sim.spl, name: 'System', color: '#3b82f6' },
          { x: FREQS, y: sim.splCone, name: 'Membran', color: '#9ca3af', dash: true },
          { x: FREQS, y: sim.splPr, name: 'PR', color: '#8b5cf6', dash: true },
        ]}
      />

      <div className="mt-4 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Excursion [mm]</div>
      <ResponsivePlot
        data={[
          { x: FREQS, y: sim.excursionMm, name: 'Driver', color: '#3b82f6' },
          { x: FREQS, y: sim.prExcursionMm, name: 'PR', color: '#8b5cf6' },
          { x: [FREQS[0]!, FREQS[end]!], y: [xmax, xmax], name: `Driver Xmax ${xmax} mm`, color: '#ef4444', dash: true },
          { x: [FREQS[0]!, FREQS[end]!], y: [p.xmaxPr, p.xmaxPr], name: `PR Xmax ${p.xmaxPr} mm`, color: '#f59e0b', dash: true },
        ]}
        yLabel="mm"
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 4th-order bandpass (SPEC §4.5)
// ---------------------------------------------------------------------------

export function Bandpass4Card({ driver }: { driver: Driver }) {
  const ts = driver.tsParams
  const { design, updateDesign } = useDesignStore()
  const [powerW, setPowerW] = useState(20)

  const seed: Bandpass4Params = useMemo(() => {
    const vbSealed =
      ts && ts.qts < 0.65 ? ts.vas / (Math.pow(0.707 / ts.qts, 2) - 1) : (ts?.vas ?? 20)
    return {
      vRear: Math.round(Math.max(vbSealed, 3) * 10) / 10,
      vFront: Math.round(Math.max(vbSealed * 0.5, 2) * 10) / 10,
      fbFront: Math.round((ts?.fs ?? 40) * 1.2),
      portDiameter: 70,
      numPorts: 1,
    }
  }, [ts])

  const p = design.bandpassParams ?? seed
  const set = (patch: Partial<Bandpass4Params>) =>
    updateDesign({ bandpassParams: { ...p, ...patch } })

  const derived = useMemo(() => {
    if (!ts) return null
    const areaCm2 = (Math.PI * Math.pow(p.portDiameter / 2 / 10, 2)) * p.numPorts
    const lenM = portLengthForTuning(p.fbFront, p.vFront / 1000, areaCm2 / 1e4)
    const voltage = Math.sqrt(powerW * (ts.imp || 8))
    const sim = simulateBandpass4(ts, p.vRear, p.vFront, areaCm2, lenM * 1000, FREQS, voltage)
    return { areaCm2, lenMm: lenM * 1000, sim }
  }, [ts, p, powerW])

  if (!ts || !derived) return null
  const { sim } = derived
  const xmax = ts.xmax || 5
  const end = FREQS.length - 1
  const maxV = Math.max(...sim.portVelocity)

  return (
    <Card title="Bandpass (4. orden)">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <NumberInput label="Bagkammer (lukket)" unit="L" value={p.vRear} min={1} onChange={(v) => set({ vRear: v })} />
        <NumberInput label="Frontkammer (ported)" unit="L" value={p.vFront} min={1} onChange={(v) => set({ vFront: v })} />
        <NumberInput label="Front-tuning Fb" unit="Hz" value={p.fbFront} min={15} onChange={(v) => set({ fbFront: v })} />
        <NumberInput label="Port diameter" unit="mm" value={p.portDiameter} min={20} onChange={(v) => set({ portDiameter: v })} />
        <NumberInput label="Antal porte" value={p.numPorts} min={1} max={4} onChange={(v) => set({ numPorts: v })} />
        <PowerInput value={powerW} onChange={setPowerW} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <StatCard label="Portlængde" value={derived.lenMm.toFixed(0)} unit="mm" />
        <StatCard label="Faktisk Fb (front)" value={sim.fbFront.toFixed(1)} unit="Hz" />
        <StatCard label="Fc (bagkammer)" value={sim.fcRear.toFixed(1)} unit="Hz" />
        <StatCard label="Maks porthastighed" value={maxV.toFixed(1)} unit="m/s" />
      </div>

      {maxV > PORT_VELOCITY_RECOMMENDED && (
        <div className="mt-3">
          <Warning>
            Porthastigheden overstiger {maxV > PORT_VELOCITY_CHUFFING ? '17 m/s — hørbar chuffing' : '10 m/s — anbefalet grænse'} ved {powerW} W.{' '}
            <button className="underline font-medium" onClick={() => set({ portDiameter: Math.round(p.portDiameter * 1.3) })}>
              Anvend: større port (+30 %)
            </button>
          </Warning>
        </div>
      )}

      <div className="mt-4 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Respons [dB SPL @ 1 m] — kun porten stråler</div>
      <ResponsivePlot data={[{ x: FREQS, y: sim.spl, name: 'System (port)', color: '#3b82f6' }]} />

      <div className="mt-4 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Excursion & impedans</div>
      <ResponsivePlot
        data={[
          { x: FREQS, y: sim.excursionMm, name: 'Excursion [mm]', color: '#3b82f6' },
          { x: [FREQS[0]!, FREQS[end]!], y: [xmax, xmax], name: `Xmax ${xmax} mm`, color: '#ef4444', dash: true },
        ]}
        yLabel="mm"
      />
      <ResponsivePlot data={[{ x: FREQS, y: sim.impedance, name: '|Z| [Ω]', color: '#10b981' }]} yLabel="Ω" />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Horn (SPEC §4.7)
// ---------------------------------------------------------------------------

export function HornCard({ driver }: { driver: Driver }) {
  const ts = driver.tsParams
  const { design, updateDesign } = useDesignStore()
  const [powerW, setPowerW] = useState(20)

  const seed: HornDesignParams = useMemo(
    () => ({
      profile: 'exponential',
      topology: 'back',
      throatAreaCm2: Math.round((ts?.sd ?? 100) * 0.7),
      mouthAreaCm2: Math.round((ts?.sd ?? 100) * 7),
      lengthM: 2.4,
      rearChamberLiters: 6,
    }),
    [ts],
  )

  const p = design.hornParams ?? seed
  const set = (patch: Partial<HornDesignParams>) =>
    updateDesign({ hornParams: { ...p, ...patch } })

  const sim = useMemo(() => {
    if (!ts) return null
    const voltage = Math.sqrt(powerW * (ts.imp || 8))
    return simulateHorn(
      ts,
      {
        profile: p.profile,
        topology: p.topology,
        throatAreaCm2: p.throatAreaCm2,
        mouthAreaCm2: p.mouthAreaCm2,
        lengthM: p.lengthM,
        rearChamberLiters: p.rearChamberLiters,
      },
      FREQS,
      voltage,
    )
  }, [ts, p, powerW])

  if (!ts || !sim) return null

  // Mouth area needed so the circumference reaches λ at fc (SPEC §4.7)
  const lambdaFc = 343 / Math.max(sim.cutoffHz, 1)
  const mouthTargetCm2 = Math.round(((lambdaFc * lambdaFc) / (4 * Math.PI)) * 1e4)

  const series = [
    { x: FREQS, y: sim.spl, name: 'System', color: '#3b82f6' },
    { x: FREQS, y: sim.splMouth, name: 'Hornmund', color: '#8b5cf6', dash: true },
  ]
  if (p.topology === 'back') {
    series.push({ x: FREQS, y: sim.splDirect, name: 'Direkte stråling', color: '#9ca3af', dash: true })
  }

  return (
    <Card title={p.topology === 'back' ? 'Back-loaded horn' : 'Front-loaded horn'}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Select
          label="Profil"
          value={p.profile}
          onChange={(v) => set({ profile: v as HornDesignParams['profile'] })}
          options={[
            { value: 'exponential', label: 'Eksponentiel' },
            { value: 'conical', label: 'Konisk' },
            { value: 'tractrix', label: 'Tractrix' },
            { value: 'hyperbolic', label: 'Hyperbolsk' },
          ]}
        />
        <Select
          label="Topologi"
          value={p.topology}
          onChange={(v) => set({ topology: v as 'front' | 'back' })}
          options={[
            { value: 'back', label: 'Back-loaded (BLH)' },
            { value: 'front', label: 'Front-loaded' },
          ]}
        />
        <NumberInput label="Hals-areal" unit="cm²" value={p.throatAreaCm2} min={5} onChange={(v) => set({ throatAreaCm2: v })} />
        <NumberInput label="Mund-areal" unit="cm²" value={p.mouthAreaCm2} min={20} onChange={(v) => set({ mouthAreaCm2: v })} />
        <NumberInput label="Hornlængde" unit="m" value={p.lengthM} min={0.3} step={0.1} onChange={(v) => set({ lengthM: v })} />
        <NumberInput label="Bagkammer" unit="L" value={p.rearChamberLiters} min={0} onChange={(v) => set({ rearChamberLiters: v })} />
        <PowerInput value={powerW} onChange={setPowerW} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        <StatCard label="Cutoff fc" value={sim.cutoffHz.toFixed(1)} unit="Hz" />
        <StatCard label="Mund vs. λ ved fc" value={sim.mouthTooSmall ? 'For lille' : 'OK'} />
        <StatCard label="Ekspansion" value={`${(p.mouthAreaCm2 / Math.max(p.throatAreaCm2, 1)).toFixed(1)}×`} />
      </div>

      {sim.mouthTooSmall && (
        <div className="mt-3">
          <Warning>
            Mundomkredsen er mindre end bølgelængden ved fc — forvent ripple i responsen (SPEC §4.7).
            Mål: ≥ {mouthTargetCm2.toLocaleString('da-DK')} cm² mund-areal, eller accepter ripple
            (typisk for kompakte BLH som W4-1052SDF-designet).
          </Warning>
        </div>
      )}

      <div className="mt-4 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Respons [dB SPL @ 1 m]</div>
      <ResponsivePlot data={series} />

      <div className="mt-4 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Impedans</div>
      <ResponsivePlot data={[{ x: FREQS, y: sim.impedance, name: '|Z| [Ω]', color: '#10b981' }]} yLabel="Ω" />

      <p className="mt-3 text-xs text-gray-500">
        Webster/T-matrix-model med fuld kompleks mundimpedans. Valideres mod Hornresp (SPEC §10) —
        golden-CSV-kørsel udestår, se ROADMAP.
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Transmission line editor (SPEC §4.6) — on the complex T-matrix model
// ---------------------------------------------------------------------------

export function TransmissionLineCard({ driver }: { driver: Driver }) {
  const ts = driver.tsParams
  const { design, updateDesign } = useDesignStore()
  const [powerW, setPowerW] = useState(20)
  const [fTarget, setFTarget] = useState(ts?.fs ?? 40)

  const seed: TLDesignParams = useMemo(
    () => ({
      lengthM: Math.round(quarterWaveLength(ts?.fs ?? 40, 8) * 100) / 100,
      areaStartCm2: Math.round((ts?.sd ?? 100) * 2),
      areaEndCm2: Math.round((ts?.sd ?? 100) * 1),
      stuffingDensity: 8,
      driverOffsetFraction: 0.25,
    }),
    [ts],
  )

  const p = design.tlParams ?? seed
  const set = (patch: Partial<TLDesignParams>) =>
    updateDesign({ tlParams: { ...p, ...patch } })

  const sim = useMemo(() => {
    if (!ts) return null
    const voltage = Math.sqrt(powerW * (ts.imp || 8))
    return simulateTransmissionLine(
      ts,
      [
        {
          length: p.lengthM,
          areaStart: p.areaStartCm2 / 1e4,
          areaEnd: p.areaEndCm2 / 1e4,
          stuffingDensity: p.stuffingDensity,
        },
      ],
      FREQS,
      { driverOffsetFraction: p.driverOffsetFraction, voltage },
    )
  }, [ts, p, powerW])

  if (!ts || !sim) return null

  const xmax = ts.xmax || 5
  const end = FREQS.length - 1
  const lineVolumeL = ((p.areaStartCm2 + p.areaEndCm2) / 2 / 1e4) * p.lengthM * 1000

  return (
    <Card title="Transmissionslinje (kompleks T-matrix)">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <NumberInput label="Linjelængde" unit="m" value={p.lengthM} min={0.3} step={0.05} onChange={(v) => set({ lengthM: v })} />
        <NumberInput label="Areal v. driver" unit="cm²" value={p.areaStartCm2} min={10} onChange={(v) => set({ areaStartCm2: v })} />
        <NumberInput label="Areal v. terminus" unit="cm²" value={p.areaEndCm2} min={5} onChange={(v) => set({ areaEndCm2: v })} />
        <NumberInput label="Fyld-densitet" unit="kg/m³" value={p.stuffingDensity} min={0} max={40} onChange={(v) => set({ stuffingDensity: v })} />
        <NumberInput label="Driver-offset" unit="× længde" value={p.driverOffsetFraction} min={0} max={0.45} step={0.05} onChange={(v) => set({ driverOffsetFraction: v })} />
        <PowerInput value={powerW} onChange={setPowerW} />
        <div className="flex items-end gap-2">
          <NumberInput label="Mål-frekvens" unit="Hz" value={fTarget} min={15} onChange={setFTarget} />
        </div>
        <div className="flex items-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => set({ lengthM: Math.round(quarterWaveLength(fTarget, p.stuffingDensity) * 100) / 100 })}
          >
            Sæt længde = ¼λ ved mål
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        <StatCard label="¼-bølge resonans" value={sim.fQuarterWave.toFixed(1)} unit="Hz" />
        <StatCard label="Linjevolumen" value={lineVolumeL.toFixed(1)} unit="L" />
        <StatCard label="Taper" value={`${(p.areaStartCm2 / Math.max(p.areaEndCm2, 1)).toFixed(2)}:1`} />
      </div>

      {p.stuffingDensity < 3 && (
        <div className="mt-3">
          <Warning>
            Næsten tom linje giver dybe kamfilter-nuller ved lige multipla af ¼-bølgefrekvensen.
            8–15 kg/m³ fyld dæmper de øvre linjeresonanser (SPEC §4.6).{' '}
            <button className="underline font-medium" onClick={() => set({ stuffingDensity: 10 })}>
              Anvend: 10 kg/m³
            </button>
          </Warning>
        </div>
      )}

      <div className="mt-4 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Respons [dB SPL @ 1 m]</div>
      <ResponsivePlot
        data={[
          { x: FREQS, y: sim.spl, name: 'System', color: '#3b82f6' },
          { x: FREQS, y: sim.splDriver, name: 'Driver', color: '#9ca3af', dash: true },
          { x: FREQS, y: sim.splTerminus, name: 'Terminus', color: '#8b5cf6', dash: true },
        ]}
      />

      <div className="mt-4 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Excursion & impedans</div>
      <ResponsivePlot
        data={[
          { x: FREQS, y: sim.excursionMm, name: 'Excursion [mm]', color: '#3b82f6' },
          { x: [FREQS[0]!, FREQS[end]!], y: [xmax, xmax], name: `Xmax ${xmax} mm`, color: '#ef4444', dash: true },
        ]}
        yLabel="mm"
      />
      <ResponsivePlot data={[{ x: FREQS, y: sim.impedance, name: '|Z| [Ω]', color: '#10b981' }]} yLabel="Ω" />
    </Card>
  )
}

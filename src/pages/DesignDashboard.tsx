// Design-dashboard — fælles slutskærm (SPEC §7.4)
//
// Status badge (Klar / Kræver opmærksomhed / Ikke realiserbar), headline
// metrics, tabbed views (Oversigt / Spinorama / Delefilter / Impedans /
// Excursion & port), "Hvorfor ser det sådan ud?"-annotationslag, design-
// versionering (SPEC §3) and ALL actionable warnings from the engine in one
// list — each with an "Anvend" button that executes the fix and can be undone.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDriverStore } from '@/store/driverStore'
import { useDesignStore } from '@/store/designStore'
import { Card, Button, StatCard, NumberInput, Select } from '@/components/common/UI'
import { ResponsivePlot } from '@/components/charts/ResponsivePlot'
import { evaluateDesign, type HealthAction, type HealthWarning } from '@/lib/designHealth'
import { simulateOnAxisWithBands } from '@/lib/acoustic/simulateBands'
import { calcSpinoramaMultiDriver } from '@/lib/acoustic/directivity'
import { calcImpedance, impedanceMetrics } from '@/lib/acoustic/impedance'
import { designAnnotations } from '@/lib/annotations'
import { snapshotDesign, listVersions, projectKeyFor } from '@/lib/designVersioning'
import { ventedAlignments, tuningForVolume } from '@/engine/enclosure/alignments'
import { simulateSealedBox } from '@/engine/enclosure/sealed'
import {
  simulateVentedBox,
  portLengthForTuning,
  PORT_VELOCITY_RECOMMENDED,
  PORT_VELOCITY_CHUFFING,
} from '@/engine/enclosure/vented'
import { simulatePassiveRadiator } from '@/engine/enclosure/passiveRadiator'
import { simulateBandpass4 } from '@/engine/enclosure/bandpass'
import { simulateHorn } from '@/engine/enclosure/horn'
import { simulateTransmissionLine } from '@/engine/enclosure/transmissionLine'
import { downloadBuildSheet } from '@/lib/export/buildSheet'
import { downloadCamillaDSP } from '@/lib/export/camillaDSP'
import { downloadEqAPO } from '@/lib/export/eqApo'
import { downloadHypex, downloadAdau } from '@/lib/export/hypexAdau'
import {
  defaultDriverLayout,
  defaultPortPosition,
  downloadOpenScad,
  downloadBaffleDxf,
  type BaffleCutSpec,
} from '@/lib/export/openscadDxf'
import {
  standingWave,
  evaluatePanel,
  PANEL_MATERIALS,
  type PanelMaterialKey,
} from '@/lib/acoustic/panelResonance'
import type { CabinetType, DesignState, DesignVersion } from '@/types'

const STATUS_STYLE: Record<string, { dot: string; box: string }> = {
  ready: {
    dot: 'bg-green-500',
    box: 'bg-green-50 border-green-300 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-200',
  },
  attention: {
    dot: 'bg-amber-500',
    box: 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200',
  },
  not_viable: {
    dot: 'bg-red-500',
    box: 'bg-red-50 border-red-300 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200',
  },
}

const SEVERITY_ICON: Record<string, string> = { error: '⛔', warning: '⚠️', info: 'ℹ️' }

const ROLE_LABELS: Record<string, string> = { low: 'Bas', mid: 'Mellem', mid2: 'Mellem 2', high: 'Diskant' }

const BAND_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

const TABS = [
  { id: 'oversigt', label: 'Oversigt' },
  { id: 'kabinet', label: 'Kabinet' },
  { id: 'spinorama', label: 'Spinorama' },
  { id: 'xo', label: 'Delefilter' },
  { id: 'impedans', label: 'Impedans' },
  { id: 'excursion', label: 'Excursion & port' },
] as const

type TabId = (typeof TABS)[number]['id']

type UndoState = {
  label: string
  portSnapshot?: { fb: number | null; vb: number | null; diameter: number; numPorts: number }
  designSnapshot?: Partial<DesignState>
} | null

function logFreqs(f0: number, f1: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(f0 * Math.pow(f1 / f0, i / (n - 1)))
  return out
}

export default function DesignDashboard() {
  const navigate = useNavigate()
  const { drivers } = useDriverStore()
  const { design, setPort, updateDesign, projectName, loadedProjectId, loadDesign } = useDesignStore()
  const [powerW, setPowerW] = useState(20)
  const [undo, setUndo] = useState<UndoState>(null)
  const [tab, setTab] = useState<TabId>('oversigt')
  const [showWhy, setShowWhy] = useState(false)
  const [versions, setVersions] = useState<DesignVersion[]>([])
  const [versionNote, setVersionNote] = useState('')
  const [panelMat, setPanelMat] = useState<PanelMaterialKey>('mdf')
  const [wallT, setWallT] = useState(19)
  const [braces, setBraces] = useState(1)

  const health = useMemo(
    () => evaluateDesign(design, drivers, { powerW }),
    [design, drivers, powerW],
  )

  // Effective box values (same fallback chain as designHealth/CabinetDesigner)
  const bassTs = drivers.find((d) => d.id === design.bands[0]?.driverId)?.tsParams
  const qb3 = bassTs?.fs && bassTs.qts && bassTs.vas ? ventedAlignments(bassTs)[0] : undefined
  const effVb = design.portVb ?? qb3?.vbL ?? 30
  const effFb = design.portFb ?? qb3?.fbHz ?? (bassTs?.fs ? tuningForVolume(bassTs, effVb) : 35)

  // Summed on-axis response + per-band curves for the plots
  const simResult = useMemo(() => {
    const activeBands = design.bands.slice(0, design.ways).filter((b) => drivers.some((d) => d.id === b.driverId))
    if (activeBands.length === 0) return null
    try {
      const freqs = logFreqs(20, 20000, 240)
      return simulateOnAxisWithBands(
        activeBands, drivers, freqs,
        design.baffleWidth, design.baffleHeight,
        design.cabinetType, effFb, effVb, design.portDiameter, design.numPorts,
        design.roundoverRadius,
      )
    } catch {
      return null
    }
  }, [design, drivers, effFb, effVb])

  const summed = simResult?.summed ?? null

  // "Hvorfor ser det sådan ud?" annotations
  const annotations = useMemo(
    () => designAnnotations(design, drivers, { f3Hz: health.metrics.f3Hz, effFb }),
    [design, drivers, health.metrics.f3Hz, effFb],
  )

  // Spinorama (computed lazily when the tab is open)
  const spin = useMemo(() => {
    if (tab !== 'spinorama' || !simResult) return null
    // simResult.bandCurves carry diameter + estimated baffle position, so the
    // spinorama uses the same per-angle edge-diffraction model as the optimizer
    if (simResult.bandCurves.length === 0) return null
    const freqs = summed!.map((p) => p.freq)
    try {
      return calcSpinoramaMultiDriver(
        simResult.bandCurves, freqs, design.baffleWidth, design.baffleHeight,
        summed!.map((p) => p.magnitude),
        { roundoverRadius: design.roundoverRadius },
      )
    } catch {
      return null
    }
  }, [tab, simResult, summed, design.baffleWidth, design.baffleHeight, design.roundoverRadius])

  // Impedance (bass driver in the active cabinet)
  const impedance = useMemo(() => {
    if (tab !== 'impedans' || !bassTs) return null
    try {
      const result = calcImpedance({
        ts: bassTs,
        cabinetType: design.cabinetType,
        boxVolume: effVb,
        fb: design.cabinetType === 'ported' ? effFb : undefined,
        fStart: 10,
        fEnd: 20000,
        pointsPerOctave: 24,
      })
      return { result, metrics: impedanceMetrics(result, bassTs) }
    } catch {
      return null
    }
  }, [tab, bassTs, design.cabinetType, effVb, effFb])

  // Excursion & port simulation (same engine calls as designHealth)
  const excursion = useMemo(() => {
    if (tab !== 'excursion' || !bassTs?.fs || !bassTs.qts || !bassTs.vas || effVb <= 0) return null
    const freqs = logFreqs(10, 2000, 200)
    const voltage = Math.sqrt(powerW * (bassTs.imp || 8))
    try {
      switch (design.cabinetType) {
        case 'sealed':
        case 'open_baffle': {
          if (design.cabinetType === 'open_baffle') return { openBaffle: true as const }
          const sim = simulateSealedBox(bassTs, effVb, freqs, { voltage })
          return { freqs, excursionMm: sim.excursionMm, portVelocity: null, label: `Lukket ${effVb.toFixed(0)} L · Qtc ${sim.qtc.toFixed(2)}` }
        }
        case 'ported': {
          const perPortAreaCm2 = Math.PI * Math.pow(design.portDiameter / 2 / 10, 2)
          const totalAreaM2 = (perPortAreaCm2 * design.numPorts) / 1e4
          const portLenM = portLengthForTuning(effFb, effVb / 1e3, totalAreaM2)
          const sim = simulateVentedBox(bassTs, effVb, perPortAreaCm2, portLenM * 1000, freqs, { voltage, portCount: design.numPorts })
          return { freqs, excursionMm: sim.excursionMm, portVelocity: sim.portVelocity, label: `Ported ${effVb.toFixed(0)} L · Fb ${effFb.toFixed(0)} Hz · portlængde ${(portLenM * 100).toFixed(0)} cm` }
        }
        case 'passive_radiator': {
          const p = design.prParams
          if (!p) return null
          const sim = simulatePassiveRadiator(bassTs, p.vb, p, freqs, voltage)
          return { freqs, excursionMm: sim.excursionMm, portVelocity: null, label: `PR ${p.vb.toFixed(0)} L · Fb ${sim.fbActual.toFixed(0)} Hz` }
        }
        case 'bandpass4': {
          const p = design.bandpassParams
          if (!p) return null
          const areaCm2 = Math.PI * Math.pow(p.portDiameter / 2 / 10, 2) * p.numPorts
          const lenM = portLengthForTuning(p.fbFront, p.vFront / 1000, areaCm2 / 1e4)
          const sim = simulateBandpass4(bassTs, p.vRear, p.vFront, areaCm2, lenM * 1000, freqs, voltage)
          return { freqs, excursionMm: sim.excursionMm, portVelocity: sim.portVelocity, label: `Bandpass ${p.vRear.toFixed(0)}+${p.vFront.toFixed(0)} L · Fb ${sim.fbFront.toFixed(0)} Hz` }
        }
        case 'horn': {
          const p = design.hornParams
          if (!p) return null
          const sim = simulateHorn(bassTs, p, freqs, voltage)
          return { freqs, excursionMm: sim.excursionMm, portVelocity: null, label: `Horn ${p.lengthM.toFixed(1)} m · fc ${sim.cutoffHz.toFixed(0)} Hz` }
        }
        case 'transmission_line': {
          const p = design.tlParams
          if (!p) return null
          const sim = simulateTransmissionLine(
            bassTs,
            [{ length: p.lengthM, areaStart: p.areaStartCm2 / 1e4, areaEnd: p.areaEndCm2 / 1e4, stuffingDensity: p.stuffingDensity }],
            freqs,
            { driverOffsetFraction: p.driverOffsetFraction, voltage },
          )
          return { freqs, excursionMm: sim.excursionMm, portVelocity: null, label: `TL ${p.lengthM.toFixed(2)} m · ¼λ ${sim.fQuarterWave.toFixed(0)} Hz` }
        }
        default:
          return null
      }
    } catch {
      return null
    }
  }, [tab, bassTs, design, effVb, effFb, powerW])

  // Kabinet tab: inner dimensions, standing waves, panels, CAD spec.
  // Depth is derived from the effective volume and the actual baffle — the
  // baffle W/H are real design values, depth is the free variable.
  const kabinet = useMemo(() => {
    if (tab !== 'kabinet') return null
    const iW = Math.max(50, design.baffleWidth - 2 * wallT)
    const iH = Math.max(50, design.baffleHeight - 2 * wallT)
    const iD = Math.max(50, (effVb / 1000) / ((iW / 1000) * (iH / 1000)) * 1000)
    const axes = [
      { label: 'Højde (indv.)', mm: iH },
      { label: 'Bredde (indv.)', mm: iW },
      { label: 'Dybde (indv., afledt af volumen)', mm: iD },
    ].map((a) => ({ ...a, f1: standingWave(a.mm) }))
    const mat = PANEL_MATERIALS[panelMat]
    const baffle = evaluatePanel({
      material: mat, thickness_mm: wallT, spanA_mm: iW, spanB_mm: iH,
      braces, treatment: 'none', driverBearing: true,
    })
    const side = evaluatePanel({
      material: mat, thickness_mm: wallT, spanA_mm: iD, spanB_mm: iH,
      braces, treatment: 'none', driverBearing: false,
    })
    return { iW, iH, iD, axes, baffle, side }
  }, [tab, design.baffleWidth, design.baffleHeight, effVb, wallT, panelMat, braces])

  // CAD export spec (OpenSCAD/DXF) — deterministic estimated driver layout
  const cutSpec: BaffleCutSpec | null = useMemo(() => {
    const bands = design.bands.slice(0, design.ways)
    const layout = defaultDriverLayout(bands, drivers, design.baffleWidth, design.baffleHeight)
    if (!layout) return null
    const port = design.cabinetType === 'ported'
      ? defaultPortPosition(layout, design.portDiameter, design.baffleWidth)
      : null
    const side = Math.cbrt(effVb / 1000)
    return {
      projectName: projectName || 'speaker-design',
      baffleWidthMm: design.baffleWidth,
      baffleHeightMm: design.baffleHeight,
      wallThicknessMm: wallT,
      outerDepthMm: Math.round(side * 1000),
      roundoverRadiusMm: design.roundoverRadius,
      drivers: layout,
      port,
    }
  }, [design, drivers, effVb, projectName, wallT])

  // Design versioning
  const projectKey = projectKeyFor(loadedProjectId, projectName)

  useEffect(() => {
    let cancelled = false
    listVersions(projectKey).then((v) => { if (!cancelled) setVersions(v) }).catch(() => {})
    return () => { cancelled = true }
  }, [projectKey])

  async function handleSaveVersion() {
    await snapshotDesign(projectKey, design, versionNote.trim())
    setVersionNote('')
    setVersions(await listVersions(projectKey))
  }

  function handleRestoreVersion(v: DesignVersion) {
    loadDesign(JSON.parse(JSON.stringify(v.design)) as DesignState, projectName || undefined, loadedProjectId ?? undefined)
  }

  function applyWarning(w: HealthWarning) {
    if (!w.apply) return
    const action: HealthAction = w.apply.action
    if (action.kind === 'setPort') {
      setUndo({
        label: w.apply.label,
        portSnapshot: {
          fb: design.portFb,
          vb: design.portVb,
          diameter: design.portDiameter,
          numPorts: design.numPorts,
        },
      })
      setPort(action.patch)
    } else {
      const snapshot: Partial<DesignState> = {}
      for (const key of Object.keys(action.patch) as (keyof DesignState)[]) {
        // @ts-expect-error — dynamic snapshot of the patched keys
        snapshot[key] = design[key]
      }
      setUndo({ label: w.apply.label, designSnapshot: snapshot })
      updateDesign(action.patch)
    }
  }

  function handleUndo() {
    if (!undo) return
    if (undo.portSnapshot) {
      setPort(undo.portSnapshot)
    }
    if (undo.designSnapshot) {
      updateDesign(undo.designSnapshot)
    }
    setUndo(null)
  }

  const style = STATUS_STYLE[health.status]!
  const activeBands = design.bands.slice(0, design.ways)

  // Annotation marker series for the response plot
  const annotationSeries = useMemo(() => {
    if (!showWhy || !summed || summed.length === 0) return []
    const mags = summed.map((p) => p.magnitude)
    const yMin = Math.min(...mags) - 3
    const yMax = Math.max(...mags) + 3
    return annotations.map((a, i) => ({
      x: [a.freqHz, a.freqHz],
      y: [yMin, yMax],
      name: `${i + 1}. ${a.label}`,
      color: '#9ca3af',
      dash: true,
    }))
  }, [showWhy, summed, annotations])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {projectName || 'Design-dashboard'}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate('/compare')}>Sammenlign</Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/system')}>System Sim.</Button>
        </div>
      </div>

      {/* Status badge */}
      <div className={`border rounded-lg p-4 ${style.box}`}>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-3 h-3 rounded-full ${style.dot}`} />
          <span className="font-semibold">{health.statusLabel}</span>
        </div>
        <p className="text-sm mt-1 opacity-90">{health.statusReason}</p>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Score (bas i kasse)" value={health.metrics.score != null ? String(health.metrics.score) : '—'} unit={health.metrics.score != null ? '/100' : undefined} />
        <StatCard label="Bas til (F3)" value={health.metrics.f3Hz != null ? health.metrics.f3Hz.toFixed(0) : '—'} unit="Hz" />
        <StatCard label={`Maks SPL (${powerW} W ref.)`} value={health.metrics.maxSplDb != null ? String(health.metrics.maxSplDb) : '—'} unit="dB" />
        <StatCard label="Advarsler" value={String(health.warnings.length)} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'oversigt' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left column: design summary + versions */}
            <div className="lg:col-span-1 space-y-4">
              <Card title="Design">
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Kabinet</div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{health.metrics.cabinetSummary}</div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/cabinet')}>Redigér →</Button>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Enheder</div>
                    {activeBands.map((band, i) => {
                      const d = drivers.find((dr) => dr.id === band.driverId)
                      return (
                        <div key={i} className="flex items-center justify-between py-0.5">
                          <span className="text-gray-500 text-xs">{ROLE_LABELS[band.role] ?? band.role}</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-xs">
                            {d ? `${d.manufacturer} ${d.model}` : '— mangler —'}
                          </span>
                        </div>
                      )
                    })}
                    <Button variant="ghost" size="sm" onClick={() => navigate('/drivers')}>Enheder →</Button>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Delefilter</div>
                    {activeBands.map((band, i) => (
                      <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                        <span className="text-gray-500">{ROLE_LABELS[band.role] ?? band.role}</span>
                        <span className="font-mono text-gray-900 dark:text-gray-100">
                          {i > 0 && band.highpassFreq > 0 ? `HP ${band.highpassFreq.toFixed(0)}` : ''}
                          {i > 0 && i < design.ways - 1 ? ' · ' : ''}
                          {i < design.ways - 1 && band.lowpassFreq > 0 ? `LP ${band.lowpassFreq.toFixed(0)}` : ''}
                        </span>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => navigate('/crossover')}>Delefilter →</Button>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                    <NumberInput label="Referenceeffekt for advarsler" unit="W" value={powerW} min={1} max={1000} step={5} onChange={setPowerW} />
                  </div>
                </div>
              </Card>

              <Card title={`Versioner (${versions.length})`}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={versionNote}
                      onChange={(e) => setVersionNote(e.target.value)}
                      placeholder="Note (valgfri)"
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <Button variant="primary" size="sm" onClick={handleSaveVersion}>Gem version</Button>
                  </div>
                  {versions.length === 0 ? (
                    <p className="text-xs text-gray-500">Ingen versioner endnu. Gem en snapshot før du eksperimenterer.</p>
                  ) : (
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {versions.slice(0, 12).map((v) => (
                        <div key={v.id} className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded px-2 py-1">
                          <div className="min-w-0">
                            <span className="text-xs font-mono text-gray-900 dark:text-gray-100">
                              v{v.version}{v.parentVersion != null ? ` ← v${v.parentVersion}` : ''}
                            </span>
                            <span className="text-xs text-gray-500 ml-2">
                              {new Date(v.createdAt).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}
                              {v.note ? ` · ${v.note}` : ''}
                            </span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleRestoreVersion(v)}>Gendan</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Right: response + warnings */}
            <div className="lg:col-span-2 space-y-4">
              <Card title="Systemrespons (on-axis)">
                {summed ? (
                  <>
                    <ResponsivePlot
                      data={[
                        {
                          x: summed.map((p) => p.freq),
                          y: summed.map((p) => p.magnitude),
                          name: 'On-axis sum',
                          color: '#3b82f6',
                        },
                        ...annotationSeries,
                      ]}
                      yLabel="dB SPL"
                    />
                    <div className="mt-2">
                      <Button variant={showWhy ? 'primary' : 'secondary'} size="sm" onClick={() => setShowWhy(!showWhy)}>
                        {showWhy ? 'Skjul forklaringer' : 'Hvorfor ser det sådan ud?'}
                      </Button>
                    </div>
                    {showWhy && (
                      <ol className="mt-3 space-y-2 text-xs text-gray-600 dark:text-gray-300 list-none">
                        {annotations.map((a, i) => (
                          <li key={a.id} className="flex gap-2">
                            <span className="font-mono text-gray-400 shrink-0">{i + 1}.</span>
                            <span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">{a.label} ({a.freqHz.toFixed(0)} Hz):</span>{' '}
                              {a.detail}
                            </span>
                          </li>
                        ))}
                        {annotations.length === 0 && <li>Ingen markører for det aktive design.</li>}
                      </ol>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Vælg enheder til vejene før systemet kan simuleres.</p>
                )}
              </Card>

              <Card title={`Advarsler (${health.warnings.length})`}>
                {undo && (
                  <div className="mb-3 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-2">
                    <span className="text-xs text-blue-700 dark:text-blue-300">Anvendt: {undo.label}</span>
                    <Button variant="secondary" size="sm" onClick={handleUndo}>Fortryd</Button>
                  </div>
                )}
                {health.warnings.length === 0 ? (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Ingen advarsler — designet ser sundt ud ved {powerW} W.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {health.warnings.map((w) => (
                      <div key={w.id} className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
                        <div className="flex items-start gap-2">
                          <span className="text-sm">{SEVERITY_ICON[w.severity]}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{w.title}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{w.detail}</div>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {w.apply && (
                                <Button variant="primary" size="sm" onClick={() => applyWarning(w)}>
                                  {w.apply.label}
                                </Button>
                              )}
                              {w.page && (
                                <Button variant="ghost" size="sm" onClick={() => navigate(w.page!)}>
                                  Åbn side →
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Export row */}
          <Card title="Eksport">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="primary"
                onClick={() => {
                  const bandsWithDrivers = activeBands
                    .map((band) => ({ band, driver: drivers.find((d) => d.id === band.driverId) }))
                    .filter((x): x is { band: typeof x.band; driver: NonNullable<typeof x.driver> } => !!x.driver)
                  const vbM3 = effVb / 1000
                  const side = Math.cbrt(vbM3)
                  downloadBuildSheet({
                    projectName: projectName || 'speaker-design',
                    cabinetType: health.metrics.cabinetSummary,
                    dims: {
                      width: Math.round(side * 0.8 * 1000),
                      height: Math.round(side * 1.25 * 1000),
                      depth: Math.round(side * 1000),
                      wallThickness: 19,
                      baffleWidth: design.baffleWidth,
                      baffleHeight: design.baffleHeight,
                      frontRoundoverRadius: design.roundoverRadius,
                    },
                    internalVolume: effVb,
                    portSpec: design.cabinetType === 'ported'
                      ? { shape: 'round', diameter: design.portDiameter, length: 0, count: design.numPorts }
                      : undefined,
                    bands: bandsWithDrivers.map(({ band, driver }) => ({ driver, band })),
                  })
                }}
              >
                📄 Byggeark
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadCamillaDSP(design.bands.slice(0, design.ways), design.ways, 48000, projectName || 'speaker-design')}
              >
                CamillaDSP YAML
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadEqAPO(design.bands, design.ways, drivers, projectName || 'speaker-design')}
              >
                Equalizer APO
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadHypex(design, drivers, projectName || 'speaker-design')}
              >
                Hypex FusionAmp
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadAdau(design, drivers, projectName || 'speaker-design')}
              >
                ADAU / SigmaStudio
              </Button>
              {cutSpec && (
                <>
                  <Button variant="secondary" onClick={() => downloadOpenScad(cutSpec)}>
                    OpenSCAD
                  </Button>
                  <Button variant="secondary" onClick={() => downloadBaffleDxf(cutSpec)}>
                    Baffel DXF
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Byggeark-dimensioner her er kubisk skøn ud fra volumen — brug Kabinetdesign → Eksport for de præcise pladeudskæringer.
            </p>
          </Card>
        </>
      )}

      {tab === 'kabinet' && kabinet && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Kabinet — redigér direkte">
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Kabinettype"
                  value={design.cabinetType}
                  onChange={(v) => updateDesign({ cabinetType: v as CabinetType })}
                  options={[
                    { value: 'sealed', label: 'Lukket' },
                    { value: 'ported', label: 'Ported (basrefleks)' },
                    { value: 'passive_radiator', label: 'Passivmembran' },
                    { value: 'bandpass4', label: 'Bandpass (4. orden)' },
                    { value: 'transmission_line', label: 'Transmissionslinje' },
                    { value: 'horn', label: 'Horn' },
                    { value: 'open_baffle', label: 'Åben baffel' },
                  ]}
                />
                <NumberInput label="Volumen" unit="L" value={Math.round(effVb * 10) / 10} min={1} step={1} onChange={(v) => setPort({ vb: v })} />
                {design.cabinetType === 'ported' && (
                  <>
                    <NumberInput label="Tuning Fb" unit="Hz" value={Math.round(effFb * 10) / 10} min={15} step={0.5} onChange={(v) => setPort({ fb: v })} />
                    <NumberInput label="Portdiameter" unit="mm" value={design.portDiameter} min={20} step={5} onChange={(v) => setPort({ diameter: v })} />
                    <NumberInput label="Antal porte" value={design.numPorts} min={1} max={4} onChange={(v) => setPort({ numPorts: Math.max(1, Math.round(v)) })} />
                  </>
                )}
                <NumberInput label="Bafflebredde" unit="mm" value={design.baffleWidth} min={100} step={10} onChange={(v) => updateDesign({ baffleWidth: v })} />
                <NumberInput label="Bafflehøjde" unit="mm" value={design.baffleHeight} min={150} step={10} onChange={(v) => updateDesign({ baffleHeight: v })} />
                <NumberInput label="Roundover" unit="mm" value={design.roundoverRadius} min={0} step={5} onChange={(v) => updateDesign({ roundoverRadius: v })} />
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Ændringer slår igennem i alle faner og i status øverst med det samme.
                Fuld kabinetgeometri, alignments og 3D:{' '}
                <button className="underline text-blue-600 dark:text-blue-400" onClick={() => navigate('/cabinet')}>Kabinetdesign →</button>
              </p>
            </Card>

            <Card title="Stående bølger (indvendige mål)">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-1 pr-2">Akse</th>
                    <th className="py-1 pr-2">Mål</th>
                    <th className="py-1 pr-2">λ/2</th>
                    <th className="py-1 pr-2">2×</th>
                    <th className="py-1">3×</th>
                  </tr>
                </thead>
                <tbody>
                  {kabinet.axes.map((a) => (
                    <tr key={a.label} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-1 pr-2">{a.label}</td>
                      <td className="py-1 pr-2">{a.mm.toFixed(0)} mm</td>
                      <td className="py-1 pr-2 font-medium">{a.f1.toFixed(0)} Hz</td>
                      <td className="py-1 pr-2">{(2 * a.f1).toFixed(0)} Hz</td>
                      <td className="py-1">{(3 * a.f1).toFixed(0)} Hz</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-500 mt-3">
                Halvbølge-resonanser mellem parallelle flader. Indvendig dybde er afledt
                af volumen og baffelmål. Dæmpningsmateriale midt på aksen (trykmaksimum
                for luften ved λ/2) dæmper første mode mest — undgå ens indvendige mål.
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Panelresonans">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Select
                  label="Materiale"
                  value={panelMat}
                  onChange={(v) => setPanelMat(v as PanelMaterialKey)}
                  options={Object.values(PANEL_MATERIALS).map((m) => ({ value: m.key, label: m.name }))}
                />
                <NumberInput label="Pladetykkelse" unit="mm" value={wallT} min={9} max={38} step={1} onChange={(v) => setWallT(Math.max(9, Math.round(v)))} />
                <NumberInput label="Braces pr. panel" value={braces} min={0} max={4} onChange={(v) => setBraces(Math.max(0, Math.round(v)))} />
              </div>
              {[
                { label: 'Frontbaffel (bærer drivere)', r: kabinet.baffle },
                { label: 'Sidepanel', r: kabinet.side },
              ].map(({ label, r }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-gray-500">{r.note}</div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <div className={`text-sm font-semibold ${r.verdict === 'good' ? 'text-green-600' : r.verdict === 'ok' ? 'text-amber-600' : 'text-red-600'}`}>
                      {r.fundamentalHz.toFixed(0)} Hz
                    </div>
                    <div className="text-xs text-gray-500">Q {r.q.toFixed(0)} · {r.decayMs.toFixed(0)} ms</div>
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-500 mt-3">
                Fundamental (1,1)-bøjningsresonans pr. felt mellem braces. Mål: over
                ~300 Hz (380 Hz for driverbærende paneler) — flyt resonansen op med
                tykkere plade eller flere braces frem for at jagte dæmpning alene.
              </p>
            </Card>

            <Card title="CAD-eksport (baffeludskæring)">
              {cutSpec ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <Button variant="primary" onClick={() => downloadOpenScad(cutSpec)}>OpenSCAD (.scad)</Button>
                    <Button variant="secondary" onClick={() => downloadBaffleDxf(cutSpec)}>Baffel DXF</Button>
                  </div>
                  <table className="w-full text-sm mb-2">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-1 pr-2">Udskæring</th>
                        <th className="py-1 pr-2">Ø</th>
                        <th className="py-1">Center (x, y fra bund)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cutSpec.drivers.map((d) => (
                        <tr key={d.label} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-1 pr-2">{d.label}</td>
                          <td className="py-1 pr-2">{d.diameterMm.toFixed(0)} mm</td>
                          <td className="py-1">({d.xMm.toFixed(0)}, {d.yMm.toFixed(0)}) mm</td>
                        </tr>
                      ))}
                      {cutSpec.port && (
                        <tr>
                          <td className="py-1 pr-2">Port</td>
                          <td className="py-1 pr-2">{cutSpec.port.diameterMm.toFixed(0)} mm</td>
                          <td className="py-1">({cutSpec.port.xMm.toFixed(0)}, {cutSpec.port.yMm.toFixed(0)}) mm</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <p className="text-xs text-gray-500">
                    Positioner er et deterministisk estimat (lodret stak på centerlinjen,
                    diskant øverst) — alle mål ligger som variabler øverst i .scad-filen
                    og kan redigeres frit. DXF er R12 (mm) til LibreCAD/Fusion/CNC.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  Ingen drivere valgt, eller driver-stakken kan ikke være på baflen
                  ({design.baffleWidth} × {design.baffleHeight} mm) — vælg drivere eller gør baflen større.
                </p>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === 'spinorama' && (
        <Card title="Spinorama (CEA-2034)">
          {spin ? (
            <>
              <ResponsivePlot
                data={(() => {
                  const refPts = spin.onAxis.filter((_, i) => spin.freq[i]! >= 300 && spin.freq[i]! <= 3000)
                  const ref = refPts.length > 0 ? refPts.reduce((s, v) => s + v, 0) / refPts.length : 0
                  return [
                    { x: spin.freq, y: spin.onAxis.map((v) => v - ref), name: 'On-axis', color: '#3b82f6' },
                    { x: spin.freq, y: spin.listeningWindow.map((v) => v - ref), name: 'Listening window', color: '#10b981' },
                    { x: spin.freq, y: spin.earlyReflections.map((v) => v - ref), name: 'Early reflections', color: '#f59e0b' },
                    { x: spin.freq, y: spin.soundPower.map((v) => v - ref), name: 'Sound power', color: '#ef4444' },
                    { x: spin.freq, y: spin.predictedInRoom.map((v) => v - ref), name: 'Predicted in-room', color: '#8b5cf6', dash: true },
                    { x: spin.freq, y: spin.directivityIndex, name: 'DI (SP)', color: '#6b7280', dash: true },
                  ]
                })()}
                yLabel="dB (rel. on-axis 300-3k)"
              />
              <p className="text-xs text-gray-500 mt-2">
                Jævnt faldende sound power og glat DI uden hop giver den mest naturlige lyd i rum (Harman/Olive).
                Direktivitet: stempelmodel pr. enhed + kantdiffraktion pr. vinkel — driverplaceringer på baflen og
                roundover indgår i alle kurver (far-field, front-halvkugle).
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Vælg enheder til vejene før spinorama kan beregnes.</p>
          )}
        </Card>
      )}

      {tab === 'xo' && (
        <Card title="Delefilter — bånd og sum">
          {simResult && summed ? (
            <>
              <ResponsivePlot
                data={[
                  ...simResult.processedBands.map((pb, i) => ({
                    x: pb.curve.map((p) => p.freq),
                    y: pb.curve.map((p) => p.magnitude),
                    name: ROLE_LABELS[pb.band.role] ?? pb.band.role,
                    color: BAND_COLORS[i % BAND_COLORS.length]!,
                    dash: true,
                  })),
                  {
                    x: summed.map((p) => p.freq),
                    y: summed.map((p) => p.magnitude),
                    name: 'Sum',
                    color: '#111827',
                  },
                ]}
                yLabel="dB SPL"
              />
              <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-gray-500">
                {activeBands.slice(0, -1).map((band, i) => {
                  const hp = activeBands[i + 1]?.highpassFreq ?? 0
                  const fXo = band.lowpassFreq > 0 && hp > 0 ? Math.sqrt(band.lowpassFreq * hp) : null
                  return fXo ? <span key={i} className="font-mono">XO {i + 1}: {fXo.toFixed(0)} Hz</span> : null
                })}
                <Button variant="ghost" size="sm" onClick={() => navigate('/crossover')}>Redigér delefilter →</Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">Vælg enheder til vejene før delefilteret kan simuleres.</p>
          )}
        </Card>
      )}

      {tab === 'impedans' && (
        <Card title="Impedans (bas-enhed i kabinettet)">
          {impedance ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <StatCard label="Minimum" value={impedance.metrics.zMin.toFixed(1)} unit={`Ω @ ${impedance.metrics.fMin.toFixed(0)} Hz`} />
                <StatCard label="Maksimum" value={impedance.metrics.zMax.toFixed(0)} unit={`Ω @ ${impedance.metrics.fMax.toFixed(0)} Hz`} />
                <StatCard label="DC-modstand" value={impedance.metrics.re.toFixed(1)} unit="Ω" />
                <StatCard label="Værste fase" value={impedance.metrics.phaseMin.toFixed(0)} unit={`° @ ${impedance.metrics.fPhaseMin.toFixed(0)} Hz`} />
              </div>
              <ResponsivePlot
                data={[
                  { x: impedance.result.freq, y: impedance.result.magnitude, name: 'Impedans (Ω)', color: '#3b82f6' },
                  { x: impedance.result.freq, y: impedance.result.phase, name: 'Fase (°)', color: '#f59e0b', dash: true },
                ]}
                yLabel="Ω / grader"
              />
              <p className="text-xs text-gray-500 mt-2">
                {design.cabinetType === 'ported'
                  ? 'To toppe med dalen ved Fb er signaturen for en portet kasse — dalen viser den reelle tuning.'
                  : 'Én top ved systemresonansen er signaturen for en lukket kasse.'}
                {' '}Minimum under 3 Ω eller stejl fase ved lav impedans stiller krav til forstærkeren.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Bas-enheden mangler T/S-parametre — udfyld dem under Enheder.</p>
          )}
        </Card>
      )}

      {tab === 'excursion' && (
        <Card title={`Excursion & port (${powerW} W)`}>
          {excursion && 'openBaffle' in excursion ? (
            <p className="text-sm text-gray-500">
              Åben baffel har ingen kabinetlast — keglens excursion stiger kraftigt mod lave frekvenser.
              Brug et højpasfilter og hold øje med Xmax i praksis.
            </p>
          ) : excursion ? (
            <>
              <p className="text-xs text-gray-500 mb-2">{excursion.label}</p>
              <ResponsivePlot
                data={[
                  { x: excursion.freqs, y: excursion.excursionMm, name: 'Excursion (mm)', color: '#3b82f6' },
                  {
                    x: [excursion.freqs[0]!, excursion.freqs[excursion.freqs.length - 1]!],
                    y: [bassTs?.xmax || 5, bassTs?.xmax || 5],
                    name: `Xmax ${(bassTs?.xmax || 5).toFixed(1)} mm`,
                    color: '#ef4444',
                    dash: true,
                  },
                ]}
                yLabel="mm (peak)"
              />
              {excursion.portVelocity && (
                <div className="mt-4">
                  <ResponsivePlot
                    data={[
                      { x: excursion.freqs, y: excursion.portVelocity, name: 'Porthastighed (m/s)', color: '#10b981' },
                      {
                        x: [excursion.freqs[0]!, excursion.freqs[excursion.freqs.length - 1]!],
                        y: [PORT_VELOCITY_RECOMMENDED, PORT_VELOCITY_RECOMMENDED],
                        name: `Anbefalet ${PORT_VELOCITY_RECOMMENDED} m/s`,
                        color: '#f59e0b',
                        dash: true,
                      },
                      {
                        x: [excursion.freqs[0]!, excursion.freqs[excursion.freqs.length - 1]!],
                        y: [PORT_VELOCITY_CHUFFING, PORT_VELOCITY_CHUFFING],
                        name: `Chuffing ${PORT_VELOCITY_CHUFFING} m/s`,
                        color: '#ef4444',
                        dash: true,
                      },
                    ]}
                    yLabel="m/s"
                  />
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Justér referenceeffekten under Oversigt → Design. Advarsler for overskridelser står samlet på Oversigt-fanen.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              Kabinettet er ikke konfigureret færdigt til excursion-simulering — åbn Kabinetdesign og udfyld parametrene.
            </p>
          )}
        </Card>
      )}
    </div>
  )
}

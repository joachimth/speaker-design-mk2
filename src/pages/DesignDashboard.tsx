// Design-dashboard — fælles slutskærm (SPEC §7.4)
//
// Status badge (Klar / Kræver opmærksomhed / Ikke realiserbar), headline
// metrics, summeret on-axis respons, and ALL actionable warnings from the
// engine in one list — each with an "Anvend" button that executes the fix
// and can be undone.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDriverStore } from '@/store/driverStore'
import { useDesignStore } from '@/store/designStore'
import { Card, Button, StatCard, NumberInput } from '@/components/common/UI'
import { ResponsivePlot } from '@/components/charts/ResponsivePlot'
import { evaluateDesign, type HealthAction, type HealthWarning } from '@/lib/designHealth'
import { simulateOnAxis } from '@/lib/acoustic/simulateBands'
import { ventedAlignments, tuningForVolume } from '@/engine/enclosure/alignments'
import { downloadBuildSheet } from '@/lib/export/buildSheet'
import { downloadCamillaDSP } from '@/lib/export/camillaDSP'
import { downloadEqAPO } from '@/lib/export/eqApo'
import type { DesignState } from '@/types'

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

type UndoState = {
  label: string
  portSnapshot?: { fb: number | null; vb: number | null; diameter: number; numPorts: number }
  designSnapshot?: Partial<DesignState>
} | null

export default function DesignDashboard() {
  const navigate = useNavigate()
  const { drivers } = useDriverStore()
  const { design, setPort, updateDesign, projectName } = useDesignStore()
  const [powerW, setPowerW] = useState(20)
  const [undo, setUndo] = useState<UndoState>(null)

  const health = useMemo(
    () => evaluateDesign(design, drivers, { powerW }),
    [design, drivers, powerW],
  )

  // Effective box values (same fallback chain as designHealth/CabinetDesigner)
  const bassTs = drivers.find((d) => d.id === design.bands[0]?.driverId)?.tsParams
  const qb3 = bassTs?.fs && bassTs.qts && bassTs.vas ? ventedAlignments(bassTs)[0] : undefined
  const effVb = design.portVb ?? qb3?.vbL ?? 30
  const effFb = design.portFb ?? qb3?.fbHz ?? (bassTs?.fs ? tuningForVolume(bassTs, effVb) : 35)

  // Summed on-axis response for the main plot
  const summed = useMemo(() => {
    const activeBands = design.bands.slice(0, design.ways).filter((b) => drivers.some((d) => d.id === b.driverId))
    if (activeBands.length === 0) return null
    try {
      const freqs: number[] = []
      for (let i = 0; i < 240; i++) freqs.push(20 * Math.pow(20000 / 20, i / 239))
      return simulateOnAxis(
        activeBands, drivers, freqs,
        design.baffleWidth, design.baffleHeight,
        design.cabinetType, effFb, effVb, design.portDiameter, design.numPorts,
      )
    } catch {
      return null
    }
  }, [design, drivers, effFb, effVb])

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: design summary */}
        <Card title="Design" className="lg:col-span-1">
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

        {/* Right: response + warnings */}
        <div className="lg:col-span-2 space-y-4">
          <Card title="Systemrespons (on-axis)">
            {summed ? (
              <ResponsivePlot
                data={[{
                  x: summed.map((p) => p.freq),
                  y: summed.map((p) => p.magnitude),
                  name: 'On-axis sum',
                  color: '#3b82f6',
                }]}
                yLabel="dB SPL"
              />
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
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Byggeark-dimensioner her er kubisk skøn ud fra volumen — brug Kabinetdesign → Eksport for de præcise pladeudskæringer.
        </p>
      </Card>
    </div>
  )
}

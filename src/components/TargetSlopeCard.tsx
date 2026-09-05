// Akustiske mål-slopes (SPEC §5.4) — UI-kort til CrossoverDesigner.
//
// Brugeren vælger et AKUSTISK mål (fx akustisk LR4 @ 2 kHz) pr. delefrekvens.
// Kortet finder de elektriske filtre (type + frekvens) der — kombineret med
// drivernes baffle-korrigerede råkurver — bedst rammer målet, og anvender dem
// på båndene. Ændrer KUN filtertype/-frekvens, aldrig gain.

import { useMemo, useState } from 'react'
import { Card, Select, NumberInput, Button } from '@/components/common/UI'
import { ResponsivePlot } from '@/components/charts/ResponsivePlot'
import {
  rawBandCurve,
  fitElectricalToTarget,
  type TargetSlopeFitResult,
  type RawCurveOpts,
} from '@/lib/acoustic/targetSlopes'
import { layoutBandPositions } from '@/lib/acoustic/baffleLayout'
import { calcBaffleDiffraction } from '@/lib/acoustic/baffle'
import { generateFrequencies } from '@/lib/acoustic/thieleSmall'
import type { CrossoverType, DesignBand, DesignState, Driver } from '@/types'

const TARGET_TYPES: { value: CrossoverType; label: string }[] = [
  { value: 'LR2', label: 'Akustisk LR2 (12 dB/okt)' },
  { value: 'BW4', label: 'Akustisk BW4 (24 dB/okt)' },
  { value: 'LR4', label: 'Akustisk LR4 (24 dB/okt)' },
  { value: 'LR8', label: 'Akustisk LR8 (48 dB/okt)' },
]

const ROLE_LABELS: Record<string, string> = {
  low: 'Bas',
  mid: 'Mellem',
  mid2: 'Mellem 2',
  high: 'Diskant',
}

const TYPE_SHORT: Record<string, string> = {
  first_order: '1. ordens',
  BW1: 'BW1',
  BW2: 'BW2',
  LR2: 'LR2',
  BW4: 'BW4',
  LR4: 'LR4',
  LR8: 'LR8',
}

interface SideResult {
  roleLabel: string
  before: { type: string; fc: number }
  fit: TargetSlopeFitResult
  raw: { freq: number; magnitude: number }[]
}

interface FitState {
  targetLabel: string
  lower: SideResult | null
  upper: SideResult | null
}

interface Props {
  design: DesignState
  drivers: Driver[]
  updateBand: (index: number, patch: Partial<DesignBand>) => void
}

export function TargetSlopeCard({ design, drivers, updateBand }: Props) {
  const ways = design.ways
  const xoCount = Math.max(0, ways - 1)
  const [xoIndex, setXoIndex] = useState(0)
  const [targetType, setTargetType] = useState<CrossoverType>('LR4')
  const [result, setResult] = useState<FitState | null>(null)

  const idx = Math.min(xoIndex, xoCount - 1)
  const lowerBand = design.bands[idx]
  const upperBand = design.bands[idx + 1]

  const defaultFc = useMemo(() => {
    const lp = lowerBand?.lowpassFreq ?? 0
    const hp = upperBand?.highpassFreq ?? 0
    if (lp > 0 && lp < 20000 && hp > 0) return Math.round(Math.sqrt(lp * hp))
    if (lp > 0 && lp < 20000) return Math.round(lp)
    if (hp > 0) return Math.round(hp)
    return 2000
  }, [lowerBand, upperBand])

  const [targetFc, setTargetFc] = useState(defaultFc)
  // Follow the XO point when the user switches selector
  const [lastIdx, setLastIdx] = useState(idx)
  if (idx !== lastIdx) {
    setLastIdx(idx)
    setTargetFc(defaultFc)
  }

  const lowerDriver = drivers.find((d) => d.id === lowerBand?.driverId)
  const upperDriver = drivers.find((d) => d.id === upperBand?.driverId)
  const canFit = !!lowerBand && !!upperBand && (!!lowerDriver || !!upperDriver)

  function runFit() {
    if (!lowerBand || !upperBand) return
    const freqs = generateFrequencies(20, 20000, 24)
    // Same position-aware diffraction as the simulation, so the fit works
    // against the curves the plots actually show
    const activeBands = design.bands.slice(0, design.ways)
    const positions = layoutBandPositions(activeBands, drivers, design.baffleWidth, design.baffleHeight)
    const diffFor = (bandIdx: number): number[] | undefined => {
      const pos = positions?.find((p) => p.bandIndex === bandIdx)
      return pos
        ? calcBaffleDiffraction(design.baffleWidth, design.baffleHeight, pos.xMm, pos.yMm, design.roundoverRadius, freqs)
        : undefined
    }
    const opts: RawCurveOpts = {
      baffleWidth: design.baffleWidth,
      baffleHeight: design.baffleHeight,
      cabinetType: design.cabinetType,
      portFb: design.portFb ?? 0,
      portVb: design.portVb ?? 0,
      portDiameter: design.portDiameter,
      numPorts: design.numPorts,
    }

    let lower: SideResult | null = null
    const lowerRaw = rawBandCurve(lowerBand, lowerDriver, { ...opts, diffractionDb: diffFor(idx) }, freqs)
    if (lowerRaw) {
      const fit = fitElectricalToTarget(lowerRaw, { type: targetType, fc: targetFc, isHighpass: false }, freqs)
      lower = {
        roleLabel: ROLE_LABELS[lowerBand.role] ?? lowerBand.role,
        before: { type: lowerBand.lowpassType, fc: lowerBand.lowpassFreq },
        fit,
        raw: lowerRaw,
      }
      updateBand(idx, { lowpassType: fit.best.type, lowpassFreq: fit.best.fc })
    }

    let upper: SideResult | null = null
    const upperRaw = rawBandCurve(upperBand, upperDriver, { ...opts, diffractionDb: diffFor(idx + 1) }, freqs)
    if (upperRaw) {
      const fit = fitElectricalToTarget(upperRaw, { type: targetType, fc: targetFc, isHighpass: true }, freqs)
      upper = {
        roleLabel: ROLE_LABELS[upperBand.role] ?? upperBand.role,
        before: { type: upperBand.highpassType, fc: upperBand.highpassFreq },
        fit,
        raw: upperRaw,
      }
      updateBand(idx + 1, { highpassType: fit.best.type, highpassFreq: fit.best.fc })
    }

    setResult({
      targetLabel: `${TYPE_SHORT[targetType] ?? targetType} @ ${targetFc} Hz`,
      lower,
      upper,
    })
  }

  const plotData = useMemo(() => {
    if (!result) return null
    const series: { x: number[]; y: number[]; name: string; color: string; dash?: boolean }[] = []
    const push = (side: SideResult | null, rawColor: string, achievedColor: string, suffix: string) => {
      if (!side) return
      const x = side.raw.map((p) => p.freq)
      const ref = side.fit.passbandRefDb
      series.push({ x, y: side.raw.map((p) => p.magnitude - ref), name: `${side.roleLabel} rå ${suffix}`, color: rawColor })
      series.push({ x, y: side.fit.achieved.map((p) => p.magnitude - ref), name: `${side.roleLabel} opnået`, color: achievedColor })
      series.push({ x, y: side.fit.target.map((p) => p.magnitude - ref), name: `Mål (${suffix})`, color: '#6b7280', dash: true })
    }
    push(result.lower, '#93c5fd', '#3b82f6', 'LP')
    push(result.upper, '#fcd34d', '#f59e0b', 'HP')
    return series
  }, [result])

  return (
    <Card title="Akustiske mål-slopes">
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
        Vælg det <strong>akustiske</strong> mål ved delefrekvensen. Værktøjet finder de
        elektriske filtre der bedst rammer målet oven på drivernes baffle-korrigerede
        råkurver — den elektriske orden bliver typisk lavere end den akustiske, fordi
        driverens egen rolloff hjælper til. Gain røres ikke.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        {xoCount > 1 && (
          <Select
            label="Delepunkt"
            value={idx}
            onChange={(v) => setXoIndex(parseInt(v))}
            options={Array.from({ length: xoCount }, (_, i) => ({
              value: i,
              label: `${ROLE_LABELS[design.bands[i]?.role ?? ''] ?? i} / ${ROLE_LABELS[design.bands[i + 1]?.role ?? ''] ?? i + 1}`,
            }))}
          />
        )}
        <Select
          label="Akustisk mål"
          value={targetType}
          onChange={(v) => setTargetType(v as CrossoverType)}
          options={TARGET_TYPES}
        />
        <NumberInput label="Målfrekvens" unit="Hz" value={targetFc} min={40} max={18000} step={50} onChange={(v) => setTargetFc(Math.round(v))} />
        <Button variant="primary" onClick={runFit} disabled={!canFit}>
          Fit elektriske filtre
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          {[result.lower, result.upper].map((side, i) =>
            side ? (
              <div key={i} className="text-sm">
                <span className="font-medium">{side.roleLabel} {i === 0 ? 'lavpas' : 'højpas'}:</span>{' '}
                mål {result.targetLabel} → elektrisk{' '}
                <span className="font-semibold">
                  {TYPE_SHORT[side.fit.best.type] ?? side.fit.best.type} @ {side.fit.best.fc} Hz
                </span>{' '}
                <span className="text-gray-500">
                  (før: {TYPE_SHORT[side.before.type] ?? side.before.type} @ {Math.round(side.before.fc)} Hz ·
                  afvigelse {side.fit.best.errorDb.toFixed(1)} dB RMS)
                </span>
              </div>
            ) : null,
          )}
          {plotData && (
            <ResponsivePlot data={plotData} yLabel="dB (rel. passbånd)" yRange={[-50, 10]} />
          )}
          <p className="text-xs text-gray-500">
            Kurverne er normaliseret til hvert bånds passbånds-niveau. Filtrene er
            anvendt på båndene — se den summerede respons i plottet ovenfor og i
            dashboardet. Fortryd ved at sætte type/frekvens tilbage manuelt.
          </p>
        </div>
      )}
    </Card>
  )
}

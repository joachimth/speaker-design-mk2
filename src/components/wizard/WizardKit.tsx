// Shared building blocks for the wizard flows (SPEC §7.2–§7.3):
// step indicator, word-based goal sliders, score ring, ranked driver cards
// and cabinet suggestion cards. All numbers come from the real engine via
// engine/score.ts and engine/enclosure/alignments.ts.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, StatCard } from '@/components/common/UI'
import { useDesignStore } from '@/store/designStore'
import { ventedAlignments, optimizeVentedFlat } from '@/engine/enclosure/alignments'
import { scoreDriverInBox, type DriverScore, type ScoreGoals } from '@/engine/score'
import type { Driver } from '@/types'

// ---------------------------------------------------------------------------
// Step header
// ---------------------------------------------------------------------------

export function StepHeader({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i < step ? 'bg-brand-600 w-8' : 'bg-gray-200 dark:bg-gray-700 w-4'
            }`}
          />
        ))}
        <span className="text-xs text-gray-400 ml-2">Trin {step} af {total}</span>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Word-based goal sliders (SPEC §7.2: "ord-baserede slidere, ikke tal")
// ---------------------------------------------------------------------------

const PRIORITY_WORDS = ['Ligegyldigt', 'Lidt vigtigt', 'Mellem', 'Vigtigt', 'Topprioritet']

function WordSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number // 0..1
  onChange: (v: number) => void
}) {
  const idx = Math.round(value * 4)
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-xs text-brand-600 dark:text-brand-400 font-medium">{PRIORITY_WORDS[idx]}</span>
      </div>
      <input
        type="range"
        min={0}
        max={4}
        step={1}
        value={idx}
        onChange={(e) => onChange(Number(e.target.value) / 4)}
        className="w-full accent-brand-600"
        aria-label={label}
      />
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{PRIORITY_WORDS[0]}</span>
        <span>{PRIORITY_WORDS[4]}</span>
      </div>
    </div>
  )
}

export function GoalSliders({
  goals,
  onChange,
}: {
  goals: ScoreGoals
  onChange: (g: ScoreGoals) => void
}) {
  return (
    <div className="space-y-5">
      <WordSlider
        label="Dyb bas (lav F3)"
        value={goals.bassDepth}
        onChange={(v) => onChange({ ...goals, bassDepth: v })}
      />
      <WordSlider
        label="Højt maks-lydtryk"
        value={goals.maxSpl}
        onChange={(v) => onChange({ ...goals, maxSpl: v })}
      />
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={goals.allowPorted}
          onChange={(e) => onChange({ ...goals, allowPorted: e.target.checked })}
          className="accent-brand-600"
        />
        Tillad basrefleks (port) — mere dyb bas, større krav til port
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score ring
// ---------------------------------------------------------------------------

export function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = size * 0.38
  const c = 2 * Math.PI * r
  const color = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const mid = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${Math.round(score)} af 100`}>
      <circle cx={mid} cy={mid} r={r} fill="none" strokeWidth={size * 0.1} className="stroke-gray-200 dark:stroke-gray-700" />
      <circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={size * 0.1}
        strokeDasharray={`${(Math.max(score, 2) / 100) * c} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${mid} ${mid})`}
      />
      <text x={mid} y={mid + size * 0.09} textAnchor="middle" fontSize={size * 0.26} fontWeight={600} className="fill-gray-800 dark:fill-gray-100">
        {Math.round(score)}
      </text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Ranked driver card ("Hvorfor ser det sådan ud?" = expandable parts)
// ---------------------------------------------------------------------------

export const BOX_TYPE_LABEL: Record<'sealed' | 'ported', string> = {
  sealed: 'Lukket',
  ported: 'Ported',
}

export function DriverScoreCard({
  rank,
  driver,
  score,
  onSelect,
}: {
  rank: number
  driver: Driver
  score: DriverScore
  onSelect: () => void
}) {
  const [open, setOpen] = useState(false)
  const box = score.box
  return (
    <div
      className={`rounded-xl border-2 p-4 bg-white dark:bg-gray-800 ${
        rank <= 3 ? 'border-brand-300 dark:border-brand-700' : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-center gap-3">
        <ScoreRing score={score.total} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {rank <= 3 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">
                TOP {rank}
              </span>
            )}
            <span className="text-xs text-gray-400 capitalize">{driver.type}</span>
          </div>
          <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {driver.manufacturer} {driver.model}
          </div>
          <div className="text-xs text-gray-500">
            {BOX_TYPE_LABEL[box.type]} {box.vbL.toFixed(1)} L
            {box.fbHz ? ` @ ${box.fbHz.toFixed(0)} Hz` : box.qtc ? ` (Qtc ${box.qtc.toFixed(2)})` : ''}
            {' · '}F3 ≈ {box.f3.toFixed(0)} Hz
          </div>
        </div>
        <Button onClick={onSelect} variant="primary" size="sm">
          Vælg
        </Button>
      </div>

      <button
        onClick={() => setOpen(!open)}
        className="mt-2 text-xs text-brand-500 hover:text-brand-600"
      >
        {open ? '▾ Skjul begrundelse' : '▸ Hvorfor denne score?'}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {score.parts.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-28 shrink-0">{p.label}</span>
              <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${p.score >= 70 ? 'bg-emerald-500' : p.score >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${p.score}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400 w-40 shrink-0 truncate" title={p.note}>
                {p.note}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cabinet suggestions for one driver (used by Flow B step 3 + "har enheder")
// ---------------------------------------------------------------------------

export interface CabinetSuggestion {
  id: string
  label: string
  type: 'sealed' | 'ported'
  vbL: number
  fbHz?: number
  note: string
  score: DriverScore | null
}

export function useCabinetSuggestions(
  driver: Driver | undefined,
  goals: ScoreGoals,
  maxVbL?: number,
): CabinetSuggestion[] {
  return useMemo(() => {
    const ts = driver?.tsParams
    if (!driver || !ts?.fs || !ts.qts || !ts.vas || !ts.sd) return []
    const out: CabinetSuggestion[] = []

    // Sealed Qtc ≈ 0.707
    if (ts.qts < 0.69) {
      let vb = ts.vas / (Math.pow(0.707 / ts.qts, 2) - 1)
      if (maxVbL) vb = Math.min(vb, maxVbL)
      out.push({
        id: 'sealed',
        label: 'Lukket (Qtc ≈ 0,71)',
        type: 'sealed',
        vbL: vb,
        note: 'Kompakt, præcis bas og enklest at bygge. Bedste transientkontrol.',
        score: scoreDriverInBox(driver, { type: 'sealed', vbL: vb }, goals),
      })
    }

    if (goals.allowPorted && ts.qts <= 0.55) {
      for (const a of ventedAlignments(ts)) {
        if (!a.applicable) continue
        let vb = a.vbL
        if (maxVbL && vb > maxVbL) continue
        out.push({
          id: a.id,
          label: `Ported ${a.label}`,
          type: 'ported',
          vbL: vb,
          fbHz: a.fbHz,
          note: a.note,
          score: scoreDriverInBox(driver, { type: 'ported', vbL: vb, fbHz: a.fbHz }, goals),
        })
      }
      // Numeric flat
      const r = optimizeVentedFlat(ts, { maxVbL })
      out.push({
        id: 'numeric',
        label: 'Ported (numerisk flat)',
        type: 'ported',
        vbL: r.vbL,
        fbHz: r.fbHz,
        note: `Nelder–Mead på den fulde model: F3 ≈ ${r.f3.toFixed(1)} Hz, puk ${r.humpDb.toFixed(1)} dB.`,
        score: scoreDriverInBox(driver, { type: 'ported', vbL: r.vbL, fbHz: r.fbHz }, goals),
      })
    }

    out.sort((x, y) => (y.score?.total ?? 0) - (x.score?.total ?? 0))
    return out
  }, [driver, goals, maxVbL])
}

export function CabinetSuggestionCard({
  suggestion,
  onSelect,
}: {
  suggestion: CabinetSuggestion
  onSelect: () => void
}) {
  const s = suggestion
  return (
    <div className="rounded-xl border-2 border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
      <div className="flex items-center gap-3">
        {s.score && <ScoreRing score={s.score.total} />}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 dark:text-gray-100">{s.label}</div>
          <div className="text-xs text-gray-500">
            {s.vbL.toFixed(1)} L{s.fbHz ? ` @ ${s.fbHz.toFixed(1)} Hz` : ''}
            {s.score ? ` · F3 ≈ ${s.score.box.f3.toFixed(0)} Hz` : ''}
          </div>
        </div>
        <Button onClick={onSelect} variant="primary" size="sm">
          Vælg
        </Button>
      </div>
      <p className="mt-2 text-xs text-gray-500">{s.note}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Apply a wizard result to the shared design store and jump to the system
// ---------------------------------------------------------------------------

export function useApplyWizardResult() {
  const navigate = useNavigate()
  const { design, updateDesign, updateBand } = useDesignStore()

  return function apply(driver: Driver, box: { type: 'sealed' | 'ported'; vbL: number; fbHz?: number }) {
    updateDesign({
      cabinetType: box.type,
      portVb: box.type === 'ported' ? Math.round(box.vbL * 10) / 10 : null,
      portFb: box.type === 'ported' && box.fbHz ? Math.round(box.fbHz * 10) / 10 : null,
    })
    // Put the chosen driver in the low band; leave the rest of the design as-is
    updateBand(0, { driverId: driver.id })
    // Nudge baffle width to fit the driver if it is wider than the current baffle
    const overall = driver.dimensions?.overallDiameter
    if (overall && overall + 60 > design.baffleWidth) {
      updateDesign({ baffleWidth: overall + 60 })
    }
    navigate('/dashboard')
  }
}

// ---------------------------------------------------------------------------
// Small shared wrapper
// ---------------------------------------------------------------------------

export function WizardPage({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl mx-auto space-y-4">{children}</div>
}

export function WizardNav({
  onBack,
  onNext,
  nextLabel = 'Næste',
  nextDisabled = false,
}: {
  onBack?: () => void
  onNext?: () => void
  nextLabel?: string
  nextDisabled?: boolean
}) {
  return (
    <div className="flex justify-between mt-4">
      {onBack ? (
        <Button variant="secondary" onClick={onBack}>
          ← Tilbage
        </Button>
      ) : (
        <div />
      )}
      {onNext && (
        <Button variant="primary" onClick={onNext} disabled={nextDisabled}>
          {nextLabel} →
        </Button>
      )}
    </div>
  )
}

// Re-export for pages
export { Card, StatCard }

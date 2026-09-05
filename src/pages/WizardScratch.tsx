// Flow B (SPEC §7.3): "Start fra bunden" — 4 trin:
// 1) mål (ord-slidere + pladsloft), 2) foreslåede enheder (auto-boks),
// 3) kabinetforslag for valgt enhed, 4) opsummering → opret design.

import { useMemo, useState } from 'react'
import { useDriverStore } from '@/store/driverStore'
import { NumberInput, StatCard } from '@/components/common/UI'
import { rankDriversAutoBox, type ScoreGoals } from '@/engine/score'
import {
  WizardPage,
  StepHeader,
  WizardNav,
  GoalSliders,
  DriverScoreCard,
  CabinetSuggestionCard,
  useCabinetSuggestions,
  useApplyWizardResult,
  BOX_TYPE_LABEL,
  Card,
  type CabinetSuggestion,
} from '@/components/wizard/WizardKit'

export default function WizardScratch() {
  const { drivers } = useDriverStore()
  const apply = useApplyWizardResult()

  const [step, setStep] = useState(1)
  const [goals, setGoals] = useState<ScoreGoals>({ bassDepth: 0.5, maxSpl: 0.5, allowPorted: true })
  const [maxVbL, setMaxVbL] = useState(100)
  const [driverId, setDriverId] = useState<string | null>(null)
  const [chosen, setChosen] = useState<CabinetSuggestion | null>(null)

  const ranked = useMemo(
    () => (step === 2 ? rankDriversAutoBox(drivers, goals, maxVbL).slice(0, 8) : []),
    [step, drivers, goals, maxVbL],
  )

  const driver = drivers.find((d) => d.id === driverId) ?? undefined
  const suggestions = useCabinetSuggestions(step === 3 ? driver : undefined, goals, maxVbL)

  return (
    <WizardPage>
      {step === 1 && (
        <>
          <StepHeader step={1} total={4} title="Hvad skal højttaleren kunne?" />
          <Card>
            <GoalSliders goals={goals} onChange={setGoals} />
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <NumberInput label="Maks. kabinetvolumen" unit="L" value={maxVbL} min={2} max={500} onChange={setMaxVbL} />
              <p className="text-xs text-gray-500">
                Groft pladsloft — 20 L er en kompakt standmodel, 60–120 L en gulvhøjttaler.
              </p>
            </div>
          </Card>
          <WizardNav onNext={() => setStep(2)} nextLabel="Foreslå enheder" />
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader step={2} total={4} title="Foreslåede enheder" />
          <p className="text-sm text-gray-500 -mt-2">
            Hver enhed har fået sit eget bedste kabinet (lukket Qtc ≈ 0,71 eller QB3-ported)
            under dit pladsloft, simuleret med den fulde motor.
          </p>
          <div className="space-y-3">
            {ranked.map((s, i) => {
              const d = drivers.find((x) => x.id === s.driverId)!
              return (
                <DriverScoreCard
                  key={s.driverId}
                  rank={i + 1}
                  driver={d}
                  score={s}
                  onSelect={() => {
                    setDriverId(s.driverId)
                    setChosen(null)
                    setStep(3)
                  }}
                />
              )
            })}
            {ranked.length === 0 && (
              <Card>
                <p className="text-sm text-gray-500">Ingen enheder med komplette T/S-parametre fundet.</p>
              </Card>
            )}
          </div>
          <WizardNav onBack={() => setStep(1)} />
        </>
      )}

      {step === 3 && driver && (
        <>
          <StepHeader step={3} total={4} title={`Kabinet til ${driver.manufacturer} ${driver.model}`} />
          <div className="space-y-3">
            {suggestions.map((s) => (
              <CabinetSuggestionCard
                key={s.id}
                suggestion={s}
                onSelect={() => {
                  setChosen(s)
                  setStep(4)
                }}
              />
            ))}
          </div>
          <WizardNav onBack={() => setStep(2)} />
        </>
      )}

      {step === 4 && driver && chosen && (
        <>
          <StepHeader step={4} total={4} title="Dit startpunkt" />
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Enhed" value={`${driver.manufacturer} ${driver.model}`} />
              <StatCard label="Kabinet" value={`${BOX_TYPE_LABEL[chosen.type]} ${chosen.vbL.toFixed(1)} L`} />
              <StatCard label="Tuning" value={chosen.fbHz ? `${chosen.fbHz.toFixed(1)} Hz` : '—'} />
              <StatCard label="F3" value={chosen.score ? `${chosen.score.box.f3.toFixed(0)} Hz` : '—'} />
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Designet oprettes med enheden i basbåndet og kabinettet sat op. Herefter kan du
              tilføje diskant/mellemtone, delefilter og rum i Simulering — og finjustere kabinettet
              under Kabinetdesign.
            </p>
          </Card>
          <WizardNav
            onBack={() => setStep(3)}
            onNext={() => apply(driver, { type: chosen.type, vbL: chosen.vbL, fbHz: chosen.fbHz })}
            nextLabel="Opret design"
          />
        </>
      )}
    </WizardPage>
  )
}

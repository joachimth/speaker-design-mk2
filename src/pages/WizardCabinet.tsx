// Flow A (SPEC §7.2): "Jeg har et kabinet" — 3 trin:
// 1) kabinettets indre volumen, 2) mål som ord-slidere, 3) rangerede drivere.

import { useMemo, useState } from 'react'
import { useDriverStore } from '@/store/driverStore'
import { NumberInput } from '@/components/common/UI'
import { rankDriversForBox, type ScoreGoals } from '@/engine/score'
import {
  WizardPage,
  StepHeader,
  WizardNav,
  GoalSliders,
  DriverScoreCard,
  useApplyWizardResult,
  Card,
} from '@/components/wizard/WizardKit'

export default function WizardCabinet() {
  const { drivers } = useDriverStore()
  const apply = useApplyWizardResult()

  const [step, setStep] = useState(1)
  const [vbL, setVbL] = useState(40)
  const [goals, setGoals] = useState<ScoreGoals>({ bassDepth: 0.5, maxSpl: 0.5, allowPorted: true })

  const ranked = useMemo(
    () => (step === 3 ? rankDriversForBox(drivers, vbL, goals).slice(0, 10) : []),
    [step, drivers, vbL, goals],
  )

  return (
    <WizardPage>
      {step === 1 && (
        <>
          <StepHeader step={1} total={3} title="Hvor stort er dit kabinet?" />
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <NumberInput label="Indre nettovolumen" unit="L" value={vbL} min={1} max={500} onChange={setVbL} />
              <p className="text-xs text-gray-500">
                Indre mål minus plader, forstærkning og port. Kender du kun de ydre mål:
                (B−2t)×(H−2t)×(D−2t) i mm ÷ 1.000.000 ≈ liter.
              </p>
            </div>
          </Card>
          <WizardNav onNext={() => setStep(2)} nextDisabled={vbL <= 0} />
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader step={2} total={3} title="Hvad er vigtigt for dig?" />
          <Card>
            <GoalSliders goals={goals} onChange={setGoals} />
          </Card>
          <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="Find enheder" />
        </>
      )}

      {step === 3 && (
        <>
          <StepHeader step={3} total={3} title={`Bedste enheder til ${vbL} L`} />
          <p className="text-sm text-gray-500 -mt-2">
            Hver enhed er simuleret i dit volumen (lukket og ported) med den fulde fysikmotor.
            Scoren er et startpunkt — åbn designet og finjustér.
          </p>
          <div className="space-y-3">
            {ranked.map((s, i) => {
              const driver = drivers.find((d) => d.id === s.driverId)!
              return (
                <DriverScoreCard
                  key={s.driverId}
                  rank={i + 1}
                  driver={driver}
                  score={s}
                  onSelect={() => apply(driver, s.box)}
                />
              )
            })}
            {ranked.length === 0 && (
              <Card>
                <p className="text-sm text-gray-500">
                  Ingen enheder med komplette T/S-parametre fundet. Tilføj drivere under Enheder.
                </p>
              </Card>
            )}
          </div>
          <WizardNav onBack={() => setStep(2)} />
        </>
      )}
    </WizardPage>
  )
}

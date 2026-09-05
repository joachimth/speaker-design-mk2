// "Jeg har enheder" (SPEC §7.1 indgang B): vælg driver → mål → kabinetforslag.

import { useState } from 'react'
import { useDriverStore } from '@/store/driverStore'
import { Select } from '@/components/common/UI'
import type { ScoreGoals } from '@/engine/score'
import {
  WizardPage,
  StepHeader,
  WizardNav,
  GoalSliders,
  CabinetSuggestionCard,
  useCabinetSuggestions,
  useApplyWizardResult,
  Card,
} from '@/components/wizard/WizardKit'

export default function WizardDriver() {
  const { drivers } = useDriverStore()
  const apply = useApplyWizardResult()

  const [step, setStep] = useState(1)
  const [driverId, setDriverId] = useState('')
  const [goals, setGoals] = useState<ScoreGoals>({ bassDepth: 0.5, maxSpl: 0.5, allowPorted: true })

  const driver = drivers.find((d) => d.id === driverId) ?? drivers[0]
  const suggestions = useCabinetSuggestions(step === 3 ? driver : undefined, goals)

  return (
    <WizardPage>
      {step === 1 && (
        <>
          <StepHeader step={1} total={3} title="Hvilken enhed vil du bygge med?" />
          <Card>
            <Select
              label="Enhed (bas/bund i designet)"
              value={driver?.id || ''}
              onChange={setDriverId}
              options={drivers.map((d) => ({
                value: d.id,
                label: `${d.manufacturer} ${d.model} (${d.type})`,
              }))}
            />
            {driver?.tsParams && (
              <p className="mt-3 text-xs text-gray-500">
                fs {driver.tsParams.fs} Hz · Qts {driver.tsParams.qts} · Vas {driver.tsParams.vas} L ·
                Xmax {driver.tsParams.xmax || '—'} mm
              </p>
            )}
          </Card>
          <WizardNav onNext={() => setStep(2)} nextDisabled={!driver} />
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader step={2} total={3} title="Hvad er vigtigt for dig?" />
          <Card>
            <GoalSliders goals={goals} onChange={setGoals} />
          </Card>
          <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="Beregn kabinetter" />
        </>
      )}

      {step === 3 && driver && (
        <>
          <StepHeader step={3} total={3} title={`Kabinetforslag til ${driver.manufacturer} ${driver.model}`} />
          <p className="text-sm text-gray-500 -mt-2">
            Alle forslag er simuleret med den fulde fysikmotor. Vælg ét som startpunkt.
          </p>
          <div className="space-y-3">
            {suggestions.map((s) => (
              <CabinetSuggestionCard
                key={s.id}
                suggestion={s}
                onSelect={() => apply(driver, { type: s.type, vbL: s.vbL, fbHz: s.fbHz })}
              />
            ))}
            {suggestions.length === 0 && (
              <Card>
                <p className="text-sm text-gray-500">
                  Enheden mangler T/S-parametre (fs, Qts, Vas, Sd) — udfyld dem under Enheder.
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

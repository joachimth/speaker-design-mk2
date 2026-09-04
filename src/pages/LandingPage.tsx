// Landing page — the mk2 wizard with 3 entry points.
// "Hvad har du?" → I have a cabinet / I have drivers / Start from scratch

import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/common/UI'

export function LandingPage() {
  const navigate = useNavigate()

  function goToCabinetMatch() {
    navigate('/match')
  }

  function goToDrivers() {
    navigate('/drivers')
  }

  function goToFromScratch() {
    navigate('/cabinet')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-brand-600 mb-3">
          🔊 Speaker Design 4 All
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Design og simuler højttalere med ægte målte frekvensdata
        </p>
      </div>

      <Card>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-6 text-center">
          Hvad har du?
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Entry A: I have a cabinet */}
          <button
            onClick={goToCabinetMatch}
            className="group p-6 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-400 transition-colors text-left"
          >
            <div className="text-4xl mb-3">📦</div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Jeg har et kabinet
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Vi finder de bedste enheder til dit kabinet
            </p>
            <div className="mt-3 text-xs text-brand-500 group-hover:translate-x-1 transition-transform">
              Find enheder →
            </div>
          </button>

          {/* Entry B: I have drivers */}
          <button
            onClick={goToDrivers}
            className="group p-6 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-400 transition-colors text-left"
          >
            <div className="text-4xl mb-3">🔊</div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Jeg har enheder
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Vi beregner det bedste kabinet
            </p>
            <div className="mt-3 text-xs text-brand-500 group-hover:translate-x-1 transition-transform">
              Beregn kabinet →
            </div>
          </button>

          {/* Entry C: Start from scratch */}
          <button
            onClick={goToFromScratch}
            className="group p-6 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-400 transition-colors text-left"
          >
            <div className="text-4xl mb-3">✨</div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Jeg starter fra bunden
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Vælg koncept, enheder og kabinet
            </p>
            <div className="mt-3 text-xs text-brand-500 group-hover:translate-x-1 transition-transform">
              Start design →
            </div>
          </button>
        </div>
      </Card>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-400">
          Fysikmotor med Thiele/Small, CEA-2034 spinorama, baffle-diffraktion og
          aktivt delefilter-design. Alt simuleres med komplekse overføringsfunktioner.
        </p>
      </div>
    </div>
  )
}

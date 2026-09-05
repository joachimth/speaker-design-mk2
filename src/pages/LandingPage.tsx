// Landing page — the mk2 wizard with 3 entry points (SPEC §7.1).
// "Hvad har du?" → I have a cabinet / I have drivers / Start from scratch
// Plus "Seneste designs" so returning users land directly in their work.

import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Card } from '@/components/common/UI'
import { getAllProjects } from '@/db/database'
import { useDesignStore } from '@/store/designStore'
import type { Project } from '@/types'

export function LandingPage() {
  const navigate = useNavigate()
  const { loadDesign } = useDesignStore()
  const [recent, setRecent] = useState<Project[]>([])

  function openRecent(p: Project) {
    if (p.designState) {
      loadDesign(p.designState, p.name, p.id)
      navigate('/system')
    } else {
      navigate('/overview')
    }
  }

  useEffect(() => {
    let cancelled = false
    getAllProjects()
      .then((all) => {
        if (cancelled) return
        const sorted = [...all].sort(
          (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
        )
        setRecent(sorted.slice(0, 3))
      })
      .catch(() => setRecent([]))
    return () => {
      cancelled = true
    }
  }, [])

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

      {recent.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Seneste designs
            </h2>
            <button
              onClick={() => navigate('/overview')}
              className="text-xs text-brand-500 hover:text-brand-600"
            >
              Alle projekter →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recent.map((p) => (
              <button
                key={p.id}
                onClick={() => openRecent(p)}
                className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand-400 transition-colors text-left bg-white dark:bg-gray-800"
              >
                <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(p.updatedAt ?? p.createdAt).toLocaleDateString('da-DK')}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-400">
          Fysikmotor med Thiele/Small, CEA-2034 spinorama, baffle-diffraktion og
          aktivt delefilter-design. Alt simuleres med komplekse overføringsfunktioner.
        </p>
      </div>
    </div>
  )
}

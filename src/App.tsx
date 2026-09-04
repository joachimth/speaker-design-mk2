import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import DriverManager from './pages/DriverManager'
import CabinetDesigner from './pages/CabinetDesigner'
import CrossoverDesigner from './pages/CrossoverDesigner'
import SystemSimulation from './pages/SystemSimulation'
import { LandingPage } from './pages/LandingPage'
import { ErrorBoundary } from '@/components/ErrorBoundary'
const CabinetMatch = lazy(() => import('./pages/CabinetMatch'))
const DesignCompare = lazy(() => import('./pages/DesignCompare'))
const WaveguideDesigner = lazy(() => import('./components/WaveguideDesigner').then(m => ({ default: m.WaveguideDesigner })))
import { useDriverStore } from './store/driverStore'
import { useDesignStore } from '@/store/designStore';
import { HelpTour, HelpTourButton } from '@/components/HelpTour';
import { SEED_DRIVERS } from './data/seedDrivers'
import { db } from './db/database'

export default function App() {
  const { loadDrivers } = useDriverStore()
  const { projectName, isDirty } = useDesignStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Initialize: ensure all seed drivers are in the database
  useEffect(() => {
    async function init() {
      const allDrivers = await db.drivers.toArray()
      const existingIds = new Set(allDrivers.map((d) => d.id))
      const missing = SEED_DRIVERS.filter((d) => !existingIds.has(d.id))
      if (missing.length > 0) {
        await db.drivers.bulkPut(missing)
      }
      await loadDrivers()
    }
    init()
  }, [loadDrivers])

  const displayName = projectName || 'Ikke navngivet'

  const navItems = [
    { to: '/', label: 'Start' },
    { to: '/drivers', label: 'Enheder' },
    { to: '/cabinet', label: 'Kabinet' },
    { to: '/match', label: 'Kabinet Match' },
    { to: '/crossover', label: 'Delingsfilter' },
    { to: '/system', label: 'System Sim.' },
    { to: '/compare', label: 'A/B Sammenlign' },
    { to: '/waveguide', label: 'Waveguide' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <NavLink to="/" className="text-lg sm:text-xl font-bold text-brand-600 whitespace-nowrap">
              🔊 Speaker Design 4 All
            </NavLink>

            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 ml-2">
              <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[160px]">
                {displayName}
              </span>
              {isDirty && <span className="text-amber-500" title="Ikke gemt">●</span>}
            </span>

            <nav className="hidden sm:flex gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <HelpTourButton />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="sm:hidden p-1.5 rounded-md text-gray-600 dark:text-gray-300"
                aria-label="Menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          <nav className="sm:hidden pb-3 space-y-1" style={{ display: mobileMenuOpen ? 'block' : 'none' }}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-md text-sm font-medium ${
                    isActive
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/drivers" element={<DriverManager />} />
          <Route path="/cabinet" element={<CabinetDesigner />} />
          <Route path="/match" element={<Suspense fallback={<div className="p-8 text-center text-gray-500">Indlæser...</div>}><CabinetMatch /></Suspense>} />
          <Route path="/crossover" element={<CrossoverDesigner />} />
          <Route path="/system" element={<SystemSimulation />} />
          <Route path="/compare" element={<Suspense fallback={<div className="p-8 text-center text-gray-500">Indlæser...</div>}><DesignCompare /></Suspense>} />
          <Route path="/waveguide" element={<Suspense fallback={<div className="p-8 text-center text-gray-500">Indlæser waveguide designer...</div>}><WaveguideDesigner /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
      </main>

      <HelpTour />

      <footer className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 text-center text-xs text-gray-400">
        Speaker Design 4 All — Fysikmotor med komplekse overføringsfunktioner, CEA-2034 spinorama, og auto-optimering.
      </footer>
    </div>
  )
}

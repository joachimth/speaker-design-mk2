# Speaker Design 4 All (mk2)

[![CI & Deploy](https://github.com/joachimth/speaker-design-mk2/actions/workflows/deploy.yml/badge.svg)](https://github.com/joachimth/speaker-design-mk2/actions/workflows/deploy.yml)

Næste generation af speaker-design værktøjet. Du fortæller appen hvad du har (et kabinet, nogle drivere, eller bare et ønske), og den giver dig et gennemsimuleret højttalerdesign med byggemål og DSP-indstillinger — og forklarer hvorfor.

**Live:** <https://joachimth.github.io/speaker-design-mk2/>

Alt kører client-side i browseren — ingen backend, ingen data forlader din maskine.

Kravgrundlaget er [docs/SPEC.md](docs/SPEC.md) (fuld UX-, arkitektur- og fysikmotor-spec). Aktuel status mod spec'en står i [ROADMAP.md](ROADMAP.md).

## Status (ærlig)

mk2 bygger på den fulde mk1-kodebase (315 tests) og er under aktiv udbygning mod spec'en. Det betyder:

- **Virker i dag:** komplet 2/3/4-vejs simulering med komplekse overføringsfunktioner, CEA-2034 spinorama, Harman/Olive preference-score, auto-optimizer (kun dæmpning, bånd 0 låst), EQ-filtre, biquad-eksport (MiniDSP 2x4 / 4x10 HD) + CamillaDSP YAML + byggeark, wizard-flows for alle tre indgange (kabinet→drivere med 8-dels forklarlig score, drivere→kabinet, fra bunden), kabinetberegner med **7 kabinettyper** (lukket/ported/passiv slave/bandpass/TL/horn/åben baffel) på den ægte lumped-element/T-matrix-motor, alignment-startpunkter (QB3/SBB4/B4/EBS + numerisk flat-optimering), excursion/porthastighed/maks-SPL, T/S-konsistensflag, 3D-kabinetbygger + STL, OS waveguide-designer, PDF/graf-digitizer, 37 drivere, projekt-gem/indlæs, A/B-sammenligning. 374 tests.
- **Under opbygning (se ROADMAP):** FRD/ZMA-import, A/B/C kvalitetsflag, reverse-null i UI, design-dashboard med versionering, golden tests mod WinISD/Hornresp-CSV, flere DSP-eksportformater.

## Arkitektur (mål jf. SPEC §2)

```
src/
├── engine/          # Headless fysikmotor — rene funktioner, SI-enheder, ingen UI-imports
│   ├── complex.ts   # Kompleks aritmetik (alle responser er komplekse H(f))
│   ├── frequencyAxis.ts
│   └── enclosure/   # TL, horn, bandpass, passiv radiator, åben baffel, port-hastighed
├── lib/acoustic/    # mk1-motoren (T/S, crossover, spinorama, optimizer) — migreres gradvist til engine/
├── lib/export/      # Byggeark, CamillaDSP, biquads, REW
├── workers/         # Simulation + optimizer i Web Workers
├── pages/           # Landing (wizard-indgange), Enheder, Kabinet, Match, Delefilter, System, Sammenlign
└── components/      # Kort og grafer
```

Grundregel fra spec'en: **motoren må aldrig forsimples for at gøre UI'et enklere.** Alle responser gemmes som komplekse overføringsfunktioner (amplitude *og* fase) og summeres komplekst.

## Udvikling

```bash
bun install
bun run dev        # dev-server
bun run test       # vitest (brug IKKE `bun test` — anden runner, falske fejl)
bun run lint
bun run build      # tsc -b && vite build
```

Deploy: push til `main` → GitHub Actions bygger og deployer til GitHub Pages. Docker-alternativ: `docker compose up` (nginx, statiske filer).

## Tech stack

React 18 + TypeScript + Vite, Tailwind CSS, Three.js, PDF.js, Dexie (IndexedDB), Zustand, Vitest.

## Relation til mk1

[speaker-design](https://github.com/joachimth/speaker-design) (mk1) er den stabile forgænger. mk2 arver hele mk1-motoren og bygger spec'ens lag ovenpå: headless engine, optimizer A/B/C, wizard-UX og fuld eksport-pakke.

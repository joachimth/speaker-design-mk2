# TODO — aktuel arbejdsliste

Langsigtet status mod spec: se [ROADMAP.md](ROADMAP.md). Krav: [docs/SPEC.md](docs/SPEC.md).

## Igangværende: reparation efter spec-audit (5. sep 2026)

### Fase A — Integritet
- [x] SPEC.md ind i repoet som autoritativt kravdokument
- [x] README/ROADMAP/TODO genskrevet så de beskriver mk2, ikke mk1
- [x] index.html title → "Speaker Design 4 All"
- [x] ProjectOverview routet igen (projekter kunne ikke indlæses/administreres)
- [x] Dark mode-toggle gendannet (regression fra mk1)
- [x] Enheds-toggle (mm/tommer) gendannet (regression fra mk1)
- [x] Seed-drivere: upsert i stedet for kun-manglende (regression fra mk1)
- [x] "Seneste designs" på landingssiden (SPEC §7.1)
- [x] CLAUDE.md: repo-layout med engine/ og korrekte kommandoer

### Fase B — Ægte engine (testet, ikke facade)
- [x] transmissionLine.ts omskrevet: kompleks T-matrix (brug engine/complex), driver-load fra faktisk linjeimpedans, kompleks summering, HF-asymptote korrekt → tests
- [x] passiveRadiator.ts verificeret mod Small's PR-model → tests
- [x] bandpass.ts 4. orden verificeret → tests
- [x] horn.ts: mundimpedans (ikke udkommenteret), kompleks summering → tests
- [x] portVelocity foldet ind i vented.ts (porthastighed = kanal fra samme kredsløb) → tests
- [x] Nyt modul: excursion x(f) + maks-SPL (displacement + termisk) → tests
- [x] Port-hastighed + excursion + maks-SPL i Kabinet-UI med 10/17 m/s advarsler (ExcursionPortCard)
- [x] Kabinettyper PR/bandpass/horn i UI + TL-editor på ny model (Fase C)

### Fase C — Spec-features (afsluttet 5. sep 2026)
- [x] Byggeark-eksport koblet til UI (Kabinetdesign → Eksport)
- [x] CamillaDSP-eksport koblet til UI (Simulering → Gem projekt)
- [x] Wizard Flow A (kabinet → drivere, 3 trin, 8-dels score) — /wizard/cabinet
- [x] Wizard Flow B (fra bunden, 4 trin) — /wizard/scratch + "har enheder" — /wizard/driver
- [x] Advarsler med "Anvend"-knap i de nye kabinetkort (PR Sd, portstørrelse, TL-fyld)
- [x] T/S konsistensflag i driverdetaljen (Enheder)
- [x] Alignments QB3/SBB4/B4/EBS + numerisk flat (Nelder–Mead) som startpunkter
- [x] 3 spec-drivere: E180HE-44, WF146WA05, W4-1052SDF (datablads-proveniens i noter)

### Fase D — afsluttet 5. sep 2026
- [x] Design-dashboard med status-badge + "Anvend"-advarsler samlet (SPEC §7.4) — /dashboard, lib/designHealth.ts, alle 7 kabinettyper, Fortryd-knap (faner + "Hvorfor"-lag kom i Fase E)
- [x] FRD/ZMA-import + A/B/C kvalitetsflag (SPEC §6, §9) — import i driverdetaljen, badges i liste+detalje, FRD-eksport af simuleret respons
- [x] Reverse-null-test i UI (SPEC §7.5) — Delingsfilter, fasebevidst summering, nul-dybde-vurdering
- [ ] Golden tests mod WinISD/Hornresp CSV (kræver eksterne kørsler)
- [x] Eksport-tests for byggeark/CamillaDSP + Equalizer APO-eksport (LPQ/HPQ-kaskader). NB: CamillaDSP/EqAPO-kanalnavne følger nu båndets rolle

### Fase E — afsluttet 5. sep 2026
- [x] Dashboard-faner (Oversigt/Spinorama/Delefilter/Impedans/Excursion & port) — spinorama/impedans/excursion beregnes lazy pr. fane på samme engine-kald som designHealth
- [x] "Hvorfor ser det sådan ud?"-annotationslag (lib/annotations.ts, testet) — bafflestep, kantdiffraktion, port/PR/bandpass-tuning, TL ¼-bølge, hornlængde, dipol-peak, delefrekvenser og F3 som markører + forklaringsliste på responsplottet
- [x] Design-versionering (SPEC §3) — snapshots med parent_version i IndexedDB (db v2, designVersions-tabel), Gem version/Gendan-kort i dashboardet, lineage/nummererings-helpers testet
- [x] Hypex FusionAmp / ADAU-eksport (lib/export/hypexAdau.ts, testet) — biquad-kaskader pr. kanal i tilbagekoblingsform (konvention angivet i headeren), ADAU også med 5.23-hex; gain/polaritet/delay pr. kanal. Tekstark til manuel indtastning i HFD/SigmaStudio — ingen native filformater
- [x] Akustiske mål-slopes (optimizer finder elektrisk filter der rammer akustisk LR4) — leveret i Fase F
- [ ] Golden tests mod WinISD/Hornresp CSV (fortsat åbent — eksterne kørsler)

### Fase F — leveret
- [x] Akustiske mål-slopes (SPEC §5.4): `lib/acoustic/targetSlopes.ts` + kort i CrossoverDesigner. Brugeren vælger akustisk mål (LR2/BW4/LR4/LR8 @ f); fittet finder elektrisk type+frekvens mod den baffle-korrigerede råkurve (deterministisk grid + fin-scan, stopbånds-guard, dobbeltvægt ±1 oktav om målet). Ændrer kun filtertype/-frekvens — aldrig gain. NB: BW4 ≡ LR4 i crossover.ts (dokumenteret forenkling)
- [x] Dashboard: Kabinet-fane — inline-redigering (kabinettype/Vb/Fb/port/baffelmål/roundover), stående bølger pr. akse (indv. dybde afledt af volumen), panelresonans (materiale/tykkelse/braces, front + side) og CAD-eksport. 3D bor fortsat i Kabinetdesign (link) — ikke embeddet i dashboardet
- [x] OpenSCAD-parametre / DXF R12 til baffeludskæring: `lib/export/openscadDxf.ts` — parametrisk .scad (alle mål som variabler) + DXF med outline og udskæringscirkler. Driverpositioner = deterministisk lodret stak (deles med diffraktionsmodellen via `lib/acoustic/baffleLayout.ts`)
- [x] Positionsafhængig kant-diffraktion (Joachims feedback 5/9): `calcBaffleDiffraction` — Vanderkooy-stil edge-integral pr. bånd (driver→kant-afstande, Δθ-vægtet, ripple + 6 dB-step i én model), roundover-dæmpning, wiret gennem processBand/simulateOnAxisWithBands/worker/optimizer/mål-slope-fit. Fallback til gammel shelf når driver-stakken ikke kan ligge på baflen. Punktkilde-antagelse (cutout-center); lytteposition on-axis far-field
- [ ] Golden tests mod WinISD/Hornresp CSV (eksterne kørsler — kan ikke laves i sandboxen; kræver kørsler på Joachims maskine)

## Regler (fra Joachim, gælder al optimizer-kode)
- Gains må KUN dæmpe, aldrig booste. Bånd 0 (woofer) altid låst på 0 dB.
- Autooptimizer må ikke ændre kabinet/drivervalg — kun foreslå.
- EQ kun på bånd med aktivt delefilter.
- Sim-sti og optimizer-sti skal dele summering + resampling.
- Tung CPU i Web Workers.

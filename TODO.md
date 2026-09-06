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
- [x] Off-axis-diffraktion pr. vinkel (opfølgning på Joachims feedback): `calcBaffleDiffractionOffAxis` i baffle.ts (edge-integral + far-field-projektion af observationsretningen) + per-vinkel delta Δ(f,h,v) i `calcSpinoramaMultiDriver` for positionsbevidste bånd. bandCurves bærer nu driverposition fra simulateOnAxisWithBands/worker, så dashboard-spinorama, SystemSimulation-spinorama og preference-score (alle scoreFromBands-stier) bruger samme placerings- og roundover-afhængige LW/ER/SP/DI/PIR. Delta ift. on-axis → ingen dobbelt-påføring af den indbagte diffraktion; legacy-kald uden position uændret. Grænser: far-field, front-halvkugle, ingen kabinetdybde-skygge; calcPolar er fortsat ren stempelmodel
- [x] Monteringsoverrides + Kudos X2-preset (6/9): `DesignBand.mount` (fast frontposition x/y eller sidemonteret) respekteret i `layoutBandPositions` — dermed i kantdiffraktion, spinorama, worker, mål-slopes og CAD-eksport uden yderligere wiring. Sidemonterede bånd får ingen frontbaffel-position → generisk baffelstep-fallback pr. bånd (dokumenteret tilnærmelse) og udelades af CAD-udskæringen. Layout-kontrakt ændret til top-til-bund (y faldende) så portplacering under nederste udskæring stadig holder. Indbygget preset `Kudos X2 (3-vejs)` (Joachims målte kabinet: 720×165×205, port Ø70×250 → Vb 13 L/fb 54 Hz konsistent med portLengthForTuning ≈ 251 mm; diskant y=655, mellemtone y=535, ScanSpeak sidemonteret 360 mm fra bund; XO 300/2800 LR4, pad −6 dB) + UI-felter for montering på bandkortet. 525 tests (19 nye i baffleLayout.test.ts + presets.test.ts)
- [x] Mk3 Reference-preset + sealed Vb-override (6/9): preset `preset-mk3-reference-joachim` fra mk3-reference-loudspeaker-repoets cabinet.scad — 2× GRS 12SW-4HE push-push SIDEMONTERET woofer_z=520 (driverCount 2), ScanSpeak 18W/4424G00 front mid_z=1065, SB26STAC-C000-4 UNDER midten tw_z=901 (c-c 164), 300×420×1180 lukket 75 L, R19, XO 200 BW4/1100 LR4, gains 0/−4/−9, rum 4,5×4×2,4 RT60 0,4. Sealed-grenen i calcCabinetResponse tager nu Vb-override (alfa = Vas/Vb → Fc/Qtc/F3; verificeret mod repoets alignment Fc≈39/Qtc≈0.76 med Vas×2) — wiret i processBand, kabinetkort, designCompare og kabinetoptimizerens sealed-sweep (sidstnævnte ignorerede volumen før = latent bug). Vb-felt i UI for lukket kabinet. designHealth-testen "større kasse → lavere F3" rettet: fysisk forkert præmis for overdæmpede kasser (Qtc<0.6 knækker tidligere målt fra midbånd) — nu 10 L vs 30 L på den fornuftige side af Qtc 0.707. Dokumenterede udeladelser: mid-kammer 13 L, waveguide +2,5 dB, Linkwitz Transform. 535 tests (10 nye: 6 preset + 4 engine)
- [x] Mount-bevidst tidsjustering + forskudt frontbaffel (6/9, Joachims feedback på mk3-presettet): delt `computeAutoDelays` i autoDesign.ts (bruges af SystemSimulation, CrossoverDesigner og preference-optimizerens Fase 1) regner nu kun på frontmonterede bånd — sidemonterede enheder giver null (delay røres ikke) i stedet for at stå som falsk 0 mm-reference (en sidemonteret bas' akustiske centrum ligger ikke i frontbaffel-planet, og under 200 Hz er λ ≥ 1,7 m alligevel). Tidsjusteringskortet er mount-bevidst: sidebånd vises stiplet som "sidemonteret — udenfor tidsjustering", summary regner kun frontenheder ("Dybeste center (front)", "✓ Frontenheder er tidsjusteret"). Nyt pr. bånd (kun front): mekanisk plan-forskydning zMm (+ = bag hovedplanet) — indgår i effektiv akustisk dybde (auto-delay) OG i fasesummeringen (depthMm-fase i complexSum, worker og PhaseAlignmentCard, negativ = fremrykket plan ankommer tidligere) — plus egen delbaffel baffleWMm×baffleHMm der giver båndet sin egen kantdiffraktionsberegning (enheden centreret på egen plade; global position bevares til CAD). Dermed kan en to-plans/forskudt frontbaffel designes, tidsjusteres mekanisk og ses i diffraktion/spinorama. Preset-delays baket: Mk3 SB26STAC 0,06 ms, Kudos BC25 0,04 ms + selvverificerende test (computeAutoDelays vs preset-delay for alle presets). Trinkanten mellem planerne modelleres ikke (dokumenteret i typerne); buildMiniDspConfig i cabinetMatch er fortsat mount-blind (kendt begrænsning). 548 tests (13 nye)
- [ ] Golden tests mod WinISD/Hornresp CSV (eksterne kørsler — kan ikke laves i sandboxen; kræver kørsler på Joachims maskine)

## Regler (fra Joachim, gælder al optimizer-kode)
- Gains må KUN dæmpe, aldrig booste. Bånd 0 (woofer) altid låst på 0 dB.
- Autooptimizer må ikke ændre kabinet/drivervalg — kun foreslå.
- EQ kun på bånd med aktivt delefilter.
- Sim-sti og optimizer-sti skal dele summering + resampling.
- Tung CPU i Web Workers.

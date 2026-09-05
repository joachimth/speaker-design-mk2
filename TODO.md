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
- [x] Design-dashboard med status-badge + "Anvend"-advarsler samlet (SPEC §7.4) — /dashboard, lib/designHealth.ts, alle 7 kabinettyper, Fortryd-knap. Faner + "Hvorfor"-lag udestår (Fase E)
- [x] FRD/ZMA-import + A/B/C kvalitetsflag (SPEC §6, §9) — import i driverdetaljen, badges i liste+detalje, FRD-eksport af simuleret respons
- [x] Reverse-null-test i UI (SPEC §7.5) — Delingsfilter, fasebevidst summering, nul-dybde-vurdering
- [ ] Golden tests mod WinISD/Hornresp CSV (kræver eksterne kørsler)
- [x] Eksport-tests for byggeark/CamillaDSP + Equalizer APO-eksport (LPQ/HPQ-kaskader). NB: CamillaDSP/EqAPO-kanalnavne følger nu båndets rolle

### Fase E — næste
- [ ] Dashboard-faner (Spinorama/XO/Impedans/Excursion i dashboardet) + "Hvorfor ser det sådan ud?"-annotationslag
- [ ] Design-versionering (snapshots med parent_version, SPEC §3)
- [ ] Akustiske mål-slopes (optimizer finder elektrisk filter der rammer akustisk LR4)
- [ ] Hypex FusionAmp / ADAU-eksport
- [ ] Golden tests mod WinISD/Hornresp CSV (fortsat åbent — eksterne kørsler)

## Regler (fra Joachim, gælder al optimizer-kode)
- Gains må KUN dæmpe, aldrig booste. Bånd 0 (woofer) altid låst på 0 dB.
- Autooptimizer må ikke ændre kabinet/drivervalg — kun foreslå.
- EQ kun på bånd med aktivt delefilter.
- Sim-sti og optimizer-sti skal dele summering + resampling.
- Tung CPU i Web Workers.

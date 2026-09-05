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
- [ ] Kabinettyper PR/bandpass/horn i UI + TL-editor på ny model (Fase C)

### Fase C — Spec-features
- [ ] Byggeark-eksport koblet til UI + tests
- [ ] CamillaDSP-eksport koblet til UI + tests
- [ ] Wizard Flow A (kabinet → drivere, 3 trin)
- [ ] Wizard Flow B (fra bunden, 4 trin)
- [ ] Dashboard-advarsler med "Anvend"-knap
- [ ] T/S konsistenskontrol ved driverimport
- [ ] Alignments (QB3/SBB4/C4/B4/EBS) som startpunkter

## Regler (fra Joachim, gælder al optimizer-kode)
- Gains må KUN dæmpe, aldrig booste. Bånd 0 (woofer) altid låst på 0 dB.
- Autooptimizer må ikke ændre kabinet/drivervalg — kun foreslå.
- EQ kun på bånd med aktivt delefilter.
- Sim-sti og optimizer-sti skal dele summering + resampling.
- Tung CPU i Web Workers.

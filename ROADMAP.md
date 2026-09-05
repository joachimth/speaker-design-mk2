# Roadmap — mod SPEC.md

Status pr. 5. september 2026, efter spec-audit. Faserne følger SPEC §11.
Reglen for afkrydsning: et punkt er først done når det er **implementeret, testet og koblet til UI** (ikke bare når filen findes).

## Fase 0 — Fundament
- [x] Repo, CI/CD (GitHub Pages), Docker
- [x] Kompleks-tal-hjælpere (`engine/complex.ts`)
- [x] Frekvensakse-modul (`engine/frequencyAxis.ts`)
- [x] mk1-basen overtaget: 315 tests, typecheck ren
- [ ] Enhedskonverteringsmodul med tests (SI internt, UI-konvertering)
- [ ] Driver/Enclosure/Design-typer udvidet jf. SPEC §3 (proveniens, Le-model, mekanik, versionering)

## Fase 1 — T/S + lukket + ported + PR + elektrisk
- [x] T/S grundmodel, lukket + ported (mk1-arv, testet)
- [x] Impedans-simulering (sealed/ported, simpel Le) (mk1-arv)
- [x] Passiv radiator-model — korrekt kredsløb med notch ved fp, testet (UI kommer med kabinettype-udvidelsen)
- [x] Port-hastighed over frekvens med advarselsgrænser (10/17 m/s) i UI (ExcursionPortCard)
- [x] Excursion x(f), maks-SPL (displacement + termisk) — engine/maxSpl + kredsløbsmodel, i UI
- [ ] Ported alignments som startpunkter (QB3, SBB4, C4, B4, EBS)
- [x] T/S konsistenskontrol-funktion (engine/driver.ts checkTsConsistency, testet — UI-flag mangler)
- [x] Analytiske golden tests: sealed Qtc=0,707 mod eksakt 2. ordens Butterworth (±0,8 dB), vented B4 mod 4. ordens Butterworth (±2 dB), piston-strålingsasymptoter, Bessel-facit
- [ ] Golden tests mod WinISD/Hornresp CSV-referencer (kræver eksterne kørsler)

## Fase 2 — Baffle + direktivitet + delefilter + spinorama
- [x] Baffle step + kantdiffraktion (approksimation, i sim-sti) (mk1-arv)
- [x] Direktivitet: målt off-axis + stempelmodel (mk1-arv)
- [x] Biquads (RBJ), kompleks summation, CEA-2034 spinorama + PIR (mk1-arv, testet)
- [x] LR2/LR4/LR8, BW2/BW4, 1. orden + EQ (PEQ/shelf) (mk1-arv)
- [ ] Reverse-null-test i UI
- [ ] Akustiske mål-slopes (elektrisk filter findes af optimizer for at ramme akustisk LR4)
- [ ] Numerisk kantdiffraktion pr. vinkel (Vanderkooy) — nuværende er formel-approksimation

## Fase 3 — Optimizer A/B/C
- [x] C: Delefilter-optimizer (Harman/Olive-score, koordinat-descent, Joachim-regler: kun dæmpning, bånd 0 låst, XO-grænser fra driver-range) (mk1-arv)
- [x] B: Kabinet-optimizer (volumen/tuning-sweep mod score) (mk1-arv, begrænset)
- [x] A: Driver-match til kabinet (Cabinet Match) (mk1-arv, begrænset)
- [ ] A: 8-dels forklarlig score 0-100 (alignment-fit, excursion-margin, port-realiserbarhed, mekanisk fit, DI-match, følsomhed, pris)
- [ ] B: geometri-optimering under constraints (maks-mål, baffle-bredde) med Nelder-Mead/DE
- [ ] C: akustisk-mål-drevet med PEQ-indsættelse, biquad-antal-constraint, excursion-constraint

## Fase 4 — UI: wizard + dashboard
- [x] Landing med tre indgange (tynd version)
- [x] Projekt-gem/indlæs, A/B-sammenligning, print (mk1-arv)
- [ ] Flow A "Jeg har et kabinet": 3 trin med ord-slidere → rangerede driverkort
- [ ] Flow B "Fra bunden / har drivere": 4 trin → beregn med fremdrift
- [ ] Design-dashboard: status-badge, redigerbar venstrekolonne, faner, advarsler med "Anvend"
- [ ] "Hvorfor ser det sådan ud?"-annotationslag
- [ ] Design-versionering (snapshots med parent_version)

## Fase 5 — TL, horn, bandpass, open baffle, kabinet-mekanik
- [x] Åben baffel (dipol-model) i kabinetberegner (mk1-arv)
- [x] Panelresonans + stående bølger (mk1-arv)
- [x] TL: korrekt kompleks T-matrix (segmenter, stuffing, offset-driver, ægte linjeimpedans-load), testet (UI-editor mangler)
- [x] Horn: T-matrix med fuld mundimpedans (Bessel/Struve), back/front-chamber, front/back-loaded, cutoff + mund-advarsel, testet (UI mangler)
- [x] Bandpass 4. orden (to-kammer kredsløb), testet (6. orden + UI mangler)
- [ ] Golden tests mod Hornresp (W4-1052SDF back-loaded horn som reference)

## Fase 6 — Eksport, DB-import, måle-feedback
- [x] Biquad-eksport: MiniDSP 2x4 / 4x10 HD, tekst/hex/JSON (mk1-arv, testet)
- [x] STL-eksport, design-JSON, REW-eksport (mk1-arv)
- [ ] Byggeark (findes som `lib/export/buildSheet.ts` — skal kobles til UI + testes)
- [ ] CamillaDSP YAML (findes som `lib/export/camillaDSP.ts` — skal kobles til UI + testes)
- [ ] Equalizer APO, Hypex FusionAmp, ADAU1701/1452
- [ ] OpenSCAD-parametre / DXF til baffeludskæring
- [ ] FRD/ZMA import
- [ ] Kvalitetsflag A/B/C + proveniens pr. driver
- [ ] Manglende spec-drivere: Dayton E180HE-44, Wavecor WF146WA05, TB W4-1052SDF

## Fase 7 — Polering
- [x] Responsivt design, dark mode, hjælpe-tour, enhedspræference (mk1-arv)
- [ ] Usikkerhedsbånd på kurver (proveniens-baseret)
- [ ] Skeleton-loading overalt, tastaturgenveje
- [ ] Del-som-link (design-JSON i URL)

## Kendte afvigelser fra spec (bevidste, v1)

Jf. SPEC §12: ingen passive delefiltre, ingen ikke-lineær simulering (BL(x)), ingen FEM/BEM, rumakustik kun som simpel model.

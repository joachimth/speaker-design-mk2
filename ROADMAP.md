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
- [x] Ported alignments som startpunkter: QB3/SBB4/B4/EBS lukket form + "numerisk flat" Nelder-Mead på fuld model (engine/enclosure/alignments.ts, testet, i Kabinetdesign-UI). C4 har ingen brugbar lukket form — dækkes af den numeriske optimizer
- [x] T/S konsistenskontrol-funktion (engine/driver.ts checkTsConsistency, testet) + UI-flag i Enheder (driverdetalje viser >10 % afvigelser)
- [x] Analytiske golden tests: sealed Qtc=0,707 mod eksakt 2. ordens Butterworth (±0,8 dB), vented B4 mod 4. ordens Butterworth (±2 dB), piston-strålingsasymptoter, Bessel-facit
- [ ] Golden tests mod WinISD/Hornresp CSV-referencer (kræver eksterne kørsler)

## Fase 2 — Baffle + direktivitet + delefilter + spinorama
- [x] Baffle step + kantdiffraktion (approksimation, i sim-sti) (mk1-arv)
- [x] Direktivitet: målt off-axis + stempelmodel (mk1-arv)
- [x] Biquads (RBJ), kompleks summation, CEA-2034 spinorama + PIR (mk1-arv, testet)
- [x] LR2/LR4/LR8, BW2/BW4, 1. orden + EQ (PEQ/shelf) (mk1-arv)
- [x] Reverse-null-test i UI (Delingsfilter: polaritetsflip på valgt overgang med den delte fasebevidste summering, nul-dybde-vurdering ved XO-frekvensen)
- [ ] Akustiske mål-slopes (elektrisk filter findes af optimizer for at ramme akustisk LR4)
- [ ] Numerisk kantdiffraktion pr. vinkel (Vanderkooy) — nuværende er formel-approksimation

## Fase 3 — Optimizer A/B/C
- [x] C: Delefilter-optimizer (Harman/Olive-score, koordinat-descent, Joachim-regler: kun dæmpning, bånd 0 låst, XO-grænser fra driver-range) (mk1-arv)
- [x] B: Kabinet-optimizer (volumen/tuning-sweep mod score) (mk1-arv, begrænset)
- [x] A: Driver-match til kabinet (Cabinet Match) (mk1-arv, begrænset)
- [x] A: 8-dels forklarlig score 0-100 på ægte sim (engine/score.ts: basdybde, flathed, maks-SPL, følsomhed, kasse-match, port-praktik, Xmax, datakvalitet — testet, driver wizard-rangeringen). DI-match og pris indgår ikke endnu
- [x] B: Vb/Fb-optimering med deterministisk Nelder-Mead på fuld model under volumenloft (optimizeVentedFlat, testet). Fuld geometri-optimering (ydre mål, baffelbredde) udestår
- [ ] C: akustisk-mål-drevet med PEQ-indsættelse, biquad-antal-constraint, excursion-constraint

## Fase 4 — UI: wizard + dashboard
- [x] Landing med tre indgange (tynd version)
- [x] Projekt-gem/indlæs, A/B-sammenligning, print (mk1-arv)
- [x] Flow A "Jeg har et kabinet": 3 trin med ord-slidere → rangerede driverkort med score-ring, top 3-badge og "Hvorfor denne score?"-udfoldning (/wizard/cabinet)
- [x] Flow B "Fra bunden": 4 trin (mål → enheder → kabinet → opsummering, /wizard/scratch) + "Jeg har enheder"-flow (/wizard/driver). Landing-indgangene peger nu på wizards
- [x] Design-dashboard (/dashboard, fælles slutskærm — wizards lander her): status-badge Klar/Kræver opmærksomhed/Ikke realiserbar med årsag, samlede engine-advarsler for alle 7 kabinettyper med "Anvend"-knap + Fortryd (lib/designHealth.ts, testet), nøgletal (F3, maks-SPL ved valgbar referenceeffekt, 8-dels score), systemrespons-plot, eksport-række (byggeark/CamillaDSP/EqAPO)
- [ ] Dashboard-faner (Spinorama/XO/Impedans/Excursion/Kabinet i selve dashboardet — i dag links til siderne) + fuld inline-redigering i venstrekolonnen
- [ ] "Hvorfor ser det sådan ud?"-annotationslag
- [ ] Design-versionering (snapshots med parent_version)

## Fase 5 — TL, horn, bandpass, open baffle, kabinet-mekanik
- [x] Åben baffel (dipol-model) i kabinetberegner (mk1-arv)
- [x] Panelresonans + stående bølger (mk1-arv)
- [x] TL: korrekt kompleks T-matrix (segmenter, stuffing, offset-driver, ægte linjeimpedans-load), testet + UI-editor på den nye model (længde/taper/fyld/offset, ¼λ-seed, plots)
- [x] Horn: T-matrix med fuld mundimpedans (Bessel/Struve), back/front-chamber, front/back-loaded, cutoff + mund-advarsel, testet + UI-kort (profil/topologi/arealer, mål-mundareal ved advarsel)
- [x] Bandpass 4. orden (to-kammer kredsløb), testet + UI-kort (6. orden udestår)
- [x] Passiv slave + alle nye typer valgbare som kabinettype i Kabinetdesign (7 typer). Systemsim-stien bruger nærmeste 2./4.-ordens tilnærmelse for PR/bandpass/horn — de ægte modeller driver kortene i Kabinetdesign
- [ ] Golden tests mod Hornresp (W4-1052SDF back-loaded horn som reference)

## Fase 6 — Eksport, DB-import, måle-feedback
- [x] Biquad-eksport: MiniDSP 2x4 / 4x10 HD, tekst/hex/JSON (mk1-arv, testet)
- [x] STL-eksport, design-JSON, REW-eksport (mk1-arv)
- [x] Byggeark koblet til UI (Kabinetdesign → Eksport: skæreliste, portspec, driverliste) — eksport-tests tilføjet
- [x] CamillaDSP YAML koblet til UI (Simulering + Dashboard) — eksport-tests tilføjet, kanalnavne følger nu båndets rolle (2-vejs = bass/treble)
- [x] Equalizer APO-eksport (LPQ/HPQ-dekomposition i kaskaderede 2. ordens-sektioner: BW2/LR2/BW4/LR4/LR8; polaritet via Copy, gain via Preamp, delay, PK/LS/HS-EQ; 1. ordens markeres ærligt som ikke-understøttet). Testet
- [ ] Hypex FusionAmp, ADAU1701/1452
- [ ] OpenSCAD-parametre / DXF til baffeludskæring
- [x] FRD/ZMA-import (eksplicit typede parsere — SPL forveksles aldrig med impedans; kommentarer, EU-decimalkomma, tab/semikolon, sortering; testet). Import på eksisterende enhed i driverdetaljen + FRD-eksport af simuleret systemrespons i Simulering
- [x] Kvalitetsflag A/B/C pr. driver (SPEC §6: A = målt on/off-axis + Z, B = målt on-axis, C = kun datablad) som badge i driverliste + detalje; C-drivere flages som info i dashboardet. Optimizer-straf for C og usikkerhedsbånd udestår
- [x] Manglende spec-drivere tilføjet med datablads-T/S: Dayton Epique E180HE-44 (seriekoblet 8 Ω), Wavecor WF146WA05, TB W4-1052SDF (fs/Q afledt af Mms/Cms/Rms — markeret i noter). 37 drivere i alt

## Fase 7 — Polering
- [x] Responsivt design, dark mode, hjælpe-tour, enhedspræference (mk1-arv)
- [ ] Usikkerhedsbånd på kurver (proveniens-baseret)
- [ ] Skeleton-loading overalt, tastaturgenveje
- [ ] Del-som-link (design-JSON i URL)

## Kendte afvigelser fra spec (bevidste, v1)

Jf. SPEC §12: ingen passive delefiltre, ingen ikke-lineær simulering (BL(x)), ingen FEM/BEM, rumakustik kun som simpel model.

<!-- Joachims originale mk2-spec, modtaget 4. sep 2026. Autoritativt krav-dokument for Speaker Design 4 All. -->

# speaker-design — Fuldstændig beskrivelse af UX, arkitektur og fysikmotor

*Arbejdsdokument til AI-drevet udvikling. Version 1.0 — september 2026.*

---

## 0. Formål med dokumentet

Dette dokument beskriver **hvordan** speaker-design skal bygges, så en AI (eller et menneske) kan arbejde modul for modul uden at miste det samlede billede. Det dækker:

1. Produktvision og designprincipper (hvad "Apple-niveau" konkret betyder her)
2. Lagdelt arkitektur — fysikmotor, data, optimizer, præsentation
3. Datamodel
4. Fysikmotorens moduler med formler og referencer
5. Optimizer (kabinet → drivere, drivere → kabinet, delefilter)
6. Driverdatabase
7. UX-flows skærm for skærm
8. Visualiseringer inkl. spinorama (CEA-2034)
9. Eksport (byggeark, DSP-presets)
10. Validering og kvalitetssikring
11. Faseinddelt byggeplan til AI med "definition of done" pr. modul

Grundregel gennem hele dokumentet: **Motoren må aldrig forsimples for at gøre UI'et enklere. UI'et skjuler kompleksitet — det fjerner den ikke.**

---

## 1. Vision og designprincipper

### 1.1 Én sætning
> Du fortæller appen hvad du har (et kabinet, nogle drivere, eller bare et ønske), og den giver dig et færdigt, gennemsimuleret højttalerdesign med byggemål og DSP-indstillinger — og forklarer hvorfor.

### 1.2 Hvad "Apple-niveau" betyder i praksis

| Princip | Konkret betydning i speaker-design |
|---|---|
| **Progressiv afsløring** | Tre niveauer overalt: (1) resultat + én sætning, (2) "Hvorfor?" med de 3–5 vigtigste tal, (3) "Ekspert" med alle kurver, parametre og antagelser. Brugeren vælger selv dybden. |
| **Ingen blindgyder** | Ethvert input fører til et resultat. Hvis noget ikke kan lade sig gøre (fx 2 × 15" i 20 liter), viser appen *hvor tæt* man er, og hvad der skal ændres. Aldrig en tom fejlmeddelelse. |
| **Live preview** | Enhver ændring (volumen, port, delefrekvens) opdaterer resultaterne med det samme (<100 ms for lumpede modeller, debounce + skeleton for tunge beregninger). |
| **Gode defaults** | Appen vælger altid et fornuftigt udgangspunkt (LR4, QB3-alignment, 18 mm MDF, port-hastighed < 10 m/s). Brugeren ændrer kun det, de vil. |
| **Forklar, ikke bare vis** | Hver score og advarsel har et "hvorfor" i almindeligt dansk. "Denne bas passer godt: EBP = 78 (ok til både lukket og ported), Vas/Vb = 1,4 giver Qtc = 0,71." |
| **Tillid via proveniens** | Alt data er markeret: *målt*, *datablad*, *modelleret* eller *estimeret*. Usikkerhed vises som bånd på kurver, ikke som en falsk præcis streg. |
| **Fortryd og sammenlign** | Alle designs er versionerede snapshots. Man kan altid gå tilbage og lægge to designs ved siden af hinanden. |
| **Enheder og sprog** | SI internt, altid. UI viser liter/mm/Hz/dB som standard, med tommer som valgmulighed. Fagtermer på niveau 1 erstattes af hverdagsord ("dyb bas til" i stedet for "F3"). |

### 1.3 Målgrupper

- **Begynder**: har fundet et brugt kabinet eller et par drivere og vil have en færdig opskrift.
- **Erfaren DIY'er**: vil selv styre alignment, delefilter og baffle-placering, men slippe for regneark.
- **Nørd** (dig selv): vil se spinorama, gruppeforsinkelse, port-hastighed, Le(f)-modeller og optimizerens vægtning.

Alle tre bruger *samme* motor. Kun præsentationsniveauet varierer.

---

## 2. Arkitektur

### 2.1 Lag

```
┌──────────────────────────────────────────────┐
│  Præsentation (UI)                            │  Wizard, dashboards, grafer, eksport
├──────────────────────────────────────────────┤
│  Applikationslag                              │  Design-state, versionering, undo, jobs
├──────────────────────────────────────────────┤
│  Optimizer                                    │  Driver-match, kabinet-optimering, XO-optimering
├──────────────────────────────────────────────┤
│  Fysikmotor (headless, ren, deterministisk)   │  T/S, kabinetter, diffraktion, direktivitet, XO, spinorama
├──────────────────────────────────────────────┤
│  Data                                         │  Driver-DB, kabinet-DB, materialer, importformater
└──────────────────────────────────────────────┘
```

**Krav til fysikmotoren:**
- Ingen UI-afhængigheder. Kan køres fra CLI og i tests.
- Rene funktioner: samme input → samme output. Ingen global tilstand.
- SI-enheder overalt (m, m², kg, N, Pa, Ω, H). Konvertering sker kun i UI-laget.
- Frekvensakse: logaritmisk, standard 10 Hz–40 kHz, 48 pkt/oktav (konfigurerbar). Alle moduler arbejder på samme akse så resultater kan summeres direkte som komplekse tal.
- Alle responser gemmes som **komplekse overføringsfunktioner** (amplitude *og* fase). Aldrig kun dB.
- Tunge beregninger (diffraktion, TL, horn, optimizer) køres i workers/baggrundsjobs med fremdriftsrapportering.

### 2.2 Foreslået repo-struktur (sprog-agnostisk)

```
/engine            fysikmotor (ingen UI-imports)
  /ts              Thiele/Small, alignments
  /enclosure       closed, vented, PR, bandpass, TL, horn, open baffle
  /electrical      impedans, Le(f), termik
  /baffle          baffle step, kantdiffraktion, driverplacering
  /directivity     stempelmodel, waveguide, polar-interpolation
  /crossover       biquads, target-slopes, delay, summation
  /spinorama       CEA-2034 aggregering
  /room            valgfrit: rumgain, gulvrefleks
/optimizer         scoring, søgealgoritmer, constraints
/data
  /drivers         JSON/SQLite + import af FRD/ZMA/datablade
  /enclosures      kendte kabinetter (kommercielle + brugerens egne)
  /materials       pladetyper, dæmpning, port-rør
/app               UI (wizard, dashboards, eksport)
/tests
  /golden          reference-outputs mod WinISD/VituixCAD/Hornresp
  /unit
/docs              dette dokument + modul-docs
```

---

## 3. Datamodel

### 3.1 Driver

```yaml
Driver:
  id, brand, model, type: [woofer|subwoofer|midrange|midwoofer|tweeter|fullrange|passive_radiator|compression_driver|AMT|ribbon|planar]
  nominal_size_mm
  # Thiele/Small (SI)
  Fs, Qts, Qes, Qms, Vas, Re, Le_1kHz, BL, Mms, Cms, Rms, Sd
  Xmax, Xmech, Pe_nominal, Pe_max, sensitivity_2p83V, Znom
  # Udvidet elektrisk model (valgfri, forbedrer impedans >1 kHz)
  Le_model: {type: [simple|leach|thorborg|wright], params: {...}}
  # Mekanik
  frame_od, cutout_diameter, mounting_depth, flange_thickness, magnet_diameter, hole_count, hole_pcd, net_displacement_volume (driverens fortrængning i kabinettet)
  # Måledata (valgfri men stærkt ønsket)
  frd_on_axis, frd_off_axis: {angle_deg: FRD}, zma
  measurement_conditions: {baffle, distance, smoothing, IEC_baffle?}
  # Direktivitet
  directivity_source: [measured|piston_model|waveguide_model]
  waveguide: {type, throat_diameter, mouth_diameter, depth, profile}
  # Metadata
  provenance per felt: [measured|datasheet|modelled|estimated]
  price, availability, datasheet_url, notes
```

### 3.2 Kabinet

```yaml
Enclosure:
  type: [sealed|vented|passive_radiator|bandpass_4|bandpass_6|transmission_line|horn_backloaded|horn_frontloaded|open_baffle|infinite_baffle]
  external_dims: {W, H, D}
  panel: {material, thickness}
  bracing: [{type, count, volume_displaced}]
  damping: {material, fill_ratio, walls_lined}
  internal_net_volume  # beregnet: brutto − vægge − bracing − driver − port
  # Type-specifikt
  vented: {ports: [{shape: round|slot, area, length, flare_type, position}], Fb}
  passive_radiator: {pr_driver_id, added_mass}
  transmission_line: {segments: [{length, area_start, area_end}], stuffing_density_profile, driver_position_along_line, terminus_area}
  horn: {profile: [exponential|hyperbolic|tractrix|conical|LeCleach], throat_area, mouth_area, length, rear_chamber_volume, front_chamber_volume}
  open_baffle: {baffle_W, baffle_H, wings}
  # Baffle
  baffle: {W, H, edge_radius_or_chamfer, driver_positions: [{driver_ref, x, y}]}
```

### 3.3 Design (systemet)

```yaml
Design:
  id, name, version, created, parent_version
  ways: 1..4
  sections: [{role: [sub|bass|mid|tweeter], driver_id, count, arrangement: [single|MTM|vertical_array|dual_side], enclosure_ref}]
  enclosures: [Enclosure]
  crossover: Crossover
  listening: {distance, height, room_mode: [anechoic|half_space|room_estimate]}
  targets: {on_axis: flat|tilt, max_spl, f3_target, listening_window_tolerance}
  results_cache: {hash_of_inputs → SystemResponse}
```

### 3.4 Aktivt delefilter

```yaml
Crossover:
  sample_rate  # til biquad-eksport
  channels: [{
    section_ref,
    blocks: [
      {type: HP|LP, topology: [butterworth|linkwitz_riley|bessel|chebyshev], order: 1..8, f}
      {type: PEQ, f, Q, gain}
      {type: shelf_low|shelf_high, f, Q, gain}
      {type: all_pass, order: 1|2, f, Q}
      {type: linkwitz_transform, f0, Q0, fp, Qp}
      {type: FIR, taps, coefficients}   # valgfrit, til fase-linearisering
    ],
    gain_dB, delay_ms, polarity
  }]
  target_acoustic_slopes: [{between: [sec_a, sec_b], type: LR4, f}]
```

**Vigtigt:** Delefilteret defineres som *akustiske* mål (fx LR4 @ 2 kHz akustisk), og de *elektriske* filtre er det, optimizeren finder for at ramme målet givet driverens egen respons. Begge gemmes.

---

## 4. Fysikmotor — moduler

Alle moduler leverer komplekse overføringsfunktioner H(f) og evt. ekstra kanaler (excursion, port-hastighed, impedans).

### 4.1 Thiele/Small-grundmodel

- Lumped-element model: driver som RLC + akustisk last.
- Afledte tal: EBP = Fs/Qes (≈<50 lukket, 50–100 begge, >100 ported), Vas-kontrol via Cms·Sd²·ρ₀·c².
- **Konsistenskontrol** ved import: beregn Qts fra Qes/Qms, Fs fra Mms/Cms, Vas fra Cms/Sd; afvigelse >10 % → flag i UI ("databladsværdier er indbyrdes inkonsistente").

### 4.2 Lukket kabinet

- α = Vas/Vb, Fc = Fs·√(1+α), Qtc = Qts·√(1+α).
- Vb korrigeres for fyld: effektiv volumen ×(1,0–1,25) afhængigt af fill-ratio (isoterm vs. adiabatisk).
- Respons: 2. ordens højpas med Qtc. F3 udledes numerisk fra kurven, ikke fra tabel.
- Anbefalinger: Qtc 0,5 (Bessel, kritisk dæmpet), 0,707 (Butterworth, maks. flad), op til ~0,9 (kompakt, lidt "punch").

### 4.3 Ported (bassrefleks)

- 4. ordens model (Small 1973). Alignments som *startpunkter*: QB3, SBB4, C4, B4, BB4, EBS.
- Approksimationer til seed (derefter numerisk):
  Vb ≈ 15·Qts^2,87·Vas, Fb ≈ 0,42·Qts^-0,9·Fs, F3 ≈ 0,26·Qts^-1,4·Fs (QB3-tilnærmelse).
- Port: Helmholtz Fb = (c/2π)·√(Sv / (Vb·Leff)), Leff = L + endekorrektion (0,85·r pr. flanget ende, 0,61·r fri ende; slotporte har egen korrektion).
- **Port-hastighed** beregnes over frekvens ved givet input; grænser: < 10 m/s anbefalet, > 17 m/s (≈5 % Mach) = advarsel om chuffing. Flared porte hæver grænsen.
- Port-resonans (rørresonans ved c/(2·L)) placeres og vises, med advarsel hvis den ligger inden for passbåndet.
- Lækagetab QL (standard 7), absorptionstab QA, port-tab QP indgår.
- Kabinettets fortrængning (port, driver, bracing) trækkes fra automatisk.

### 4.4 Passiv radiator

- Som ported, men med PR's Mmp, Cmp, Sdp, Xmax_pr. Kontrol af PR-excursion (skal typisk have ≥2× drivers Vd). Notch fra PR's egen resonans vises.

### 4.5 Bandpass (4. og 6. orden)

- To-kammer model med transfer-matricer. Vis pas-bånd, ripple og de to portes hastighed.

### 4.6 Transmission line

- 1D bølgeledermodel: linjen deles i segmenter, hver med areal, længde og stuffing-densitet; **transfer-matrix (T-matrix)** pr. segment med kompleks bølgetal der modellerer stuffingens dæmpning og hastighedsreduktion (King/Augspurger-tilgang).
- Driveren kan sidde et vilkårligt sted langs linjen (offset-driver, "mass-loaded TL").
- Output: driver-, terminus- og summeret respons, excursion, linjens resonanser.
- Første seed: kvartbølge L = c/(4·f_target), justeret for stuffing (typisk 10–25 % hastighedsreduktion).

### 4.7 Horn

- Webster's hornligning løst med T-matrix over profilsegmenter (eksponentiel, hyperbolsk, traktrix, konisk, Le Cléac'h).
- Cutoff for eksponentiel: fc = m·c/(4π), m = flare-konstant.
- Bagkammer + frontkammer som lumpede compliances.
- Output: throat-impedans, mundtransfer, summeret respons for back-loaded horn (driver direkte + horn-mund med delay). Advarsel når mund-omkreds < λ ved fc (utilstrækkelig mund → ripple).
- Valideres mod Hornresp-golden-files.

### 4.8 Open baffle / dipol

- Dipol-roll-off (6 dB/okt under dipol-peak), dipol-peak ved f ≈ c/(2·D_eff), hvor D_eff er effektiv vej-længde bag om baflen (numerisk fra baffle-geometri via 4.10).
- Excursion-krav er langt større end lukket: vises tydeligt.

### 4.9 Elektrisk model, excursion, effekt, termik

- Impedans over frekvens inkl. kabinettets bidrag (dobbelt-peak ved ported) og Le(f) via Leach (Z = K·(jω)^n) eller Thorborg-model, hvis parametre findes; ellers simpel Le.
- Zmin og fase-vinkel → advarsel om forstærkerkrav.
- **Excursion** x(f) ved givet spænding; **maks SPL** = laveste af displacement-begrænset og termisk-begrænset SPL. Displacement-begrænset SPL i halvrum ved 1 m (peak): p = ρ₀·2π·f²·Sd·Xmax, konverteret til dB re 20 µPa.
- Termisk: Pe_nominal → gennemsnitlig SPL; effektkompression estimeres som ΔT via simpel termisk model (Re stiger 0,4 %/K).
- **Bidraget fra flere drivere**: N ens drivere parallelt/serielt → +6 dB pr. fordobling ved samme spænding (impedans-afhængigt), +3 dB ved samme effekt. Gensidig kobling i bas medregnes (drivere deler kabinetluft).

### 4.10 Baffle: baffle step og kantdiffraktion

- Baffle step: 3-dB-punkt f₃ ≈ 115/W (W i meter) som seed, men **den faktiske kurve beregnes numerisk**: driver modelleres som stempel/kilde på en endelig baffle, kanterne diskretiseres (sekundære kilder à la Vanderkooy/"Edge"-metoden), og resultatet summeres komplekst for hver observationsvinkel.
- Input: baffle W/H, driverens x/y, kantradius/fas (reducerer diffraktion over f ≈ c/(4·r)), afstand og vinkel.
- Output: diffraktions-transfer pr. vinkel — bruges direkte af 4.11 og 4.13, og af optimizeren til at foreslå driverplacering (asymmetrisk placering, gyldne forhold, undgå lige afstande til kanter).

### 4.11 Direktivitet

- **Målt** off-axis data (foretrukket): interpolation mellem vinkler, spejling til fuld sfære hvor symmetrisk.
- **Stempelmodel** for konusdrivere: D(θ) = 2·J₁(ka·sinθ)/(ka·sinθ), a = effektiv radius fra Sd. Bruges når måledata mangler; markeres "modelleret".
- **Waveguide/horn**: geometrisk model (konstant direktivitet indtil mund-cutoff, derefter udvidende) eller målt.
- Kombineret med 4.10 giver dette hver sektions komplekse respons ved alle CEA-2034-vinkler (0–180° horisontalt og vertikalt i 10°-trin).

### 4.12 Delefilter og summation

- Biquad-implementering (RBJ Cookbook) af alle bloktyper; kaskade → H_el(f) pr. kanal.
- Akustisk respons pr. sektion = H_el · H_driver(vinkel) · H_baffle(vinkel) · e^(−jω·τ_delay) · polaritet · gain.
- Sum over sektioner *og* over multiple drivere med deres fysiske positioner (giver korrekt vertikal lobing for MTM, arrays osv.).
- **Delay-estimat**: akustisk center pr. driver ≈ konusdybde/voice-coil-position (fra mounting_depth og driver-type), justeret af optimizer. Vises som "start-delay, verificer med måling".
- Output: on-axis sum, fase, gruppeforsinkelse, **reverse-null-test** (vend polaritet på én sektion → dybt nul ved XO-frekvens bekræfter alignment), pr.-sektion bidrag.
- Standard-mål: LR4 (to kaskaderede Butterworth Q=0,707) som akustisk slope; LR2/LR8/Bessel som valg. Optimizer finder de elektriske filtre (inkl. PEQ'er) der får *akustisk* respons til at ramme målet inden for ±0,5 dB i 2 oktaver omkring XO.

### 4.13 Spinorama (CEA-2034 / ANSI-CTA-2034-A)

Fra fuld-sfære respons pr. vinkel beregnes:
- **On-axis**, **Listening Window** (gns. af 0°, ±10° V, ±10°/±20°/±30° H), **Early Reflections** (gulv, loft, front, side, bag – de definerede vinkelsæt), **Sound Power** (kugle-vægtet energi-gennemsnit), **DI-kurver** (LW–SP, ER–SP), **Predicted In-Room (PIR)** = 0,12·LW + 0,44·ER + 0,44·SP.
- Vægtning per vinkel sker energi-mæssigt (ikke komplekst) for SP/ER, komplekst for LW jf. standarden.
- Ekstra scorer: Harman-lignende "preference rating" udledt af NBD/SM/LFX (markeret som *indikativ*, ikke som sandhed).

### 4.14 Rum (valgfrit lag)

- Halvrum vs. fuldrum (+6 dB under baffle step ved vægplacering), gulv-bounce-notch ud fra driverhøjde og lytteafstand, simpel rum-gain under ~50 Hz. Slået fra som standard, men en enkelt toggle.

### 4.15 Kabinet-mekanik

- Pladeresonanser: enkel plade-model (fastspændt/simpelt understøttet) pr. panel → første mode-frekvens; foreslå bracing-placering der flytter den over 300 Hz eller ud af midrange-passbånd.
- Indre stående bølger: f = c/(2·L) for hver indre dimension; vis og foreslå dæmpning på den lange akse.
- Dimensionering: undgå heltalsforhold; seed = 0,6 : 1 : 1,6 (eller brugerens egen begrænsning, fx "maks. 25 cm bred").

---

## 5. Optimizer

### 5.1 Tre opgaver

| Opgave | Input | Output |
|---|---|---|
| **A. Kabinet → drivere** | Kendt kabinet (type, netto-volumen, baffle, evt. eksisterende udskæring), ønsker (budget, SPL, F3) | Rangeret liste af drivere/driversæt med score og begrundelse |
| **B. Drivere + koncept → kabinet** | Valgte drivere, type, antal veje, antal pr. vej, begrænsninger (maks. dims) | Optimale mål, port/TL/horn-geometri, driverplacering |
| **C. Delefilter** | Design med kabinet og drivere | Komplet aktivt delefilter der rammer akustiske mål + system-respons + spinorama |

### 5.2 Scoring for driver-match (opgave A)

Hver kandidat scores 0–100 som vægtet sum, alle delscorer forklaringsbare:

- **Alignment-fit**: hvor tæt Vb ligger på driverens optimale Vb for kabinettypen (Qtc-afvigelse fra 0,707 for lukket; F3/ripple for ported).
- **Basrækkevidde**: F3 opnået vs. ønsket.
- **Excursion-margin**: x/Xmax ved ønsket SPL i passbåndet (inkl. under Fb hvor ported mister kontrol → foreslå subsonisk HP).
- **Port-realiserbarhed**: kan en port med acceptabel hastighed rent fysisk være i kabinettet?
- **Mekanisk fit**: udskæring, dybde, baffle-bredde vs. frame.
- **Direktivitets-match**: driverens ka ved planlagt XO-frekvens vs. tweeterens/næste vejs direktivitet (undgå DI-spring).
- **Følsomhed** i systemet (efter baffle step) og sammenligning på tværs af veje.
- **Pris/tilgængelighed**.

Vægtene er brugerjusterbare på ekspertniveau, men har defaults. Top-3 vises som kort med "Godt match fordi …" og "Vær opmærksom på …".

### 5.3 Kabinet-optimering (opgave B)

- Parameterrum: Vb, Fb, portareal/-længde (eller TL-segmenter/horn-profil), W/H/D under constraints (maks. mål, min. baffle-bredde til drivere, pladetykkelse).
- Objektiv: vægtet sum af (afvigelse fra flad respons til F3-mål, gruppeforsinkelse-straf, excursion-straf, port-hastigheds-straf, størrelses-straf).
- Metode: grid/alignment-seed → Nelder–Mead eller differential evolution (robust mod lokale minima). Deterministisk seed så resultat er reproducerbart.

### 5.4 Delefilter-optimering (opgave C)

- Variable: pr. kanal HP/LP-type/orden/f, 0–4 PEQ (f, Q, gain), shelves, delay, polaritet, gain.
- Objektiv (frekvensvægtet): on-axis-flatness, **PIR-glathed**, DI-kontinuitet ved XO, fase-match ±15° over XO-regionen, reverse-null-dybde, begrænset boost (maks +6 dB under baffle step), excursion under limit.
- Constraints: maks. antal biquads (fx miniDSP 2x4 HD = 10 pr. kanal), Q-grænser, ingen PEQ under Fb i ported.
- Metode: start fra analytisk løsning (mål-slope inverteret mod driverens råkurve), dernæst lokal optimering. Kør altid mod *baffle-korrigerede* driverkurver.

### 5.5 Fuld pipeline "Jeg vil have en X-vejs Y-type"

1. Vælg type + antal veje + antal drivere pr. vej.
2. For hver vej: find kandidater via 5.2 med XO-frekvens-vinduer som constraint (fx bas < 300–500 Hz, mid 300–3 000 Hz, tweeter > 1 800 Hz), sammensæt sæt med gode direktivitets-overgange.
3. Kør 5.3 per sektion (delte kammer vs. separate kammer for mid).
4. Placér drivere på baffle (4.10 + vertikale afstande ≤ λ/2 ved XO for at begrænse lobing).
5. Kør 5.4.
6. Beregn spinorama, maks-SPL, impedans, byggeark.
7. Gem som version.

---

## 6. Driverdatabase

- Format: JSON pr. driver + SQLite-index (eller Postgres senere). Skema = 3.1.
- Importer: FRD/ZMA (VituixCAD/REW/ARTA), Klippel-eksport, manuel indtastning fra datablad, PDF-udtræk med AI (altid med proveniens "datasheet" og efterfølgende konsistenskontrol 4.1).
- Kvalitetsflag pr. driver: *A* (målt on/off-axis + impedans), *B* (målt on-axis + T/S), *C* (kun datablad). Vises som badge i UI; optimizeren straffer C-drivere let og viser bredere usikkerhedsbånd.
- Versionering af poster (databladsrevisioner). Community-bidrag via PR med automatisk validering.
- Start-population: dine egne drivere (Scan-Speak 18W/4424G00, SB26ST + WG212, GRS 12SW-4HE, Dayton E180HE-44, Wavecor WF146WA05, Scan-Speak H2606, TB W4-1052SDF) + de mest brugte DIY-drivere fra SB Acoustics, Scan-Speak, Dayton, Seas, Peerless, Purifi, Satori, Vifa.
- Kabinet-DB: kommercielle flat-pack og kendte DIY-kabinetter (Denovo, Dayton, Parts Express, Speaker Hardware) samt brugerens egne. Felter = 3.2.

---

## 7. UX-flows

### 7.1 Landingsside — tre indgange

```
┌───────────────────────────────────────────────┐
│  Hvad har du?                                 │
│                                               │
│  [ Jeg har et kabinet ]                       │
│  [ Jeg har drivere ]                          │
│  [ Jeg starter fra bunden ]                   │
│                                               │
│  Seneste designs  ▸  Floorstander v7  MTM v2  │
└───────────────────────────────────────────────┘
```

Under hver knap én linje: "Vi finder de bedste enheder til det" / "Vi beregner det bedste kabinet" / "Fortæl os om rummet og musikken".

### 7.2 Flow A: "Jeg har et kabinet"

**Trin 1 — Kabinettet**
- Vælg fra kabinet-DB *eller* indtast: type, udvendige mål, pladetykkelse, evt. port (diameter/længde) → netto-volumen beregnes og vises live ("≈ 31,4 L netto").
- Foto-hjælp (senere): tag billede af kabinettet med målestok.
- Eksisterende udskæringer? (diameter) → constraint på drivere.

**Trin 2 — Hvad vil du med det?**
- Tre slidere med ord i stedet for tal: *Dyb bas ←→ Kompakt/kontrolleret*, *Lavt lytteniveau ←→ Fest*, *Budget*. På niveau 2 viser samme slidere F3-mål, mål-SPL og kr.
- Antal veje: 1/2/3 (appen foreslår ud fra kabinetstørrelse).

**Trin 3 — Resultater**
- Tre kort øverst (bedste match), liste nedenunder.
- Hvert kort: driverbillede, navn, score-ring, én sætning "Passer godt fordi…", to advarsler max, pris.
- Tryk → Design-dashboard (7.4) er allerede fuldt simuleret.

### 7.3 Flow B: "Jeg starter fra bunden" / "Jeg har drivere"

**Trin 1 — Koncept**
- Kabinettype som store, illustrerede kort (lukket, ported, TL, horn, PR, open baffle) med én sætning om karakter og pladskrav.
- Antal veje (segment-kontrol 1–4) og drivere pr. vej (stepper) → tegning opdateres live (MTM, 2,5-vejs osv. genkendes og navngives).

**Trin 2 — Drivere**
- Pr. vej: auto-forslag (top-3) eller vælg selv fra DB. Har brugeren egne drivere, vælges de her og resten udfyldes automatisk.
- Kompatibilitets-tjek mellem veje vises som grøn/gul/rød linje mellem kortene ("overgang 2,2 kHz: direktivitet matcher").

**Trin 3 — Begrænsninger**
- Maks. bredde/højde/dybde, pladetykkelse, gulvstående/stand, "skal kunne stå tæt på væg".

**Trin 4 — Beregn**
- Fremdrift med korte statuslinjer ("Optimerer port…", "Beregner diffraktion…", "Tilpasser delefilter…"). Typisk 2–10 s.

### 7.4 Design-dashboard (fælles slutskærm)

```
┌─────────────────────────────────────────────────────────┐
│  Floorstander v7                        [Sammenlign][⋯] │
│  ● Klar til byggeri     Score 91   Bas til 34 Hz  108 dB│
├───────────────┬─────────────────────────────────────────┤
│  Kabinet      │   [Systemrespons]  [Spinorama]  [XO]    │
│  32 L ported  │                                         │
│  Fb 33 Hz     │      graf (on-axis, LW, PIR)            │
│  Port 2×70 mm │                                         │
│  ─────────    │                                         │
│  Drivere      │                                         │
│  ▸ 12SW-4HE   │   Hvorfor ser det sådan ud?  ▸          │
│  ▸ 18W/4424   │                                         │
│  ▸ SB26ST+WG  │                                         │
│  ─────────    │   ⚠ Port-hastighed 14 m/s ved 30 Hz     │
│  Delefilter   │     — overvej 2×80 mm port  [Anvend]    │
│  LR4 300/2200 │                                         │
├───────────────┴─────────────────────────────────────────┤
│  [Byggeark]  [DSP-eksport]  [Del]                        │
└─────────────────────────────────────────────────────────┘
```

Principper for dashboardet:
- Venstre kolonne = redigerbare parametre; ændring → live opdatering til højre.
- Status-badge: Klar / Kræver opmærksomhed / Ikke realiserbar, med årsag.
- Advarsler er handlingsorienterede med "Anvend"-knap der udfører forslaget (og kan fortrydes).
- Faner: Systemrespons, Spinorama, Delefilter, Impedans & effekt, Excursion & port, Kabinet (3D + stående bølger), Byggeark.
- "Hvorfor ser det sådan ud?" åbner et lag der annoterer kurven (baffle step, port-resonans, XO-punkt, diffraktions-ripple).

### 7.5 Delefilter-skærm

- Signalflow-diagram pr. kanal (HP → PEQ → PEQ → LP → delay → gain).
- Under: summeret respons + pr.-sektion kurver; toggle for reverse-null.
- Hvert blok-kort kan redigeres direkte (f, Q, gain) med live opdatering; "Re-optimér" knap holder brugerens låste blokke fast.
- Eksport-panel: vælg platform → coefficienter/preset (se 9).

### 7.6 Sammenligning

- To eller tre versioner side om side: samme faner, samme akser, forskel-kurve (ΔdB). Brug til A/B af port-størrelse, Qtc, XO-frekvens.

### 7.7 Detaljer der gør forskellen (Apple-følelsen)

- Alle tal har enheder og fornuftig afrunding (34 Hz, ikke 33,847).
- Grafer: konsistent farve pr. sektion i hele appen (bas altid samme farve).
- Hover/tap på kurve viser værdi + hvilket modul der bidrager.
- Skeleton-loading, aldrig blank skærm.
- Tastaturgenveje på desktop, store touch-mål på mobil.
- Alt kan deles som ét link (design-JSON serialiseret) og som PDF.
- Mørk/lys tilstand følger system.

---

## 8. Visualiseringer

| Visualisering | Indhold |
|---|---|
| Systemrespons | On-axis, LW, PIR; usikkerhedsbånd; annotationer |
| Spinorama | Fuld CEA-2034: ON, LW, ER, SP, ERDI, SPDI, PIR |
| Polar | Horisontal og vertikal heatmap (frekvens × vinkel, normaliseret) |
| Delefilter | Elektriske og akustiske slopes, fase, gruppeforsinkelse, reverse-null |
| Impedans | |Z| og fase, Zmin markeret, forstærkerkrav |
| Excursion & port | x/Xmax pr. sektion ved valgt SPL, port-hastighed, termisk grænse |
| Kabinet 3D | Ydre/indre, bracing, port, driverplacering; stående bølger som farvede akser |
| Byggeark | Skæreliste, boremål, portmål, materialer, dæmpningsplan |

---

## 9. Eksport

- **Byggeark (PDF/Markdown)**: skæreliste med pladetykkelse, indre/ydre mål, driverudskæringer med centrum-koordinater, port-specifikation, bracing, dæmpning, samlingsrækkefølge, netto-volumen-kontrol.
- **DSP-presets**: miniDSP (2x4 HD / Flex / SHD), Hypex FusionAmp (.hfd-lignende værdier), ADAU1701/1452 (SigmaStudio-parametre), CamillaDSP (YAML), Equalizer APO, generiske biquad-koefficienter (b0,b1,b2,a1,a2 ved valgt fs) — alle med delay og polaritet.
- **CAD**: OpenSCAD-parametre og STEP/DXF til baffleudskæring (matcher dine eksisterende OpenSCAD-templates).
- **Data**: FRD/ZMA for simuleret systemrespons, så det kan sammenholdes med egen måling i REW/VituixCAD.
- **Design-JSON**: hele designet, importerbart.

---

## 10. Validering og kvalitet

- **Golden tests**: for hvert kabinetmodul et sæt kendte drivere med reference-output fra WinISD/VituixCAD/Hornresp (gemt som CSV). Tolerance ±0,5 dB i passbåndet, ±1 Hz på Fb/F3.
- **Analytiske tests**: lukket kasse mod Small's lukkede formler; Helmholtz mod målt rør; stempel-direktivitet mod tabelværdier; LR4-summation = 0 dB flad; CEA-2034 mod referenceberegning af kendt måledata (fx et offentligt Klippel-datasæt).
- **Egenskabstests**: energi-konservering (SP ≤ on-axis), fase-konsistens (minimum-fase hvor forventet), monotoni (større Vb → lavere Fc i lukket).
- **Regression** på UI-niveau: snapshot af dashboards for 5 referencedesigns.
- **Måle-feedback-loop** (senere): importér din egen REW-måling af det byggede design → appen viser simuleret vs. målt og lærer offset for driverens akustiske center.

---

## 11. Byggeplan til AI

Hver fase har en "definition of done" (DoD). AI'en arbejder på én fase ad gangen, med tests først.

### Fase 0 — Fundament (1 uge)
- Repo-struktur, frekvensakse-modul, kompleks-tal-hjælpere, enhedskonvertering, Driver/Enclosure/Design-typer med validering.
- **DoD**: typer + 100 % testdækning på validering og enhedskonvertering.

### Fase 1 — T/S + lukket + ported + PR (2 uger)
- 4.1–4.4, 4.9 (impedans, excursion, maks-SPL, port-hastighed).
- **DoD**: golden tests mod WinISD for 10 drivere inden for tolerancer; CLI der printer respons for et design-JSON.

### Fase 2 — Baffle + direktivitet + delefilter + spinorama (3 uger)
- 4.10–4.13. Biquads (RBJ), summation med positioner, CEA-2034.
- **DoD**: LR4-summation flad ±0,1 dB; spinorama af et offentligt datasæt matcher ±0,5 dB; MTM-lobing reproducerer kendt vertikal null.

### Fase 3 — Optimizer A/B/C (3 uger)
- 5.1–5.5. Forklarbar scoring.
- **DoD**: for dine egne drivere foreslår appen et 3-vejs design med LR4 300/2 200 Hz-klasse resultat, PIR-glathed bedre end manuel reference; kørselstid < 10 s.

### Fase 4 — UI: wizard + dashboard (3 uger)
- 7.1–7.4, live-opdatering, versionering, sammenligning.
- **DoD**: en ny bruger kan gå fra "Jeg har et kabinet" til byggeark på < 3 minutter uden at læse hjælp; alle advarsler har "Anvend".

### Fase 5 — TL, horn, bandpass, open baffle (3 uger)
- 4.5–4.8, 4.15.
- **DoD**: golden tests mod Hornresp for 3 TL- og 3 horn-designs (dit W4-1052SDF back-loaded horn er en oplagt reference).

### Fase 6 — Eksport, DB-import, måle-feedback (2 uger)
- Kap. 6, 9, 10 (feedback-loop).
- **DoD**: miniDSP- og CamillaDSP-eksport verificeret ved at importere i værktøjet og måle samme respons; FRD/ZMA-import fra VituixCAD-format.

### Fase 7 — Polering (løbende)
- Animationer, mørk tilstand, tilgængelighed, mobil-layout, PDF-kvalitet, community-DB.

### Sådan instrueres AI'en pr. modul (skabelon)

```
Modul: <navn>  (henvis til afsnit X.Y i spec)
Input/Output-kontrakt: <typer>
Fysik: <formler + referencer>
Tests der skal bestå FØR implementering: <liste>
Ikke-mål: <hvad modulet IKKE gør>
Definition of done: <konkret, målbar>
```

### Vidensgrundlag AI'en skal trække på

Thiele (1971) og Small (1972–73) om lukkede/ported systemer; Leach om Le(f) og horn; Beranek *Acoustics*; Olson om baffle-diffraktion; Vanderkooy om kantdiffraktion; Dickason *Loudspeaker Design Cookbook*; King og Augspurger om transmission lines; Keele og Geddes om horn/waveguides; Toole *Sound Reproduction* og ANSI/CTA-2034-A om spinorama; Klippel om ikke-lineariteter og Xmax-definitioner; RBJ Audio EQ Cookbook om biquads; Linkwitz om LR-filtre og transform.

---

## 12. Afgrænsning (ikke-mål i v1)

- Passive delefiltre (kan tilføjes senere; motoren er allerede klar da den arbejder med akustiske mål).
- Ikke-lineær simulering (BL(x), Cms(x)) — Xmax-tjek er lineært i v1.
- Fuld FEM/BEM af kabinet — vi bruger lumpede og 1D/2D-approksimationer med kendte grænser, tydeligt markeret.
- Rumakustik ud over 4.14.

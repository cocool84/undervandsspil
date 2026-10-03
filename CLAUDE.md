# Akvariet (Undervandsspil)

Et magisk 3D-undervandsakvarium til småbørn (ca. 2–5 år) på **iPad 10. generation i Safari** (også som hjemmeskærm-app). Børnene kan ikke læse, så der må **ingen tekst** være i brugerfladen: kun ikoner, farver, bevægelse og lyd. Alt reagerer på berøring, og knapperne er store.

Der er **to akvarier**, som man skifter imellem med en knap:
- **Koralrevet** med små fisk.
- **Det åbne hav** med store dyr: delfin, haj, spækhugger og hval.

- Live: https://cocool84.github.io/undervandsspil/ (GitHub Pages fra `main`).
- Repoet er **offentligt** og må kun indeholde kode, så der må ingen personlige oplysninger om familien stå her.

## Arbejdsgang ved ændringer

1. Lav ændringen. Kode og kodekommentarer skrives på engelsk og i samme stil som den omgivende kode.
2. Kør `npm test`. Alle tests skal bestå i alle fire projekter.
3. Kør `npm run sw`. Det skriver fil-listen og en versions-hash ind i `sw.js`, og **skal** gøres før hver commit, ellers får brugerne en forældet cache.
4. Commit direkte på `main` med en dansk commit-besked, som slutter med `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
5. `git push`, og vent på Pages-buildet:
   ```bash
   gh api repos/cocool84/undervandsspil/pages/builds/latest
   ```
6. Røgtest den live URL: ingen konsolfejl, og `VERSION` i den live `sw.js` er den nye.

Brugeren tester på den rigtige iPad. Ydelse og berøringsfølelse på enheden kan ikke afgøres herfra.

## Kommandoer

```bash
npm run serve        # python3 -m http.server 8765 --bind 127.0.0.1 (Playwright genbruger den)
npm test             # Playwright: webkit + chromium × liggende 1180×820 + stående 820×1180, iPad-UA, touch
npx playwright test -g "fish factory" --project=webkit-landscape   # én test, ét projekt
npm run sw           # opdatér sw.js (fil-liste + VERSION)
npm run icons        # PNG-ikoner ud fra icons/icon.svg
```

- **Projekterne:** WebKit ligger tættest på Safari. Chromium bruges til ægte multitouch og træk via CDP `Input.dispatchTouchEvent`; de tests springes over i WebKit.
- **Lav fps i Chromium:** headless Chromium renderer i software, så lav fps og nedskalering der er forventet og ikke en fejl.
- **Skærmbilleder:** havner i `tests/shots/<projekt>/` (git-ignoreret). Se dem kritisk efter visuelle ændringer.
- **Fuld kørsel:** tager ca. 15–20 min. Kør den i baggrunden og rediger ikke filer i `src/` imens, for testene henter modulerne fra dev-serveren.
- **Test-hooks:**
  - `window.__aq`: `ready`, `perf()`, `fish()`, `bubbles()`, `whatIsAt(x, y)`, `snapshotStats()`. De gælder altid det akvarium, der vises.
  - `__aq.app` giver adgang til alt internt, fx `world` (det viste akvarium, `kind` = `'reef'` | `'ocean'`), `worlds`, `population`, `populations.reef`/`.ocean`, `switchWorld()`, `factory`, `parent` og `audio`.
  - `__aq.app.audio.analyze()` renderer alle lyde offline og måler dem.

## URL-flag (`src/config.js`)

| Flag | Virkning |
|---|---|
| `?debug` | Overlay med fps, tier og draw calls (virker også på iPad'en) |
| `?debug=depth` | Viser dybdebufferen |
| `?quality=N` | Lås kvalitetstrin 0–5 |
| `?simslow=N` | Busy-wait N ms pr. frame (tester nedskalering) |
| `?fill=N` | N malede testfisk i stedet for de egne (højst 25 i revet, 8 store dyr i havet). **Gemmes aldrig.** Bruges til ydelsesmåling: `?fill=25&debug` og `?ocean&fill=8&debug` |
| `?ocean` | Start i det åbne hav |
| `?fishgrid`, `?fishgrid=eyes` | QA-gitter med alle former, mønstre og øjne |
| `?fishgrid=animals`, `?fishgrid=animals2` | QA-gitter med de fire store dyr (2: med mønstre og andre øjne). Åbner havet |
| `?seed=N` | Anden opbygning af revet |
| `?night` | Start om natten |
| `?autostart` | Spring startboblen over (tests) |
| `?nosw` | Ingen service worker |
| `?nantest` | Tegner NaN/Inf-pixels (tester beskyttelsen) |

## Arkitektur

ES-moduler uden bundler. Three.js **0.186.1** ligger i `vendor/three/` (låst version, kun de filer der bruges) og hentes via import map i `index.html`. Én `WebGLRenderer` og én WebGL-kontekst. Der er tre scener: revet, havet og fiskefabrikken.

- `src/main.js`: wiring, start og loop. Desuden:
  - Skift mellem akvarium og fabrik (`app.view`, og `app.busy` under boble-overgangen).
  - Skift mellem akvarierne (`app.switchWorld`, `buildWorld`, `enterWorld`).
  - Idle-besøg og callbacks for lyd og effekter (`wire(world)` pr. akvarium).
- `src/core/`:
  - `renderer.js`: composer-kæden RenderPass (HalfFloat og DepthTexture på *begge* ping-pong-targets) → UnrealBloomPass → `finalpass.js`.
  - `finalpass.js`: ringe fra berøring, dybdeskarphed, farvekorrektion, vignet, Khronos PBR Neutral tonemap, sRGB og dithering. Erstatter OutputPass.
  - `camera.js`: framing i landskab og portræt, dykket ved start og `bounds` for fiskene.
  - `quality.js`: tiers ud fra et pixelbudget og en EMA af frametiden.
  - `uniforms.js`: delte uniforms `U` og dag/nat-paletten.
- `src/glsl/common.js`: fælles GLSL (`PRELUDE`): støj, vandfarve og tåge, `softShade`, caustics og `aqSafe`.
- `src/world/`: baggrund, sand (`sandHeight` bruges til at placere alt), caustics-RT, lysstråler, overflade, sten, tang, koraller og anemoner, kisten, krabben, vandmænd, søstjerne-tittebøh (`starfish.js`) og store bobler man kan poppe (`bigbubbles.js`).
  - `world.js` bygger og opdaterer **revet** og har `pickables`.
  - `ocean.js` bygger og opdaterer **det åbne hav**: lys sandbund, der falder ud i det dybe, det sunkne skib (`ship.js`), gyldenbrun tangskov, grå sten, havbund med søvifter og søpindsvin (`createSeabed` i `corals.js`) og sildestimen.
  - Begge har de samme dele (`scene`, `school`, `fx`, `bubbles`, `food`, `treasure`, `starfish`, `bigBubbles`, `pickables`, `seaweed.clusters`, `update`, `applyTier`). Derfor virker berøring, knapper og fabrik i begge.
- `src/particles/`: GPU-partikler med startdata i instance-attributter og bevægelsen i shaderen: bobler, fx (hjerter, stjerner, glimmer, konfetti), plankton, skygger og sildestimen (`sardines.js`: 140 små fisk, der løber hver sin bane om stimens midte og spredes af `scare(p)`). CPU-simuleret: foder og skattens perler.
- `src/fish/`:
  - `dna.js`: DNA, startfisk og personlighed ud fra seed.
  - `geometry.js`: én geometri pr. form, alle dele i ét draw call med en fælles UV-layout til maleriet.
  - `animals.js`: de fire store dyr (former 4–7). Kroppen er bygget af profilkurver, finner og luffer har lidt tykkelse, og de bruger samme UV-layout og samme shader som fiskene.
  - `material.js`: fiske-shaderen med analytiske øjne.
  - `fish.js`: bevægelse, animation og tilstande, plus `display()` til fabrikken.
  - `school.js`: boids, picking og ind/ud-svømning.
  - `population.js`: hvem der bor i hvert akvarium (`REEF` og `SEA`). Bestanden findes fra start, og fiskene kommer ind, når akvariet bygges (`attach`).
  - `testfish.js`: testfiskene til `?fill`.
- `src/factory/`:
  - `factory.js`: fabrikkens logik med 5 trin, tryllestav og slip ud.
  - `studio.js`: fabrikkens scene med baggrund, sand og bobler.
  - `painter.js`: fingermaling med raycast → UV på et lærred på 512×256 i to lag.
- `src/ui/`: HUD, startboble, fabrikkens knapper, forældrehjørnet, boble-overgangen og alle ikoner (`icons.js`, inline SVG).
- `src/audio/`: `synth.js` (alle lyde som rene opskrifter), `ambience.js` (havlyd og spilledåse), `engine.js` (lydkæde, stemmeloft, oplåsning) og `analysis.js` (offline-måling til testene).
- `src/storage.js` gemmer i localStorage. `src/backup.js` håndterer gem/hent kopi som fil (med både revets og havets egne dyr). `src/interact.js` styrer berøring i akvariet. `sw.js` er service workeren.

### Vigtige mønstre

- **Delte uniforms:** alle materialer er egne `ShaderMaterial` med `withShared()`, som deler *referencer* til `U`. Fabrikken bytter lyset ud med `inStudio(material)`, så den altid ses i dagslys og uden tåge.
- **Fisk:** én draw call pr. fisk. Geometrien deles pr. form, og malerierne har samme UV-layout på alle fire former, så et maleri følger med, når formen skiftes. u går fra snude til hale, og v er spejlet, så begge sider viser maleriet. Finnerne tager farven fra kroppens kant.
- **`setState(state, data)`** kopierer `data` ind på fisken. Brug **aldrig** et metodenavn som nøgle (fx `trickName`, ikke `trick`).
- **NaN/Inf-beskyttelse:** `aqSafe()` sidder på bloom-passets high-pass-input og på alle `tDiffuse`-læsninger i FinalPass, så én dårlig pixel aldrig kan gøre skærmen sort. Den må ikke fjernes. Nul-normaler i geometrien bliver saneret.
- **Tal i Float32-buffere:** sammenlign med den værdi, der faktisk står i bufferen (se `Bubbles.spawn` og `isAlive`).
- **To akvarier:**
  - Hvert akvarium har sin egen scene og bygges først, når der er brug for det. En ny verden bygges, mens boble-overgangen holder skærmen dækket (`BubbleWipe.play` venter på et promise), og shaderne kompileres i ventetiden.
  - `setTerrain(kind)` bestemmer, hvilken havbund `sandHeight` beskriver. `setPalette(kind)` styrer vandets farver og lys.
  - Lysnettet (caustics) deles af begge akvarier og fabrikken.
- **Gemning:** nøglen `undervandsspil.v1` = `{v:1, settings:{night, muted, volume, ambience, world}, fish:[DNA], sea:[DNA], draft}`. `fish` er revets egne fisk, `sea` havets egne dyr, og `world` er det akvarium, man var i sidst. Malerier gemmes som JPEG data-URL i 512×256. Ved fuld kvote bliver malerierne mindre, og som sidste udvej mister de ældste deres maleri. En fisk går aldrig tabt.
- **DNA:** `{id, born, kind:'design'|'wand'|'starter', shape 0–7, color, pattern 0–3 (ingen, striber, prikker, regnbue), eyes 0–3 (store, søvnige, glade, googly), glow, seed, paint, color2}`. Formerne er 0–3 for revets fisk (rund, lang, trekant, kuglefisk) og 4–7 for havets dyr (delfin, haj, spækhugger, hval).

## Beslutninger truffet undervejs

- **Byggetrin:** projektet er bygget i 6 trin (scene → fisk → interaktioner → fabrik → lyd → polering) med test på iPad'en efter trin 1–3. Alle trin er færdige.
- **PWA:** manifest, rigtigt apple-touch-icon og service worker, så appen virker helt offline efter første besøg.
  - Produktion henter fra cachen først, localhost fra netværket først (`ignoreSearch`).
  - En ny version, der kommer mens startboblen vises, giver genindlæsning med det samme. Under leg venter den til næste start.
- **Lyd og fuldskærm på iOS:** lyden låses op af startboblen. Fuldskærm forsøges kun på `pointerup`/`touchend` med 800 ms spærring mod dobbelt forespørgsel. Safaris fuldskærms-X sidder øverst til venstre, så tandhjul og hjem-knap sidder til **højre**.
- **Kvalitet:**
  - iPad 10 starter på **tier 2** (DPR 1,5).
  - På iPad går den aldrig over starttrinnet, fordi mislykkede opgraderinger gav synlige hak.
  - Nedskalering ved under 55 fps i 1,5 s. Flere frames over 250 ms i træk giver 2 trin ned.
  - Budget: højst 90 draw calls og 250.000 trekanter.
  - Med 25 malede fisk er tallene 44 draw calls og cirka 191.000 trekanter.
  - Målt på den rigtige iPad 10 (3. oktober 2026): `?fill=25` gav 60 fps på tier 2.
  - Havet med 8 malede dyr (`?ocean&fill=8`) bruger cirka 25 draw calls og 118.000 trekanter. Det er ikke målt på iPad'en endnu.
- **Bestand:**
  - **8 startfisk** og **højst 25 fisk** i alt.
  - Når der mangler plads, svømmer først en startfisk ud, så den ældste tryllestavsfisk, så den ældste designede fisk. Egne fisk, der skubbes ud, slettes.
  - Fisk vinker farvel og svømmer ud til siden. Startfisk svømmer ind igen fra siden.
- **Øjne:** flade og sænket ned i hovedet. Googly-øjne har samme størrelse, og hver pupil ruller for sig. Søvnige og glade øjne skal være tydeligt åbne.
- **Det åbne hav** (brugerens valg: det åbne hav frem for ishavet):
  - Dybblåt, klart vand, en sandbund der falder ud i det dybe, et venligt sunket skib med skat, tangskov, grå sten og en sildestime.
  - **Én af hver til at starte med:** delfin, haj, spækhugger og hval. Der er højst **8 dyr**, og startdyrene svømmer ud først, ligesom i revet.
  - Delfin, spækhugger og hval slår med halen op og ned (vandrette halefinner). Hajen slår fra side til side.
  - Artstegninger (hvide maver, spækhuggerens pletter, hajens gæller, hvalens stribede strube) ligger under barnets egen maling.
  - Tryk på et dyr giver et trick og dyrets egen sang. Hvalen puster en fontæne af bobler, og hajen siger "nom nom".
  - Tryk på skibet: det gynger, koøjerne blinker, klokken ringer, og der kommer skat ud (højst hvert 3,5 s).
  - Tryk på sildestimen: den spredes og samler sig igen. Delfinen og spækhuggeren drøner også selv igennem den nu og da.
- **Skift mellem akvarierne:**
  - Knappen sidder nederst til venstre ved siden af dag/nat og viser altid det *andet* sted: en hval på vej ud i havet og en fisk ved en koral på vej hjem til revet.
  - Boble-overgangen dækker skiftet. Derefter dykker kameraet ned i det nye vand, og en beboer svømmer hen og siger hej.
  - Appen husker, hvilket akvarium man var i sidst.
- **Fiskefabrikken:** fem trin med kun ikoner: form, maling, mønster, øjne og en stor grøn slip-ud-knap. Kladden huskes.
  - **Åbnes den fra havet, laver den store dyr** (brugerens valg): formvalget viser de fire dyr, og dyret svømmer ud i havet.
  - Kladden følger med mellem akvarierne: samme farver og maleri på det tilsvarende dyr eller den tilsvarende fisk (form ± 4).
  - Et stort dyr læner ryggen lidt mod barnet i fabrikken, så de vandrette halefinner kan ses.
  - **Tryllestaven** laver en tilfældig fisk med ét tryk og springer til slip-ud-trinnet. Selve udsætningen kræver ét tryk mere.
  - **Farveklatter:** den *første* klat farver hele fisken. De næste vælger penselfarven, så man kan male gule striber på en blå fisk. Et ekstra tryk på den valgte klat hælder farven ud over hele fisken igen. Strøgene ligger i et lag over grundfarven.
  - **I male-trinnet er hver finger en pensel.** Strøget maler, når fingeren er over fisken, også hvis det startede ved siden af. Fisken drejer ikke en piruet, når man går ind i male-trinnet.
  - **Lys og scene:** studielys via `inStudio`, bloom-styrke 0,18 og ingen dybdeskarphed.
  - **Drejning:** fisken vender sig næsten forfra ved øjne-trinnet.
- **Nat og lyd:** dag/nat og lyd til/fra huskes til næste gang.
- **Forældrehjørnet:** tandhjulet kræver 3 sekunders tryk. Der er skydere til lydstyrke og havlyd, gem/hent kopi og slet egne fisk med ✓/✗. Slet og gem/hent kopi gælder begge akvarier.
  - **Skyderne er egne pointer-styrede komponenter** (`Slider` i `ui/parent.js`), ikke `<input type=range>`. Siden blokerer `touchmove` for at undgå zoom og scroll, og det forhindrer iPad'ens indbyggede skydere i at blive trukket (kun tryk virkede). Mens man trækker, høres en blød tone, der stiger med lydstyrken. Indstillingen gemmes, når fingeren slipper.
  - **Gem kopi:** iOS' delingsark ("Gem i Filer") eller en download.
  - **Hent kopi:** filen tjekkes felt for felt. Kun `data:image/jpeg|png` accepteres som maleri. Fisk, man ikke har i forvejen, svømmer hjem, og 25-grænsen gælder stadig. I `?fill`-tilstand er hent kopi slået fra.
- **Polering:**
  - Store bobler man kan poppe (to ud af tre har en overraskelse: hjerter eller glimmer).
  - En søstjerne kigger op ved hvert 3. tryk i sandet (2., 5., 8. …) og vinker.
  - Fingersporet er et regnbuebånd, der spiller toner efter fingerens højde.
  - Efter cirka 14 s uden berøring svømmer en fisk hen til glasset og hilser.

## Lyd: brugerens ønsker (skal overholdes)

- **Aldrig høj eller skarp lyd.** Alt er blødt og syntetiseret med Web Audio.
- **Lydkæde:** buses → master → lowpass 7 kHz → blød limiter.
- **Skala:** alle tonehøjder ligger i **C-dur pentatonisk** (`noteFreq`), så alt, der spilles samtidig, klinger godt.
- **Havlyden skal ligge et godt stykke under effekterne.** Efter børnenes test var den for høj, og den er sænket cirka 6–8 dB. Den må ikke drive limiteren.
- **Ingen stemme-agtig eller summende syntese.** Det gamle formant-"fnis" ved tryk på en fisk var irriterende. Lyde skal være charmerende og musikalske:
  - blød "boble-marimba"
  - slide-whistle-glid
  - spilledåse
  - harpe
- **Fisk:** hver fisk har sin egen stemme (store fisk synger dybere). Hurtige gentagne tryk giver kun én blød tone.
- **Maling:** brugeren fandt det tidligere stø-sus ved hvert penselstrøg irriterende. I stedet spiller `paintNote` en blød, glasagtig tone højst hvert 0,3 s og først efter cirka 40 px fingerbevægelse. Tonerne vandrer op og ned i skalaen fra penselfarvens egen tone, så maling lyder som en langsom lille melodi. Støj må ikke bruges til maling.
- **Havets dyr** synger hver sin lille melodi (`animalTune`):
  - delfinen: glade fløjt ("wii-wii-wiii!")
  - hajen: et venligt "da-dum … da-dum, da-da-da — ting!"
  - spækhuggeren: et legende "wuu-huu!"
  - hvalen: en langsom, dyb sang
  
  Dertil kommer hvalens bløde pust (`spout`), skibsklokken (`bell`) og en fjern hval i havets baggrundslyd cirka hvert halve minut (`whaleCall`, lige til at ane under havets brus).
- **Temamelodi:** `theme` spiller en kort, hyggelig vals på cirka 5 s, når startboblen popper og kameraet dykker. Melodien ligger på boble-marimba med spilledåse en oktav over og bløde akkorder (C | G | Am | C), og den slutter med en harpe og bobler. Den startes via `audio.whenRunning()`, fordi lyden på iOS kan være ved at starte lige efter første tryk. Kommer lyden ikke i gang inden for 2 s, springes melodien over.
- **Automatisk tjek:** `tests/aquarium.spec.mjs` → "every sound is soft". Målingen er A-vægtet med en lille højttalers bas-rolloff, se `src/audio/analysis.js`.
  - hver opskrift: peak ≤ −6 dBFS og diskantandel over 5 kHz < 0,12
  - hver effekt (undtagen `whoosh`) mindst **8 dB** over havlydens højeste øjeblik om dagen
  - om natten og i havet mindst 5 dB over
  - havlyden: peak ≤ −18 dBFS, også i det åbne hav
  - spilledåsen om natten og hvalerne i havet: højst 4 dB over dagens havlyd
- **Lytteprøve:** Claude kan ikke selv høre lydene. Når lyde ændres, renderes en lytteprøve offline gennem den rigtige lydkæde (OfflineAudioContext i Playwright → WAV → `afconvert -f m4af -d aac` → m4a), som brugeren kan høre. Spektrogrammer hjælper til selvtjek.

## Praktiske tips

- Brug absolutte stier i shell-kommandoer, ikke `cd`.
- Dev-serveren kan startes via `.claude/launch.json` (navn `akvariet`) eller med `npm run serve`.
- Nye filer i `src/` kommer først med i offline-cachen efter `npm run sw`.
- Tjek visuelle ændringer i begge retninger (1180×820 og 820×1180) og om natten.

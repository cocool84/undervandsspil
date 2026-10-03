# Akvariet (Undervandsspil)

Et magisk 3D-undervandsakvarium til småbørn (ca. 2–5 år) på **iPad 10. generation i Safari** (også som hjemmeskærm-app). Børnene kan ikke læse, så der må **ingen tekst** være i brugerfladen: kun ikoner, farver, bevægelse og lyd. Alt reagerer på berøring, og knapperne er store.

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
  - `window.__aq`: `ready`, `perf()`, `fish()`, `bubbles()`, `whatIsAt(x, y)`, `snapshotStats()`.
  - `__aq.app` giver adgang til alt internt, fx `factory`, `population`, `parent` og `audio`.
  - `__aq.app.audio.analyze()` renderer alle lyde offline og måler dem.

## URL-flag (`src/config.js`)

| Flag | Virkning |
|---|---|
| `?debug` | Overlay med fps, tier og draw calls (virker også på iPad'en) |
| `?debug=depth` | Viser dybdebufferen |
| `?quality=N` | Lås kvalitetstrin 0–5 |
| `?simslow=N` | Busy-wait N ms pr. frame (tester nedskalering) |
| `?fill=N` | N malede testfisk i stedet for de egne (højst 25). **Gemmes aldrig.** Bruges til ydelsesmåling: `?fill=25&debug` |
| `?fishgrid`, `?fishgrid=eyes` | QA-gitter med alle former, mønstre og øjne |
| `?seed=N` | Anden opbygning af revet |
| `?night` | Start om natten |
| `?autostart` | Spring startboblen over (tests) |
| `?nosw` | Ingen service worker |
| `?nantest` | Tegner NaN/Inf-pixels (tester beskyttelsen) |

## Arkitektur

ES-moduler uden bundler. Three.js **0.186.1** ligger i `vendor/three/` (låst version, kun de filer der bruges) og hentes via import map i `index.html`. Én `WebGLRenderer`, én WebGL-kontekst og to scener: akvariet og fiskefabrikken.

- `src/main.js`: wiring, start, loop, skift mellem akvarium og fabrik (`app.view`, `app.busy` under boble-overgangen), idle-besøg og callbacks for lyd og effekter.
- `src/core/`:
  - `renderer.js`: composer-kæden RenderPass (HalfFloat og DepthTexture på *begge* ping-pong-targets) → UnrealBloomPass → `finalpass.js`.
  - `finalpass.js`: ringe fra berøring, dybdeskarphed, farvekorrektion, vignet, Khronos PBR Neutral tonemap, sRGB og dithering. Erstatter OutputPass.
  - `camera.js`: framing i landskab og portræt, dykket ved start og `bounds` for fiskene.
  - `quality.js`: tiers ud fra et pixelbudget og en EMA af frametiden.
  - `uniforms.js`: delte uniforms `U` og dag/nat-paletten.
- `src/glsl/common.js`: fælles GLSL (`PRELUDE`): støj, vandfarve og tåge, `softShade`, caustics og `aqSafe`.
- `src/world/`: baggrund, sand (`sandHeight` bruges til at placere alt), caustics-RT, lysstråler, overflade, sten, tang, koraller og anemoner, kisten, krabben, vandmænd, søstjerne-tittebøh (`starfish.js`) og store bobler man kan poppe (`bigbubbles.js`). `world.js` bygger og opdaterer det hele og har `pickables`.
- `src/particles/`: GPU-partikler med startdata i instance-attributter og bevægelsen i shaderen: bobler, fx (hjerter, stjerner, glimmer, konfetti), plankton og skygger. CPU-simuleret: foder og skattens perler.
- `src/fish/`:
  - `dna.js`: DNA, startfisk og personlighed ud fra seed.
  - `geometry.js`: én geometri pr. form, alle dele i ét draw call med en fælles UV-layout til maleriet.
  - `material.js`: fiske-shaderen med analytiske øjne.
  - `fish.js`: bevægelse, animation og tilstande, plus `display()` til fabrikken.
  - `school.js`: boids, picking og ind/ud-svømning.
  - `population.js`: hvem der bor i akvariet.
  - `testfish.js`: testfiskene til `?fill`.
- `src/factory/`:
  - `factory.js`: fabrikkens logik med 5 trin, tryllestav og slip ud.
  - `studio.js`: fabrikkens scene med baggrund, sand og bobler.
  - `painter.js`: fingermaling med raycast → UV på et lærred på 512×256 i to lag.
- `src/ui/`: HUD, startboble, fabrikkens knapper, forældrehjørnet, boble-overgangen og alle ikoner (`icons.js`, inline SVG).
- `src/audio/`: `synth.js` (alle lyde som rene opskrifter), `ambience.js` (havlyd og spilledåse), `engine.js` (lydkæde, stemmeloft, oplåsning) og `analysis.js` (offline-måling til testene).
- `src/storage.js` gemmer i localStorage. `src/backup.js` håndterer gem/hent kopi som fil. `src/interact.js` styrer berøring i akvariet. `sw.js` er service workeren.

### Vigtige mønstre

- **Delte uniforms:** alle materialer er egne `ShaderMaterial` med `withShared()`, som deler *referencer* til `U`. Fabrikken bytter lyset ud med `inStudio(material)`, så den altid ses i dagslys og uden tåge.
- **Fisk:** én draw call pr. fisk. Geometrien deles pr. form, og malerierne har samme UV-layout på alle fire former, så et maleri følger med, når formen skiftes. u går fra snude til hale, og v er spejlet, så begge sider viser maleriet. Finnerne tager farven fra kroppens kant.
- **`setState(state, data)`** kopierer `data` ind på fisken. Brug **aldrig** et metodenavn som nøgle (fx `trickName`, ikke `trick`).
- **NaN/Inf-beskyttelse:** `aqSafe()` sidder på bloom-passets high-pass-input og på alle `tDiffuse`-læsninger i FinalPass, så én dårlig pixel aldrig kan gøre skærmen sort. Den må ikke fjernes. Nul-normaler i geometrien bliver saneret.
- **Tal i Float32-buffere:** sammenlign med den værdi, der faktisk står i bufferen (se `Bubbles.spawn` og `isAlive`).
- **Gemning:** nøglen `undervandsspil.v1` = `{v:1, settings:{night, muted, volume, ambience}, fish:[DNA], draft}`. Malerier gemmes som JPEG data-URL i 512×256. Ved fuld kvote bliver malerierne mindre, og som sidste udvej mister de ældste deres maleri. En fisk går aldrig tabt.
- **DNA:** `{id, born, kind:'design'|'wand'|'starter', shape 0–3, color, pattern 0–3 (ingen, striber, prikker, regnbue), eyes 0–3 (store, søvnige, glade, googly), glow, seed, paint, color2}`.

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
- **Bestand:**
  - **8 startfisk** og **højst 25 fisk** i alt.
  - Når der mangler plads, svømmer først en startfisk ud, så den ældste tryllestavsfisk, så den ældste designede fisk. Egne fisk, der skubbes ud, slettes.
  - Fisk vinker farvel og svømmer ud til siden. Startfisk svømmer ind igen fra siden.
- **Øjne:** flade og sænket ned i hovedet. Googly-øjne har samme størrelse, og hver pupil ruller for sig. Søvnige og glade øjne skal være tydeligt åbne.
- **Fiskefabrikken:** fem trin med kun ikoner: form, maling, mønster, øjne og en stor grøn slip-ud-knap. Kladden huskes.
  - **Tryllestaven** laver en tilfældig fisk med ét tryk og springer til slip-ud-trinnet. Selve udsætningen kræver ét tryk mere.
  - **Farveklatter:** den *første* klat farver hele fisken. De næste vælger penselfarven, så man kan male gule striber på en blå fisk. Et ekstra tryk på den valgte klat hælder farven ud over hele fisken igen. Strøgene ligger i et lag over grundfarven.
  - **I male-trinnet er hver finger en pensel.** Strøget maler, når fingeren er over fisken, også hvis det startede ved siden af. Fisken drejer ikke en piruet, når man går ind i male-trinnet.
  - **Lys og scene:** studielys via `inStudio`, bloom-styrke 0,18 og ingen dybdeskarphed.
  - **Drejning:** fisken vender sig næsten forfra ved øjne-trinnet.
- **Nat og lyd:** dag/nat og lyd til/fra huskes til næste gang.
- **Forældrehjørnet:** tandhjulet kræver 3 sekunders tryk. Der er skydere til lydstyrke og havlyd, gem/hent kopi og slet egne fisk med ✓/✗.
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
- **Automatisk tjek:** `tests/aquarium.spec.mjs` → "every sound is soft". Målingen er A-vægtet med en lille højttalers bas-rolloff, se `src/audio/analysis.js`.
  - hver opskrift: peak ≤ −6 dBFS og diskantandel over 5 kHz < 0,12
  - hver effekt (undtagen `whoosh`) mindst **8 dB** over havlydens højeste øjeblik om dagen
  - om natten mindst 5 dB over (undtagen `brush`)
  - havlyden: peak ≤ −18 dBFS
  - spilledåsen om natten: højst 4 dB over dagens havlyd
- **Lytteprøve:** Claude kan ikke selv høre lydene. Når lyde ændres, renderes en lytteprøve offline gennem den rigtige lydkæde (OfflineAudioContext i Playwright → WAV → `afconvert -f m4af -d aac` → m4a), som brugeren kan høre. Spektrogrammer hjælper til selvtjek.

## Praktiske tips

- Brug absolutte stier i shell-kommandoer, ikke `cd`.
- Dev-serveren kan startes via `.claude/launch.json` (navn `akvariet`) eller med `npm run serve`.
- Nye filer i `src/` kommer først med i offline-cachen efter `npm run sw`.
- Tjek visuelle ændringer i begge retninger (1180×820 og 820×1180) og om natten.

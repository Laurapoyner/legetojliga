# LegetøjsLigaen

Børnenes eget legetøj bliver til spilfigurer. De tager et billede af en bamse, en dino eller en bil, giver den et navn og gør den stærkere ved at bevæge sig foran kameraet, rydde op, hjælpe til og passe på den. Bagefter kan de udfordre hinanden i arenaen.

Det her er **testversionen**: en webapp uden database, som kører i browseren på iPad, telefon og computer. Alt gemmes på den enhed, man spiller på. MongoDB og fælles data på tværs af enheder er næste skridt (se nederst).

## Det kan spillet

- **Profiler**: et barn pr. profil, flere kan tilføjes. Forældrepanel med PIN-kode.
- **Figurer**: billede, navn, type (bamse, dino …) og klasse (Stærk, Hurtig, Forsvarer). Level 1–25 med XP-formlen `60 + (level − 1) × 20` – i alt 6.960 XP til level 25.
- **Kameratræning** med MediaPipe Pose, der tæller rigtige bevægelser: sprællemænd, squats, høje knæløft, hop, stå på ét ben, superhelte-positur, flyvemaskinen, dans og løb på stedet. Videoen bliver på enheden og gemmes ikke. Virker kameraet ikke, kan en voksen godkende øvelsen i stedet.
- **Opgaver i den virkelige verden** (40+): oprydning med før/efter-billeder, hjælp hjemme, kreative opgaver, læsning, udeleg og venlighed. En voksen godkender, før der gives XP.
- **Pleje**: mad, vand, søvn, vask, leg og kram giver energi og glæde (og lidt XP). Figurerne mister aldrig levels ved pauser.
- **Kampe**: udfordring → svar → tre runder med Angreb, Forsvar og Finte (+ specialangreb fra level 5). Begge vælger træk i hemmelighed. Animeret kamp med replay.
- **Grænser** (kan ændres af forældre): 3 kampe pr. figur og 15 pr. barn om dagen, højst 100 kamp-XP om dagen, sejr 20 / uafgjort 16 / nederlag 12 XP. Nulstilles ved midnat dansk tid.
- **Daglige missioner**, **pokaler**, **rekorder**, level-up med konfetti og lyd.
- **Oplæsning**: tæller højt i træningen, fortæller i kampene, siger level up og nye pokaler, og læser missioner og opgaver op for børn, der ikke kan læse endnu. Bruger Azure-stemmen (Christel eller Jeppe), hvis den er sat op – ellers enhedens egen danske stemme.
- **Forældrepanel**: godkend opgaver, ret XP og grænser pr. opgave, lav egne opgaver, sværhedsgrad pr. barn (Let/Normal/Svær), ret fejl i XP, slet legetøj, historik, backup og gendannelse.

## Prøv det lokalt

Kræver [Node.js](https://nodejs.org) 18 eller nyere. Der skal ikke installeres noget andet.

```bash
npm start
```

Åbn http://localhost:3000. Kameraet virker på `localhost` på en computer med webkamera.
Vil I bare kigge først, så tryk **Prøv eksempel-familien** på forsiden (PIN 1234).

Tests af regler, kampe og bevægelsestællere:

```bash
npm test
```

## Læg det på GitHub og Render

Kameraet kræver en sikker adresse (`https://`) på iPad og telefon. Den nemmeste vej er en gratis "Static Site" på Render:

1. Opret et nyt repository på GitHub, og læg alle filerne i det (I kan trække mappen ind på GitHub-siden "Add file → Upload files").
2. På [render.com](https://render.com): **New → Static Site**, og vælg jeres repository.
3. **Build Command**: lad feltet være tomt. **Publish Directory**: `.` (et punktum). Tilføj evt. miljøvariablen `SKIP_INSTALL_DEPS` = `true`, så Render ikke prøver at installere noget.
4. Tryk **Create Static Site**. Efter et minut får I en adresse som `https://legetoejsligaen.onrender.com`.
5. Åbn adressen i Safari på iPad'en, tryk **Del → Føj til hjemmeskærm**. Så ligner det en app.

Vil I have Azure-stemmen med, skal I i stedet vælge **Web Service** – se næste afsnit. Det bliver også nødvendigt, når API'et til MongoDB kommer på.

> I testversionen har hver enhed sine egne data. Spiller børnene på hver sin iPad, kan de ikke udfordre hinanden endnu – det kommer med databasen. Indtil da: spil på samme enhed og skift spiller øverst til venstre. Tag jævnligt en backup i forældrepanelet under **Data**.

## Stemme fra Azure

Azure-nøglen må aldrig ligge i koden eller på GitHub. Den gemmes som en hemmelig miljøvariabel på serveren, og browseren beder serveren om lyden. Uden Azure bruger spillet bare enhedens egen danske stemme (på iPad hedder den Sara).

1. Gå til [portal.azure.com](https://portal.azure.com) og opret en **Speech service** (Azure AI Speech). Vælg prisniveauet **Free F0** – det giver 500.000 tegn neural oplæsning gratis om måneden. Vælg en europæisk region, fx *West Europe*.
2. Åbn ressourcen og find **Keys and Endpoint**. Kopiér **KEY 1** og **Location/Region** (fx `westeurope`).
3. På Render: **New → Web Service** (ikke Static Site), og vælg jeres repository.
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Under **Environment** tilføjer I:
   - `AZURE_SPEECH_KEY` = jeres nøgle
   - `AZURE_SPEECH_REGION` = regionen, fx `westeurope`
   - (valgfrit) `AZURE_DAILY_CHAR_LIMIT` = højst antal tegn om dagen. Standard er 15000, så I holder jer inden for det gratis niveau.
5. Når siden kører: Forældrepanel → **Stemme** → **Tjek igen**. Der skal stå, at Azure-stemmen er sat op. Vælg Christel eller Jeppe, og tryk **Prøv stemmen**.

Lokalt kan I teste med:

```bash
AZURE_SPEECH_KEY=jeres-nøgle AZURE_SPEECH_REGION=westeurope npm start
```

(I PowerShell på Windows: `$env:AZURE_SPEECH_KEY="jeres-nøgle"; $env:AZURE_SPEECH_REGION="westeurope"; npm start`)

Godt at vide:

- Hver sætning hentes kun én gang og genbruges, så forbruget bliver lavt. Tal og nedtælling hentes på forhånd, så de kommer præcist.
- Serveren tillader højst 200 tegn pr. sætning, begrænser antallet af forespørgsler og stopper ved dagsgrænsen. Så kan andre ikke bruge jeres nøgle løs.
- En gratis Web Service på Render går i dvale, når ingen har brugt den et stykke tid. Første besøg derefter kan tage op mod et minut.
- I forhåndsvisningen i Claude kan Azure ikke nås. Der bruges enhedens egen stemme.

## Mappestruktur

```
index.html              Siden, der indlæser spillet
css/app.css             Alt design
js/main.js              Start, navigation og fordeling af tryk
js/catalog.js           Indhold: aktiviteter, XP, missioner, pokaler, pleje, klasser
js/rules.js             Spillets regler (levels, stats, kampe, grænser, missioner)
js/actions.js           Handlinger, der ændrer data (her skal API-kald ind senere)
js/store.js             Lagring på enheden (IndexedDB) – udskiftes med server senere
js/pose/counters.js     Bevægelsestællere oven på MediaPipe Pose
js/pose/camera.js       Kamera og indlæsning af MediaPipe
js/voice.js             Oplæsning (Azure via serveren eller enhedens egen stemme)
js/ui/*.js              Skærmene (forside, figurer, træning, opgaver, arena, forældre …)
tests/                  Automatiske tests (node --test)
server.js               Lille webserver til lokal kørsel og Render Web Service + Azure-oplæsning
```

Vil I ændre point, opgaver eller tekster permanent, så ret `js/catalog.js`. Mange ting kan også ændres direkte i forældrepanelet.

## Næste skridt: MongoDB og flere enheder

Spillet er bygget, så reglerne (`rules.js`) kan genbruges på serveren, og alle ændringer går gennem `actions.js`. Plan:

1. Tilføj Express og MongoDB-driveren, og lav et API i `server.js` (Render Web Service + MongoDB Atlas).
2. Samlinger: `families`, `children`, `toys`, `submissions`, `xpLog`, `battles`, `careLog`, `settings`, `activities` – samme felter som i dag.
3. Flyt validering af grænser, XP-tildeling og kampberegning til serveren (brug `rules.js`), så intet kan snydes fra browseren.
4. Gem billeder privat (fx MongoDB GridFS eller en privat bucket) og slet dokumentationsbilleder efter 14 dage.
5. Lad `actions.js` kalde API'et i stedet for at gemme lokalt, og hent nye udfordringer jævnligt eller via server-sent events.
6. Login for familien (forældre-konto) og simpel profilvalg for børnene.

### Prompt til en AI-kodeassistent til det skridt

> Jeg har en fungerende webapp, LegetøjsLigaen (vanilla JS, ingen build). Al data gemmes i dag lokalt via `js/store.js`, og alle ændringer sker i `js/actions.js`, mens reglerne ligger i `js/rules.js`. Tilføj en Node/Express-backend i `server.js` med MongoDB (Atlas) til hosting på Render. Lav samlinger, der matcher felterne i `defaultState()` i `actions.js`. Flyt validering af dagsgrænser, XP og kampberegning til serveren ved at genbruge `rules.js`. Tilføj familie-login med forældre-PIN, privat lagring af billeder og synkronisering, så børnene kan udfordre hinanden fra hver sin enhed. Bevar alle eksisterende funktioner og tests, og tilføj tests for API'et. Lav en `.env.example` og vejledning til deployment på Render.

## Privatliv

- Kameravideo analyseres på enheden og gemmes aldrig.
- Billeder af legetøj og opgaver gemmes kun i browseren på enheden.
- Dokumentationsbilleder slettes automatisk 14 dage efter, at en voksen har godkendt eller afvist opgaven.
- Ingen profiler er offentlige, og der er ingen kontakt med fremmede.

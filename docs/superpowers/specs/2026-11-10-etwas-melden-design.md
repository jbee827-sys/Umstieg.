# „Etwas melden“ – Rückmeldungen per E-Mail

Stand: 10.11.2026 · Freigabe: Julian, 10.11.2026 (samt Datenschutztexten)

Layout-Vorschau (Wegwerf-Entwurf, nicht im Repo eingecheckt):
`frontend/.entwurf/meldung-vorschau.html`, veröffentlicht unter
https://claude.ai/artifact/NbQzuSNSeizDVAu9gL1cLA (Version 4). Julian hat sie
mit den unten genannten Änderungen freigegeben.

## Wozu

Wer Umstieg. benutzt, soll Julian direkt erreichen können, ohne ein
Mailprogramm zu öffnen und ohne seine Adresse zu kennen. Gemeldet werden:

- ein falscher Weg (Wegnavigation passt nicht zur Wirklichkeit),
- ein fehlender Bahnhof,
- ein fehlendes oder falsches Gleis,
- allgemeines Feedback und Wünsche an die App.

Die Meldung ist **nur Freitext**. Die App schickt **nichts** aus ihrem Zustand
mit (keinen Bahnhof, keine Gleise, keinen Schritt, keine Geräteangaben) –
ausdrücklicher Wunsch Julians. Optional kann die Person ihre E-Mail-Adresse
angeben, damit Julian antworten kann.

## Ziele

- Ein Textknopf **„Etwas melden“** im Eingabe-Bildschirm, direkt **unter dem
  aufklappbaren Block „Einstellungen“**, im Aussehen von „Reise importieren“
  (`.textknopf`, Link-Optik, kein roter Knopf).
- Er öffnet eine Meldeansicht als Dialog, gebaut wie „Reise importieren“
  (`.dialog-grund` / `.dialog`, `components/ReiseImport.tsx`).
- Das Backend nimmt die Meldung an und schickt sie per SMTP über web.de an
  `mail.umstieg@web.de`.
- **Erst nur auf der Website.** In der iOS-App bleibt der Knopf vorerst
  verborgen (`istApp()`, `plattform/`), Entscheidung Julian 10.11.2026. Grund:
  Die App würde damit erstmals E-Mail-Adresse und Nutzerinhalte erfassen; dafür
  müssten zuerst die Datenschutzangaben in App Store Connect und
  `frontend/ios/App/App/PrivacyInfo.xcprivacy` angepasst werden. Das kommt mit
  einem späteren App-Update.

## Nicht-Ziele

- Keine Kategorien- oder Typauswahl, keine Anhänge, keine Fotos.
- Kein automatisch mitgeschickter App-Zustand.
- Keine Speicherung der Meldungen im Backend (keine Datenbank, keine Datei,
  kein Log des Inhalts). Die Mail im Postfach ist der einzige Ort.
- Kein Ticket-System, keine Bestätigungsmail an die meldende Person.
- Kein Texture-Look für „Senden“: Den hat Julian nur für „Umstieg starten“,
  „Navigation starten“ und „Weiter“ gewollt.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Inhalt oder Adresse einer Meldung landen in einem Server-Protokoll, einem
  Fehlerbericht oder einem Zwischenspeicher.
- Das SMTP-Passwort oder ein anderer Schlüssel steht im Repo, im Frontend
  oder in einer Ausgabe.
- Julians Postfach wird zur Spam-Schleuder: ungebremst automatisierte
  Meldungen.
- Die Datenschutzseite sagt nach dem Einbau etwas, das nicht mehr stimmt
  (heute u. a. „Server verarbeitet … speichert nichts“).

## Aussehen und Texte (von Julian so festgelegt)

**Einstieg:** Textknopf „Etwas melden“ unter „Einstellungen“.

**Meldeansicht (Dialog):**

| Element | Text / Verhalten |
|---|---|
| Titel | „Etwas melden“ – **ohne** Einleitungstext darunter |
| Feld 1, Beschriftung | „Deine Nachricht“ – **ohne** Hilfetext darunter |
| Feld 1, Platzhalter | „z. B. In Fulda führt der Weg von Gleis 4 zu Gleis 6 über eine Treppe, die gesperrt ist.“ |
| Feld 1 | mehrzeilig, Zeichenzähler „n / 2000“ rechts darunter |
| Feld 2, Beschriftung | „E-Mail-Adresse (optional)“ |
| Feld 2, Hilfetext | „Gib deine E-Mail-Adresse an, um eine Antwort zu erhalten.“ (Julians Satz, Bindestrich und Komma ergänzt) |
| Knöpfe | „Abbrechen“ (sekundär) · „Senden“ (`.knopf-primaer`, flach rot) – nebeneinander, gleich breit, Pille |
| Kleingedrucktes | „Deine Nachricht geht per E-Mail an Umstieg. Mehr dazu im Datenschutz.“ – „Datenschutz“ führt zur Datenschutzseite |

**Feldaufbau** nach cult-ui „Halo Field“, aber **ohne Halo-Effekt** und in den
Farben von Umstieg.: Beschriftung → Hilfetext (nur bei der E-Mail) → Hülle →
Fehlerzeile. Hülle: leicht abgesetzter Grund, 1-px-Rand, 14 px Radius,
feiner Lichtrand oben; bei Fokus roter Rand mit weichem Fokusring. Hell- und
Nachtfassung über Token in `index.css` (beide dunklen Blöcke gleich halten –
`einstellungen/darstellung-css.test.ts`).

**Regeln für die Nachricht** (Julian):

| Nachricht (Zeichen **ohne Leerzeichen**) | Zeile unter dem Feld | „Senden“ |
|---|---|---|
| 0 | – (kein Satz; „Schreib ein paar Worte.“ am 11.11.2026 von Julian gestrichen) | gesperrt |
| 1–4 | „Dein Text ist zu kurz.“ (Fehlerrot, Feldrand rot) | gesperrt |
| ab 5 | – | frei |

**Leerzeichen zählen nicht** (Julian): Für die Mindestlänge zählen nur
Zeichen, die kein Leerraum sind – auch nicht in der Mitte („a b c“ = 3).
Die Höchstgrenze von 2000 Zeichen zählt dagegen alles, so wie es im Feld
steht; mehr lässt das Feld nicht zu (`maxLength`), und der Zähler zeigt
dieselbe Zahl. Das Backend prüft beide Regeln genauso.

**E-Mail-Adresse:** leer ist erlaubt. Ist etwas eingetragen, das keine
Adresse sein kann: „Diese E-Mail-Adresse sieht unvollständig aus.“, „Senden“
gesperrt.

**Nach dem Senden:** dieselbe Dialogfläche zeigt grünen Haken, „Danke!“,
„Deine Meldung ist angekommen.“ und den Knopf „Schließen“. **Kein** Satz über
eine Antwort – auch nicht, wenn eine Adresse angegeben wurde (Julian).

**Versand fehlgeschlagen** (Netz, Server, Ratenbegrenzung): „Das hat nicht
geklappt. Prüf deine Verbindung und versuch es noch einmal.“ – Text und
Adresse bleiben im Formular stehen.

## Versand (von Julian so entschieden)

- Über das **Backend auf Fly**, nicht über das Mailprogramm der Person.
- **SMTP von web.de** mit Julians Postfach als Absender und Empfänger:
  `smtp.web.de`, Port `587`, STARTTLS.
- Zugangsdaten als Fly-Secrets, bereits hinterlegt (Status „Staged“, wirksam
  mit dem nächsten Backend-Deploy): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASS`, `MELDUNG_AN`. Lokale Quelle: `E:\jbeer\.secrets\smtp-webde.env`
  (Tresor: nur lesen, nie den Wert ausgeben).
- Ist eine Adresse angegeben, wird sie **Reply-To** der Mail; „Antworten“ in
  web.de geht dann an die meldende Person.

**Form der Mail:**

```
Von:     mail.umstieg@web.de
An:      mail.umstieg@web.de
Antwort an: <Adresse der Person>          (nur wenn angegeben)
Betreff: Meldung aus Umstieg. – 10.11.2026, 21:58

<Text der Person, unverändert, als reiner Text>

—
Antwort an: anna@beispiel.de              bzw.  Keine Antwortadresse angegeben.
```

Zeit in Europe/Berlin. Reiner Text, kein HTML.

## Schutz gegen Missbrauch

- Mindestens 5, höchstens 2000 Zeichen – im Frontend **und** im Backend
  geprüft (das Backend vertraut dem Frontend nicht).
- Eigene, enge Ratenbegrenzung für die neue Route in `GRENZEN`
  (`backend/src/app.ts`).
- Kleiner `bodyLimit` an der Route.
- Kopfzeilen-Einschleusung ausschließen: Die Adresse geht nur nach Prüfung in
  Reply-To; Zeilenumbrüche in Adresse oder Betreff werden abgewiesen.

**Für später vorgemerkt (nicht Teil dieses Umbaus, Julian 10.11.2026):** eine
Obergrenze für alle zusammen, z. B. höchstens 30 Meldungen pro Stunde. Die
Grenze je IP hält niemanden mit wechselnden Adressen auf; bei Massenversand
könnte web.de das Postfach als Absender sperren. Einbauen, sobald Spam
auftaucht.

## Datenschutz

Neuer Abschnitt auf der Datenschutzseite (`components/Datenschutz.tsx`, wird
auch vorgerendert über `statisch/rechtsseiten.tsx`) und Ergänzung der
Kurzfassung. Inhalt mindestens: Was übertragen wird (Text, freiwillige
Adresse), dass der Server es nur weiterreicht und nicht speichert, dass es
per E-Mail über web.de (1&1 Mail & Media GmbH) an Julian geht, Rechtsgrundlage,
Speicherdauer im Postfach. Die Liste der Code-Stellen im Kopfkommentar der
Datei wird ergänzt.

- **Speicherdauer** (Julian): im Postfach, bis die Meldung erledigt ist,
  höchstens 12 Monate.
- **Rechtsgrundlage** (Vorschlag, Julian prüft): Art. 6 Abs. 1 lit. f DSGVO –
  Bearbeiten der Meldung, die die Person selbst abschickt; die Adresse
  freiwillig, nur zum Antworten.
- Ebenfalls anzupassen, weil sonst unwahr: die **Kurzfassung** und der Absatz
  unter **„Deine Rechte“** („… keine personenbezogenen Daten speichern …“).
- Die iOS-Abschnitte bleiben unverändert, solange der Knopf in der App
  verborgen ist.
- Ablauf: Claude schreibt die Texte als Entwurf, Julian gibt sie frei, bevor
  irgendetwas live geht.

## Entwurf der Datenschutztexte (zur Freigabe durch Julian)

Stil wie die übrige Seite: „wir/uns“, Du-Anrede, `{BETREIBER.email}` aus
`rechtliches/betreiber.ts`.

**1. Kurzfassung** – neuer Satz am Ende des Absatzes:

> Schreibst du uns über „Etwas melden“, kommt deine Nachricht – und deine
> E-Mail-Adresse, wenn du sie angibst – per E-Mail bei uns an.

**2. Neuer Abschnitt „Etwas melden“** – nach „Server-Protokolle“:

> **Etwas melden**
>
> Über „Etwas melden“ kannst du uns einen falschen Weg, einen fehlenden
> Bahnhof oder ein fehlendes Gleis melden oder uns einfach etwas schreiben.
> Diese Funktion gibt es derzeit nur auf der Webseite.
>
> Übertragen wird nur, was du selbst eingibst: deine Nachricht und, wenn du
> möchtest, deine E-Mail-Adresse. Die Webseite schickt nichts weiter mit –
> keinen Bahnhof, keine Gleise, keinen Standort.
>
> Unser Server reicht die Nachricht als E-Mail an unser Postfach weiter und
> **speichert sie nicht**; auch in ein Protokoll gelangt sie nicht. Für Versand
> und Postfach nutzen wir **WEB.DE** der 1&1 Mail & Media GmbH mit Sitz in
> Deutschland.
>
> Die E-Mail-Adresse ist freiwillig. Wir verwenden sie nur, um dir auf deine
> Meldung zu antworten.
>
> Rechtsgrundlage ist unser berechtigtes Interesse, Fehler in der App zu
> beheben und deine Meldung zu bearbeiten (Art. 6 Abs. 1 lit. f DSGVO). Die
> Meldung bleibt in unserem Postfach, bis sie erledigt ist, **höchstens 12
> Monate**; danach löschen wir sie. Möchtest du sie früher gelöscht haben,
> schreib uns an {BETREIBER.email}.

**3. „Server-Protokolle“**, Liste der Anbieter – Fly.io ergänzt:

> **Fly.io Inc.** betreibt den Server, der die Wege berechnet und Meldungen
> weiterreicht.

**4. „Deine Rechte“** – der Satz „Da wir keine personenbezogenen Daten
speichern … nichts, worüber Auskunft zu erteilen wäre.“ wird ersetzt durch:

> Personenbezogene Daten bewahren wir nur auf, wenn du uns über „Etwas
> melden“ schreibst: deine Nachricht und, falls angegeben, deine
> E-Mail-Adresse in unserem Postfach. Darauf beziehen sich diese Rechte;
> schreib uns dazu an {BETREIBER.email}. Darüber hinaus können wir dich in
> unseren Beständen nicht identifizieren – es gibt schlicht nichts, worüber
> Auskunft zu erteilen wäre.

**5. Kopfkommentar** der Datei: neuer Eintrag mit den Code-Stellen
(Frontend-Komponente, Backend-Route, Test, der das Nicht-Protokollieren
absichert).

Die iOS-Abschnitte bleiben unverändert, solange der Knopf in der App
verborgen ist.

## Auslieferung

1. Echter Versand vorab geprüft: lokal mit den Werten aus
   `E:\jbeer\.secrets\smtp-webde.env` an Julians Postfach (Julian erlaubt,
   10.11.2026). Werte nie ausgeben. **Erledigt 10.11.2026:** Testmail per
   curl über `smtp.web.de:587` mit STARTTLS vom Server angenommen
   (Anmeldung und TLS funktionieren).
2. **Backend zuerst** deployen (`flyctl deploy backend --ha=false`); damit
   werden auch die gestagten Secrets wirksam. Danach prüfen: Route antwortet,
   eine Testmeldung kommt an.
3. **Dann das Frontend** per Fast-Forward auf `main` – sonst liefe „Senden“ in
   Produktion auf einen 404.
4. Push und Deploy nur auf Julians ausdrücklichen Auftrag.

## Was dem Bauenden überlassen ist

- Name und Form der Backend-Route (Vorschlag: `POST /api/meldung`, JSON).
- Mail-Bibliothek (Vorschlag: `nodemailer`) und Zeitlimits beim SMTP-Versand.
- Genaue Grenze der Ratenbegrenzung.
- Komponentenname und Aufteilung im Frontend; Prüfregel für die Adresse
  (bewusst schlicht).
- Dass die Ansicht in Hell und Dunkel zu den Token passt und auf 360 px
  Breite funktioniert.
- Tests nach Projektbrauch (vitest, Frontend und Backend nicht gleichzeitig
  laufen lassen).

## Festlegungen (von Julian am 10.11.2026 bestätigt)

- Leeres Feld zeigt keinen Satz, nur „Senden“ ist gesperrt (11.11.2026).
- Leerzeichen zählen für die Mindestlänge nicht.
- Grenze 2000 Zeichen mit Zähler.
- „Senden“ flach rot, „Abbrechen“ sekundär daneben.
- Text bleibt nach einem Fehlschlag stehen.

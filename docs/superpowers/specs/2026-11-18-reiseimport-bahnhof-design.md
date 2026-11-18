# Reise-Import: klarer Dialog und Bahnhof per offiziellem Namen

Stand 18.11.2026, freigegeben von Julian (Ansatz A, Entwurf a).

## Anlass

Test mit TestFlight-Bau 3 am iPhone (Fehlerbilder 1–3, 18.11.2026):

1. Im Dialog „Reise importieren“ ist nicht zu erkennen, was zu tippen ist –
   die Umstiegskarte sieht aus wie der Hinweiskasten darüber, nur
   „Abbrechen“ ist als Knopf erkennbar. Der mittlere Kasten („Eberswalde Hbf
   → Berlin-Karow, 18.11.2026. Stimmt das? …“) wiederholt den Text darüber.
2. Nach der Übernahme steht „Bernau (S)“ nur als Suchtext im Feld; den
   Bahnhof „Bernau(b Berlin)“ muss man selbst antippen.

## Befund zu 2 (RIS::Stations, gemessen 18.11.2026)

Ein Bahnhof besteht aus mehreren EVA-Nummern mit je eigenem offiziellen
Namen. Die Namenssuche (`stop-places/by-name`) liefert nur den führenden
Eintrag, mit `groupMembers`; die Namen der Mitglieder stehen erst auf
`stop-places/{eva}`.

| EVA | `nameLong` | |
|---|---|---|
| 8013470 | Bernau(b Berlin) | führend, Gruppe `[8013470, 8089205]` |
| 8089205 | Bernau (S) | S-Bahn-Teil |
| 8011102 | Berlin Gesundbrunnen | führend |
| 8089015 | Berlin Gesundbrunnen(S) | `nameShort` „Berlin Gesundbr. (S)“ |

Der DB Navigator schreibt im Reisetext den Namen der Verkehrsstelle, an der
der Abschnitt hält – beim S2-Abschnitt also „Bernau (S)“. Je EVA gibt es
außerdem `nameShort`, `nameLocal`, `speechLong`, `speechShort` und
`synonyms` (Betriebskürzel wie „BER-“).

## Ziele

- a: Im Dialog ist ohne Nachdenken klar, was zu tun ist; nichts steht doppelt.
- b: Ein Bahnhofsname aus dem Reisetext wird zum Bahnhof der App, wenn er
  **offiziell eindeutig** ist – allgemein, nicht nur für Bernau.

## Nicht-Ziele / Anti-Ziele

- Keine Timetables-Abfrage für die Auflösung (knappe Limits).
- Kein Raten: Ein ähnlicher Name, ein abgeschnittener Zusatz oder ein
  Sprechname allein wählen nichts aus. Lieber nachfragen als falsch wählen.
- Nichts wird ohne Tipp des Nutzers ins Formular übernommen (bestehende
  Regel in `ReiseImport.tsx`).
- Der Reisetext verlässt das Gerät weiterhin nicht; ans Backend geht nur der
  Bahnhofsname.

## Ansätze (b)

- **A – gewählt:** Backend gleicht den Namen mit den offiziellen Namen der
  Gruppenmitglieder ab. Präzise (nur exakte Treffer), allgemein (alle
  Zusätze wie „(S)“, „(tief)“), kostet nur Stationsabfragen, gecacht.
- B – Frontend schneidet Zusätze ab und wählt bei genau einem Bahnhof.
  Verworfen: „Bernau“ trifft Bernau(b Berlin) und Bernau a Chiemsee.
- Verworfen ohne Ausarbeitung: Prüfung über die Abfahrtstafel (Timetables),
  eigene Namensliste aller Bahnhöfe (groß, veraltet).

## Design

### a – Dialog

```
Reise importieren
1. … 4.  (Anleitung, unverändert)
[ Text der Verbindung … ]
(„Live-Daten erst am Reisetag“ – bleibt, wenn zutreffend)

┌──────────────────────────────── ✓ ┐  ← gewählt: Rand/Haken
│ Bernau (S)                        │
│ RE3 an 21:07 Gl. 4 → S2 ab 21:23 Gl. 2 │
│ 16 min Umsteigezeit               │
└───────────────────────────────────┘
[ Abbrechen ]   [ Bestätigen ]   ← nebeneinander, Bestätigen grün
```

- Der Kasten „von → nach, Datum. Stimmt das? / Welcher Umstieg? · N
  Abschnitte erkannt …“ entfällt.
- Umstiegskarten sind wählbar (Radio-Verhalten). Genau ein Umstieg: vorgewählt.
  Mehrere: keiner vorgewählt, „Bestätigen“ gesperrt bis zur Wahl.
- Der Zwischenschritt „Das wird übernommen …“ mit „Übernehmen“/„Zurück zur
  Auswahl“ entfällt – die Karte zeigt bereits Bahnhof, Züge, Zeiten, Gleise.
  „Bestätigen“ übernimmt und schließt.
- „Bestätigen“ in `--color-gruen` (hell `#0f7a4f`, dunkel `#3cc98a`);
  Textfarbe mit ausreichendem Kontrast in beiden Modi.
- Fälle ohne Umstieg („keinen Umstieg“) und unlesbarer Text: wie bisher, dann
  nur „Abbrechen“.

### b – Bahnhof auflösen

Backend, neuer Endpunkt (Name dem Builder überlassen), Eingabe ein Name:

1. Namenssuche wie `/api/stations` (mit `namensvarianten`), nur gültige EVAs.
2. Für jeden führenden Bahnhof der Treffer: offizielle Namen von ihm und
   seinen `groupMembers` (`stop-places/{eva}`, Stamm-Cache 24 h).
3. Vergleich **exakt** nach Normalisierung: Groß/klein egal, Leerraum
   zusammengefasst, Leerzeichen vor „(“ egal („Bernau (S)“ = „Bernau(S)“).
   Verglichen werden `nameLong`, `nameShort`, `nameLocal` – nicht
   `speech*` (zu grob: „Bernau“) und nicht `synonyms` (Kürzel).
4. Genau eine Gruppe passt → deren führender Bahnhof (EVA + Name). Keine oder
   mehrere → kein Ergebnis.

Frontend nach „Bestätigen“: Bahnhof auflösen – zuerst der Name der Abfahrt
(wie heute `bahnhof`), dann der der Ankunft. Treffer → derselbe Zustand, als
hätte man den Bahnhof in der Suchliste angetippt (Tafeln gehen auf). Kein
Treffer oder Ausfall → wie heute Suchtext + Liste, darüber der Hinweis
„Bitte Bahnhof antippen“. Die übrigen Felder (Gleise, Züge) werden wie
bisher sofort gesetzt.

## Dem Builder überlassen

Endpunktname und Antwortform, ob das Frontend das `Ort`-Objekt über die
normale Suche holt oder direkt erhält, Platzierung des Hinweises, Tests
(Bernau (S), Berlin Gesundbrunnen(S), Name ohne Gruppe, mehrdeutiger Name,
Ausfall der Stations-API). `Umstieg` bekommt dafür den Ankunftsnamen.

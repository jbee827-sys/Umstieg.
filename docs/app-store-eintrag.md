# App Store: Vorlagen für den Store-Eintrag (Paket 10)

Stand 24.10.2026. Claude liefert, Julian trägt in App Store Connect ein und
gibt frei. Grenzen von Apple in Klammern; gezählt mit Leerzeichen.

## Grunddaten

| Feld | Wert |
|---|---|
| Name (30) | `Umstieg.` |
| Untertitel (30) | `Von Gleis zu Gleis umsteigen` (28) |
| Primäre Kategorie | Navigation |
| Sekundäre Kategorie | Reisen |
| Preis | kostenlos |
| Verfügbarkeit | nur Deutschland (Österreich und Schweiz später) |
| Support-URL | `https://www.umstieg.online/impressum` |
| Datenschutz-URL | `https://www.umstieg.online/datenschutz` |
| Marketing-URL | `https://www.umstieg.online/` |
| Copyright | `2026 Julian Beerbaum` |
| Altersfreigabe | 4+ (alle Fragen des Fragebogens: „Keine“ bzw. „Nein“ – kein Web-Browser mit freiem Zugang, keine nutzergenerierten Inhalte, keine Käufe) |

## Schlüsselwörter (100)

Ohne „DB“, „Deutsche Bahn“, „ICE“ und andere Marken (Richtlinie 2.3.7), ohne
Wörter, die schon in Name oder Untertitel stehen:

```
umsteigen,bahnhof,anschluss,bahnsteig,zug,weg,aufzug,barrierefrei,verspätung,gleiswechsel,reise
```

(95 Zeichen, 96 Byte – Apple zählt Byte.)

## Werbetext (170)

> Neu: Umstieg. warnt dich, wenn dein Anschluss das Gleis wechselt, und
> erinnert dich fünf Minuten vor der Ankunft an dein Abfahrtsgleis.

## Beschreibung (4000)

> Du kommst auf Gleis 14 an, dein Anschluss fährt in acht Minuten von Gleis 6 –
> und du weißt nicht, wo es langgeht. Umstieg. zeigt dir den Weg durch den
> Bahnhof: ab der Stelle, an der dein Wagen hält, über Treppe, Rolltreppe,
> Aufzug oder Unterführung, Schritt für Schritt bis zum Abfahrtsgleis.
>
> SO FUNKTIONIERT ES
> • Bahnhof wählen – oder den Standort erkennen lassen
> • Ankunfts- und Anschlusszug aus der Tafel wählen, die Gleise übernimmt die App
> • Weg starten: ein Ebenenschema zeigt jede Ebene, die du durchquerst
>
> SCHAFFE ICH DEN ANSCHLUSS?
> Eine Ampel vergleicht laufend die Restzeit bis zur Abfahrt mit deiner
> Gehzeit – mit den Live-Daten der Bahn. Grün heißt entspannt, Gelb knapp,
> Rot kaum zu schaffen.
>
> UNTERWEGS
> • Mitteilung bei Gleiswechsel oder Ausfall deines Anschlusses
> • Erinnerung fünf Minuten vor der Ankunft
> • Barrierefreie Route mit Aufzug oder Route mit Stopp an WC und Kiosk
> • Gehtempo wählbar, der Bildschirm bleibt beim Gehen an
> • Verbindung aus einer Reise-App teilen und direkt übernehmen
>
> BUS, TRAM UND U-BAHN
> Auch der Weg vom Zug zur Haltestelle vor dem Bahnhof – und zwischen zwei
> Haltestellen.
>
> OHNE KONTO, OHNE WERBUNG
> Umstieg. ist kostenlos, braucht keine Anmeldung und zeigt keine Werbung.
> Dein Standort wird nur mit deiner Erlaubnis verwendet, auf dem Gerät
> gerundet und nirgends gespeichert.
>
> Für Bahnhöfe in Deutschland. Fahrplandaten: Deutsche Bahn (DB API
> Marketplace), Transitous/DELFI; Bahnhofsgeometrie: © OpenStreetMap-
> Mitwirkende. Quelloffen unter der AGPL: github.com/jbee827-sys/Umstieg.

Der Satz zum Teilen gilt erst mit Paket 7 – vorher streichen.

## Neuigkeiten (erste Fassung)

> Die erste Fassung von Umstieg. als App – mit Mitteilungen bei Gleiswechsel,
> Erinnerung vor der Ankunft und Haptik beim Gehen.

## Bildschirmfotos

Erzeugt der Actions-Ablauf `iOS` bei jedem Lauf (Artefakt
`ios-bildschirmfotos`): iPhone 6,9 Zoll und iPad 13 Zoll, hell und dunkel,
je Eingabe, Übersicht und Weg mit der Beispielreise Berlin Hbf. Apple
verlangt für iPhone mindestens ein Foto in 6,9 Zoll (1320 × 2868) und für
iPad in 13 Zoll (2064 × 2752); kleinere Größen leitet App Store Connect
daraus ab. Julian wählt aus (Vorschlag: hell, alle drei Bildschirme).

## App-Datenschutz („Datenschutz-Etikett“)

Frage in App Store Connect: *Erfassen Sie oder Ihre Drittanbieter Daten von
dieser App?*

Nach Apples Begriff heißt „erfassen“: vom Gerät übertragen **und** länger
aufbewahrt, als die Anfrage in Echtzeit braucht. Umstieg. bewahrt nichts auf
(Datenschutzerklärung). Die gerundete Koordinate geht aber über unseren
Server an Transitous, und dort haben wir keinen Einfluss darauf, ob sie
protokolliert wird. Deshalb der vorsichtige Vorschlag:

- **Ja, Daten werden erfasst** – genau eine Art:
  - *Standort → Grober Standort*
  - Verwendung: **App-Funktionalität**
  - Mit der Identität verknüpft: **Nein**
  - Für Tracking verwendet: **Nein**

Die strenge Lesart („Daten werden nicht erfasst“) wäre vertretbar, solange
nur unser Server die Koordinate sieht; mit Transitous als Drittem ist sie es
nicht sicher. Kommt mit Paket 4 eine Messung mit Einwilligung dazu, kommt
*Nutzungsdaten → Produktinteraktion (Analyse, nicht verknüpft, kein
Tracking)* hinzu – und dieselbe Angabe in `PrivacyInfo.xcprivacy`.

## Exportkonformität

`ITSAppUsesNonExemptEncryption = NO` steht in `Info.plist` – die App nutzt nur
die Verschlüsselung des Systems (HTTPS). Die Frage erscheint dann nicht.

## Hinweis für die Prüfung (App Review Information → Notes, englisch)

> Umstieg. helps rail passengers in Germany change trains: it shows the walking
> route inside a station from the arrival platform to the departure platform
> (stairs, escalators, lifts, underpasses), step by step and level by level,
> and continuously rates whether the connection can still be made, based on
> live data from Deutsche Bahn.
>
> No account is needed. All data covers stations in Germany only, so live
> results outside Germany are empty.
>
> To see the full flow without being at a German station: on the first screen,
> tap the round "i" at the top right. A guided tour runs through a recorded
> example journey at Berlin Hbf (arrival on platform 14, connection from
> platform 6) on the real screens – input, overview and route – without network
> access.
>
> Native features beyond the website:
> - Local notifications when the connecting train changes platform or is
>   cancelled, when the connection becomes unlikely (status turns red), and five
>   minutes before arrival. Permission is requested only once a journey is
>   running.
> - Location via Core Location ("while using"), requested only after the user
>   taps "Standort verwenden" with an explanation shown first. Used to detect
>   the station and the arrival at the platform; rounded on device, not stored.
> - Haptic feedback on step changes and arrival; screen stays awake during
>   navigation.
> - Share extension: a connection shared from a journey planner app is imported
>   directly (Paket 7 – remove this line if not yet included).
>
> The app is open source under the AGPL with an additional permission for app
> store distribution: https://github.com/jbee827-sys/Umstieg.

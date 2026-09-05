# FaSta-Koordinaten im Synthesemodell (§5) – Designdokument

Stand: 05.09.2026 · Validiert im Brainstorming · Zieldokument für die Umsetzung mit Claude Code

Erfüllt §5 aus [`2026-08-24-umstiegs-navigator-design.md`](../../../2026-08-24-umstiegs-navigator-design.md) (ToDo 7b im README).

---

## 1. Ziel und Abgrenzung

Stufe 3 (das Synthesemodell) soll **die Lage von Aufzügen und Rolltreppen aus FaSta beziehen**, statt sie zu raten. Heute setzt das Modell jede Querung auf die Bahnsteigmitte und jede Kante Bahnsteig→Querung auf pauschal 10 m.

**Warum das jetzt der wichtigste offene Bau ist:** Seit ToDo 7a+ steht fest, dass der `platforms`-Endpunkt **keine Koordinaten** führt. FaSta ist damit die einzige verbliebene Quelle mit echten Ortsangaben. Was §4.3 nicht leisten kann, kann allenfalls §5.

**Ausdrücklich nicht das Ziel:** ein geometrisch korrekter Bahnhofsplan. Stufe 3 bleibt ein Schema mit „ca."-Angaben. Verbessert wird, **wo** die Querung liegt und **wie weit** der Weg dorthin ist – nicht der Anspruch auf Metergenauigkeit.

**Der bereits gebaute Teil:** `syntheseGraph(info, anlagen)` nimmt FaSta-Anlagen schon entgegen (`core/synthmodell.ts:70`), aber sie kommen nirgends an – der gecachte Graph wird ohne sie gebaut (`routes/api.ts:552`), und FaSta wird nur bei `variante=barrierefrei` überhaupt abgerufen (`routes/api.ts:356`). Und selbst wenn Anlagen ankommen, dienen ihre Koordinaten nur der Suche nach dem nächsten Gleis; positioniert wird mit ihnen nichts.

## 2. Was die Sondierung ergab (05.09.2026)

Fünf Bahnhöfe gegen die echte FaSta-API. Das Fixture war handgebaut und trug seinen eigenen Vorbehalt; verifiziert war bisher nur die **Adressierung** (`stationnumber` statt EVA), nicht die Nutzlast.

| Bahnhof | Anlagen m. Koord. | Gleisbezug in `description` | benannte Bahnsteige | Nachbarabstand |
|---|---|---|---|---|
| Hannover Hbf | 20 | **90 %** | 6 | 20–26 m |
| Berlin Hbf | 69 | 65 % | 7 | 10–22 m, 178 m über Ebenen |
| Eberswalde Hbf | 9 | 44 % | 1 | – |
| Frankfurt Hbf | 53 | 36 % | 2 (nur S-Bahn) | 26 m |
| München Hbf | 25 | 16 % | 2 (nur S-Bahn) | 15–20 m |

**Die Messung hat den ursprünglich gewählten Weg verworfen.** Rein geometrisches Clustern der Anlagen wäre aktiv falsch gewesen:

1. **Die Menge ist verunreinigt.** Berlins Spannweite von 339 m kommt von `„von Parkhaus A zum 1. UG"`, `„1.UG – Tram Haltestelle 5"`, `„Nicht Reisendenrelevant"`, `„zu U-Bahn Gleis"`. Diese Anlagen sind keine Bahnsteigzugänge.
2. **Die Schwelle ist nicht übertragbar.** 30 m ergibt in Berlin 6 Cluster, in Hannover 2.

**Was stattdessen trägt:** `description` nennt fast immer ein **Gleispaar** – `„zu Gleis 15/16"`, `„zu Bstg Gl 11/12"`, `„zu Bst 9/10"`. Ein Gleispaar *ist* ein Bahnsteig. Das ist keine Vermutung, sondern die Auskunft selbst, und sie passt genau auf das vorhandene `bahnsteigId`-Konzept. Damit entfällt das Clustern vollständig.

**Weitere belegte Funde:**

| Fund | Beleg | Folge für den Bau |
|---|---|---|
| Abdeckung spaltet sich nach Bahnhofstyp | Durchgangsbahnhof 44–90 %, Kopfbahnhof 16–36 % | Verankerung muss **je Bahnsteig** greifen, nicht je Bahnhof |
| Pauschale 15 m sind zu klein | gemessen 20–26 m | `BAHNSTEIG_ABSTAND_M` 15 → 20 |
| Echte Nutzlast ist ein **blankes Array** | alle fünf Antworten | Fixture hat die falsche Form; Client verträgt beides zufällig |
| Unbekannte Felder | `stateExplanation`, `operationalResumeDate`, `operatorname`, `stationnumber` | bleiben ungenutzt, aber dokumentiert |
| `state: UNKNOWN` kommt vor | Frankfurt 1×, Eberswalde 2× | konservative Abbildung auf `INACTIVE` (`fasta.ts:40`) ist damit **belegt** richtig |
| ~1 Anlage je Bahnhof ohne Koordinaten | Berlin 69/70, München 25/26 | Filter im Client bleibt |

## 3. Festgelegte Entscheidungen

| Entscheidung | Festlegung |
|---|---|
| Zuordnung Anlage → Bahnsteig | Aus `description`, **nie** aus Geometrie |
| Anlagen ohne Gleisbezug | Fliegen aus der Geometrie. Kein Rateversuch |
| Bahnsteige ohne FaSta-Nennung | Bleiben synthetisch – gemischt, je Bahnsteig |
| Bahnsteigachse | Aus den echten Bahnsteigen abgeleitet; ohne sie wie heute nach Osten |
| Bahnsteiglänge / Abschnitte | **Nicht** aus der Anlagenstreuung. Begründung unten |
| Koordinaten vs. Status | Koordinaten in den Graphcache, Status niemals |
| Nutzertext | Unverändert. „ca." bleibt, es bleiben Schätzanteile |
| OSM-Pfad (`wendeFastaAn`) | Unberührt |

**Begründung zur Bahnsteiglänge:** Die Streuung der Anlagen eines Bahnsteigs ist eine **Untergrenze**, keine Länge. Berlins Gleis 11/12 misst so 65 m bei real ~450 m. Daraus eine Länge abzuleiten hieße, neue falsche Genauigkeit zu erzeugen – genau das, wogegen die „ca."-Regel steht.

## 4. Architektur

Kein neuer Dienst. FaSta ist bereits angeschlossen (`clients/fasta.ts`, Cache 5 min in `app.ts:320`). Neu ist **wo** es abgerufen wird.

```
                        heute                          neu
  Graphbau (gecacht)    syntheseGraph(info)            syntheseGraph(info, anlagen)
  baueGraphEintrag()    ohne Anlagen                   FaSta NUR wenn Stufe 3 erreicht
        |                                              -> Koordinaten pruegen die Geometrie
        v
  Graphcache            24 h / 10 min (Stufe 3)        unveraendert - Koordinaten sind stabil
        |
        v
  je Anfrage            variante=barrierefrei:         unveraendert
  routes/api.ts         kopiereGraph + wendeFastaAn    Status bleibt aus dem Cache heraus
```

**Die Cache-Naht, und warum sie hält:** Dieses Repo ist hier schon einmal hineingetreten – `api.ts:369` kopiert den Graphen, damit *„ein gerade defekter Aufzug nicht im 24-Stunden-Graphcache landet"*. §5 will FaSta-Daten in genau diesen Cache legen. Die Auflösung ist die Trennung zweier Dinge, die in derselben Antwort stehen:

- **Koordinaten sind stabil.** Ein Aufzug wandert nicht. Sie dürfen in den gecachten Graphen.
- **`state` ist live.** Er darf es nicht, und tut es weiterhin nicht.

`syntheseGraph` trägt heute beim Bau `status` in die Kanten ein (`synthmodell.ts:157`). **Das muss entfallen**, sobald der Graph gecacht wird – sonst friert der Status ein. Der Status kommt danach für alle Stufen über denselben Weg: `kopiereGraph` + `wendeFastaAn` pro Anfrage.

**Und dabei greift `wendeFastaAn` in der heutigen Form nicht.** Es ordnet Anlagen der nächstgelegenen Kante gleichen Typs zu, aber nur innerhalb von `FASTA_MAX_ABSTAND_M = 50` (`synthmodell.ts:165`). Im verankerten Synthesemodell sitzt der Kantenknoten auf dem **Bahnsteigschwerpunkt**, die Anlage aber an ihrem echten Ort – bei Berlins 280 m langen Bahnsteigen sind das bis zu ~140 m. Die 50-m-Schranke würde den Status also stillschweigend verwerfen, und die barrierefreie Route liefe auf einem defekten Aufzug weiter. Das ist kein Randfall, sondern der Regelfall an großen Bahnhöfen.

**Auflösung – Zuordnung über Identität statt Entfernung.** `FastaAnlage` wächst um die `equipmentnumber` aus der Rohantwort (in allen fünf Sondierungsantworten vorhanden), `GraphKante` um ein optionales `anlageId`. Beide Ergänzungen sind additiv. `syntheseGraph` schreibt beim Bau die `anlageId` in die von einer Anlage erzeugte Kante – eine **stabile** Angabe, die gecacht werden darf – und **keinen** Status. Beim Anwenden gilt dann:

- Kante trägt `anlageId` → Status der Anlage mit dieser Nummer, ohne Entfernungsprüfung.
- Kante trägt keine (OSM-Graph, Stufe 1/2) → wie heute über die Entfernung mit 50-m-Schranke.

Damit wird die Stufe-3-Zuordnung exakt statt geraten, und der OSM-Pfad bleibt unberührt. Der Kommentarblock über `wendeFastaAn` („Für Stufe 3 ist das nicht nötig – dort trägt `syntheseGraph` den Status bereits beim Bau ein") wird damit falsch und ist mitzuziehen.

**Kosten:** FaSta wird nur gerufen, wenn ein Bahnhof wirklich auf Stufe 3 fällt, und dann einmal je Graphbau (Frist 10 min). Der 5-Minuten-Clientcache liegt darunter. Kein Abruf je Variante.

## 5. Der Gleisbezug-Parser

Neue Einheit `core/fasta-gleisbezug.ts` – rein, ohne Abhängigkeiten, einzeln testbar.

```
gleiseAusBeschreibung(text: string): string[]
```

**Vokabular** (belegt in den Rohdaten): `Gleis`, `Gleise`, `Gl`, `Gl.`, `Bstg Gl`, `Bstg`, `Bst`, `Bst.` – jeweils gefolgt von einer Nummer mit optionalem Buchstabensuffix (`1a`), optional als Paar mit `/`.

**Zwei Fallen, beide in den Rohdaten nachgewiesen:**

| Rohtext | Naive Lesart | Richtig |
|---|---|---|
| `"Gleis 22 - 1.UG - Kein Halt EG"` | Bereich „Gleis 1 bis 22" | Ein Gleis: **22**. Der Bindestrich ist Trenner, `1.UG` ist eine Ebene |
| `"von UG zu Gleis 1a (S-Bahn)"` | Gleis **1** | Gleis **1a**. Der Suffix trägt Bedeutung, `1a ≠ 1` |

**Regeln, die daraus folgen:**

1. Ein Bereich (`3-8`) gilt nur bei **unmittelbar angrenzendem** Bindestrich ohne Leerzeichen.
2. Eine Zahl, der direkt ein `.` folgt, ist eine Ebenenangabe und **kein** Gleis (`1.UG`, `1.OG`).
3. Der Buchstabensuffix bleibt Teil der Bezeichnung.

**Wann eine Anlage einen Bahnsteig verankert** – genau dann, wenn sie **eine** Fundstelle mit **einem oder zwei** Gleisen liefert:

| Rohtext | Gleise | Wirkung |
|---|---|---|
| `"zu Gleis 15/16"` | 15, 16 | verankert Bahnsteig `15/16` |
| `"Gleis 22 - 1.UG - Kein Halt EG"` | 22 | verankert Bahnsteig `22` |
| `"Gleis 5/6 (C/D) - Gleis 11/12"` | zwei Fundstellen | **Verbindung**, verankert nichts |
| `"zu Gleis 3-8 Abschnitt D/E"` | 3,4,5,6,7,8 | mehr als zwei – verankert nichts |
| `"von Parkhaus A zum 1. UG"` | keine | fliegt raus |

**Zur ausgeschlossenen Verbindung:** Eine Anlage, die zwei Bahnsteige nennt, ist die Querung selbst – aber sie trägt nur **einen** Punkt, und eine Verbindung braucht zwei. Sie hier zu verwerten hieße raten. Bewusst ausgelassen (6 von 69 in Berlin), im README als Nachlauf zu vermerken.

**Bahnsteigschlüssel:** die genannten Gleise, numerisch sortiert, mit `/` verbunden – `11/12` und `12/11` sind derselbe Bahnsteig. Sortierung wie im Repo üblich über `localeCompare(…, 'de', { numeric: true })`.

## 6. Die Geometrie

`gruppiereBahnsteige` (`synthmodell.ts:41`) bekommt die Anlagen und arbeitet in drei Schritten:

**Schritt 1 – benannte Bahnsteige bilden.** Je Bahnsteigschlüssel aus FaSta die zugehörigen Einträge aus `info.gleise` sammeln. Gleise, die FaSta nennt, die aber nicht in der DB-Gleisliste stehen (Tram, U-Bahn, fremde S-Bahn), werden verworfen – die Gleisliste bleibt die Autorität darüber, was dieser Bahnhof hat. Position des Bahnsteigs = **Schwerpunkt seiner Anlagen**.

**Schritt 2 – Achse ableiten.** Bei ≥ 2 benannten Bahnsteigen ergibt die Richtung zwischen dem ersten und dem letzten die Bahnsteigachse; sortiert wird wie heute nach `lon`, bei Gleichstand nach `lat` (`synthmodell.ts:69`). Sonst wie heute nach Osten.

**Schritt 3 – übrige Bahnsteige synthetisch anhängen.** Gleise, die FaSta nicht nennt, werden wie heute gruppiert und entlang der Achse verteilt – aber mit **20 m** statt 15 m (gemessen) und verankert an den echten Bahnsteigen statt an der blanken Stationsposition. Gibt es keinen echten Bahnsteig, bleibt es exakt beim heutigen Aufbau ab der Stationsposition; nur der Abstand wächst auf 20 m.

**Verankerung prägt die Lage – Kanten trägt jede Anlage.** Die Trennung ist wichtig genug für einen eigenen Satz: Nur Anlagen **mit** Gleisbezug bestimmen, *wo* ein Bahnsteig liegt. Aber Anlagen **ohne** Gleisbezug erzeugen weiterhin ihre Kante nach der heutigen Regel (nächstgelegenes Gleis), sofern der betroffene Bahnsteig keine eigene verankerte Anlage hat.

Ohne diese Trennung hätte der Umbau an schwach beschrifteten Bahnhöfen **barrierefreie Routen vernichtet**: München nennt nur 16 % seiner Anlagen mit Gleisbezug: Die übrigen 84 % verlören ihre Aufzugkante, und aus „Route vorhanden" würde „keine barrierefreie Route". Eine Verbesserung der Geometrie darf keine Auskunft kosten, die es heute gibt.

**Die Kante Bahnsteig → Querung.** Heute pauschal `TREPPE_LAENGE_M = 10`. Neu, je Anlage des Bahnsteigs:

```
laengeM = round(haversineM(Gleisknoten, Anlage))   // der echte Weg über den Bahnsteig
        + (Aufzug ? AUFZUG_LAENGE_M : TREPPE_LAENGE_M)   // der geschaetzte Abstieg
```

Der Weg über den Bahnsteig wird damit gemessen, der Abstieg bleibt geschätzt – und die Textausgabe sagt weiterhin „ca.", weil ein Schätzanteil bleibt. Bahnsteige ohne Anlage behalten die heutige pauschale Treppe.

**Der Ein-Anlagen-Fall, ausdrücklich:** Trägt ein Bahnsteig genau eine Anlage, fällt sein Schwerpunkt mit ihr zusammen und der gemessene Weg ist **0** – die Kante besteht dann nur aus dem geschätzten Abstieg. Das ist gewollt: Über die Ausdehnung dieses Bahnsteigs liegt kein einziger Beleg vor, und eine erfundene Strecke wäre schlechter als keine. Betrifft in der Sondierung Eberswalde und beide Kopfbahnhöfe.

**Was sich am Graphaufbau NICHT ändert:** ein Querungsknoten je Bahnsteig auf Level −1, Querungskanten zwischen benachbarten Bahnsteigen, Nachbargleiskanten. Die Form bleibt; echt werden die Zahlen.

## 7. Degradation

Ergänzt die Tabelle aus Konzept 8. Jeder Fall fällt auf das heutige Verhalten zurück – **nie** auf etwas Schlechteres.

| Fall | Verhalten |
|---|---|
| Kein `stationID` in den Stationsdaten | Heutiges Modell. Protokolleintrag `fasta-geometrie-fehlt` |
| FaSta antwortet nicht / wirft | Heutiges Modell. Protokolleintrag mit Grund |
| FaSta liefert `[]` | Heutiges Modell, kein Vorfall – der Bahnhof hat schlicht keine Anlagen |
| Keine Anlage trägt Gleisbezug (München-Fall) | Heutiges Modell für alle Bahnsteige |
| Nur ein Teil trägt Gleisbezug | Gemischt: echt, wo belegt; synthetisch für den Rest |

Der Reisende bekommt in **keinem** dieser Fälle einen neuen Hinweis: Der bestehende `„Kartendaten nicht verfügbar – Standardmodell mit ungefähren Angaben."` deckt sie ab, und die Route wird nie schlechter als heute. Die Unterscheidung gehört ins Protokoll, nicht in die Antwort – dieselbe Linie wie bei der Wagenreihung (`api.ts`, Konzept 7).

## 8. Tests

Vorgehen nach TDD; jede Zeile hier ist ein Test, der zuerst rot ist.

**Parser (`test/fasta-gleisbezug.test.ts`) – rein, ohne API:**
- Vokabular: `Gleis 3/4`, `Gl 11/12`, `Gl. 101/102`, `Bstg Gl 3/4`, `Bst 9/10`
- Falle 1: `"Gleis 22 - 1.UG - Kein Halt EG"` → genau `['22']`
- Falle 2: `"von UG zu Gleis 1a (S-Bahn)"` → genau `['1a']`
- Bereich: `"zu Gleis 3-8 Abschnitt D/E"` → sechs Gleise, verankert nichts
- Zwei Fundstellen: `"Gleis 5/6 (C/D) - Gleis 11/12"` → verankert nichts
- Kein Bezug: `"von Parkhaus A zum 1. UG"`, `"DB Lounge"`, `"Nicht Reisendenrelevant"`, `""`
- Schlüssel: `12/11` und `11/12` ergeben denselben Bahnsteig

**Geometrie (`test/synthmodell.test.ts`, ergänzend):**
- Benannter Bahnsteig sitzt auf dem Schwerpunkt seiner Anlagen, nicht auf dem Stationsanker
- Kante Bahnsteig→Querung trägt den gerechneten Abstand, nicht mehr 10 m
- Unbenannte Bahnsteige hängen mit 20 m an der Achse der echten
- Anlagen ohne Gleisbezug **verschieben keinen Bahnsteig** (Parkhaus-Fall) …
- … **erzeugen aber weiterhin ihre Kante** – der München-Fall darf keine barrierefreie Route verlieren
- Ohne Anlagen: gleiche Knoten und Kanten wie heute, allein der Bahnsteigabstand ist 20 m statt 15 m (Regressionsschutz)

**Echte Fixtures (`test/fixtures/db/`):** Das handgebaute `fasta-facilities.json` wird durch **echte Aufzeichnungen** ersetzt – Hannover (20 Anlagen, sauberster Fall) und Berlin (69 Anlagen, mit Parkhäusern und Tram als Störung). Damit prüfbar:
- Hannover ergibt 6 benannte Bahnsteige
- Berlin schließt Parkhaus-, Tram- und U-Bahn-Anlagen aus der Geometrie aus
- Die echte Rohform (blankes Array) wird geparst

**Cache-Naht (`test/cache.test.ts`, ergänzend):**
- Ein `INACTIVE`-Status landet **nicht** im gecachten Graphen
- Zwei Anfragen mit unterschiedlichem Live-Status auf demselben gecachten Graphen sehen unterschiedliche Sperrungen

**Statuszuordnung über Identität (`test/fasta.test.ts`, ergänzend):**
- Anlage **140 m** von der Kante entfernt, aber gleiche `anlageId` → Status greift (der Berliner Regelfall, an dem die 50-m-Schranke gescheitert wäre)
- Kante ohne `anlageId` (OSM) → weiterhin über Entfernung, 50-m-Schranke unverändert wirksam
- `anlageId` einer Anlage, die in der Antwort fehlt → Kante bleibt ohne Status, keine Ausnahme

**Degradation (`test/degradation.test.ts`, ergänzend):** je ein Test für die fünf Zeilen aus Abschnitt 7.

## 9. Ausdrücklich nicht in diesem Schritt

| Ausgelassen | Grund |
|---|---|
| Bahnsteiglänge/Abschnitte aus der Streuung | Streuung ist Untergrenze, nicht Länge (Berlin: 65 m statt ~450 m) |
| Anlagen, die zwei Bahnsteige nennen | Brauchen zwei Punkte, tragen einen |
| Kopfbahnhof-Modell ohne Querung | Eigenes Thema; München/Frankfurt zeigen den Bedarf, §5 löst ihn nicht |
| Neue Nutzertexte / Wegfall von „ca." | Es bleiben Schätzanteile |
| `operationalResumeDate` („Aufzug wieder ab …") | Eigener Nutzen, eigener Entwurf |
| §4.3 in voller Fassung | Bleibt auf fehlenden DB-Koordinaten blockiert |

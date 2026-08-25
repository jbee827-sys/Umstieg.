# Datenrealitäts-Spike – Ergebnis

Stand: 25.8.2026 · Stichprobe: 27 Bahnhöfe · Quelle: Overpass (OSM), Radius 400 m

## Stufenverteilung gesamt

| Stufe | Bedeutung | Anzahl | Anteil |
|---|---|---|---|
| 1 | vollständiges Indoor-Mapping | 20 | 74 % |
| 2 | Teildaten | 3 | 11 % |
| 3 | keine verwertbaren Indoor-Daten → Synthesemodell | 4 | 15 % |

## Kategorie gross (8)

Stufe 1: 8 · Stufe 2: 0 · Stufe 3: 0

| Bahnhof | Elemente | Gleise | Stufe | Gleispaare verbunden | Ways mit level | Abschnittsmarker |
|---|---|---|---|---|---|---|
| Berlin Hbf | 3733 | 15 | 1 | 100 % | 474/1093 | 0 |
| Hamburg Hbf | 2299 | 12 | 1 | 100 % | 430/684 | 18 |
| Frankfurt (Main) Hbf | 2472 | 33 | 1 | 94 % | 296/628 | 6 |
| Köln Hbf | 1953 | 11 | 1 | 100 % | 279/483 | 39 |
| Hannover Hbf | 1822 | 12 | 1 | 100 % | 390/497 | 61 |
| Nürnberg Hbf | 2402 | 22 | 1 | 100 % | 471/622 | 0 |
| Duisburg Hbf | 2001 | 13 | 1 | 100 % | 289/457 | 4 |
| Mannheim Hbf | 1870 | 4 | 1 | 100 % | 242/437 | 49 |

## Kategorie mittel (11)

Stufe 1: 8 · Stufe 2: 2 · Stufe 3: 1

| Bahnhof | Elemente | Gleise | Stufe | Gleispaare verbunden | Ways mit level | Abschnittsmarker |
|---|---|---|---|---|---|---|
| Gütersloh Hbf | 845 | 4 | 2 | 33 % | 14/197 | 1 |
| Gießen | 554 | 11 | 1 | 100 % | 89/142 | 11 |
| Marburg (Lahn) | 705 | 6 | 1 | 100 % | 57/164 | 2 |
| Lüneburg | 738 | 7 | 2 | 52 % | 13/187 | 2 |
| Konstanz | 399 | 0 | 3 | 0 % | 0/82 | 0 |
| Cottbus Hbf | 1654 | 10 | 1 | 100 % | 71/505 | 0 |
| Schwerin Hbf | 634 | 10 | 1 | 64 % | 17/139 | 0 |
| Osnabrück Hbf | 1052 | 9 | 1 | 100 % | 137/243 | 8 |
| Heilbronn Hbf | 953 | 7 | 1 | 100 % | 56/257 | 12 |
| Bamberg | 369 | 7 | 1 | 100 % | 71/99 | 0 |
| Uelzen | 402 | 7 | 1 | 100 % | 6/80 | 9 |

## Kategorie klein (8)

Stufe 1: 4 · Stufe 2: 1 · Stufe 3: 3

| Bahnhof | Elemente | Gleise | Stufe | Gleispaare verbunden | Ways mit level | Abschnittsmarker |
|---|---|---|---|---|---|---|
| Zernitz | 9 | 0 | 3 | 0 % | 0/2 | 0 |
| Bad Kleinen | 0 | 0 | 3 | 0 % | 0/0 | 0 |
| Riedstadt-Goddelau | 134 | 1 | 2 | 100 % | 0/29 | 0 |
| Kirchhain (Bz Kassel) | 0 | 0 | 3 | 0 % | 0/0 | 0 |
| Treuchtlingen | 356 | 7 | 1 | 100 % | 41/86 | 0 |
| Neuenmarkt-Wirsberg | 191 | 5 | 1 | 100 % | 5/41 | 6 |
| Angermünde | 377 | 5 | 1 | 100 % | 15/83 | 0 |
| Büchen | 229 | 4 | 1 | 100 % | 22/51 | 0 |

## Wagenpositions-USP: Abschnittsmarker (A–F) in OSM

14 von 27 Bahnhöfen (52 %) haben platform_section-artige Tags. Die Abbildung Wagenreihungs-Abschnitt → Bahnsteigkoordinate muss daher primär über DB-Stationsdaten (Bahnsteiglänge + Abschnittseinteilung) erfolgen, nicht über OSM.

## Entscheidungstor (Plan Task 6)

**Stufe-1-Anteil 74 % ≥ 20 % → keine Prioritätsverschiebung.** Indoor-Routing über OSM trägt einen relevanten Teil der Fälle; Stufe-1-Pfad wie geplant ausbauen.

## Offen (blockiert auf DB-Registrierung)

Ohne `DB_CLIENT_ID`/`DB_CLIENT_SECRET` kann der Check „liefern die DB-Stationsdaten Bahnsteiglänge + Abschnittseinteilung?" nicht laufen. Nach Registrierung erneut ausführen.

*Hinweis: Koordinaten der Stichprobe stammen aus Vorwissen; bei 0 gefundenen Gleisen an großen/mittleren Bahnhöfen Koordinate prüfen, bevor das Ergebnis als Datenlücke gewertet wird.*

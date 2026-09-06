import { describe, it, expect } from 'vitest'
import { parseReise } from './reisetext'

/**
 * Vorlage ist der Textexport aus dem DB Navigator („Verbindung teilen").
 * Diese Probe stammt aus einer echten Verbindung vom 15.08.2026; der
 * `vbid`-Link am Ende ist absichtlich mit abgebildet, weil der Parser ihn
 * verwerfen muss - er identifiziert die Buchung bei bahn.de und wird für
 * nichts gebraucht.
 *
 * Das Format ist nicht dokumentiert. Die DB kann es ohne Vorwarnung ändern,
 * deshalb muss der Parser auf Unbekanntes mit `null` antworten statt mit
 * Unsinn: Ein falsch erkanntes Gleis ist schlimmer als ein nicht erkanntes.
 */
const ECHT = `Waldstraße/Friedhof, Hockenheim → Eberswalde Hbf
15.08.2026

Bus 731
Nach Hockenheim, Bahnhof
Ab 9:46 Waldstraße/Friedhof, Hockenheim
An 9:57 Bahnhof, Hockenheim

S6
Nach Worms Hbf
Ab 10:17 Hockenheim, Gleis 1
An 10:40 Mannheim Hbf, Gleis 12

ICE 74
Nach Hamburg Hbf
Ab 11:03 Mannheim Hbf, Gleis 2
An 11:40 Frankfurt(Main)Hbf, Gleis 8

ICE 1134
Nach Berlin Hbf
Ab 12:02 Frankfurt(Main)Hbf, Gleis 7
An 16:01 Berlin Hbf, Gleis 3

RE3 (3352)
Nach Schwedt(Oder)
Ab 16:23 Berlin Hbf, Gleis 6
An 17:02 Eberswalde Hbf, Gleis 3

Verbindung ansehen:
https://www.bahn.de/buchung/start?vbid=d342e70f%2D0555%2D4a46%2Dbcb4%2D0a89d9d4637c`

describe('parseReise', () => {
  it('liest Kopfzeile und Datum', () => {
    const r = parseReise(ECHT)!
    expect(r.von).toBe('Waldstraße/Friedhof, Hockenheim')
    expect(r.nach).toBe('Eberswalde Hbf')
    expect(r.datum).toBe('15.08.2026')
  })

  it('findet alle fünf Abschnitte', () => {
    expect(parseReise(ECHT)!.abschnitte).toHaveLength(5)
  })

  it('liest Zug, Zeiten, Bahnhöfe und Gleise eines Abschnitts', () => {
    const a = parseReise(ECHT)!.abschnitte[3]
    expect(a).toMatchObject({
      zug: 'ICE 1134',
      abZeit: '12:02',
      abBahnhof: 'Frankfurt(Main)Hbf',
      abGleis: '7',
      anZeit: '16:01',
      anBahnhof: 'Berlin Hbf',
      anGleis: '3',
    })
  })

  // Die Tücke des Formats: Der Haltestellenname enthält selbst ein Komma.
  // Wer stumpf am Komma trennt, macht aus „Waldstraße/Friedhof, Hockenheim"
  // ein Gleis namens „Hockenheim".
  it('verwechselt einen Ortsnamen nach dem Komma nicht mit einem Gleis', () => {
    const a = parseReise(ECHT)!.abschnitte[0]
    expect(a.abBahnhof).toBe('Waldstraße/Friedhof, Hockenheim')
    expect(a.abGleis).toBeUndefined()
    expect(a.anBahnhof).toBe('Bahnhof, Hockenheim')
    expect(a.anGleis).toBeUndefined()
  })

  it('leitet die Umstiege aus den Abschnitten ab', () => {
    const u = parseReise(ECHT)!.umstiege
    expect(u).toHaveLength(4)
  })

  it('nennt je Umstieg Bahnhof, beide Gleise und die Umsteigezeit', () => {
    const u = parseReise(ECHT)!.umstiege[2]
    expect(u).toMatchObject({
      bahnhof: 'Frankfurt(Main)Hbf',
      anZug: 'ICE 74',
      anZeit: '11:40',
      anGleis: '8',
      abZug: 'ICE 1134',
      abZeit: '12:02',
      abGleis: '7',
      minuten: 22,
    })
  })

  // Fuer die Zuguebernahme im Formular: Ein TafelEintrag traegt auch das
  // Ziel, sonst stuende in der Auswahl "aus  ·  12:02" mit einer Luecke.
  it('nennt je Umstieg auch die Ziele beider Zuege', () => {
    const u = parseReise(ECHT)!.umstiege[2]
    expect(u.anZiel).toBe('Hamburg Hbf')
    expect(u.abZiel).toBe('Berlin Hbf')
  })

  // Der Bus-Umstieg hat kein Ankunftsgleis. Er darf trotzdem erscheinen -
  // nur eben unvollstaendig, damit die Oberflaeche das sagen kann.
  it('behaelt einen Umstieg ohne Gleis, markiert ihn aber als unvollstaendig', () => {
    const u = parseReise(ECHT)!.umstiege[0]
    expect(u.bahnhof).toBe('Hockenheim')
    expect(u.anGleis).toBeUndefined()
    expect(u.vollstaendig).toBe(false)
    expect(parseReise(ECHT)!.umstiege[2].vollstaendig).toBe(true)
  })

  it('verwirft den vbid-Link', () => {
    const r = parseReise(ECHT)!
    expect(JSON.stringify(r)).not.toContain('vbid')
    expect(JSON.stringify(r)).not.toContain('bahn.de')
  })

  // Ein einzelner Abschnitt ist eine gueltige Reise - nur ohne Umstieg.
  it('kommt mit einer Fahrt ohne Umstieg zurecht', () => {
    const r = parseReise(`Mannheim Hbf → Frankfurt(Main)Hbf
15.08.2026

ICE 74
Nach Hamburg Hbf
Ab 11:03 Mannheim Hbf, Gleis 2
An 11:40 Frankfurt(Main)Hbf, Gleis 8`)!
    expect(r.abschnitte).toHaveLength(1)
    expect(r.umstiege).toHaveLength(0)
  })

  it('rechnet ueber Mitternacht richtig', () => {
    const r = parseReise(`A → B
15.08.2026

ICE 1
Nach B
Ab 22:00 A, Gleis 1
An 23:50 X, Gleis 2

ICE 2
Nach B
Ab 0:15 X, Gleis 3
An 1:00 B, Gleis 4`)!
    expect(r.umstiege[0].minuten).toBe(25)
  })

  describe('gibt null zurueck, statt zu raten', () => {
    it('bei leerem Text', () => {
      expect(parseReise('')).toBeNull()
      expect(parseReise('   \n  ')).toBeNull()
    })

    it('bei beliebigem Text', () => {
      expect(parseReise('Hallo, das ist keine Reise.')).toBeNull()
    })

    it('wenn keine einzige Zeitangabe vorkommt', () => {
      expect(parseReise('Abfahrt vom Hauptbahnhof, Gleis 5, bitte einsteigen')).toBeNull()
    })

    it('wenn kein einziger Abschnitt lesbar ist', () => {
      expect(parseReise('A → B\n15.08.2026\n\nirgendwas\nund noch was')).toBeNull()
    })
  })
})

/**
 * Zweite Runde: Es gibt nicht nur den DB Navigator.
 *
 * Die VBB-App, der DB Navigator und die Aushaenge der Verkehrsverbuende
 * schreiben dieselbe Sache verschieden auf - mal „Gleis 7", mal „(Gleis 7)",
 * mal „Bstg. 7", mal klein geschrieben, mal ohne Kopfzeile. Ein Parser, der
 * genau eine Schreibweise kennt, erkennt beim ersten fremden Text gar nichts.
 *
 * Geloest wird das NICHT durch einen Erkenner je App - das haette fuer jede
 * weitere App einen weiteren gebraucht. Erkannt werden stattdessen die
 * FELDER: Zeit, Rolle, Ort, Gleis, Zug, Richtung. Wo sie in der Zeile
 * stehen, ist gleichgueltig.
 */
describe('parseReise: andere Schreibweisen', () => {
  // Statt eines App-Namens steht dort, WAS gefunden wurde. Daran laesst sich
  // ablesen, ob man den uebernommenen Gleisen trauen kann.
  it('benennt, was erkannt wurde', () => {
    const r = parseReise(ECHT)!
    expect(r.erkannt.abschnitte).toBe(5)
    expect(r.erkannt.zuege).toBe(5)
    expect(r.erkannt.gleiseVollstaendig).toBe(false) // der Bus-Umstieg
  })

  it('kommt ohne Kopfzeile aus', () => {
    const r = parseReise(`ICE 74
ab 11:03 Mannheim Hbf, Gleis 2
an 11:40 Frankfurt(Main)Hbf, Gleis 8

ICE 1134
ab 12:02 Frankfurt(Main)Hbf, Gleis 7
an 16:01 Berlin Hbf, Gleis 3`)!
    expect(r.abschnitte).toHaveLength(2)
    expect(r.umstiege[0]).toMatchObject({ bahnhof: 'Frankfurt(Main)Hbf', anGleis: '8', abGleis: '7' })
    expect(r.erkannt.gleiseVollstaendig).toBe(true)
  })

  it('liest das Gleis auch in Klammern', () => {
    const r = parseReise(`RE1
ab 10:15 Berlin Hbf (Gleis 12)
an 10:25 Berlin Ostbahnhof (Gleis 3)

S7
ab 10:31 Berlin Ostbahnhof (Gleis 8)
an 10:40 Berlin Alexanderplatz (Gleis 1)`)!
    expect(r.abschnitte[0].abGleis).toBe('12')
    expect(r.umstiege[0]).toMatchObject({ bahnhof: 'Berlin Ostbahnhof', anGleis: '3', abGleis: '8' })
  })

  it('versteht die Abkuerzungen Gl., Bstg. und Steig', () => {
    const r = parseReise(`RB22
ab 08:05 Potsdam Hbf, Gl. 4
an 08:41 Berlin Wannsee, Bstg. 2

S1
ab 08:48 Berlin Wannsee, Steig 1
an 09:10 Berlin Friedrichstr., Gl. 3`)!
    expect(r.abschnitte[0].abGleis).toBe('4')
    expect(r.abschnitte[0].anGleis).toBe('2')
    expect(r.umstiege[0]).toMatchObject({ anGleis: '2', abGleis: '1' })
  })

  it('vertraegt Abfahrt/Ankunft ausgeschrieben und „Uhr" hinter der Zeit', () => {
    const r = parseReise(`Bus M41
Abfahrt 14:05 Uhr Hermannplatz
Ankunft 14:20 Uhr Berlin Hbf, Gleis 3

ICE 1234
Abfahrt 14:35 Uhr Berlin Hbf, Gleis 8
Ankunft 16:00 Uhr Hamburg Hbf, Gleis 12`)!
    expect(r.abschnitte).toHaveLength(2)
    expect(r.umstiege[0]).toMatchObject({ bahnhof: 'Berlin Hbf', anGleis: '3', abGleis: '8' })
  })

  it('behaelt die Kopfzeile, wenn es eine gibt', () => {
    const r = parseReise(`Potsdam Hbf -> Berlin Alexanderplatz
15.08.2026

RB22
ab 08:05 Potsdam Hbf, Gl. 4
an 08:41 Berlin Wannsee, Bstg. 2

S1
ab 08:48 Berlin Wannsee, Steig 1
an 09:10 Berlin Alexanderplatz, Gl. 3`)!
    expect(r.von).toBe('Potsdam Hbf')
    expect(r.nach).toBe('Berlin Alexanderplatz')
    expect(r.datum).toBe('15.08.2026')
  })

  // Der allgemeine Erkenner darf nicht alles schlucken. Ohne mindestens ein
  // Ab/An-Paar mit Zeit wird nichts behauptet.
  it('raet auch im allgemeinen Fall nicht', () => {
    expect(parseReise('Ich fahre morgen um 10 Uhr von Berlin nach Hamburg.')).toBeNull()
    expect(parseReise('ab 10:15 Berlin Hbf')).toBeNull()
  })
})

/**
 * VBB-App („Verbindung teilen"). Echte Probe vom 03.09.2026.
 *
 * Das Format dreht gegenueber dem DB Navigator alles um:
 *
 *   DB:   Ab 22:53 Eberswalde, Gleis 4      - Schluesselwort zuerst
 *   VBB:  22:53 - Abfahrt Eberswalde, Gleis 4   - ZEIT zuerst
 *
 * Und der Zug steht HINTER der Abfahrtszeile („mit RE3 Richtung ..."), nicht
 * davor. Beides zusammen liess die erste Fassung an jeder einzelnen Zeile
 * scheitern - erkannt wurde gar nichts.
 *
 * Dritte Tuecke: Der Bahnhofsname traegt einen Klammerzusatz
 * („S+U Berlin Hauptbahnhof [Gleis 1-8]"), der NICHT das Gleis ist. Das
 * echte Gleis steht danach.
 */
const VBB_ECHT = `Ich habe diese Verbindung in VBB gefunden:

22:34 - Fußweg nach Eberswalde, Hauptbahnhof, Dauer 19 Min.

22:53 - Abfahrt Eberswalde, Hauptbahnhof, Gleis 4
      mit RE3 Richtung Jüterbog, Bahnhof
23:33 - Ankunft S+U Berlin Hauptbahnhof [Gleis 1-8], Gleis 4

-----
Gesamtdauer: 59 Min.`

describe('parseReise: VBB-App', () => {
  it('erkennt den Text ueberhaupt', () => {
    expect(parseReise(VBB_ECHT)).not.toBeNull()
    expect(parseReise(VBB_ECHT)!.erkannt.abschnitte).toBe(1)
  })

  it('liest Zeit, Bahnhof und Gleis trotz umgedrehter Reihenfolge', () => {
    const a = parseReise(VBB_ECHT)!.abschnitte[0]
    expect(a.abZeit).toBe('22:53')
    expect(a.abBahnhof).toBe('Eberswalde, Hauptbahnhof')
    expect(a.abGleis).toBe('4')
    expect(a.anZeit).toBe('23:33')
    expect(a.anGleis).toBe('4')
  })

  it('nimmt den Zug aus der Zeile DAHINTER', () => {
    const a = parseReise(VBB_ECHT)!.abschnitte[0]
    expect(a.zug).toBe('RE3')
    expect(a.nach).toBe('Jüterbog, Bahnhof')
  })

  // „[Gleis 1-8]" ist ein Namenszusatz, kein Gleis. Bliebe er stehen, fände
  // die Gleiserkennung „1-8" statt „4". Das ist Zeilenrauschen, kein
  // Vokabular - dieser Schnitt bleibt deshalb hier im Parser.
  it('entfernt weiterhin den Klammerzusatz aus dem Bahnhofsnamen', () => {
    expect(parseReise(VBB_ECHT)!.abschnitte[0].anBahnhof).not.toMatch(/\[/)
  })

  /**
   * Die Vorsilbe „S+U" bleibt dagegen absichtlich stehen: Sie aufzulösen ist
   * seit dem 04.09.2026 allein Aufgabe der Bahnhofssuche im Backend
   * (`backend/src/core/bahnhofsname.ts`), nicht mehr dieses Parsers - sonst
   * pflegt man dieselbe Vokabelliste an zwei Stellen. Der Bahnhof landet
   * deshalb als SUCHTEXT im Formular, nicht als aufgelöster Name; die
   * Backend-Suche probiert die Schreibvarianten selbst durch (siehe dort,
   * `namensvarianten()` und ihre eigenen Tests).
   */
  it('laesst die Verkehrsmittel-Vorsilbe unangetastet - das loest jetzt die Backend-Suche', () => {
    expect(parseReise(VBB_ECHT)!.abschnitte[0].anBahnhof).toBe('S+U Berlin Hauptbahnhof')
  })

  /**
   * Ebenso bei der Nachsilbe: „Bahnhof"/„Bhf" wird nicht mehr abgeschnitten,
   * auch nicht in Kombination mit einer Vorsilbe. Die Gegenprobe zeigt, dass
   * sich daran nichts geaendert hat: „Hauptbahnhof" trug ohnehin nie eine
   * Vorsilbe und war von dieser Vokabelliste nie betroffen.
   */
  it('laesst eine angehaengte Bahnhofs-Nachsilbe unangetastet, auch kombiniert mit einer Vorsilbe', () => {
    const r = parseReise(`12:00 - Abfahrt Hockenheim, Bahnhof, Gleis 1
      mit RE1 Richtung X
12:30 - Ankunft S+U Berlin Gesundbrunnen Bhf, Gleis 4`)!
    expect(r.abschnitte[0].abBahnhof).toBe('Hockenheim, Bahnhof')
    expect(r.abschnitte[0].anBahnhof).toBe('S+U Berlin Gesundbrunnen Bhf')
    // Gegenprobe unveraendert: „Hauptbahnhof" trug ohnehin nie eine Vorsilbe.
    expect(parseReise(VBB_ECHT)!.abschnitte[0].abBahnhof).toBe('Eberswalde, Hauptbahnhof')
  })

  it('ueberspringt den Fussweg', () => {
    expect(parseReise(VBB_ECHT)!.abschnitte).toHaveLength(1)
  })

  /**
   * Die VBB haengt die Stadt in RUNDEN Klammern an und laesst das Gleis
   * dahinter folgen: „… (Berlin), Gleis 6". Nach dem Herausnehmen der
   * Gleisangabe endet die Zeile auf „…(Berlin)," - und die Schlussbereinigung
   * schnitt `),` als Ganzes ab, weil die runde Klammer in ihrer Zeichenklasse
   * stand. Herausgekommen ist ein unbalancierter Name, mit dem die
   * Bahnhofssuche nichts anfangen kann und die Navigation nicht startet.
   *
   * Runde Klammern gehoeren zum Namen („Frankfurt(Main)Hbf"), eckige nicht -
   * dieser Unterschied stand schon im Parser und wurde hier verletzt.
   */
  it('behaelt die schliessende Klammer eines Namenszusatzes', () => {
    const r = parseReise(`16:53 - Abfahrt Eberswalde, Hauptbahnhof, Gleis 4
      mit RE3 Richtung Luckenwalde, Bahnhof
17:21 - Ankunft S+U Gesundbrunnen Bhf (Berlin), Gleis 6`)!
    expect(r.abschnitte[0].anBahnhof).toBe('S+U Gesundbrunnen Bhf (Berlin)')
  })

  // Die Gegenprobe: Das Gleis darf trotzdem sauber herausfallen - der Zusatz
  // ist Name, die Angabe dahinter ist das Gleis.
  it('liest das Gleis hinter einem Klammerzusatz weiterhin richtig', () => {
    const r = parseReise(`17:35 - Abfahrt S+U Gesundbrunnen Bhf (Berlin), Gleis 3
      mit S41 Richtung S Königs Wusterhausen Bhf
17:55 - Ankunft S Treptower Park (Berlin), Gleis 4`)!
    expect(r.abschnitte[0].abGleis).toBe('3')
    expect(r.abschnitte[0].anGleis).toBe('4')
    expect(r.abschnitte[0].anBahnhof).toBe('S Treptower Park (Berlin)')
  })

  it('leitet aus zwei Abschnitten den Umstieg ab', () => {
    const r = parseReise(`Ich habe diese Verbindung in VBB gefunden:

22:53 - Abfahrt Eberswalde, Hauptbahnhof, Gleis 4
      mit RE3 Richtung Jüterbog, Bahnhof
23:33 - Ankunft S+U Berlin Hauptbahnhof [Gleis 1-8], Gleis 4

23:45 - Abfahrt S+U Berlin Hauptbahnhof [Gleis 1-8], Gleis 16
      mit ICE 1234 Richtung Hamburg Hbf
01:10 - Ankunft Hamburg Hbf, Gleis 7`)!
    expect(r.abschnitte).toHaveLength(2)
    expect(r.umstiege).toHaveLength(1)
    expect(r.umstiege[0]).toMatchObject({
      bahnhof: 'S+U Berlin Hauptbahnhof',
      anZug: 'RE3',
      anGleis: '4',
      abZug: 'ICE 1234',
      abGleis: '16',
      minuten: 12,
      vollstaendig: true,
    })
  })

  it('verwirft die Rahmenzeilen', () => {
    const r = parseReise(VBB_ECHT)!
    expect(JSON.stringify(r)).not.toContain('Gesamtdauer')
    expect(JSON.stringify(r)).not.toContain('gefunden')
  })
})

import { describe, expect, it } from 'vitest'
import type { Bahnhofsdaten } from './typen'
import { bahnhofsseiteHtml, eingabeLink, sitemapXml, uebersichtHtml, type Bauteile } from './seiten'

/**
 * Die vorgerenderten Bahnhofsseiten (Konzept Nutzergewinnung AP 5b/5c):
 * vollstaendig lesbar ohne JavaScript, CSP-fest (kein Inline-Stil, kein
 * Inline-Skript), mit eigenem Titel und eigener kanonischer Adresse.
 */
const HANNOVER: Bahnhofsdaten = {
  name: 'Hannover Hbf',
  eva: '8000152',
  slug: 'hannover-hbf',
  lat: 52.376761,
  lon: 9.741021,
  stufe: 1,
  geholtAm: '2026-10-13T18:19:12.496Z',
  gleise: ['1', '2', '3'],
  paare: [
    { von: '1', nach: '2', gleicherBahnsteig: true, sek: 15, wechsel: 0, anlagen: [], lage: 'ebenerdig', stufenfreiSek: 15 },
    { von: '1', nach: '3', gleicherBahnsteig: false, sek: 110, wechsel: 2, anlagen: ['rolltreppe'], lage: 'unterfuehrung', stufenfreiSek: 243 },
    { von: '2', nach: '1', gleicherBahnsteig: true, sek: 15, wechsel: 0, anlagen: [], lage: 'ebenerdig', stufenfreiSek: 15 },
    { von: '2', nach: '3', gleicherBahnsteig: false, sek: 121, wechsel: 2, anlagen: ['treppe'], lage: 'unterfuehrung', stufenfreiSek: null },
    { von: '3', nach: '1', gleicherBahnsteig: false, sek: 130, wechsel: 2, anlagen: ['rolltreppe'], lage: 'unterfuehrung', stufenfreiSek: 250 },
    { von: '3', nach: '2', gleicherBahnsteig: false, sek: null, wechsel: 0, anlagen: [], lage: 'ebenerdig', stufenfreiSek: null },
  ],
}

const BAUTEILE: Bauteile = { css: '/assets/bahnhofsseiten-abc12345.css', messung: '/assets/messung-def67890.js' }

const html = bahnhofsseiteHtml(HANNOVER, BAUTEILE)
const doc = new DOMParser().parseFromString(html, 'text/html')
const meta = (sel: string) => doc.querySelector(sel)?.getAttribute('content')

describe('bahnhofsseiteHtml: Kopf', () => {
  it('ist ein vollstaendiges deutsches HTML-Dokument', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(doc.documentElement.getAttribute('lang')).toBe('de')
    expect(doc.querySelector('meta[name="viewport"]')).not.toBeNull()
  })

  it('traegt Titel (unter 65 Zeichen) und Beschreibung nach Konzept 4.2', () => {
    expect(doc.title).toBe('Umsteigen in Hannover Hbf: Gehzeit von Gleis zu Gleis')
    expect(doc.title.length).toBeLessThan(65)
    expect(meta('meta[name="description"]')).toMatch(/^Wie lange dauert der Umstieg in Hannover Hbf\?/)
  })

  it('hat die eigene kanonische Adresse und dieselben Angaben fuer geteilte Links', () => {
    const url = 'https://www.umstieg.online/bahnhof/hannover-hbf'
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(url)
    expect(meta('meta[property="og:url"]')).toBe(url)
    expect(meta('meta[property="og:title"]')).toBe(doc.title)
    expect(meta('meta[property="og:description"]')).toBe(meta('meta[name="description"]'))
  })

  it('beschreibt den Bahnhof als TrainStation (JSON-LD)', () => {
    const daten = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!) as Record<string, unknown>
    expect(daten['@type']).toBe('TrainStation')
    expect(daten.name).toBe('Hannover Hbf')
    expect(daten.url).toBe('https://www.umstieg.online/bahnhof/hannover-hbf')
    expect(daten.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 52.376761, longitude: 9.741021 })
  })

  // CSP: script-src 'self', style-src 'self'.
  it('laedt Stil und Messung als Dateien - kein Inline-Stil, kein Inline-Skript', () => {
    expect(html).not.toMatch(/\sstyle=/)
    expect(html).not.toMatch(/<style/)
    expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe(BAUTEILE.css)
    const skripte = [...doc.querySelectorAll('script')].filter((s) => s.getAttribute('type') !== 'application/ld+json')
    expect(skripte.map((s) => s.getAttribute('src'))).toEqual([BAUTEILE.messung])
    expect(skripte.every((s) => (s.textContent ?? '').trim() === '')).toBe(true)
  })
})

describe('bahnhofsseiteHtml: Inhalt', () => {
  it('beginnt mit der Ueberschrift und dem Einleitungssatz', () => {
    expect(doc.querySelector('h1')?.textContent).toBe('Umsteigen in Hannover Hbf')
    expect(doc.body.textContent).toContain(
      'Gehzeiten zwischen allen 3 Gleisen, berechnet aus dem Bahnhofsplan, bei normalem Gehtempo ab Bahnsteigmitte.',
    )
  })

  it('fuehrt mit vorbelegtem Bahnhof in die App', () => {
    const knopf = [...doc.querySelectorAll('a')].find((a) => a.textContent === 'Weg für meinen Umstieg anzeigen')
    expect(knopf?.getAttribute('href')).toBe(eingabeLink(HANNOVER))
    expect(eingabeLink(HANNOVER)).toMatch(/^\/eingabe\?bahnhof=8000152&/)
  })

  it('hat je Ankunftsgleis einen aufklappbaren Block mit Tabelle', () => {
    const bloecke = doc.querySelectorAll('details')
    expect(bloecke).toHaveLength(3)
    expect(bloecke[0].querySelector('summary')?.textContent).toBe('Ankunft Gleis 1')
    expect(bloecke[0].querySelectorAll('tbody tr')).toHaveLength(2)
    const kopf = [...bloecke[0].querySelectorAll('thead th')].map((th) => th.textContent)
    expect(kopf).toEqual(['Abfahrt', 'Gehzeit', 'Weg', 'Stufenfrei'])
  })

  it('rundet Minuten auf und nennt den gleichen Bahnsteig als Text', () => {
    const zeilen = [...doc.querySelectorAll('details')[1].querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('th, td')].map((z) => z.textContent),
    )
    expect(zeilen).toEqual([
      ['Gleis 1', 'Gleicher Bahnsteig', 'über den Bahnsteig', 'ja'],
      ['Gleis 3', '3 min', 'Treppe, Unterführung', 'nicht möglich'],
    ])
  })

  it('nennt die drei laengsten Umstiege als Fliesstext', () => {
    const absatz = doc.querySelector('.bs-laengste')?.textContent ?? ''
    expect(absatz).toMatch(/Gleis 3 nach Gleis 1/)
    expect(absatz).toMatch(/3 Minuten/)
  })

  it('weist auf Richtwerte, Stand und OpenStreetMap hin', () => {
    const text = doc.body.textContent ?? ''
    expect(text).toContain('Richtwerte. Mit Gepäck oder wenig Ortskenntnis mehr Zeit einplanen.')
    expect(text).toContain('Bahnhofsplan vom 13.10.2026')
    const osm = [...doc.querySelectorAll('a')].find((a) => a.getAttribute('href') === 'https://www.openstreetmap.org/copyright')
    expect(osm?.textContent).toBe('OpenStreetMap-Mitwirkende')
  })

  it('verlinkt Uebersicht, Impressum und Datenschutz', () => {
    const ziele = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(ziele).toContain('/bahnhoefe')
    expect(ziele).toContain('/impressum')
    expect(ziele).toContain('/datenschutz')
  })

  it('maskiert Namen mit Sonderzeichen', () => {
    const seltsam = bahnhofsseiteHtml({ ...HANNOVER, name: 'A & B <C>' }, BAUTEILE)
    expect(seltsam).not.toContain('<C>')
    expect(new DOMParser().parseFromString(seltsam, 'text/html').querySelector('h1')?.textContent).toBe('Umsteigen in A & B <C>')
  })
})

describe('uebersichtHtml (/bahnhoefe)', () => {
  const zweiter: Bahnhofsdaten = { ...HANNOVER, name: 'Aachen Hbf', slug: 'aachen-hbf', gleise: ['1', '2'] }
  const ueb = new DOMParser().parseFromString(uebersichtHtml([HANNOVER, zweiter], BAUTEILE), 'text/html')

  it('setzt die Anzahl aus dem Bestand in Titel und Ueberschrift', () => {
    expect(ueb.title).toBe('Umsteigezeiten für 2 Bahnhöfe in Deutschland | Umstieg.')
    expect(ueb.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://www.umstieg.online/bahnhoefe')
  })

  it('listet alle Bahnhoefe alphabetisch nach Anfangsbuchstaben, mit Gleisanzahl', () => {
    const gruppen = [...ueb.querySelectorAll('h2')].map((h) => h.textContent)
    expect(gruppen).toEqual(['A', 'H'])
    const links = [...ueb.querySelectorAll('li a')].map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Aachen Hbf', '/bahnhof/aachen-hbf'],
      ['Hannover Hbf', '/bahnhof/hannover-hbf'],
    ])
    expect(ueb.body.textContent).toContain('2 Gleise')
  })

  it('kommt ohne Inline-Stil aus', () => {
    expect(uebersichtHtml([HANNOVER], BAUTEILE)).not.toMatch(/\sstyle=/)
  })
})

describe('sitemapXml (Konzept AP 2)', () => {
  const xml = sitemapXml([HANNOVER], '2026-10-21')
  const sm = new DOMParser().parseFromString(xml, 'application/xml')
  const eintraege = [...sm.getElementsByTagName('url')].map((u) => [
    u.getElementsByTagName('loc')[0].textContent,
    u.getElementsByTagName('lastmod')[0].textContent,
  ])

  it('nennt Start, Uebersicht, jede Bahnhofsseite und die Rechtsseiten', () => {
    expect(eintraege.map(([loc]) => loc)).toEqual([
      'https://www.umstieg.online/',
      'https://www.umstieg.online/bahnhoefe',
      'https://www.umstieg.online/bahnhof/hannover-hbf',
      'https://www.umstieg.online/impressum',
      'https://www.umstieg.online/datenschutz',
    ])
  })

  it('traegt bei Bahnhofsseiten das Datum des Bahnhofsplans', () => {
    expect(eintraege[2][1]).toBe('2026-10-13')
    expect(eintraege[0][1]).toBe('2026-10-21')
  })

  it('ist gueltiges Sitemap-XML', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(sm.getElementsByTagName('parsererror')).toHaveLength(0)
    expect(sm.documentElement.getAttribute('xmlns')).toBe('http://www.sitemaps.org/schemas/sitemap/0.9')
  })
})

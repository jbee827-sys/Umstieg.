import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Was Suchmaschinen und KI-Crawler von der Startseite sehen
 * (Konzept Nutzergewinnung, AP 1).
 *
 * Die App entsteht erst im Browser. GPTBot, ClaudeBot und PerplexityBot
 * führen kein JavaScript aus, Google stellt die Seite in eine eigene
 * Render-Warteschlange – für sie zählt allein, was in `index.html` steht.
 * Bis zum 21.10.2026 war das der Titel „Umstieg." und ein leeres
 * `<div id="root">`. Diese Tests halten fest, dass dort der Nutzen steht.
 */
const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8')
const doc = new DOMParser().parseFromString(html, 'text/html')

function meta(attribut: 'name' | 'property', wert: string): string {
  return doc.querySelector(`meta[${attribut}="${wert}"]`)?.getAttribute('content') ?? ''
}

describe('Startseite ohne JavaScript', () => {
  // Richtwerte: Google kürzt Titel ab etwa 60, Beschreibungen ab etwa 155 Zeichen.
  it('hat einen Titel mit Nutzen, höchstens 60 Zeichen', () => {
    expect(doc.title).toContain('von Gleis zu Gleis')
    expect(doc.title.length).toBeLessThanOrEqual(60)
  })

  it('hat eine Beschreibung mit Handlungsaufforderung, höchstens 155 Zeichen', () => {
    const beschreibung = meta('name', 'description')
    expect(beschreibung).toMatch(/eingeben/)
    expect(beschreibung.length).toBeLessThanOrEqual(155)
  })

  it('zeigt geteilten Links denselben Text', () => {
    expect(meta('property', 'og:title')).toBe(doc.title)
    expect(meta('property', 'og:description')).toBe(meta('name', 'description'))
    expect(meta('name', 'twitter:title')).toBe(doc.title)
    expect(meta('name', 'twitter:description')).toBe(meta('name', 'description'))
  })

  it('trägt im Wurzelelement einen lesbaren Vortext mit Überschrift', () => {
    const wurzel = doc.getElementById('root')
    expect(wurzel?.querySelector('h1')?.textContent).toBe('Der Weg von Gleis zu Gleis beim Umsteigen')
    expect(wurzel?.textContent).toMatch(/Gleis/)
    expect(wurzel?.textContent).toMatch(/Aufzug/)
  })

  it('verlinkt aus dem Vortext die Übersicht der Bahnhöfe', () => {
    const link = doc.querySelector('#root a[href="/bahnhoefe"]')
    expect(link).not.toBeNull()
  })

  // CSP: style-src 'self' - ein style-Attribut würde blockiert.
  it('kommt ohne Inline-Stile aus', () => {
    expect(html).not.toMatch(/\sstyle=/)
  })

  it('beschreibt die App als WebApplication (JSON-LD)', () => {
    const block = doc.querySelector('script[type="application/ld+json"]')
    expect(block).not.toBeNull()
    const daten = JSON.parse(block!.textContent ?? '{}') as Record<string, unknown>
    expect(daten['@type']).toBe('WebApplication')
    expect(daten.url).toBe('https://www.umstieg.online/')
    expect(daten.applicationCategory).toBe('TravelApplication')
    expect(daten.operatingSystem).toBe('Web')
    expect(daten.inLanguage).toBe('de')
    expect((daten.offers as { price: unknown }).price).toBe(0)
    expect(daten.description).toBe(meta('name', 'description'))
  })

  // Die Abnahme prüft `curl … | grep -c "von Gleis zu Gleis"` ≥ 2.
  it('nennt „von Gleis zu Gleis" in mindestens zwei Zeilen', () => {
    expect(html.split('\n').filter((z) => z.includes('von Gleis zu Gleis')).length).toBeGreaterThanOrEqual(2)
  })
})

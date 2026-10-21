import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * robots.txt und Auslieferung (Konzept Nutzergewinnung AP 2).
 */
const hier = dirname(fileURLToPath(import.meta.url))
const robots = readFileSync(resolve(hier, '../public/robots.txt'), 'utf8')
const vercel = JSON.parse(readFileSync(resolve(hier, '../../vercel.json'), 'utf8')) as {
  trailingSlash?: boolean
  rewrites: { source: string; destination: string }[]
}

describe('robots.txt', () => {
  const zeilen = robots.split(/\r?\n/).map((z) => z.trim())

  it('erlaubt allen alles ausser den Reise-Bildschirmen', () => {
    expect(zeilen).toContain('User-agent: *')
    expect(zeilen).toContain('Allow: /')
    const gesperrt = zeilen.filter((z) => z.startsWith('Disallow:')).map((z) => z.slice('Disallow:'.length).trim())
    expect(gesperrt.sort()).toEqual(['/angekommen', '/meldungen', '/uebersicht', '/weg'])
  })

  // Ohne gespeicherte Reise zeigen diese Pfade nur die Eingabe - doppelte
  // Inhalte. Die Eingabe selbst, die Bahnhofsseiten und die Rechtsseiten
  // bleiben offen; KI-Crawler werden ausdruecklich nicht ausgesperrt.
  it('sperrt keine oeffentliche Seite und keinen KI-Crawler eigens', () => {
    expect(robots).not.toMatch(/Disallow:\s*\/(bahnhof|bahnhoefe|impressum|datenschutz|eingabe)?\s*$/m)
    expect(robots).not.toMatch(/User-agent:\s*(GPTBot|ClaudeBot|PerplexityBot)/i)
  })

  it('nennt die Sitemap', () => {
    expect(zeilen).toContain('Sitemap: https://www.umstieg.online/sitemap.xml')
  })
})

describe('vercel.json', () => {
  // /bahnhof/x/ → 308 → /bahnhof/x: eine Adresse je Seite, wie die
  // kanonische Angabe.
  it('leitet Adressen mit Schraegstrich am Ende auf die ohne um', () => {
    expect(vercel.trailingSlash).toBe(false)
  })

  // Vorhandene Dateien gehen vor; alles andere - auch /bahnhof/<unbekannt> -
  // faellt auf die App.
  it('behaelt die Umschreibung auf die App fuer alles Uebrige', () => {
    expect(vercel.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }])
  })
})

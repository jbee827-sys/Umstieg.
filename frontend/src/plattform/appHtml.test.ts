import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { appHtml, cspAusVercel } from './appHtml'

const vercel = JSON.parse(readFileSync('../vercel.json', 'utf8'))
const indexHtml = readFileSync('index.html', 'utf8')

describe('CSP der App', () => {
  const csp = cspAusVercel(vercel)

  it('übernimmt die Quellen aus vercel.json', () => {
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain('connect-src')
    expect(csp).toContain('https://umstieg-backend.fly.dev')
    expect(csp).toContain("object-src 'none'")
  })

  it('lässt weg, was nur als Kopfzeile wirkt', () => {
    expect(csp).not.toContain('frame-ancestors')
  })

  it('bricht ab, wenn vercel.json keine CSP hat', () => {
    expect(() => cspAusVercel({ headers: [] })).toThrow(/Content-Security-Policy/)
  })
})

describe('index.html der App', () => {
  const html = appHtml(indexHtml, cspAusVercel(vercel))

  it('trägt die CSP als <meta> direkt nach dem Zeichensatz', () => {
    expect(html).toMatch(/<meta charset="UTF-8" \/>\s*<meta http-equiv="Content-Security-Policy" content="default-src 'self';/)
  })

  it('reicht unter Statusleiste und Home-Balken', () => {
    expect(html).toContain('content="width=device-width, initial-scale=1.0, viewport-fit=cover"')
  })

  it('hat keinen Vortext für Suchmaschinen', () => {
    expect(html).not.toContain('vortext')
    expect(html).toContain('<div id="root"></div>')
  })

  it('bricht ab statt still die Web-Seite auszuliefern', () => {
    expect(() => appHtml('<html></html>', 'x')).toThrow(/nicht gefunden/)
  })
})

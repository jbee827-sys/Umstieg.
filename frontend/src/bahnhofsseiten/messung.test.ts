import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * messung.js laeuft auf den vorgerenderten Seiten statt `<Analytics>`. Es
 * muss dieselbe Zusage halten wie die App (Datenschutzerklaerung): Die
 * Abfragezeichenkette geht nie an die Messung.
 */
const code = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'messung.js'), 'utf8')

type Fenster = Window & { va?: (...a: unknown[]) => void; vaq?: unknown[][] }
const fenster = window as Fenster

afterEach(() => {
  delete fenster.va
  delete fenster.vaq
  document.head.querySelectorAll('script').forEach((s) => s.remove())
})

function lade(): (e: { type: string; url: string }) => { url: string } | null {
  new Function(code)()
  const eintrag = fenster.vaq?.find(([art]) => art === 'beforeSend')
  return eintrag?.[1] as (e: { type: string; url: string }) => { url: string } | null
}

describe('messung.js', () => {
  it('schneidet die Abfragezeichenkette ab, bevor gesendet wird', () => {
    const vorSenden = lade()
    expect(vorSenden({ type: 'pageview', url: 'https://www.umstieg.online/bahnhof/hannover-hbf?utm_source=x' })?.url).toBe(
      'https://www.umstieg.online/bahnhof/hannover-hbf',
    )
  })

  it('verwirft ein Ereignis mit unlesbarer Adresse', () => {
    expect(lade()({ type: 'pageview', url: 'kaputt' })).toBeNull()
  })

  it('laedt das Skript von Vercel vom eigenen Ursprung (CSP: script-src self)', () => {
    lade()
    const skript = document.head.querySelector('script')
    expect(skript?.getAttribute('src')).toBe('/_vercel/insights/script.js')
    expect(skript?.defer).toBe(true)
  })
})

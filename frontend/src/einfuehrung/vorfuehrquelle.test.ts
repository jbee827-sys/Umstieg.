import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { holeApi } from '../api/basis'
import { holeRoute, holeTafel, RouteFehler, sucheStationen } from '../api/client'
import { sucheOrte } from '../api/orte'
import { verbindeLive } from '../api/sse'
import { gruppiereTafel } from '../api/tafelauswahl'
import daten from './daten/berlin-hbf-14-6.json'
import { aktiviereVorfuehrquelle, deaktiviereVorfuehrquelle, type Vorfuehrdaten } from './vorfuehrquelle'

const DATEN = daten as unknown as Vorfuehrdaten

function gehzeit(schluessel: string): number {
  const a = DATEN.routen[schluessel]
  if (a.status !== 200) throw new Error(`${schluessel} ist nicht aufgezeichnet`)
  return a.antwort.gehzeitSek
}
const BASIS = { eva: '8011160', gleisAn: '14', gleisAb: '6', profil: 'normal' } as const

let netz: ReturnType<typeof vi.fn>
beforeEach(() => {
  netz = vi.fn(async () => new Response('[]'))
  vi.stubGlobal('fetch', netz)
})
afterEach(() => {
  deaktiviereVorfuehrquelle()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * Plan Einführungstour, Paket 2: Solange die Tour läuft, kommt jede Antwort
 * auf /api/* aus der Aufzeichnung - kein Netz, kein Backend.
 */
describe('Vorführquelle', () => {
  it('beantwortet die Route aus der Aufzeichnung, ohne das Netz zu fragen', async () => {
    aktiviereVorfuehrquelle(DATEN)
    const route = await holeRoute({ ...BASIS, variante: 'barrierefrei', abschnitt: 'ende' })
    expect(route.gehzeitSek).toBe(gehzeit('barrierefrei|ende'))
    expect(netz).not.toHaveBeenCalled()
  })

  it('nimmt ohne Abschnitt die Bahnsteigmitte - wie das Backend', async () => {
    aktiviereVorfuehrquelle(DATEN)
    const route = await holeRoute({ ...BASIS, variante: 'schnellste' })
    expect(route.gehzeitSek).toBe(gehzeit('schnellste|mitte'))
  })

  it('antwortet auf eine nicht aufgezeichnete Reise wie das Backend auf eine ohne Weg', async () => {
    aktiviereVorfuehrquelle(DATEN)
    const fehler = await holeRoute({ ...BASIS, gleisAb: '7', variante: 'schnellste' }).catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(RouteFehler)
    expect((fehler as RouteFehler).code).toBe('keine-route')
  })

  it('findet Berlin Hbf als Ort und als Bahnhof', async () => {
    aktiviereVorfuehrquelle(DATEN)
    const orte = await sucheOrte('Berl')
    expect(orte.ok && orte.antwort.orte.map((o) => [o.name, o.eva])).toEqual([['Berlin Hbf', '8011160']])
    const stationen = await sucheStationen('berlin')
    expect(stationen.ok && stationen.treffer.map((t) => t.eva)).toEqual(['8011160'])
    const nichts = await sucheOrte('Kassel')
    expect(nichts.ok && nichts.antwort.orte).toEqual([])
  })

  it('stellt die Züge der Beispielreise auf die Tafeln, relativ zu jetzt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 22, 14, 58, 30))
    aktiviereVorfuehrquelle(DATEN)
    const an = await holeTafel('8011160', 'arr')
    const ab = await holeTafel('8011160', 'dep')
    expect(an.ok && an.eintraege.find((e) => e.zug === 'ICE 945')).toMatchObject({
      zeitSoll: '15:00',
      gleisSoll: '14',
      ziel: 'Köln Hbf',
    })
    expect(ab.ok && ab.eintraege.find((e) => e.zug === 'ICE 1007')).toMatchObject({
      zeitSoll: '15:11',
      gleisSoll: '6',
      ziel: 'München Hbf',
    })
    // Daneben weitere Züge, damit die Tafel wie eine aussieht.
    expect(an.ok && an.eintraege.length).toBeGreaterThanOrEqual(3)
    expect(ab.ok && ab.eintraege.length).toBeGreaterThanOrEqual(3)
  })

  it('erzeugt Zeiten, die die Tafelauswahl kurz vor Mitternacht in ihr Fenster nimmt', async () => {
    // Die Tafel rechnet mit der lokalen Uhr (getHours) - die Vorführzeiten
    // tun es auch, sonst fiele der Anschluss um 23:55 aus der Liste.
    vi.useFakeTimers({ toFake: ['Date'] })
    const jetzt = new Date(2026, 9, 22, 23, 55, 0)
    vi.setSystemTime(jetzt)
    aktiviereVorfuehrquelle(DATEN)
    const ab = await holeTafel('8011160', 'dep')
    if (!ab.ok) throw new Error('Tafel fehlt')
    expect(ab.eintraege.find((e) => e.zug === 'ICE 1007')?.zeitSoll).toBe('00:08')
    const fern = gruppiereTafel(ab.eintraege, jetzt).find((b) => b.kategorie === 'fern')
    expect(fern?.eintraege.map((e) => e.zug)).toContain('ICE 1007')
  })

  it('antwortet auf alles andere unter /api/ mit 404 und sagt es in der Konsole', async () => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {})
    aktiviereVorfuehrquelle(DATEN)
    const res = await holeApi('/api/weg?vonLat=1')
    expect(res.status).toBe(404)
    expect(warnung).toHaveBeenCalledWith(expect.stringContaining('/api/weg'))
    expect(netz).not.toHaveBeenCalled()
  })

  it('öffnet während der Vorführung keinen Live-Strom', () => {
    const quelle = vi.fn()
    vi.stubGlobal('EventSource', quelle)
    aktiviereVorfuehrquelle(DATEN)
    const trenne = verbindeLive({ eva: '8011160', onEreignis: () => {}, onWiederverbunden: () => {} })
    expect(quelle).not.toHaveBeenCalled()
    expect(() => trenne()).not.toThrow()
  })

  it('gibt nach dem Abschalten wieder an das echte Netz', async () => {
    aktiviereVorfuehrquelle(DATEN)
    deaktiviereVorfuehrquelle()
    await holeTafel('8011160', 'arr')
    expect(netz).toHaveBeenCalledWith('/api/board/8011160?type=arr')
  })
})

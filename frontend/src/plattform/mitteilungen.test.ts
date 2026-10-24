import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveEreignis } from '../api/typen'

const nativ = vi.hoisted(() => ({
  app: true,
  display: 'granted' as string,
  check: vi.fn(),
  request: vi.fn(),
  schedule: vi.fn(() => Promise.resolve({ notifications: [] })),
  cancel: vi.fn(() => Promise.resolve()),
}))

vi.mock('./istApp', () => ({ istApp: () => nativ.app }))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: nativ.check,
    requestPermissions: nativ.request,
    schedule: nativ.schedule,
    cancel: nativ.cancel,
  },
}))

const m = await import('./mitteilungen')

/** Bis alle angestoßenen Versprechen durch sind. */
const abwarten = () => new Promise((fertig) => setTimeout(fertig, 0))

function sichtbar(ja: boolean) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (ja ? 'visible' : 'hidden') })
}

const gleiswechsel: LiveEreignis = {
  typ: 'gleiswechsel',
  zug: 'ICE 1007',
  seite: 'ab',
  alt: '6',
  neu: '8',
  zeitstempel: '2026-10-24T12:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  nativ.app = true
  nativ.display = 'granted'
  nativ.check.mockImplementation(() => Promise.resolve({ display: nativ.display }))
  nativ.request.mockImplementation(() => Promise.resolve({ display: 'granted' }))
  sichtbar(false)
})

describe('was eine Mitteilung wert ist', () => {
  it('Gleiswechsel und Ausfall des Anschlusses', () => {
    expect(m.istMitteilenswert(gleiswechsel)).toBe(true)
    expect(m.istMitteilenswert({ ...gleiswechsel, typ: 'ausfall' })).toBe(true)
  })

  it('nicht der Ankunftszug, keine Verspätung, kein Herzschlag', () => {
    expect(m.istMitteilenswert({ ...gleiswechsel, seite: 'an' })).toBe(false)
    expect(m.istMitteilenswert({ ...gleiswechsel, typ: 'verspaetung' })).toBe(false)
    expect(m.istMitteilenswert({ ...gleiswechsel, typ: 'heartbeat' })).toBe(false)
  })

  it('die Ampel springt auf Rot - nur beim Wechsel', () => {
    expect(m.wirdRot('gelb', 'rot')).toBe(true)
    expect(m.wirdRot('gruen', 'rot')).toBe(true)
    expect(m.wirdRot('rot', 'rot')).toBe(false)
    expect(m.wirdRot(null, 'rot')).toBe(false)
    expect(m.wirdRot('gelb', 'gelb')).toBe(false)
  })
})

describe('Sofortmeldung', () => {
  it('im Hintergrund mit dem Text der Störmeldung', async () => {
    m.teileEreignisMit(gleiswechsel)
    await abwarten()
    expect(nativ.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({ title: 'Gleiswechsel', body: 'ICE 1007 fährt heute von Gleis 8 statt 6.' })],
    })
  })

  it('im Vordergrund nicht - dort steht die Störmeldung', async () => {
    sichtbar(true)
    m.teileEreignisMit(gleiswechsel)
    m.teileGefaehrdungMit('6')
    await abwarten()
    expect(nativ.schedule).not.toHaveBeenCalled()
  })

  it('ohne Erlaubnis nichts', async () => {
    nativ.display = 'denied'
    m.teileGefaehrdungMit('6')
    await abwarten()
    expect(nativ.schedule).not.toHaveBeenCalled()
  })

  it('im Browser nie', async () => {
    nativ.app = false
    m.teileEreignisMit(gleiswechsel)
    m.bereiteMitteilungenVor()
    await abwarten()
    expect(nativ.check).not.toHaveBeenCalled()
  })
})

describe('Erlaubnis', () => {
  it('gefragt wird nur, solange noch nicht geantwortet', async () => {
    nativ.display = 'prompt'
    m.bereiteMitteilungenVor()
    await abwarten()
    expect(nativ.request).toHaveBeenCalledOnce()

    nativ.display = 'denied'
    m.bereiteMitteilungenVor()
    await abwarten()
    expect(nativ.request).toHaveBeenCalledOnce()
  })
})

describe('Erinnerung vor der Ankunft', () => {
  const ankunft = new Date(Date.now() + 20 * 60_000)

  it('fünf Minuten vorher, mit Bahnhof, Anschluss und Gleis', async () => {
    m.planeErinnerung({ ankunft, bahnhofName: 'Leipzig Hbf', gleisAb: '6', zugAbName: 'ICE 1007' })
    await abwarten()
    expect(nativ.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] })
    const geplant = (nativ.schedule.mock.calls[0] as unknown as [{ notifications: { body: string; schedule: { at: Date } }[] }])[0]
      .notifications[0]
    expect(geplant.body).toBe('In 5 Minuten kommst du in Leipzig Hbf an – ICE 1007 fährt von Gleis 6.')
    expect(geplant.schedule.at.getTime()).toBe(ankunft.getTime() - m.ERINNERUNG_VORLAUF_MS)
  })

  it('ist der Zeitpunkt vorbei, fällt nur die alte weg', async () => {
    m.planeErinnerung({ ankunft: new Date(Date.now() + 60_000), bahnhofName: 'Leipzig Hbf', gleisAb: '6' })
    await abwarten()
    expect(nativ.cancel).toHaveBeenCalledOnce()
    expect(nativ.schedule).not.toHaveBeenCalled()
  })

  it('ohne Zugname ein allgemeiner Satz', () => {
    expect(m.erinnerungsText({ ankunft, bahnhofName: 'Fulda', gleisAb: '3' })).toBe(
      'In 5 Minuten kommst du in Fulda an – dein Anschluss fährt von Gleis 3.',
    )
  })
})

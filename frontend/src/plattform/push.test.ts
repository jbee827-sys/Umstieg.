import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReiseAnmeldung } from '../api/mitteilungen'

const nativ = vi.hoisted(() => ({
  app: true,
  tour: false,
  erlaubnis: 'granted' as string,
  check: vi.fn(),
  request: vi.fn(),
  getToken: vi.fn(),
  listener: {} as Record<string, (e: unknown) => void>,
  addListener: vi.fn(),
  zugestellt: vi.fn(),
  raeume: vi.fn(),
  an: vi.fn(),
  ab: vi.fn(),
  test: vi.fn(),
  vergiss: vi.fn(),
}))

vi.mock('./istApp', () => ({ istApp: () => nativ.app }))
vi.mock('../einfuehrung/zustand', () => ({ vorfuehrungLaeuft: () => nativ.tour }))
vi.mock('./mitteilungen', () => ({ vergissErinnerung: nativ.vergiss }))
vi.mock('../api/mitteilungen', () => ({
  meldeReiseAn: nativ.an,
  meldeReiseAb: nativ.ab,
  schickeTestmitteilung: nativ.test,
}))
vi.mock('./firebase', () => ({
  FirebaseMessaging: {
    checkPermissions: nativ.check,
    requestPermissions: nativ.request,
    getToken: nativ.getToken,
    addListener: nativ.addListener,
    getDeliveredNotifications: nativ.zugestellt,
    removeAllDeliveredNotifications: nativ.raeume,
  },
}))

type Push = typeof import('./push')
let p: Push

const reise = (gleis = '14', mitAn = true): ReiseAnmeldung => ({
  ort: { pfad: 'bahnhof', eva: '8011160' },
  bahnhofName: 'Berlin Hbf',
  haltWort: 'Gleis',
  ...(mitAn ? { an: { name: 'ICE 1006', soll: '2026-11-26T14:52:00.000Z', gleis: '7', richtung: 'München' } } : {}),
  ab: { name: 'RE 3352', soll: '2026-11-26T15:05:00.000Z', gleis, richtung: 'Stralsund' },
  gehzeitSek: 240,
})

/** Bis alle angestossenen Versprechen durch sind (auch unter falscher Uhr). */
const abwarten = () =>
  Array.from({ length: 10 }).reduce<Promise<void>>((kette) => kette.then(() => undefined), Promise.resolve())

function sichtbar(ja: boolean) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (ja ? 'visible' : 'hidden') })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-11-26T14:00:00Z') })
  vi.clearAllMocks()
  nativ.app = true
  nativ.tour = false
  nativ.erlaubnis = 'granted'
  nativ.listener = {}
  nativ.check.mockImplementation(() => Promise.resolve({ receive: nativ.erlaubnis }))
  nativ.request.mockImplementation(() => Promise.resolve({ receive: 'granted' }))
  nativ.getToken.mockResolvedValue({ token: 'tok-1' })
  nativ.addListener.mockImplementation((name: string, f: (e: unknown) => void) => {
    nativ.listener[name] = f
    return Promise.resolve({ remove: vi.fn() })
  })
  nativ.an.mockResolvedValue('ok')
  nativ.ab.mockResolvedValue(undefined)
  nativ.test.mockResolvedValue(true)
  nativ.zugestellt.mockResolvedValue({ notifications: [] })
  nativ.raeume.mockResolvedValue(undefined)
  // Jede Pruefung mit frischem Modulzustand (Token, Drossel, aktiv). Die
  // Hoerer am gemeinsamen `document` merken, sonst antworteten die alten
  // Modulkopien mit.
  vi.resetModules()
  const echt = document.addEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation((typ: string, f: EventListenerOrEventListenerObject) => {
    hoerer.push([typ, f])
    echt(typ, f)
  })
  p = await import('./push')
})

const hoerer: [string, EventListenerOrEventListenerObject][] = []
afterEach(() => {
  for (const [typ, f] of hoerer.splice(0)) document.removeEventListener(typ, f)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('anmelden', () => {
  it('meldet die Reise mit dem Token an und ist danach aktiv', async () => {
    p.meldeAnWennNoetig(reise())
    await abwarten()
    expect(nativ.an).toHaveBeenCalledWith('tok-1', 'ios', reise())
    expect(p.pushAktiv()).toBe(true)
  })

  it('meldet dieselbe Reise innerhalb von 10 s nur einmal an', async () => {
    p.meldeAnWennNoetig(reise())
    await abwarten()
    p.meldeAnWennNoetig(reise())
    await abwarten()
    expect(nativ.an).toHaveBeenCalledTimes(1)

    // Eine geaenderte Reise innerhalb der 10 s wartet bis zum Ende der Drossel.
    p.meldeAnWennNoetig(reise('15'))
    await abwarten()
    expect(nativ.an).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(nativ.an).toHaveBeenCalledTimes(2)
    expect(nativ.an.mock.calls[1][2].ab.gleis).toBe('15')
  })

  it('meldet beim Zurueckkommen in den Vordergrund erneut an', async () => {
    p.meldeAnWennNoetig(reise())
    await abwarten()
    sichtbar(false)
    sichtbar(true)
    await abwarten()
    expect(nativ.an).toHaveBeenCalledTimes(2)
  })

  it('meldet bei einem neuen Token neu an', async () => {
    p.meldeAnWennNoetig(reise())
    await abwarten()
    nativ.listener.tokenReceived({ token: 'tok-2' })
    await abwarten()
    expect(nativ.an).toHaveBeenLastCalledWith('tok-2', 'ios', reise())
  })

  it('fragt nach der Erlaubnis, wenn sie noch offen ist, und bleibt ohne sie lokal', async () => {
    nativ.erlaubnis = 'prompt'
    nativ.request.mockResolvedValueOnce({ receive: 'denied' })
    p.meldeAnWennNoetig(reise())
    await abwarten()
    expect(nativ.request).toHaveBeenCalledTimes(1)
    expect(nativ.getToken).not.toHaveBeenCalled()
    expect(nativ.an).not.toHaveBeenCalled()
    expect(p.pushAktiv()).toBe(false)
  })

  it('bleibt bei lokalen Mitteilungen, wenn die Anmeldung abgelehnt wird', async () => {
    nativ.an.mockResolvedValue('abgelehnt')
    p.meldeAnWennNoetig(reise())
    await abwarten()
    expect(p.pushAktiv()).toBe(false)
    expect(nativ.vergiss).not.toHaveBeenCalled()
  })

  it('faellt zurueck, wenn eine erneute Anmeldung scheitert', async () => {
    p.meldeAnWennNoetig(reise())
    await abwarten()
    expect(p.pushAktiv()).toBe(true)
    nativ.an.mockResolvedValue('abgelehnt')
    sichtbar(true)
    await abwarten()
    expect(p.pushAktiv()).toBe(false)
  })

  it('tut im Browser und in der Einfuehrungstour nichts', async () => {
    nativ.app = false
    p.meldeAnWennNoetig(reise())
    await abwarten()
    nativ.app = true
    nativ.tour = true
    p.meldeAnWennNoetig(reise())
    await abwarten()
    expect(nativ.check).not.toHaveBeenCalled()
    expect(nativ.an).not.toHaveBeenCalled()
  })
})

describe('Erinnerung vom Server', () => {
  it('nimmt der lokalen Erinnerung den Platz, wenn die Wache die Ankunft kennt', async () => {
    p.meldeAnWennNoetig(reise())
    await abwarten()
    expect(p.erinnerungVomServer()).toBe(true)
    expect(nativ.vergiss).toHaveBeenCalled()
  })

  it('laesst die lokale Erinnerung stehen, wenn die Anmeldung keine Ankunft hat', async () => {
    p.meldeAnWennNoetig(reise('14', false))
    await abwarten()
    expect(p.pushAktiv()).toBe(true)
    expect(p.erinnerungVomServer()).toBe(false)
    expect(nativ.vergiss).not.toHaveBeenCalled()
  })

  it('sagt Bescheid, wenn sich der Stand aendert', async () => {
    const f = vi.fn()
    const weg = p.hoereAufPushStand(f)
    p.meldeAnWennNoetig(reise())
    await abwarten()
    expect(f).toHaveBeenCalledTimes(1)
    weg()
    await p.meldeAbUndVergiss()
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('abmelden', () => {
  it('meldet bei Reiseende ab', async () => {
    p.meldeAnWennNoetig(reise())
    await abwarten()
    await p.meldeAbUndVergiss()
    expect(nativ.ab).toHaveBeenCalledWith('tok-1')
    expect(p.pushAktiv()).toBe(false)
    // Danach meldet auch das Zurueckkommen nichts mehr an.
    sichtbar(true)
    await abwarten()
    expect(nativ.an).toHaveBeenCalledTimes(1)
  })

  it('meldet ab, wenn die Reise nicht mehr anmeldbar ist', async () => {
    p.meldeAnWennNoetig(reise())
    await abwarten()
    p.meldeAnWennNoetig(null)
    await abwarten()
    expect(nativ.ab).toHaveBeenCalledWith('tok-1')
    expect(p.pushAktiv()).toBe(false)
  })

  it('verwirft eine noch wartende Anmeldung', async () => {
    p.meldeAnWennNoetig(reise())
    await abwarten()
    p.meldeAnWennNoetig(reise('15'))
    await p.meldeAbUndVergiss()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(nativ.an).toHaveBeenCalledTimes(1)
  })
})

describe('Testmitteilung', () => {
  it('holt das Token und schickt die Testmitteilung', async () => {
    expect(await p.testmitteilung()).toBe(true)
    expect(nativ.test).toHaveBeenCalledWith('tok-1')
  })

  it('schickt ohne Erlaubnis nichts', async () => {
    nativ.erlaubnis = 'denied'
    expect(await p.testmitteilung()).toBe(false)
    expect(nativ.test).not.toHaveBeenCalled()
  })
})

const GLEIS_DATEN = {
  art: 'gleis-ab',
  zug: 'RE 3352',
  anzeige: 'RE 3',
  seite: 'ab',
  alt: '3',
  neu: '5',
  gleisAlt: '3',
  gleisNeu: '5',
  restMin: '9',
  gehMin: '4',
  status: 'erreichbar',
  stand: '16:01',
  aktion: 'weg',
  aktionGleis: '5',
  // was iOS sonst noch in `userInfo` legt
  aps: { alert: { title: 'Gleis 5 statt 3' } },
  'gcm.message_id': '1',
}

describe('Ereignis aus einer Mitteilung', () => {
  it('macht aus den Daten einer Gleis-Mitteilung ein Gleiswechsel-Ereignis der richtigen Seite', () => {
    expect(p.ereignisAusDaten(GLEIS_DATEN)).toEqual({
      typ: 'gleiswechsel',
      zug: 'RE 3352',
      seite: 'ab',
      alt: '3',
      neu: '5',
      zeitstempel: '2026-11-26T14:00:00.000Z',
    })
    expect(p.ereignisAusDaten({ ...GLEIS_DATEN, art: 'zeit-an', seite: 'an', alt: '15:52', neu: '15:58' })).toMatchObject({
      typ: 'verspaetung',
      seite: 'an',
      alt: '15:52',
      neu: '15:58',
    })
    const ausfall = p.ereignisAusDaten({ art: 'ausfall-ab', zug: 'f-ab', seite: 'ab' })
    expect(ausfall).toMatchObject({ typ: 'ausfall', zug: 'f-ab', seite: 'ab' })
    expect(ausfall).not.toHaveProperty('neu')
  })

  it('macht aus Rot, Erinnerung und Fremdem kein Ereignis', () => {
    expect(p.ereignisAusDaten({ ...GLEIS_DATEN, art: 'rot' })).toBeNull()
    expect(p.ereignisAusDaten({ ...GLEIS_DATEN, art: 'erinnerung' })).toBeNull()
    expect(p.ereignisAusDaten({ art: 'test' })).toBeNull()
    expect(p.ereignisAusDaten({ ...GLEIS_DATEN, zug: undefined })).toBeNull()
  })
})

describe('antippen', () => {
  it('meldet das Antippen mit Ereignis und Aktion', async () => {
    const f = vi.fn()
    p.hoereAufAntippen(f)
    await abwarten()
    nativ.listener.notificationActionPerformed({ actionId: 'weg', notification: { data: GLEIS_DATEN } })
    expect(f).toHaveBeenCalledWith({
      ereignis: expect.objectContaining({ typ: 'gleiswechsel', neu: '5' }),
      art: 'gleis-ab',
      aktion: 'weg',
      verbindung: false,
    })
    nativ.listener.notificationActionPerformed({ actionId: 'tap', notification: { data: { ...GLEIS_DATEN, art: 'rot', aktion: 'verbindung' } } })
    expect(f).toHaveBeenLastCalledWith({ ereignis: null, art: 'rot', verbindung: true })
  })

  it('uebergeht Wegwischen und fremde Mitteilungen', async () => {
    const f = vi.fn()
    p.hoereAufAntippen(f)
    await abwarten()
    nativ.listener.notificationActionPerformed({ actionId: 'dismiss', notification: { data: GLEIS_DATEN } })
    nativ.listener.notificationActionPerformed({ actionId: 'tap', notification: { data: { foo: 'bar' } } })
    expect(f).not.toHaveBeenCalled()
  })

  it('hoert im Browser nicht hin', async () => {
    nativ.app = false
    p.hoereAufAntippen(vi.fn())
    await abwarten()
    expect(nativ.addListener).not.toHaveBeenCalled()
  })
})

describe('zugestellte Mitteilungen', () => {
  it('liest das Mitteilungszentrum und raeumt es', async () => {
    nativ.zugestellt.mockResolvedValue({
      notifications: [{ data: GLEIS_DATEN }, { data: { ...GLEIS_DATEN, art: 'erinnerung' } }, { data: {} }],
    })
    const liste = await p.holeZugestellte()
    expect(liste).toHaveLength(2)
    expect(liste[0]).toMatchObject({ art: 'gleis-ab', ereignis: { typ: 'gleiswechsel' } })
    expect(liste[1]).toMatchObject({ art: 'erinnerung', ereignis: null })
    expect(nativ.raeume).toHaveBeenCalled()
  })

  it('liefert im Browser und bei einem Fehler nichts', async () => {
    nativ.zugestellt.mockRejectedValue(new Error('nicht da'))
    expect(await p.holeZugestellte()).toEqual([])
    nativ.app = false
    expect(await p.holeZugestellte()).toEqual([])
  })
})

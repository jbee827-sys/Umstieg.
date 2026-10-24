import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const plugins = vi.hoisted(() => ({
  app: false,
  notification: vi.fn(() => Promise.resolve()),
  impact: vi.fn(() => Promise.resolve()),
  keepAwake: vi.fn(() => Promise.resolve()),
  allowSleep: vi.fn(() => Promise.resolve()),
  setStyle: vi.fn(() => Promise.resolve()),
  hide: vi.fn(() => Promise.resolve()),
  open: vi.fn(() => Promise.resolve()),
}))

vi.mock('./istApp', () => ({ istApp: () => plugins.app }))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: plugins.notification, impact: plugins.impact },
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Warning: 'WARNING', Success: 'SUCCESS' },
}))
vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: { keepAwake: plugins.keepAwake, allowSleep: plugins.allowSleep },
}))
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: plugins.setStyle },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: plugins.hide } }))
vi.mock('@capacitor/browser', () => ({ Browser: { open: plugins.open } }))

const geraet = await import('./geraet')

beforeEach(() => {
  vi.clearAllMocks()
  plugins.app = false
})

afterEach(() => {
  delete document.documentElement.dataset.darstellung
})

describe('im Browser wie bisher', () => {
  it('ein Ereignis vibriert wie immer, ohne Plugin', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    geraet.meldeEreignisSpuerbar()
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200])
    expect(plugins.notification).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('Schrittwechsel, Ankunft, Wachhalten, Statusleiste, Start: nichts', () => {
    geraet.tippeSchrittwechsel()
    geraet.meldeAnkunftSpuerbar()
    geraet.halteBildschirmWach(true)
    geraet.passeStatusleisteAn()
    geraet.blendeStartbildschirmAus()
    for (const f of Object.values(plugins)) if (typeof f === 'function') expect(f).not.toHaveBeenCalled()
  })
})

describe('in der App', () => {
  beforeEach(() => {
    plugins.app = true
  })

  it('Ereignis als Warnung, Ankunft als Erfolg, Schritt als leichter Tipp', () => {
    geraet.meldeEreignisSpuerbar()
    geraet.meldeAnkunftSpuerbar()
    geraet.tippeSchrittwechsel()
    expect(plugins.notification).toHaveBeenNthCalledWith(1, { type: 'WARNING' })
    expect(plugins.notification).toHaveBeenNthCalledWith(2, { type: 'SUCCESS' })
    expect(plugins.impact).toHaveBeenCalledWith({ style: 'LIGHT' })
  })

  it('ein Fehler des Plugins stört nie', async () => {
    plugins.impact.mockReturnValueOnce(Promise.reject(new Error('kein Motor')))
    expect(() => geraet.tippeSchrittwechsel()).not.toThrow()
    await Promise.resolve()
  })

  it('der Bildschirm bleibt an und darf danach wieder aus', () => {
    geraet.halteBildschirmWach(true)
    geraet.halteBildschirmWach(false)
    expect(plugins.keepAwake).toHaveBeenCalledOnce()
    expect(plugins.allowSleep).toHaveBeenCalledOnce()
  })

  it('die Statusleiste folgt der gewählten Palette', () => {
    document.documentElement.dataset.darstellung = 'dunkel'
    geraet.passeStatusleisteAn()
    document.documentElement.dataset.darstellung = 'hell'
    geraet.passeStatusleisteAn()
    expect(plugins.setStyle.mock.calls).toEqual([[{ style: 'DARK' }], [{ style: 'LIGHT' }]])
  })

  it('fremde Links öffnen in Safari, eigene bleiben in der App', () => {
    geraet.oeffneExterneLinksImBrowser()
    document.body.innerHTML =
      '<a id="fremd" href="https://transitous.org/sources" target="_blank">Quellen</a>' +
      '<a id="eigen" href="/daten">Daten</a>'
    const fremd = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.getElementById('fremd')!.dispatchEvent(fremd)
    expect(fremd.defaultPrevented).toBe(true)
    expect(plugins.open).toHaveBeenCalledWith({ url: 'https://transitous.org/sources' })

    const eigen = new MouseEvent('click', { bubbles: true, cancelable: true })
    // Erst nach dem Hörer (der in der Capture-Phase sitzt): jsdom navigiert sonst.
    document.getElementById('eigen')!.addEventListener('click', (e) => e.preventDefault())
    document.getElementById('eigen')!.dispatchEvent(eigen)
    expect(plugins.open).toHaveBeenCalledOnce()
    document.body.innerHTML = ''
  })
})

describe('istExtern', () => {
  const herkunft = 'capacitor://localhost'
  it.each([
    ['https://github.com/jbee827-sys/Umstieg.', true],
    ['http://example.org', true],
    ['/impressum', false],
    ['capacitor://localhost/daten', false],
    ['mailto:kontakt@umstieg.online', false],
    ['tel:+49', false],
  ])('%s → %s', (href, erwartet) => {
    expect(geraet.istExtern(href, herkunft)).toBe(erwartet)
  })
})

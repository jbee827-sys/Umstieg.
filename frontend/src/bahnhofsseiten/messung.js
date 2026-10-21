// Reichweitenmessung auf den vorgerenderten Seiten (/bahnhof/..., /bahnhoefe).
//
// Dasselbe, was `<Analytics beforeSend={ohneAbfrage} />` in der App tut
// (main.tsx, analytik/ereignis.ts) - nur ohne React: Warteschlange anlegen,
// die Abfragezeichenkette vor dem Senden abschneiden, dann das Skript von
// Vercel laden. Als eigene Datei unter /assets/, weil die CSP kein
// Inline-Skript erlaubt (script-src 'self'). Was die Messung sieht, nennt
// die Datenschutzerklaerung.
;(() => {
  window.va =
    window.va ||
    function (...argumente) {
      ;(window.vaq = window.vaq || []).push(argumente)
    }
  window.va('beforeSend', (ereignis) => {
    try {
      const adresse = new URL(ereignis.url)
      adresse.search = ''
      return { ...ereignis, url: adresse.toString() }
    } catch {
      return null
    }
  })
  const skript = document.createElement('script')
  skript.src = '/_vercel/insights/script.js'
  skript.defer = true
  skript.dataset.sdkn = '@vercel/analytics'
  document.head.appendChild(skript)
})()

// Reiter Zuege / S-Bahn / U-Bahn auf den vorgerenderten Bahnhofsseiten.
//
// Das HTML zeigt ohne JavaScript den ersten Reiter; die anderen Felder stehen
// mit `hidden` im Dokument (Suche und KI lesen sie trotzdem). Dieses Skript
// schaltet nur um: Klick, Pfeiltasten (rund herum), Pos1/Ende - das
// WAI-ARIA-Muster fuer Reiter. Als eigene Datei unter /assets/, weil die CSP
// kein Inline-Skript erlaubt (script-src 'self').
;(() => {
  function waehle(leiste, reiter, fokus) {
    for (const t of leiste.querySelectorAll('[role="tab"]')) {
      const aktiv = t === reiter
      t.setAttribute('aria-selected', String(aktiv))
      t.tabIndex = aktiv ? 0 : -1
      const feld = document.getElementById(t.getAttribute('aria-controls'))
      if (feld) feld.hidden = !aktiv
    }
    if (fokus) reiter.focus()
  }

  for (const leiste of document.querySelectorAll('[role="tablist"]')) {
    const reiter = [...leiste.querySelectorAll('[role="tab"]')]
    const reiterVon = (e) => {
      const t = e.target instanceof Element ? e.target.closest('[role="tab"]') : null
      return t ? reiter.indexOf(t) : -1
    }
    leiste.addEventListener('click', (e) => {
      const i = reiterVon(e)
      if (i >= 0) waehle(leiste, reiter[i], false)
    })
    leiste.addEventListener('keydown', (e) => {
      const i = reiterVon(e)
      if (i < 0) return
      const n = reiter.length
      const ziel =
        e.key === 'ArrowRight' ? (i + 1) % n
        : e.key === 'ArrowLeft' ? (i - 1 + n) % n
        : e.key === 'Home' ? 0
        : e.key === 'End' ? n - 1
        : -1
      if (ziel < 0) return
      e.preventDefault()
      waehle(leiste, reiter[ziel], true)
    })
  }
})()

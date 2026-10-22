import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import { AppRahmen } from './AppRahmen'
import { ohneAbfrage } from './analytik/ereignis'
import { ladeDarstellung, wendeDarstellungAn } from './einstellungen/darstellung'
import { leiteRauteUm } from './navigation/rechtsseiten'
import { uebernimmBahnhofAusAdresse } from './sitzung/vorbelegung'

// Vor dem ersten Zeichnen: Wer Dunkel gewaehlt hat, soll nicht erst einen
// weissen Bildschirm sehen.
wendeDarstellungAn(ladeDarstellung())
// Ebenfalls vorher: geteilte alte Links (#impressum) auf die echte Adresse,
// bevor App die Adresse liest - und ein Bahnhof aus dem Link einer
// Bahnhofsseite in die Eingabe (/eingabe?bahnhof=…).
leiteRauteUm()
uebernimmBahnhofAusAdresse()

// Die Reichweitenmessung haengt hier und nicht in App.tsx: Sie gehoert nicht
// zur Anwendung, sondern zur Auslieferung, und die Komponententests sollen
// sie nicht mitrendern.
//
// `beforeSend` ist keine Kosmetik. Es ist die Stelle, an der zugesichert
// wird, was die Messung sehen darf - siehe analytik/ereignis.ts. Die
// Datenschutzerklaerung nennt genau das, und Datenschutz.test.tsx haelt sie
// darauf fest.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRahmen />
    <Analytics beforeSend={ohneAbfrage} />
  </StrictMode>,
)

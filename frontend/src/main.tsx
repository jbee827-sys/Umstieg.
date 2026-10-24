import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import { AppRahmen } from './AppRahmen'
import { ohneAbfrage } from './analytik/ereignis'
import { starteVorfuehrungAusAdresse } from './einfuehrung/vorfuehrstart'
import { ladeDarstellung, wendeDarstellungAn } from './einstellungen/darstellung'
import { leiteRauteUm } from './navigation/rechtsseiten'
import {
  blendeStartbildschirmAus,
  folgeDarstellung,
  folgeSchriftgroesse,
  oeffneExterneLinksImBrowser,
} from './plattform/geraet'
import { istApp, markiereApp } from './plattform/istApp'
import { uebernimmBahnhofAusAdresse } from './sitzung/vorbelegung'

// Vor dem ersten Zeichnen: Wer Dunkel gewaehlt hat, soll nicht erst einen
// weissen Bildschirm sehen.
wendeDarstellungAn(ladeDarstellung())
markiereApp()
// Nur in der App: Statusleiste passend zur Palette, Textgroesse des Geraets,
// fremde Links in Safari.
folgeDarstellung()
folgeSchriftgroesse()
oeffneExterneLinksImBrowser()
// Ebenfalls vorher: geteilte alte Links (#impressum) auf die echte Adresse,
// bevor App die Adresse liest - und ein Bahnhof aus dem Link einer
// Bahnhofsseite in die Eingabe (/eingabe?bahnhof=…).
leiteRauteUm()
uebernimmBahnhofAusAdresse()
// Bildschirmfotos des Cloud-Builds: /vorfuehrung/… (nur App und Entwicklung).
starteVorfuehrungAusAdresse()

// Die Reichweitenmessung haengt hier und nicht in App.tsx: Sie gehoert nicht
// zur Anwendung, sondern zur Auslieferung, und die Komponententests sollen
// sie nicht mitrendern.
//
// `beforeSend` ist keine Kosmetik. Es ist die Stelle, an der zugesichert
// wird, was die Messung sehen darf - siehe analytik/ereignis.ts. Die
// Datenschutzerklaerung nennt genau das, und Datenschutz.test.tsx haelt sie
// darauf fest.
//
// In der App misst sie (noch) nicht: Dort laedt kein Vercel das Skript, und
// Apple verlangt vorher eine Einwilligung (Richtlinie 5.1.1, Plan App Store
// Paket 4).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRahmen />
    {!istApp() && <Analytics beforeSend={ohneAbfrage} />}
  </StrictMode>,
)

// Der Startbildschirm der App deckt den Augenblick ab, bis React gezeichnet
// hat - danach weg, sonst saehe man ihn bis zu seiner Hoechstdauer.
requestAnimationFrame(() => blendeStartbildschirmAus())

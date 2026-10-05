import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { ohneAbfrage } from './analytik/ereignis'
import { ladeDarstellung, wendeDarstellungAn } from './einstellungen/darstellung'

// Vor dem ersten Zeichnen: Wer Dunkel gewaehlt hat, soll nicht erst einen
// weissen Bildschirm sehen.
wendeDarstellungAn(ladeDarstellung())

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
    <App />
    <Analytics beforeSend={ohneAbfrage} />
  </StrictMode>,
)

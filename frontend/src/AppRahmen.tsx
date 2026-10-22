import { useEffect, useState } from 'react'
import App from './App.tsx'
import { meldeRahmenAn } from './einfuehrung/neuaufbau'

/**
 * Hält die App unter einem Schlüssel. Erhöht die Einführungstour ihn, baut
 * React die App neu auf, und sie liest Adresse und Speicher wie beim Laden
 * der Seite (einfuehrung/neuaufbau.ts).
 */
export function AppRahmen() {
  const [durchlauf, setDurchlauf] = useState(0)
  useEffect(() => meldeRahmenAn(() => setDurchlauf((n) => n + 1)), [])
  return <App key={durchlauf} />
}

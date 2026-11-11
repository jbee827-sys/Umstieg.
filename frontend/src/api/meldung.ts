import { apiUrl } from './basis'

/**
 * „Etwas melden": schickt Text und - nur wenn angegeben - die Adresse an
 * `POST /api/meldung`. `true` nur, wenn das Backend die Mail losgeworden ist
 * (204); alles andere ist fuer die Ansicht derselbe Fehlschlag.
 *
 * Bewusst `fetch` statt `holeApi`: Das kennt nur GET und den Vorschalter der
 * Einfuehrungstour, und eine Vorfuehrung darf keine Mail ausloesen.
 */
export async function sendeMeldung(text: string, email: string): Promise<boolean> {
  const adresse = email.trim()
  try {
    const antwort = await fetch(apiUrl('/api/meldung'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(adresse ? { text, email: adresse } : { text }),
    })
    return antwort.status === 204
  } catch {
    return false
  }
}

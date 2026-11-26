import { registerPlugin } from '@capacitor/core'
import type { FirebaseMessagingPlugin } from '@capacitor-firebase/messaging'

/**
 * Das native Plugin `@capacitor-firebase/messaging` - selbst registriert statt
 * ueber das Paket.
 *
 * Grund: Der Einstieg des Pakets bringt eine Web-Fassung mit, die
 * `firebase/messaging` laedt (das Firebase-JS-SDK). Das braucht nur die
 * Website, und die nutzt keine Server-Mitteilungen; ohne das Paket scheitern
 * Vite-Bau und Tests am fehlenden Modul. Mehr als diesen `registerPlugin`-
 * Aufruf tut der JS-Teil des Pakets in der App nicht - die Arbeit macht der
 * Swift-Teil, den `cap sync` einbindet. Vom Paket bleiben hier nur die Typen.
 *
 * Nur in der App aufrufen (`istApp()`): Im Browser gibt es keine Fassung,
 * jeder Aufruf scheitert dort mit „not implemented“.
 */
export const FirebaseMessaging = registerPlugin<FirebaseMessagingPlugin>('FirebaseMessaging')

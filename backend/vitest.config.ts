import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Die Tests laufen in UTC, weil die Produktion in UTC laeuft (Fly-Container
    // ohne TZ). Ohne das sind Zeitzonenfehler auf einem deutschen
    // Entwicklungsrechner unsichtbar: Date#getHours() liefert dort zufaellig
    // die richtige Stunde, im Container zwei zu wenig. Genau so ist der Fehler
    // entstanden, dass die Zugauswahl nur abgefahrene Zuege zeigte.
    env: { TZ: 'UTC' },
  },
});

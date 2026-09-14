import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Ein Bau fuer den ABZUG, nicht fuer die Auslieferung.
 *
 * Unterschied zur Produktion: alles in EINE Datei. Kein Code-Splitting, kein
 * getrenntes CSS, keine nachgeladenen Bausteine - der Abzug muss ohne Server
 * laufen, und ein Artefakt kann keine zweite Datei nachladen.
 *
 * Das kostet die Lazy-Grenze um MapLibre: In der Auslieferung wird die Karte
 * erst geholt, wenn jemand sie aufklappt. Hier liegt sie im Bundle. Fuer den
 * Abzug ist das richtig, fuer die Produktion waere es falsch - deshalb eine
 * eigene Datei statt eines Schalters in `vite.config.ts`.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-abzug',
    cssCodeSplit: false,
    assetsInlineLimit: 100 * 1024 * 1024,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
})

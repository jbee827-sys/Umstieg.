import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Umstieg. als iOS-App (Plan App Store, Paket 2).
 *
 * Die Web-App liegt IM App-Paket (`dist-app`, gebaut mit `npm run build:app`)
 * und wird nicht von Vercel geladen - Richtlinie 2.5.2 verlangt, dass der
 * ausgefuehrte Code mit der App geprueft wird. Gesprochen wird nur mit dem
 * Backend auf Fly (CSP in index.html, siehe src/plattform/appHtml.ts).
 */
const config: CapacitorConfig = {
  appId: 'online.umstieg.app',
  appName: 'Umstieg.',
  webDir: 'dist-app',
  ios: {
    // Die Seite reicht unter Statusleiste und Home-Balken; die Abstaende
    // setzt das CSS mit env(safe-area-inset-*), nicht die WebView.
    contentInset: 'never',
    // Kein Vorschaufenster beim langen Druck auf einen Link.
    allowsLinkPreview: false,
    // Kein backgroundColor: Ohne Angabe nimmt die WebView die Systemfarbe und
    // ist nachts dunkel, bevor die Seite steht - kein weisser Blitz.
  },
  plugins: {
    // Der Startbildschirm (einfarbig, hell/dunkel - scripts/app-bilder.ts)
    // bleibt, bis React gezeichnet hat: main.tsx blendet ihn dann aus. Die
    // 3 s sind nur die Obergrenze, falls das nie geschieht.
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      showSpinner: false,
    },
  },
}

export default config

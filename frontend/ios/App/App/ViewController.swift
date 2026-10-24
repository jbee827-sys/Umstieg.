import UIKit
import Capacitor

/// Die WebView der App (Plan App Store, Paket 8).
///
/// SceneDelegate.swift (und Main.storyboard) setzen diese Klasse statt
/// CAPBridgeViewController ein, damit hier eingreifen kann, was Capacitor
/// nicht als Einstellung kennt.
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Eigene Plugins der App liegen im App-Ziel, nicht in einem Paket -
        // Capacitor findet sie nur, wenn sie hier angemeldet werden.
        bridge?.registerPluginInstance(UebergabePlugin())
        // Zurueck-Wischgeste vom linken Rand: Die Bildschirme der App sind
        // Eintraege im Verlauf (navigation/adressen.ts), die Geste geht also
        // genau dorthin zurueck, wo die Leiste auch hinfuehrt. Die eigene
        // Seitenanimation tritt dabei zurueck (hasUAVisualTransition, App.tsx).
        webView?.allowsBackForwardNavigationGestures = true
    }
}

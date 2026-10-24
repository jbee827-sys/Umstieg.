import UIKit
import Capacitor

/// Die WebView der App (Plan App Store, Paket 8).
///
/// Main.storyboard nennt diese Klasse statt CAPBridgeViewController, damit
/// hier eingreifen kann, was Capacitor nicht als Einstellung kennt.
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Zurueck-Wischgeste vom linken Rand: Die Bildschirme der App sind
        // Eintraege im Verlauf (navigation/adressen.ts), die Geste geht also
        // genau dorthin zurueck, wo die Leiste auch hinfuehrt. Die eigene
        // Seitenanimation tritt dabei zurueck (hasUAVisualTransition, App.tsx).
        webView?.allowsBackForwardNavigationGestures = true
    }
}

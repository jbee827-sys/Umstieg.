import Capacitor
import Foundation

/// Reicht einen geteilten Text an die Web-App weiter (Plan App Store, Paket 7).
///
/// Aufgerufen von frontend/src/plattform/uebergabe.ts beim Start und jedes
/// Mal, wenn die App wieder sichtbar wird. Registriert in ViewController.swift.
@objc(UebergabePlugin)
public class UebergabePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "UebergabePlugin"
    public let jsName = "Uebergabe"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "hole", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "zustand", returnType: CAPPluginReturnPromise)
    ]

    @objc func hole(_ call: CAPPluginCall) {
        if let text = UebergabeSpeicher.nimm() {
            call.resolve(["text": text])
        } else {
            call.resolve([:])
        }
    }

    /// Diagnose (16.11.2026): der Stand des gemeinsamen Speichers, ohne ihn
    /// zu veraendern - angezeigt unter „Einstellungen“.
    @objc func zustand(_ call: CAPPluginCall) {
        call.resolve(UebergabeSpeicher.zustand())
    }
}

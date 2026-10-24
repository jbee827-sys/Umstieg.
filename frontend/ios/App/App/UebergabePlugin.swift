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
        CAPPluginMethod(name: "hole", returnType: CAPPluginReturnPromise)
    ]

    @objc func hole(_ call: CAPPluginCall) {
        if let text = UebergabeSpeicher.nimm() {
            call.resolve(["text": text])
        } else {
            call.resolve([:])
        }
    }
}

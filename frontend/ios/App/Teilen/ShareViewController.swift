import UIKit
import UniformTypeIdentifiers

/// „An Umstieg senden“ im Teilen-Menue (Plan App Store, Paket 7).
///
/// Nimmt den Text einer geteilten Verbindung - etwa aus dem DB Navigator -
/// und legt ihn in den gemeinsamen Speicher (UebergabeSpeicher.swift). Beim
/// naechsten Oeffnen zeigt Umstieg ihn im bekannten Dialog „Reise
/// importieren“; ausgewertet wird dort, mit reise/reisetext.ts - hier nicht.
///
/// Die App wird bewusst NICHT von hier aus geoeffnet: Teilen-Erweiterungen
/// duerfen das nicht, und die bekannten Umwege ueber die Responder-Kette sind
/// unzuverlaessig und ein Grund fuer Ablehnungen. Ein Satz sagt stattdessen,
/// was als Naechstes zu tun ist.
class ShareViewController: UIViewController {
    private let titel = UILabel()
    private let text = UILabel()
    private let fertig = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        baueOberflaeche()
        zeige(titel: "Wird übergeben …", text: "")
        sammleText { [weak self] geteilt in
            DispatchQueue.main.async { self?.uebergib(geteilt) }
        }
    }

    private func uebergib(_ geteilt: String) {
        let ohneRand = geteilt.trimmingCharacters(in: .whitespacesAndNewlines)
        if ohneRand.isEmpty {
            zeige(
                titel: "Nichts zum Übergeben",
                text: "Teile die Verbindung bitte als Text – im DB Navigator über „Verbindung teilen“."
            )
        } else if UebergabeSpeicher.lege(ohneRand) {
            // Die Zeichenzahl ist Diagnose (16.11.2026): Sie zeigt, dass
            // wirklich Text ankam - und in Umstieg steht dieselbe Zahl.
            zeige(
                titel: "An Umstieg übergeben",
                text: "Öffne jetzt Umstieg – von hier aus geht das nicht von selbst. Dort wartet die Verbindung unter „Reise importieren“; du wählst nur noch den Umstieg aus.\n\n\(ohneRand.count) Zeichen übergeben."
            )
        } else if !UebergabeSpeicher.gruppeErreichbar {
            zeige(
                titel: "Das hat nicht geklappt",
                text: "Der gemeinsame Speicher mit Umstieg ist nicht erreichbar (App Group fehlt). Kopiere den Text und füge ihn in Umstieg unter „Reise importieren“ ein."
            )
        } else {
            zeige(
                titel: "Das hat nicht geklappt",
                text: "Kopiere den Text und füge ihn in Umstieg unter „Reise importieren“ ein."
            )
        }
    }

    /// Alles, was als Text oder Link geteilt wurde, in der gelieferten Reihenfolge.
    private func sammleText(_ fertig: @escaping (String) -> Void) {
        let elemente = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        var teile: [Int: String] = [:]
        let gruppe = DispatchGroup()
        let schutz = NSLock()
        var nummer = 0

        func merke(_ index: Int, _ wert: String) {
            schutz.lock()
            teile[index] = wert
            schutz.unlock()
        }

        for element in elemente {
            if let beschreibung = element.attributedContentText?.string, !beschreibung.isEmpty {
                merke(nummer, beschreibung)
                nummer += 1
            }
            for anbieter in element.attachments ?? [] {
                let index = nummer
                nummer += 1
                if anbieter.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    gruppe.enter()
                    anbieter.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { wert, _ in
                        if let zeichen = wert as? String { merke(index, zeichen) }
                        gruppe.leave()
                    }
                } else if anbieter.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    gruppe.enter()
                    anbieter.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { wert, _ in
                        if let adresse = wert as? URL { merke(index, adresse.absoluteString) }
                        gruppe.leave()
                    }
                }
            }
        }

        gruppe.notify(queue: .global()) {
            // Derselbe Text kommt manchmal doppelt - als Beschreibung und als Anhang.
            var gesehen = Set<String>()
            let text = teile.keys.sorted()
                .compactMap { teile[$0] }
                .filter { gesehen.insert($0).inserted }
                .joined(separator: "\n")
            fertig(text)
        }
    }

    private func baueOberflaeche() {
        view.backgroundColor = .systemBackground

        titel.font = .preferredFont(forTextStyle: .title2)
        titel.adjustsFontForContentSizeCategory = true
        titel.numberOfLines = 0
        text.font = .preferredFont(forTextStyle: .body)
        text.adjustsFontForContentSizeCategory = true
        text.numberOfLines = 0
        text.textColor = .secondaryLabel

        var aussehen = UIButton.Configuration.filled()
        aussehen.title = "Fertig"
        aussehen.baseBackgroundColor = UIColor(red: 0xEC / 255, green: 0x30 / 255, blue: 0x13 / 255, alpha: 1)
        aussehen.cornerStyle = .capsule
        fertig.configuration = aussehen
        fertig.addAction(UIAction { [weak self] _ in self?.schliesse() }, for: .touchUpInside)

        let stapel = UIStackView(arrangedSubviews: [titel, text, fertig])
        stapel.axis = .vertical
        stapel.spacing = 16
        stapel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stapel)
        NSLayoutConstraint.activate([
            stapel.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stapel.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stapel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 32),
            fertig.heightAnchor.constraint(greaterThanOrEqualToConstant: 50),
        ])
    }

    private func zeige(titel neuerTitel: String, text neuerText: String) {
        titel.text = neuerTitel
        text.text = neuerText
        text.isHidden = neuerText.isEmpty
        fertig.isHidden = neuerText.isEmpty
    }

    private func schliesse() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}

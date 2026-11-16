import Foundation

/// Der gemeinsame Speicher von App und Teilen-Erweiterung (Plan App Store,
/// Paket 7). Beide Ziele uebersetzen diese Datei mit, damit Gruppe und
/// Schluessel nur an einer Stelle stehen.
///
/// Die Erweiterung legt den geteilten Text hier ab, die App holt ihn beim
/// naechsten Oeffnen ab und loescht ihn dabei (UebergabePlugin). Es liegt
/// immer hoechstens ein Text darin - der zuletzt geteilte.
enum UebergabeSpeicher {
    static let gruppe = "group.online.umstieg.app"
    private static let schluessel = "geteilterText"
    private static let zeitpunkt = "geteiltAm"
    /// Aelter als ein Tag: niemand wartet mehr darauf.
    private static let haltbarkeit: TimeInterval = 24 * 60 * 60

    // Diagnose (16.11.2026): Zeitpunkte und Zaehler, nie der Text selbst. Sie
    // bleiben nach dem Abholen stehen, damit sich ablesen laesst, welche
    // Seite zuletzt was getan hat.
    private static let abgelegtAm = "diagnoseAbgelegtAm"
    private static let abgelegtZahl = "diagnoseAbgelegtZahl"
    private static let abgeholtAm = "diagnoseAbgeholtAm"
    private static let abgeholtZahl = "diagnoseAbgeholtZahl"

    /// Ob dieses Ziel die App Group wirklich hat.
    ///
    /// `UserDefaults(suiteName:)` liefert auch OHNE die Berechtigung ein
    /// Objekt - es schreibt dann in den eigenen Speicher des Ziels, und die
    /// andere Seite sieht nichts. Bis zum 16.11.2026 meldete die Erweiterung
    /// deshalb „An Umstieg uebergeben“, ohne dass es zu pruefen war. Der
    /// Ordner der Gruppe ist nur mit der Berechtigung da.
    static var gruppeErreichbar: Bool {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: gruppe) != nil
    }

    private static var speicher: UserDefaults? {
        gruppeErreichbar ? UserDefaults(suiteName: gruppe) : nil
    }

    static func lege(_ text: String) -> Bool {
        guard let speicher = speicher else { return false }
        let jetzt = Date().timeIntervalSince1970
        speicher.set(text, forKey: schluessel)
        speicher.set(jetzt, forKey: zeitpunkt)
        speicher.set(jetzt, forKey: abgelegtAm)
        speicher.set(speicher.integer(forKey: abgelegtZahl) + 1, forKey: abgelegtZahl)
        return speicher.string(forKey: schluessel) == text
    }

    /// Holt den Text und loescht ihn - ein geteilter Text wird genau einmal uebergeben.
    ///
    /// Geloescht wird nur, was auch gelesen wurde. Bis zum 16.11.2026 loeschte
    /// JEDER Aufruf, auch einer, der nichts fand: Sah die App den Text der
    /// Erweiterung einen Augenblick lang noch nicht, war er danach weg.
    static func nimm() -> String? {
        guard let speicher = speicher else { return nil }
        let am = speicher.double(forKey: zeitpunkt)
        guard am > 0 else { return nil }
        defer {
            speicher.removeObject(forKey: schluessel)
            speicher.removeObject(forKey: zeitpunkt)
        }
        let jetzt = Date().timeIntervalSince1970
        guard jetzt - am < haltbarkeit else { return nil }
        guard let text = speicher.string(forKey: schluessel) else { return nil }
        speicher.set(jetzt, forKey: abgeholtAm)
        speicher.set(speicher.integer(forKey: abgeholtZahl) + 1, forKey: abgeholtZahl)
        return text
    }

    /// Der Stand des Speichers fuer die Diagnose in den Einstellungen - ohne
    /// etwas zu veraendern und ohne den Text.
    static func zustand() -> [String: Any] {
        var stand: [String: Any] = ["gruppe": gruppeErreichbar]
        guard let speicher = speicher else { return stand }
        let jetzt = Date().timeIntervalSince1970
        let am = speicher.double(forKey: zeitpunkt)
        let zeichen = speicher.string(forKey: schluessel)?.count ?? 0
        stand["wartet"] = am > 0 && zeichen > 0
        stand["zeichen"] = zeichen
        if am > 0 { stand["wartetSeitSek"] = Int(jetzt - am) }
        let abgelegt = speicher.double(forKey: abgelegtAm)
        if abgelegt > 0 { stand["abgelegtVorSek"] = Int(jetzt - abgelegt) }
        stand["abgelegtZahl"] = speicher.integer(forKey: abgelegtZahl)
        let abgeholt = speicher.double(forKey: abgeholtAm)
        if abgeholt > 0 { stand["abgeholtVorSek"] = Int(jetzt - abgeholt) }
        stand["abgeholtZahl"] = speicher.integer(forKey: abgeholtZahl)
        return stand
    }
}

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

    private static var speicher: UserDefaults? { UserDefaults(suiteName: gruppe) }

    static func lege(_ text: String) -> Bool {
        guard let speicher = speicher else { return false }
        speicher.set(text, forKey: schluessel)
        speicher.set(Date().timeIntervalSince1970, forKey: zeitpunkt)
        return true
    }

    /// Holt den Text und loescht ihn - ein geteilter Text wird genau einmal uebergeben.
    static func nimm() -> String? {
        guard let speicher = speicher else { return nil }
        defer {
            speicher.removeObject(forKey: schluessel)
            speicher.removeObject(forKey: zeitpunkt)
        }
        let am = speicher.double(forKey: zeitpunkt)
        guard am > 0, Date().timeIntervalSince1970 - am < haltbarkeit else { return nil }
        return speicher.string(forKey: schluessel)
    }
}

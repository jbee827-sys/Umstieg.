import CoreText
import UIKit
import UserNotifications
import UserNotificationsUI

/// Aufgeklappte Mitteilung (Konzept Mitteilungen 4a, Entwurf
/// `11-mitteilungen-entwuerfe.html`, Farben aus `design/DESIGN.md`).
///
/// Alles kommt aus den `data` der Mitteilung (`mitteilungsDaten` im Backend):
/// `art, zug, anzeige, seite, alt, neu, restMin, gehMin, status, stand,
/// gleisAlt, gleisNeu, aktion, aktionGleis`. Die Erweiterung rechnet nichts
/// selbst und fragt kein Netz - sie zeigt den Stand, den der Server beim
/// Versand hatte, und sagt mit „Stand hh:mm“, wie alt er ist.
final class MitteilungViewController: UIViewController, UNNotificationContentExtension {

    // MARK: Farben (hell / dunkel nach System)

    private static func farbe(_ hell: UInt32, _ dunkel: UInt32) -> UIColor {
        UIColor(dynamicProvider: { merkmale in
            merkmale.userInterfaceStyle == .dark ? MitteilungViewController.rgb(dunkel) : MitteilungViewController.rgb(hell)
        })
    }

    private static func rgb(_ wert: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((wert >> 16) & 0xff) / 255,
            green: CGFloat((wert >> 8) & 0xff) / 255,
            blue: CGFloat(wert & 0xff) / 255,
            alpha: 1
        )
    }

    private let grund = MitteilungViewController.farbe(0xffffff, 0x171615)       // Reinweiss / Nachtgrund
    private let schrift = MitteilungViewController.farbe(0x201e1d, 0xf3f2f2)     // Tintenschwarz / Lichtschrift
    private let nebengrau = MitteilungViewController.farbe(0x605d5d, 0xb4b0ae)   // Nebelgrau / Daemmergrau
    private let linie = MitteilungViewController.farbe(0xd7d3d3, 0x454240)       // Linienstrich / Nachtfeld
    private let gruen = MitteilungViewController.farbe(0x0f7a4f, 0x3cc98a)       // Bahngruen / Nachtgruen
    private let rot = MitteilungViewController.farbe(0xec3013, 0xff5233)         // Signalrot / Nachtrot
    private let gelb = MitteilungViewController.farbe(0xffd400, 0xffd400)        // Warngelb

    // MARK: Schrift

    /// Archivo ist eine variable Schrift (Achse `wght` 100-900). Fehlt sie,
    /// nimmt die Ansicht die Systemschrift im selben Gewicht.
    private func archivo(_ groesse: CGFloat, _ gewicht: CGFloat) -> UIFont {
        guard let basis = UIFont(name: "ArchivoSemiBold-Regular", size: groesse) else {
            let system: UIFont.Weight = gewicht >= 800 ? .heavy : gewicht >= 700 ? .bold : gewicht >= 500 ? .medium : .regular
            return UIFont.systemFont(ofSize: groesse, weight: system)
        }
        let wght = 0x7767_6874 // 'wght'
        let variation = UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
        let deskriptor = basis.fontDescriptor.addingAttributes([variation: [wght: gewicht]])
        return UIFont(descriptor: deskriptor, size: groesse)
    }

    // MARK: Ansicht

    private let streifen = UIView()
    private let stapel = UIStackView()
    private let titel = UILabel()
    private let text = UILabel()
    private let gleisZeile = UIStackView()
    private let gleisAlt = UILabel()
    private let pfeil = UILabel()
    private let gleisNeu = UILabel()
    private let werteZeile = UIStackView()
    private let statusZeile = UIStackView()
    private let punkt = StatusPunkt()
    private let statusText = UILabel()
    private let standText = UILabel()
    private var streifenHoehe: NSLayoutConstraint?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = grund

        streifen.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(streifen)
        let hoehe = streifen.heightAnchor.constraint(equalToConstant: 0)
        streifenHoehe = hoehe
        NSLayoutConstraint.activate([
            streifen.topAnchor.constraint(equalTo: view.topAnchor),
            streifen.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            streifen.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hoehe,
        ])

        stapel.axis = .vertical
        stapel.spacing = 12
        stapel.alignment = .fill
        stapel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stapel)
        NSLayoutConstraint.activate([
            stapel.topAnchor.constraint(equalTo: streifen.bottomAnchor, constant: 16),
            stapel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            stapel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            stapel.bottomAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor, constant: -16),
        ])

        for label in [titel, text, gleisAlt, pfeil, gleisNeu, statusText, standText] {
            label.adjustsFontForContentSizeCategory = false
        }
        titel.font = archivo(26, 700)
        titel.textColor = schrift
        titel.numberOfLines = 0
        text.font = archivo(18, 400)
        text.textColor = schrift
        text.numberOfLines = 0

        gleisZeile.axis = .horizontal
        gleisZeile.alignment = .lastBaseline
        gleisZeile.spacing = 12
        gleisAlt.font = archivo(32, 700)
        gleisAlt.textColor = nebengrau
        pfeil.font = archivo(32, 700)
        pfeil.textColor = nebengrau
        pfeil.text = "→"
        gleisNeu.font = archivo(56, 800)
        gleisNeu.textColor = schrift
        for teil in [gleisAlt, pfeil, gleisNeu] { gleisZeile.addArrangedSubview(teil) }
        gleisZeile.addArrangedSubview(UIView())

        werteZeile.axis = .horizontal
        werteZeile.alignment = .fill
        werteZeile.spacing = 16

        statusZeile.axis = .horizontal
        statusZeile.alignment = .center
        statusZeile.spacing = 8
        punkt.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            punkt.widthAnchor.constraint(equalToConstant: 12),
            punkt.heightAnchor.constraint(equalToConstant: 12),
        ])
        statusText.font = archivo(15, 700)
        statusText.textColor = schrift
        standText.font = archivo(15, 500)
        standText.textColor = nebengrau
        standText.textAlignment = .right
        let luecke = UIView()
        luecke.setContentHuggingPriority(.defaultLow, for: .horizontal)
        for teil in [punkt, statusText, luecke, standText] { statusZeile.addArrangedSubview(teil) }

        for teil in [titel, text, gleisZeile, werteZeile, statusZeile] { stapel.addArrangedSubview(teil) }
    }

    func didReceive(_ notification: UNNotification) {
        let inhalt = notification.request.content
        let daten = inhalt.userInfo
        func wert(_ schluessel: String) -> String? {
            guard let s = daten[schluessel] as? String, !s.isEmpty else { return nil }
            return s
        }

        titel.text = inhalt.title
        text.text = inhalt.body

        // Gleiswechsel: altes Gleis durchgestrichen, das neue gross.
        if let alt = wert("gleisAlt"), let neu = wert("gleisNeu") {
            gleisAlt.attributedText = NSAttributedString(
                string: alt,
                attributes: [.strikethroughStyle: NSUnderlineStyle.single.rawValue, .strikethroughColor: nebengrau]
            )
            gleisNeu.text = neu
            gleisZeile.isHidden = false
        } else {
            gleisZeile.isHidden = true
        }

        let status = wert("status") ?? "erreichbar"

        // Minuten bis zur Abfahrt | Weg - nicht bei einem Ausfall.
        for alt in werteZeile.arrangedSubviews { alt.removeFromSuperview() }
        if status != "faellt-aus", let rest = wert("restMin"), let geh = wert("gehMin") {
            werteZeile.addArrangedSubview(wertBlock("\(rest) Min.", "bis zur Abfahrt"))
            let trenner = UIView()
            trenner.backgroundColor = linie
            trenner.translatesAutoresizingMaskIntoConstraints = false
            trenner.widthAnchor.constraint(equalToConstant: 1).isActive = true
            werteZeile.addArrangedSubview(trenner)
            werteZeile.addArrangedSubview(wertBlock("\(geh) Min.", "Weg"))
            werteZeile.addArrangedSubview(UIView())
            werteZeile.isHidden = false
        } else {
            werteZeile.isHidden = true
        }

        switch status {
        case "knapp":
            statusText.text = "Knapp"
            punkt.art = .knapp(rot: rot, gelb: gelb)
            zeigeStreifen(true)
        case "faellt-aus":
            statusText.text = "Fällt aus"
            punkt.art = .ring(rot)
            zeigeStreifen(false)
        default:
            statusText.text = "Erreichbar"
            punkt.art = .voll(gruen)
            zeigeStreifen(false)
        }
        standText.text = wert("stand").map { "Stand \($0)" }

        // Die Aktionen der Kategorie `reise` (AppDelegate) mit der Beschriftung
        // dieser Mitteilung: das neue Gleis bzw. bei einem Ausfall die Suche.
        let wegTitel = wert("aktion") == "verbindung"
            ? "Andere Verbindung wählen"
            : wert("aktionGleis").map { "Weg zu Gleis \($0)" } ?? "Weg zum Gleis"
        extensionContext?.notificationActions = [
            UNNotificationAction(identifier: "weg", title: wegTitel, options: [.foreground]),
            UNNotificationAction(identifier: "oeffnen", title: "Reise öffnen", options: [.foreground]),
        ]

        view.setNeedsLayout()
        view.layoutIfNeeded()
        let breite = view.bounds.width > 0 ? view.bounds.width : UIScreen.main.bounds.width
        let groesse = view.systemLayoutSizeFitting(
            CGSize(width: breite, height: UIView.layoutFittingCompressedSize.height),
            withHorizontalFittingPriority: .required,
            verticalFittingPriority: .fittingSizeLevel
        )
        preferredContentSize = CGSize(width: breite, height: groesse.height)
    }

    private func wertBlock(_ zahl: String, _ beschriftung: String) -> UIView {
        let oben = UILabel()
        oben.font = archivo(24, 700)
        oben.textColor = schrift
        oben.text = zahl
        let unten = UILabel()
        unten.font = archivo(15, 500)
        unten.textColor = nebengrau
        unten.text = beschriftung
        let block = UIStackView(arrangedSubviews: [oben, unten])
        block.axis = .vertical
        block.spacing = 2
        return block
    }

    /// „Knapp“: 6 pt rot-gelbe Streifen im 45-Grad-Winkel oben an der Ansicht.
    private func zeigeStreifen(_ an: Bool) {
        streifenHoehe?.constant = an ? 6 : 0
        guard an else {
            streifen.backgroundColor = .clear
            return
        }
        let kachel: CGFloat = 12
        let bild = UIGraphicsImageRenderer(size: CGSize(width: kachel, height: kachel)).image { ctx in
            let g = ctx.cgContext
            g.setFillColor(gelb.resolvedColor(with: traitCollection).cgColor)
            g.fill(CGRect(x: 0, y: 0, width: kachel, height: kachel))
            g.setFillColor(rot.resolvedColor(with: traitCollection).cgColor)
            // Zwei Dreiecksbaender ergeben ueber die Kacheln durchgehende Diagonalen.
            g.move(to: CGPoint(x: 0, y: 0))
            g.addLine(to: CGPoint(x: kachel / 2, y: 0))
            g.addLine(to: CGPoint(x: 0, y: kachel / 2))
            g.closePath()
            g.move(to: CGPoint(x: kachel, y: 0))
            g.addLine(to: CGPoint(x: kachel, y: kachel / 2))
            g.addLine(to: CGPoint(x: kachel / 2, y: kachel))
            g.addLine(to: CGPoint(x: 0, y: kachel))
            g.closePath()
            g.fillPath()
        }
        streifen.backgroundColor = UIColor(patternImage: bild)
    }
}

/// Der Punkt vor dem Status: voll (erreichbar), halb rot / halb gelb (knapp),
/// roter Ring (faellt aus).
private final class StatusPunkt: UIView {
    enum Art {
        case voll(UIColor)
        case knapp(rot: UIColor, gelb: UIColor)
        case ring(UIColor)
    }

    var art: Art = .voll(.clear) {
        didSet { setNeedsDisplay() }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        isOpaque = false
        backgroundColor = .clear
    }

    override func draw(_ rect: CGRect) {
        guard let g = UIGraphicsGetCurrentContext() else { return }
        let kreis = bounds.insetBy(dx: 1, dy: 1)
        switch art {
        case let .voll(farbe):
            g.setFillColor(farbe.resolvedColor(with: traitCollection).cgColor)
            g.fillEllipse(in: kreis)
        case let .knapp(rot, gelb):
            g.setFillColor(gelb.resolvedColor(with: traitCollection).cgColor)
            g.fillEllipse(in: kreis)
            g.saveGState()
            g.clip(to: CGRect(x: kreis.minX, y: kreis.minY, width: kreis.width / 2, height: kreis.height))
            g.setFillColor(rot.resolvedColor(with: traitCollection).cgColor)
            g.fillEllipse(in: kreis)
            g.restoreGState()
        case let .ring(farbe):
            g.setStrokeColor(farbe.resolvedColor(with: traitCollection).cgColor)
            g.setLineWidth(2)
            g.strokeEllipse(in: kreis.insetBy(dx: 1, dy: 1))
        }
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        setNeedsDisplay()
    }
}

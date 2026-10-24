// Bilder fuer das iOS-Projekt (Plan App Store, Paket 5): App-Symbol und
// Startbildschirm. Erzeugt, nicht gezeichnet - wer das Logo aendert, laesst
// das Skript neu laufen und checkt die PNGs ein.
//
// Aufruf (aus frontend/): npx tsx scripts/app-bilder.ts
//
// - App-Symbol 1024 x 1024 aus public/umstieg-logo.svg. Apple lehnt Symbole
//   mit Alphakanal ab - auch einen, der ueberall deckend ist. Deshalb wird
//   hier selbst als RGB-PNG (Farbtyp 2) geschrieben, nicht das RGBA von resvg
//   uebernommen.
// - Startbildschirm: eine Flaeche in der Grundfarbe der App, hell und dunkel.
//   Kein Logo darauf - die Human Interface Guidelines wollen, dass der Start
//   aussieht wie der erste Bildschirm, nicht wie ein Werbeplakat. Die Farben
//   sind --color-bg aus src/index.css.
import { readFileSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { Resvg } from '@resvg/resvg-js'

const ASSETS = 'ios/App/App/Assets.xcassets'
const HELL = [0xff, 0xff, 0xff] as const
const DUNKEL = [0x17, 0x16, 0x1a] as const

function abschnitt(typ: string, daten: Buffer): Buffer {
  const laenge = Buffer.alloc(4)
  laenge.writeUInt32BE(daten.length)
  const typUndDaten = Buffer.concat([Buffer.from(typ, 'ascii'), daten])
  const pruefsumme = Buffer.alloc(4)
  pruefsumme.writeUInt32BE(crc32(typUndDaten))
  return Buffer.concat([laenge, typUndDaten, pruefsumme])
}

/** PNG ohne Alphakanal: 8 Bit je Farbe, Farbtyp 2, ohne Zeilenfilter. */
function rgbPng(breite: number, hoehe: number, rgb: Uint8Array): Buffer {
  const kopf = Buffer.alloc(13)
  kopf.writeUInt32BE(breite, 0)
  kopf.writeUInt32BE(hoehe, 4)
  kopf[8] = 8
  kopf[9] = 2
  const zeilen = Buffer.alloc((breite * 3 + 1) * hoehe)
  for (let y = 0; y < hoehe; y++) {
    const ab = y * (breite * 3 + 1)
    zeilen[ab] = 0
    zeilen.set(rgb.subarray(y * breite * 3, (y + 1) * breite * 3), ab + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    abschnitt('IHDR', kopf),
    abschnitt('IDAT', deflateSync(zeilen, { level: 9 })),
    abschnitt('IEND', Buffer.alloc(0)),
  ])
}

/** RGBA auf Weiss legen und den Alphakanal verwerfen. */
function ohneAlpha(rgba: Uint8Array): Uint8Array {
  const rgb = new Uint8Array((rgba.length / 4) * 3)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const a = rgba[i + 3] / 255
    for (let k = 0; k < 3; k++) rgb[j + k] = Math.round(rgba[i + k] * a + 255 * (1 - a))
  }
  return rgb
}

function flaeche(seite: number, farbe: readonly [number, number, number]): Buffer {
  const rgb = new Uint8Array(seite * seite * 3)
  for (let i = 0; i < rgb.length; i += 3) rgb.set(farbe, i)
  return rgbPng(seite, seite, rgb)
}

const svg = readFileSync('public/umstieg-logo.svg', 'utf8')
const symbol = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render()
writeFileSync(
  `${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`,
  rgbPng(symbol.width, symbol.height, ohneAlpha(symbol.pixels)),
)

// Einfarbig - die Groesse ist gleich, `scaleAspectFill` fuellt jeden Bildschirm.
writeFileSync(`${ASSETS}/Splash.imageset/start-hell.png`, flaeche(64, HELL))
writeFileSync(`${ASSETS}/Splash.imageset/start-dunkel.png`, flaeche(64, DUNKEL))

console.log(`App-Symbol ${symbol.width} x ${symbol.height}, Startbildschirm hell und dunkel`)

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** CSS einer Datei unter `src/`, ohne Kommentare. */
export function cssVon(datei: string): string {
  const pfad = resolve(dirname(fileURLToPath(import.meta.url)), '..', datei)
  return readFileSync(pfad, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Der Inhalt jedes Blocks, der mit `kopf` beginnt – Klammern mitgezaehlt. */
export function bloeckeAb(css: string, kopf: string): string[] {
  const bloecke: string[] = []
  let ab = css.indexOf(kopf)
  while (ab >= 0) {
    const auf = css.indexOf('{', ab)
    let tiefe = 0
    let i = auf
    for (; i < css.length; i++) {
      if (css[i] === '{') tiefe++
      if (css[i] === '}' && --tiefe === 0) break
    }
    bloecke.push(css.slice(auf + 1, i))
    ab = css.indexOf(kopf, i)
  }
  return bloecke
}

/** Alle Deklarationen der Regeln mit GENAU diesem Selektor. */
export function deklarationenVon(css: string, selektor: string): string[] {
  const ergebnis: string[] = []
  for (const t of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (t[1].trim() !== selektor) continue
    for (const d of t[2].split(';')) {
      const z = d.replace(/\s+/g, ' ').trim()
      if (z) ergebnis.push(z)
    }
  }
  return ergebnis
}

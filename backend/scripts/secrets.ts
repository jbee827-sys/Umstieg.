// Die DB-Schluessel fuer Skripte, die echte Schnittstellen rufen.
//
// EINE Stelle fuer den Pfad. Bis zum 02.10.2026 trug jedes Skript eine eigene
// Kopie mit `homedir()/.secrets` – als der Tresor von C: nach E: wanderte,
// fanden alle acht ihn nicht mehr.
//
// Gelesen wird nur in `process.env`; kein Wert wird ausgegeben. Das `\r`
// wird abgeschnitten: Mit CRLF in der Datei landete sonst ein Wagenruecklauf
// im Schluessel, und der Auth-Header waere still falsch.
import { readFileSync } from 'node:fs';

/** Der Tresor (nur lesen). Siehe D:\Claude-code\CLAUDE.md. */
export const SECRETS_DATEI = 'E:\\jbeer\\.secrets\\umstieg.env';

export function ladeSecrets(): void {
  for (const zeile of readFileSync(SECRETS_DATEI, 'utf8').split('\n')) {
    const sauber = zeile.replace(/\r$/, '').trim();
    if (!sauber || sauber.startsWith('#')) continue;
    const trenner = sauber.indexOf('=');
    if (trenner < 0) continue;
    process.env[sauber.slice(0, trenner).trim()] = sauber.slice(trenner + 1).trim();
  }
}

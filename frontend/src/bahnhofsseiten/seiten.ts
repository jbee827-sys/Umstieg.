import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BASIS_URL, maskiere } from '../statisch/kopf'
import { BAHNHOF_PFAD } from './adressen'
import { Bahnhofsseite, Uebersicht } from './Bahnhofsseite'
import { beschreibungFuer, titelFuer } from './texte'
import type { Bahnhofsdaten } from './typen'

export { BAHNHOF_PFAD, eingabeLink } from './adressen'

/**
 * Die vorgerenderten Bahnhofsseiten als fertige Dokumente (Konzept
 * Nutzergewinnung AP 5b): beim Build aus den Daten in `daten/` erzeugt
 * (scripts/statische-seiten.tsx). Keine Hydratation, keine App - nur Text,
 * Tabellen und Links, damit Google und KI-Crawler ohne JavaScript alles
 * lesen. CSP: Stil und Messung kommen als Dateien aus /assets/, kein
 * Inline-Stil, kein Inline-Skript.
 */
export interface Bauteile {
  /** Gemeinsame CSS-Datei, mit Hash unter /assets/. */
  css: string
  /** Reichweitenmessung (messung.js), mit Hash unter /assets/. */
  messung: string
}

/** JSON in einem Skriptblock: `<` maskiert, damit kein `</script>` den Block beendet. */
function jsonLd(daten: object): string {
  return JSON.stringify(daten).replace(/</g, '\\u003c')
}

function dokument(o: {
  titel: string
  beschreibung: string
  pfad: string
  bauteile: Bauteile
  strukturiert?: object
  inhalt: string
}): string {
  const url = maskiere(`${BASIS_URL}${o.pfad}`)
  const t = maskiere(o.titel)
  const b = maskiere(o.beschreibung)
  return [
    '<!doctype html>',
    '<html lang="de">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${t}</title>`,
    `<meta name="description" content="${b}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<link rel="icon" type="image/svg+xml" href="/umstieg-logo.svg" />',
    '<link rel="icon" type="image/png" sizes="512x512" href="/umstieg-logo-512.png" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Umstieg." />',
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${b}" />`,
    `<meta property="og:url" content="${url}" />`,
    '<meta property="og:image" content="https://www.umstieg.online/umstieg-og.png" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${b}" />`,
    `<link rel="stylesheet" href="${maskiere(o.bauteile.css)}" />`,
    `<script defer src="${maskiere(o.bauteile.messung)}"></script>`,
    ...(o.strukturiert ? [`<script type="application/ld+json">${jsonLd(o.strukturiert)}</script>`] : []),
    '</head>',
    `<body>${o.inhalt}</body>`,
    '</html>',
    '',
  ].join('\n')
}

export function bahnhofsseiteHtml(d: Bahnhofsdaten, bauteile: Bauteile): string {
  const pfad = BAHNHOF_PFAD(d.slug)
  return dokument({
    titel: titelFuer(d.name),
    beschreibung: beschreibungFuer(d.name),
    pfad,
    bauteile,
    strukturiert: {
      '@context': 'https://schema.org',
      '@type': 'TrainStation',
      name: d.name,
      url: `${BASIS_URL}${pfad}`,
      geo: { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lon },
    },
    inhalt: renderToStaticMarkup(createElement(Bahnhofsseite, { d })),
  })
}

export function uebersichtHtml(alle: Bahnhofsdaten[], bauteile: Bauteile): string {
  return dokument({
    titel: `Umsteigezeiten für ${alle.length} Bahnhöfe in Deutschland | Umstieg.`,
    beschreibung:
      'Gehzeiten von Gleis zu Gleis für große und mittlere Bahnhöfe in Deutschland, mit Treppen, Aufzügen und stufenfreien Wegen.',
    pfad: '/bahnhoefe',
    bauteile,
    inhalt: renderToStaticMarkup(createElement(Uebersicht, { alle })),
  })
}

/**
 * Alle oeffentlichen Seiten (Konzept AP 2). `lastmod` der Bahnhofsseiten
 * ist der Stand ihres Bahnhofsplans, sonst der Tag des Builds.
 */
export function sitemapXml(alle: Bahnhofsdaten[], heute: string): string {
  const eintrag = (pfad: string, datum: string) =>
    `  <url><loc>${maskiere(`${BASIS_URL}${pfad}`)}</loc><lastmod>${datum}</lastmod></url>`
  const sortiert = [...alle].sort((a, b) => a.slug.localeCompare(b.slug))
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    eintrag('/', heute),
    eintrag('/bahnhoefe', heute),
    ...sortiert.map((d) => eintrag(BAHNHOF_PFAD(d.slug), d.geholtAm.slice(0, 10))),
    eintrag('/impressum', heute),
    eintrag('/datenschutz', heute),
    '</urlset>',
    '',
  ].join('\n')
}

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lies = (datei: string) => readFileSync(fileURLToPath(new URL(`../${datei}`, import.meta.url)), 'utf8');

describe('Betrieb: OSM-Bestand im Image, Gelerntes auf dem Volume', () => {
  it('kopiert den Startbestand ins Image und nennt seinen Pfad', () => {
    const d = lies('Dockerfile');
    expect(d).toContain('COPY osm-bestand ./osm-bestand');
    expect(d).toContain('ENV OSM_STARTBESTAND_PFAD=/app/osm-bestand');
  });

  it('startet ueber das Startskript und gibt die Rechte erst dort ab', () => {
    const d = lies('Dockerfile');
    expect(d).toContain('apk add --no-cache su-exec');
    expect(d).toContain('ENTRYPOINT ["/usr/local/bin/docker-start.sh"]');
    expect(d).not.toMatch(/^USER node$/m);
    const s = lies('docker-start.sh');
    expect(s).toContain('chown -R node:node "$OSM_VOLUME_PFAD"');
    expect(s).toContain('exec su-exec node "$@"');
    expect(s).not.toContain('\r');
  });

  it('haengt das Volume ein und nennt den Pfad', () => {
    const f = lies('fly.toml');
    expect(f).toMatch(/\[mounts\]\s*\n\s*source = "osm_daten"\s*\n\s*destination = "\/data"/);
    expect(f).toContain('OSM_VOLUME_PFAD = "/data/osm"');
  });

  it('schliesst den Startbestand nicht vom Build aus', () => {
    expect(lies('.dockerignore')).not.toContain('osm-bestand');
  });

  it('laedt Simulations- und Testablagen nicht als Build-Kontext hoch', () => {
    const zeilen = lies('.dockerignore').split(/\r?\n/).map((z) => z.trim());
    expect(zeilen).toContain('osm-ablage');
    expect(zeilen).toContain('.test-ablage');
  });
});

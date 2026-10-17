import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { erzeugeCache } from '../cache/lru.js';
import type { HaltestellenClient } from '../clients/haltestellen.js';
import { Ueberwachung, type Protokoll } from '../core/ueberwachung.js';
import type { Sicherheitsprotokoll } from '../core/sicherheitsprotokoll.js';
import type { HaltestellenTafelEintrag, TafelEintrag } from '../core/typen.js';
import { berlinUhrzeit } from '../core/zeit.js';
import { leseKoordinaten } from './api.js';

/**
 * SSE-Strom je EVA-Nummer. Die Ereignisse stammen aus der Überwachung, die
 * unabhängig von der Zahl der Zuschauer nur EINMAL je EVA pollt
 * (Konzeptkorrektur 1 – Ratenlimits).
 *
 * `zugAn`/`zugAb` schränken die Ereignisse auf die beiden Züge des Umstiegs
 * ein; ohne sie kommen alle Ereignisse des Bahnhofs an.
 *
 * `erlaubteHerkuenfte` ist dieselbe Liste, die `@fastify/cors` bekommt – siehe
 * den Kommentar am `writeHead` weiter unten, warum diese Route sie selbst
 * braucht.
 */
export interface SseGrenzen {
  /** Offene Stroeme insgesamt. */
  gesamt: number;
  /** Offene Stroeme je Aufrufer. */
  jeAufrufer: number;
}

/**
 * Bewusst niedrig. Ein Umstieg braucht EINEN Strom; zwei sind Reserve fuer den
 * Moment, in dem ein Reload den alten noch nicht abgeraeumt hat.
 */
export const SSE_GRENZEN_STANDARD: SseGrenzen = { gesamt: 140, jeAufrufer: 2 };

/**
 * Live-Überwachung des Haltestellenpfads (Umstieg 2.0, Spec 5.4): eine eigene
 * `Ueberwachung`, deren Schlüssel die Haltestellen-ID ist. Die Koordinate
 * merkt sich die Route beim Öffnen des Stroms, weil MOTIS die Haltestelle nach
 * einem Datenwechsel nur über `center` wiederfindet (A5).
 */
export interface HaltestellenLive {
  ueberwachung: Ueberwachung;
  merkeOrt(id: string, punkt: { lat: number; lon: number }): void;
}

/** Transitous liest Echtzeit etwa einmal je Minute – öfter fragen bringt nur Last (Spec 5.4). */
export const HALTESTELLEN_LIVE_INTERVALL_MS = 60_000;

/** Eintrag der Haltestellentafel in der Form, die die Überwachung vergleicht. */
export function haltestellenTafelAlsTafel(e: HaltestellenTafelEintrag): TafelEintrag {
  return {
    zug: e.fahrtId,
    anzeige: e.linie,
    zeitSoll: berlinUhrzeit(e.zeitSoll),
    ...(e.zeitIst ? { zeitIst: berlinUhrzeit(e.zeitIst) } : {}),
    gleisSoll: e.steigSoll ?? '',
    ...(e.steigIst ? { gleisIst: e.steigIst } : {}),
    ziel: e.ziel,
    ausfall: e.ausfall,
  };
}

export function erzeugeHaltestellenLive(
  client: HaltestellenClient,
  o: { log?: Protokoll; maxHalte?: number } = {},
): HaltestellenLive {
  const orte = erzeugeCache<{ lat: number; lon: number }>(500, 24 * 60 * 60_000);
  const ueberwachung = new Ueberwachung(
    async (id) => {
      const punkt = orte.get(id);
      if (!punkt) return [];
      const h = { id, ...punkt };
      const [an, ab] = await Promise.all([client.tafelFrisch(h, 'arr'), client.tafelFrisch(h, 'dep')]);
      /*
       * Die Überwachung schlüsselt nach Fahrt und Sollminute. An einer
       * Bushaltestelle tragen Ankunft und Abfahrt derselben Fahrt oft dieselbe
       * Sollminute, aber verschiedene Ist-Zeiten – beide Einträge
       * überschrieben sich dann bei jedem Durchlauf gegenseitig und meldeten
       * eine Verspätung, die es nicht gibt. Die Abfahrt gewinnt: Sie
       * entscheidet über den Anschluss.
       */
      const tafel = ab.map(haltestellenTafelAlsTafel);
      const vorhanden = new Set(tafel.map((t) => `${t.zug}|${t.zeitSoll}`));
      for (const t of an.map(haltestellenTafelAlsTafel)) {
        if (!vorhanden.has(`${t.zug}|${t.zeitSoll}`)) tafel.push(t);
      }
      return tafel;
    },
    HALTESTELLEN_LIVE_INTERVALL_MS,
    o.log,
    o.maxHalte,
  );
  return { ueberwachung, merkeOrt: (id, punkt) => void orte.set(id, punkt) };
}

const HALTESTELLEN_NICHT_EINGERICHTET = {
  fehler: 'haltestellen-nicht-eingerichtet',
  detail: 'Haltestellen sind auf diesem Server nicht eingerichtet.',
};

export function registriereLiveRouten(
  app: FastifyInstance,
  ueberwachung: Ueberwachung,
  erlaubteHerkuenfte: string[] = [],
  grenzen: SseGrenzen = SSE_GRENZEN_STANDARD,
  sicherheit?: Sicherheitsprotokoll,
  haltestellen?: HaltestellenLive | null,
): void {
  /**
   * Zaehler der offenen Stroeme - nur im Arbeitsspeicher, je App-Instanz.
   *
   * Eine Ratenbegrenzung je Anfrage hilft hier nicht: Ein Strom wird EINMAL
   * geoeffnet und bleibt dann stundenlang bestehen. Gezaehlt werden muss
   * deshalb, was offen ist, nicht was ankommt.
   *
   * `jeAufrufer` wird bei null wieder entfernt. Sonst waechst die Karte mit
   * jeder je gesehenen Adresse weiter - ein Speicherleck, das ausgerechnet
   * ueber die Adressen der Besucher liefe.
   *
   * Beide Pfade (Bahnhof und Haltestelle) teilen sich diese Zaehler: Ein
   * Handy mit einem Strom je Pfad verbraucht zwei Plaetze.
   */
  let offen = 0;
  const jeAufrufer = new Map<string, number>();

  /** Ein Strom für einen oder mehrere Schlüssel derselben Überwachung. */
  function oeffneStrom(
    req: FastifyRequest,
    reply: FastifyReply,
    quelle: { ueberwachung: Ueberwachung; schluessel: string[]; zuVieleFehler: string; zuVieleDetail: string },
    zuege: string[],
    route: string,
  ) {
    /*
     * Erst pruefen, dann uebernehmen: Nach `reply.hijack()` ist der Kopf
     * mit 200 schon auf der Leitung, eine Ablehnung waere dann nicht mehr
     * moeglich. Die Absage laeuft ueber die normale Fastify-Antwort und
     * traegt deshalb die CORS-Header von `@fastify/cors` ganz von selbst.
     */
    const aufrufer = req.ip;
    if (offen >= grenzen.gesamt || (jeAufrufer.get(aufrufer) ?? 0) >= grenzen.jeAufrufer) {
      sicherheit?.melde('sse-verbindungen', route);
      return reply.code(503).send({
        fehler: 'zu-viele-verbindungen',
        detail: 'Zu viele gleichzeitige Live-Verbindungen. Bitte spaeter erneut versuchen.',
      });
    }
    // Alle Schluessel zugleich: Einzeln geprueft haette jeder den letzten
    // freien Platz fuer sich beansprucht, und der zweite risse die Grenze.
    if (!quelle.ueberwachung.hatKapazitaetFuerAlle(quelle.schluessel)) {
      sicherheit?.melde('sse-bahnhoefe', route);
      return reply.code(503).send({ fehler: quelle.zuVieleFehler, detail: quelle.zuVieleDetail });
    }

    const kopf: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Verhindert Pufferung durch zwischengeschaltete Proxys (Caddy/nginx).
      'X-Accel-Buffering': 'no',
    };

    /**
     * CORS von Hand – und zwar zwingend.
     *
     * `reply.hijack()` schreibt die Header roh auf den Socket. Alles, was
     * `@fastify/cors` an die Fastify-Antwort gehängt hat, kommt dabei nie
     * auf die Leitung. In Produktion war der Strom damit für den Browser
     * unerreichbar: `EventSource` setzt CORS durch und verwirft eine Antwort
     * ohne Freigabe-Header – stillschweigend, ohne dass an der Oberfläche
     * etwas davon zu sehen wäre.
     *
     * Zwei Tage lang unbemerkt geblieben, weil die Prüfung mit `curl` lief.
     * `curl` schickt den Origin-Header mit, setzt CORS aber NICHT durch:
     * Der Strom sah dort einwandfrei aus. Gefunden am 03.09.2026 bei der
     * Abnahme im Browser gegen die Produktion.
     *
     * Gespiegelt wird, was `@fastify/cors` für eine einfache GET-Anfrage mit
     * Allowlist täte: die passende Herkunft zurückspiegeln, sonst nichts.
     *
     * `Vary: Origin` steht bewusst AUSSERHALB der Bedingung. Auch die
     * Ablehnung hängt an der Herkunft: Ohne `Vary` darf ein
     * Zwischenspeicher die kopflose Antwort einer fremden Herkunft an eine
     * erlaubte ausliefern – die scheiterte dann an einer Freigabe, die es
     * eigentlich gibt. `@fastify/cors` sendet den Header deshalb in beiden
     * Fällen. Hier stand er zuerst nur im erlaubten; aufgefallen beim
     * Nachprüfen der Ränder am 03.09.2026.
     */
    kopf['Vary'] = 'Origin';
    const herkunft = req.headers.origin;
    if (herkunft && erlaubteHerkuenfte.includes(herkunft)) {
      kopf['Access-Control-Allow-Origin'] = herkunft;
    }

    offen++;
    jeAufrufer.set(aufrufer, (jeAufrufer.get(aufrufer) ?? 0) + 1);

    // Fastify soll die Antwort nicht selbst abschließen – der Strom bleibt offen.
    reply.hijack();
    reply.raw.writeHead(200, kopf);

    const abmeldungen = quelle.schluessel.map((schluessel) =>
      quelle.ueberwachung.abonniere(schluessel, zuege, (ereignis) => {
        reply.raw.write(`event: ${ereignis.typ}\ndata: ${JSON.stringify(ereignis)}\n\n`);
      }),
    );

    // Erst nach der Anmeldung senden: Wer diesen Kommentar empfängt, ist
    // sicher abonniert – darauf verlassen sich die Tests.
    reply.raw.write(': verbunden\n\n');

    // Verbindungsabbruch (Tunnel, Tabwechsel, Reload) meldet ab. Ohne das
    // pollt die EVA weiter, obwohl niemand mehr zuhört.
    //
    // `beendet` schuetzt gegen ein doppeltes Herunterzaehlen: `close` kann
    // mehr als einmal feuern, und ein zu niedriger Zaehler waere schlimmer
    // als ein zu hoher - er gaebe Plaetze frei, die es nicht gibt.
    let beendet = false;
    req.raw.on('close', () => {
      if (beendet) return;
      beendet = true;
      for (const abmelden of abmeldungen) abmelden();
      offen--;
      const rest = (jeAufrufer.get(aufrufer) ?? 1) - 1;
      if (rest > 0) jeAufrufer.set(aufrufer, rest);
      else jeAufrufer.delete(aufrufer);
    });
  }

  app.get<{ Params: { eva: string }; Querystring: { zugAn?: string; zugAb?: string } }>(
    '/api/live/:eva',
    (req, reply) => {
      const zuege = [req.query.zugAn, req.query.zugAb].filter((z): z is string => Boolean(z));
      return oeffneStrom(
        req,
        reply,
        {
          ueberwachung,
          schluessel: [req.params.eva],
          zuVieleFehler: 'zu-viele-bahnhoefe',
          zuVieleDetail: 'Es werden derzeit zu viele Bahnhoefe live beobachtet.',
        },
        zuege,
        '/api/live/:eva',
      );
    },
  );

  /*
   * Haltestellenpfad: EIN Strom fuer Ankunfts- und Abfahrtshaltestelle
   * (Review Focus 5). Zwei Stroeme wuerden bei der Grenze von zwei je
   * Aufrufer schon den Reload-Puffer aufbrauchen. Die Route steht auch ohne
   * Einrichtung - sonst fiele `/api/live/haltestelle` auf `/api/live/:eva`
   * und wuerde als EVA „haltestelle“ ueberwacht.
   */
  app.get<{ Querystring: Record<string, string | undefined> }>('/api/live/haltestelle', (req, reply) => {
    if (!haltestellen) return reply.code(503).send(HALTESTELLEN_NICHT_EINGERICHTET);
    const q = req.query;
    const halte: { id: string; punkt: { lat: number; lon: number } }[] = [];
    for (const s of ['an', 'ab'] as const) {
      const id = q[s];
      if (id === undefined) continue;
      const punkt = leseKoordinaten(q[`${s}Lat`], q[`${s}Lon`]);
      if (!id || id.length > 300 || !punkt) return reply.code(400).send({ fehler: 'parameter-ungueltig' });
      if (!halte.some((h) => h.id === id)) halte.push({ id, punkt });
    }
    if (halte.length === 0) {
      return reply.code(400).send({ fehler: 'parameter-fehlt', detail: 'an oder ab ist erforderlich' });
    }
    for (const h of halte) haltestellen.merkeOrt(h.id, h.punkt);
    const zuege = [q.fahrtAn, q.fahrtAb].filter((z): z is string => Boolean(z));
    return oeffneStrom(
      req,
      reply,
      {
        ueberwachung: haltestellen.ueberwachung,
        schluessel: halte.map((h) => h.id),
        zuVieleFehler: 'zu-viele-haltestellen',
        zuVieleDetail: 'Es werden derzeit zu viele Haltestellen live beobachtet.',
      },
      zuege,
      '/api/live/haltestelle',
    );
  });
}

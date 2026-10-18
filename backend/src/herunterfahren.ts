/**
 * Geordnetes Herunterfahren bei SIGINT (Fly, Standard) und SIGTERM.
 *
 * `app.close()` laesst die `onClose`-Hooks laufen - darunter der MOTIS-Zaehler,
 * der seine angebrochene Stunde schreibt (K7). Offene Live-Stroeme beendet
 * vorher ein `preClose`-Hook in `routes/live.ts`; die Browser verbinden sich
 * selbst neu, dann mit der neuen Maschine.
 *
 * Der Notaus liegt unter Flys 5 s `kill_timeout`: Haengt das Schliessen, endet
 * der Prozess trotzdem selbst, statt hart abgeschossen zu werden.
 */
export const NOTAUS_MS = 4000;

interface Signalquelle {
  once(signal: 'SIGINT' | 'SIGTERM', behandler: () => void): unknown;
}

export function registriereHerunterfahren(
  app: { close(): Promise<unknown> },
  o: {
    prozess?: Signalquelle;
    beende?: (code: number) => void;
    notausMs?: number;
    log?: (text: string) => void;
  } = {},
): void {
  const prozess = o.prozess ?? process;
  const beende = o.beende ?? ((code: number) => process.exit(code));
  const log = o.log ?? ((text: string) => console.log(text));
  let laeuft = false;

  const fahreHerunter = (signal: string) => {
    if (laeuft) return;
    laeuft = true;
    log(`${signal}: fahre herunter`);
    const notaus = setTimeout(() => {
      log(`Herunterfahren dauerte ueber ${o.notausMs ?? NOTAUS_MS} ms - Notaus`);
      beende(1);
    }, o.notausMs ?? NOTAUS_MS);
    // Der Notaus selbst darf den Prozess nicht am Leben halten.
    notaus.unref?.();
    void (async () => {
      let code = 0;
      try {
        await app.close();
      } catch {
        code = 1;
      }
      clearTimeout(notaus);
      beende(code);
    })();
  };

  prozess.once('SIGINT', () => fahreHerunter('SIGINT'));
  prozess.once('SIGTERM', () => fahreHerunter('SIGTERM'));
}

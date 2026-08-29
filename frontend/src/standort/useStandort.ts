import { useCallback, useEffect, useRef, useState } from 'react';
import type { Standort, StandortStatus } from './typen';

const OPTIONEN: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 15000,
};

function zuStandort(pos: GeolocationPosition): Standort {
  return {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    genauigkeitM: pos.coords.accuracy,
    zeitstempel: pos.timestamp,
  };
}

/**
 * Kapselt die Browser-Geolocation-API. Die Freigabe wird beim Mounten
 * angefragt; ist sie bereits erteilt, sieht ein Wiederkehrer dank der
 * Permissions-API keinen Dialog mehr.
 *
 * Bewusst ohne Entscheidungslogik – die liegt in ankunft.ts und
 * bahnhofErkennung.ts und ist dort ohne Browser-Mocks testbar.
 */
export function useStandort(): {
  status: StandortStatus;
  standort: Standort | null;
  starteVerfolgung: () => void;
  stoppeVerfolgung: () => void;
} {
  // Fehlt die API, laeuft die Seite ueber http:// ausserhalb von localhost.
  // Direkt beim Initialisieren abgeleitet statt im Effect gesetzt: das spart
  // einen zweiten Render und der Status stimmt schon im ersten.
  const [status, setStatus] = useState<StandortStatus>(() =>
    'geolocation' in navigator ? 'unbekannt' : 'nicht-verfuegbar',
  );
  const [standort, setStandort] = useState<Standort | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    let abgebrochen = false;

    const frageAb = (): void => {
      setStatus('frage-laeuft');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (abgebrochen) return;
          setStandort(zuStandort(pos));
          setStatus('erteilt');
        },
        (fehler) => {
          if (abgebrochen) return;
          setStatus(fehler.code === fehler.PERMISSION_DENIED ? 'verweigert' : 'fehler');
        },
        OPTIONEN,
      );
    };

    // Permissions-API zuerst: erteilte Freigabe → kein erneuter Dialog.
    // Fehlt sie (aeltere Safari-Versionen), direkt abfragen.
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((ergebnis) => {
          if (abgebrochen) return;
          if (ergebnis.state === 'denied') setStatus('verweigert');
          else frageAb();
        })
        .catch(() => {
          if (!abgebrochen) frageAb();
        });
    } else {
      frageAb();
    }

    return () => {
      abgebrochen = true;
    };
  }, []);

  const stoppeVerfolgung = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const starteVerfolgung = useCallback(() => {
    if (!('geolocation' in navigator) || watchId.current !== null) return;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStandort(zuStandort(pos));
        setStatus('erteilt');
      },
      (fehler) => {
        // Letzte bekannte Position bleibt stehen (Degradationstabelle).
        setStatus(fehler.code === fehler.PERMISSION_DENIED ? 'verweigert' : 'fehler');
      },
      OPTIONEN,
    );
  }, []);

  // Kein Tracking ueber die Lebensdauer der Komponente hinaus.
  useEffect(() => stoppeVerfolgung, [stoppeVerfolgung]);

  return { status, standort, starteVerfolgung, stoppeVerfolgung };
}

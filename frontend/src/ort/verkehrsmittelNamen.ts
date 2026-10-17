import type { Verkehrsmittel } from '../api/typen'

/** Ausgeschriebene Namen – für Vorleser und Tafelzeilen. */
export const VERKEHRSMITTEL_NAME: Record<Verkehrsmittel, string> = {
  bahn: 'Bahn',
  sbahn: 'S-Bahn',
  ubahn: 'U-Bahn',
  tram: 'Tram',
  bus: 'Bus',
  faehre: 'Fähre',
  sonstiges: 'Sonstiges',
}

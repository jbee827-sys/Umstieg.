import type { HaltestellenTafelEintrag } from '../api/typen'

/**
 * Wie der Steig einer Fahrt heisst. An Bahnsteigen „Gl. 7“ wie im
 * Bahnhofspfad; kurze Kennungen („A“, „3“) bekommen „Steig“ davor; was schon
 * selbst sagt, was es ist („Pos. 11“, „Bstg. 2“), bleibt, wie es kommt.
 */
export function steigText(e: HaltestellenTafelEintrag): string {
  const steig = e.steigIst ?? e.steigSoll
  if (!steig) return 'Steig ?'
  if (e.verkehrsmittel === 'bahn' || e.verkehrsmittel === 'sbahn') return `Gl. ${steig}`
  return /^[A-Za-z0-9]{1,3}$/.test(steig) ? `Steig ${steig}` : steig
}

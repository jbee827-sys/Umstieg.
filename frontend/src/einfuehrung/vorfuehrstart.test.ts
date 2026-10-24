import { describe, expect, it } from 'vitest'
import { vorfuehrZiel } from './vorfuehrstart'

describe('Vorführung aus der Adresse', () => {
  it.each(['eingabe', 'uebersicht', 'weg'] as const)('/vorfuehrung/%s führt bis dorthin', (ziel) => {
    expect(vorfuehrZiel(`/vorfuehrung/${ziel}`)).toBe(ziel)
    expect(vorfuehrZiel(`/vorfuehrung/${ziel}/`)).toBe(ziel)
  })

  it('andere Adressen sind keine Vorführung', () => {
    expect(vorfuehrZiel('/')).toBeNull()
    expect(vorfuehrZiel('/eingabe')).toBeNull()
    expect(vorfuehrZiel('/weg')).toBeNull()
  })

  it('unbekannte Ziele werden nicht vorgeführt', () => {
    expect(vorfuehrZiel('/vorfuehrung/meldungen')).toBeNull()
    expect(vorfuehrZiel('/vorfuehrung/')).toBeNull()
    expect(vorfuehrZiel('/vorfuehrung/weg/mehr')).toBeNull()
  })
})

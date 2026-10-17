import { describe, it, expect } from 'vitest'
import { uhrzeit } from './zeit'
describe('uhrzeit', () => {
  it('deutsche Ortszeit, auch wenn der Rechner anders steht', () => {
    expect(uhrzeit('2026-10-16T14:28:00Z')).toBe('16:28')
    expect(uhrzeit('2026-11-16T14:28:00Z')).toBe('15:28')
  })
  it('kaputter Wert ergibt leeren Text', () => expect(uhrzeit('bald')).toBe(''))
})

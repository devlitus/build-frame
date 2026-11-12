import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { CONFIG_VALLE, generarValle } from '../../src/core'

describe('valle', () => {
  it('la misma semilla genera siempre el mismo valle', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), (s) => {
        expect(generarValle(CONFIG_VALLE, s)).toEqual(generarValle(CONFIG_VALLE, s))
      }),
    )
  })
})

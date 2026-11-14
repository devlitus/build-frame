/**
 * E2E-16 · Rompedor. The HUD energy meter (`Energia`, src/ui/Energia.tsx) is an accessible meter
 * whose value always mirrors the core energy. Replaces the logic of energia.spec.ts «la barra de
 * energía es un medidor accesible con su valor y máximo», «usar la azada gasta 2 y el medidor lo
 * refleja» and energia-rompedor.spec.ts «el medidor de energía: valor y texto accesibles
 * coherentes con el estado en cada gasto» (low mark at a quarter or less). Without a DOM the
 * component is called as a function and its vnode props are read.
 */
import { describe, expect, it, vi } from 'vitest'
import { ENERGIA_MAXIMA } from '../../src/core'

let energiaActual = ENERGIA_MAXIMA
vi.mock('../../src/ui/useEstado', () => ({
  useEstado: (sel: (e: { energia: number }) => unknown) => sel({ energia: energiaActual }),
}))

const { Energia } = await import('../../src/ui/Energia')

function medidor(energia: number): Record<string, unknown> {
  energiaActual = energia
  const v = Energia() as unknown as { props: Record<string, unknown> }
  return v.props
}

describe('energy meter (HUD)', () => {
  it('is a meter from 0 to the maximum with the current value and «n de max» text', () => {
    const p = medidor(ENERGIA_MAXIMA)
    expect(p).toMatchObject({
      role: 'meter',
      'aria-valuemin': 0,
      'aria-valuemax': ENERGIA_MAXIMA,
      'aria-valuenow': ENERGIA_MAXIMA,
      'aria-valuetext': `${ENERGIA_MAXIMA} de ${ENERGIA_MAXIMA}`,
      'data-baja': 'false',
    })
  })

  it.each([
    [94, false],
    [48, false],
    [26, false],
    [25, true],
    [24, true],
    [0, true],
  ])('with %i energy the value and the «low» mark follow the state (low = %s)', (n, baja) => {
    const p = medidor(n)
    expect(p['aria-valuenow']).toBe(n)
    expect(p['data-baja']).toBe(baja ? 'true' : 'false')
    expect(p['aria-valuetext']).toBe(
      baja ? `${n} de ${ENERGIA_MAXIMA}, baja` : `${n} de ${ENERGIA_MAXIMA}`,
    )
  })
})

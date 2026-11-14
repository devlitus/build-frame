/**
 * E2E-16 · Rompedor. The Life action buttons (src/ui/BarraHerramientas.tsx) show what the core
 * would do. Replaces the logic of cosechar.spec.ts «… cosechar con el botón contextual» (the
 * button says «Cosechar» only facing a ripe, living plant with the hand), energia.spec.ts «la
 * tecla Z duerme y el botón solo se ve donde se puede dormir», «en el Modo Plano no hay botón
 * Dormir» and energia-rompedor.spec.ts «Z con el inventario abierto: si el botón se oculta…» (the
 * button hides with the inventory open). Without a DOM, the components are called as functions
 * with the hooks returning the real state.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  comprobarDormir,
  CONFIG_CULTIVOS,
  crearEstadoInicial,
  CULTIVOS,
  diasHastaMadurar,
  ladoValle,
  plantaNueva,
  type EstadoJuego,
} from '../../src/core'
import { conTierraLabrable } from './fixtures/labranza'

let estadoActual: EstadoJuego
let inventarioAbierto = false
vi.mock('../../src/ui/useEstado', () => ({
  useEstado: (sel: (e: EstadoJuego) => unknown) => sel(estadoActual),
  usePartida: () => ({}),
  useInventarioAbierto: () => ({ abierto: inventarioAbierto, origen: 'puntero' }),
}))

const { BotonAccion, BotonDormir } = await import('../../src/ui/BarraHerramientas')

const base = crearEstadoInicial({ semilla: 42 })
const LADO = ladoValle(base.valle)

/** Facing south at (50, 50) a radish on (50, 51) that has grown `dias` days. */
function conRabano(dias: number, marchita = 0): EstadoJuego {
  const e = conTierraLabrable(
    { ...base, personaje: { x: 50.5, y: 50.5, orientacion: 'sur' } },
    50,
    50,
  )
  const i = 51 * LADO + 50
  const p = [...plantaNueva(i, CULTIVOS.indexOf('rabano'))] as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  p[2] = dias
  p[5] = marchita
  return {
    ...e,
    herramienta: 'mano',
    tierra: e.tierra.slice(0, i) + 'a' + e.tierra.slice(i + 1),
    plantas: [p],
  }
}

function texto(v: unknown): string | undefined {
  const hijos = (v as { props?: { children?: unknown } } | null)?.props?.children
  return typeof hijos === 'string' ? hijos : undefined
}

describe('contextual action button', () => {
  const madura = diasHastaMadurar(CONFIG_CULTIVOS.cultivos.rabano)

  it('says «Cosechar» only with the hand facing a ripe, living plant', () => {
    estadoActual = conRabano(madura)
    expect(texto(BotonAccion())).toBe('Cosechar')
    estadoActual = conRabano(madura - 1)
    expect(texto(BotonAccion())).not.toBe('Cosechar')
    estadoActual = conRabano(madura, 1)
    expect(texto(BotonAccion())).not.toBe('Cosechar')
    estadoActual = { ...conRabano(madura), herramienta: 'azada' }
    expect(texto(BotonAccion())).not.toBe('Cosechar')
    estadoActual = { ...conRabano(madura), personaje: { x: 50.5, y: 50.5, orientacion: 'norte' } }
    expect(texto(BotonAccion())).not.toBe('Cosechar')
  })

  it('does not exist in the Plano', () => {
    estadoActual = { ...conRabano(madura), modo: 'plano' }
    expect(BotonAccion()).toBeNull()
  })
})

describe('Dormir button', () => {
  it('shows exactly where the core accepts Dormir, and hides with the inventory open', () => {
    const lejos = { ...base, personaje: { x: 50.5, y: 50.5, orientacion: 'sur' as const } }
    for (const [nombre, e] of [
      ['at the spawn', base],
      ['far away', lejos],
      ['in the Plano', { ...base, modo: 'plano' as const }],
    ] as const) {
      estadoActual = e
      inventarioAbierto = false
      const visible = BotonDormir() !== null
      expect(visible, nombre).toBe(comprobarDormir(e) === undefined)
      inventarioAbierto = true
      expect(BotonDormir(), `${nombre} with the inventory open`).toBeNull()
    }
    estadoActual = base
    inventarioAbierto = false
    expect(BotonDormir()).not.toBeNull()
  })
})

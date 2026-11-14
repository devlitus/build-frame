/* eslint-disable @typescript-eslint/no-non-null-assertion -- datos conocidos en tests */
/**
 * E2E-16 · Rompedor. The faint/sleep notice text, from the core event to the string the HUD shows.
 * Replaces the logic of `m4-global-rompedor.spec.ts` «[S3] con la casa terminada, el aviso del
 * desmayo dice «Despiertas en casa» y no menciona la entrada del valle».
 *
 * `Aviso` is a Preact component; there is no DOM in vitest, so the hooks are replaced by an
 * immediate runner: `useEffect` runs at once (it subscribes to the real `Partida`), `useState`
 * records every text it is given and timers are faked. Nothing of `Aviso`'s own logic is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aplicarComando,
  colocacionValida,
  crearEstadoInicial,
  defEdificio,
  despiertaEnCasa,
  personajeAlDespertar,
  personajeEnAparicion,
  type Comando,
  type EstadoJuego,
} from '../../src/core'
import { Partida } from '../../src/game/partida'
import { t } from '../../src/ui/textos'

const textos: (string | undefined)[] = []
let partidaActual: Partida | undefined

vi.mock('preact/hooks', () => ({
  useEffect: (f: () => unknown) => {
    f()
  },
  useLayoutEffect: () => undefined,
  useState: (inicial: unknown) => [
    inicial,
    (v: string | undefined) => {
      textos.push(v)
    },
  ],
}))
vi.mock('../../src/ui/useEstado', () => ({ usePartida: () => partidaActual }))

const { Aviso, unirFrases } = await import('../../src/ui/Aviso')
const frase = (clave: Parameters<typeof t>[0]) => unirFrases([t(clave)])

const SEMILLA = 42

function ok(e: EstadoJuego, c: Comando): EstadoJuego {
  const r = aplicarComando(e, c)
  if (!r.ok) throw new Error(`${c.tipo}: ${r.error}`)
  return r.estado
}

/** A game where the house is a finished building, built through real commands (as the e2e did). */
function conCasaTerminada(): EstadoJuego {
  let e = crearEstadoInicial({ semilla: SEMILLA })
  e = ok(e, { tipo: 'CambiarModo', modo: 'plano' })
  const c = e.valle.casillasPorParcela
  const n = e.valle.parcelasPorLado
  // The parcel of the spawn point (always affordable as the first purchase).
  const indice = Math.floor(e.aparicion.y / c) * n + Math.floor(e.aparicion.x / c)
  e = ok(e, { tipo: 'ComprarParcela', indice })
  const x0 = (indice % n) * c
  const y0 = Math.floor(indice / n) * c
  e = ok(e, { tipo: 'PintarZona', x0, y0, x1: x0 + c - 1, y1: y0 + c - 1, zona: 'vivienda' })
  const def = defEdificio('casa')!
  let sitio: { x: number; y: number } | undefined
  for (let y = y0; y <= y0 + c - def.alto && !sitio; y++)
    for (let x = x0; x <= x0 + c - def.ancho && !sitio; x++)
      if (colocacionValida(e, 'casa', x, y).valida) sitio = { x, y }
  if (!sitio) throw new Error('no house site in the spawn parcel')
  e = ok(e, { tipo: 'Construir', tipoEdificio: 'casa', x: sitio.x, y: sitio.y })
  e = ok(e, { tipo: 'CambiarModo', modo: 'vida' })
  // The house takes 3 days: three faints finish it.
  for (let i = 0; i < 3; i++) e = ok(e, { tipo: 'AvanzarTiempo', minutos: 1500 })
  expect(e.edificios.find((b) => b.tipo === 'casa')?.obra).toBeNull()
  return e
}

function montarAviso(estado: EstadoJuego): Partida {
  textos.length = 0
  partidaActual = new Partida(estado)
  Aviso()
  return partidaActual
}

/** Last non-empty text the notice showed. */
function ultimoTexto(): string | undefined {
  vi.advanceTimersByTime(200)
  return textos.filter((x) => x !== undefined).at(-1)
}

describe('faint notice: «you wake up at home» (core + Aviso)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { location: { search: '' } })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('[S3] with the house finished, the faint wakes you at its door and the notice says «Despiertas en casa», not «entrada del valle»', () => {
    // Original e2e: m4-global-rompedor.spec.ts «[S3] con la casa terminada, el aviso del desmayo
    // dice «Despiertas en casa» y no menciona la entrada del valle».
    const e = conCasaTerminada()
    const partida = montarAviso(e)
    const r = partida.emitir({ tipo: 'AvanzarTiempo', minutos: 1500 })
    expect(r.ok && r.eventos.some((v) => v.tipo === 'desmayo')).toBe(true)
    const yo = partida.estado.personaje
    const casa = partida.estado.edificios.find((b) => b.tipo === 'casa')!
    // Wakes at the door (x+2, y+3), far from the valley entrance.
    expect({ x: yo.x, y: yo.y }).toEqual({ x: casa.x + 2.5, y: casa.y + 3.5 })
    const entrada = personajeEnAparicion(partida.estado.aparicion)
    expect(Math.hypot(yo.x - entrada.x, yo.y - entrada.y)).toBeGreaterThan(5)
    expect(despiertaEnCasa(partida.estado)).toBe(true)
    const texto = ultimoTexto()
    expect(texto).toContain('Te quedaste dormido')
    expect(texto).toContain('Despiertas en casa')
    expect(texto).not.toContain('entrada del valle')
  })

  it('without a house the faint notice mentions the valley entrance and you wake at the spawn', () => {
    const partida = montarAviso(crearEstadoInicial({ semilla: SEMILLA }))
    partida.emitir({ tipo: 'AvanzarTiempo', minutos: 1500 })
    expect(partida.estado.personaje).toEqual(personajeAlDespertar(partida.estado))
    expect(partida.estado.personaje).toEqual(personajeEnAparicion(partida.estado.aparicion))
    expect(ultimoTexto()).toBe(frase('avisoDesmayo'))
    expect(t('avisoDesmayo')).toContain('entrada del valle')
  })

  it('with the house still under construction the notice is the valley-entrance one', () => {
    let e = conCasaTerminada()
    const casa = e.edificios.find((b) => b.tipo === 'casa')!
    e = {
      ...e,
      edificios: e.edificios.map((b) =>
        b.id === casa.id ? { ...b, obra: { diaInicio: e.dia, diaFin: e.dia + 5 } } : b,
      ),
    }
    const partida = montarAviso(e)
    partida.emitir({ tipo: 'AvanzarTiempo', minutos: 1500 })
    expect(despiertaEnCasa(partida.estado)).toBe(false)
    expect(ultimoTexto()).toBe(frase('avisoDesmayo'))
  })

  it('sleeping at home says «Despiertas en casa» with the «dormido» text', () => {
    const e = conCasaTerminada()
    const partida = montarAviso(e)
    const r = partida.emitir({ tipo: 'Dormir' })
    expect(r.ok).toBe(true)
    expect(ultimoTexto()).toBe(frase('avisoDormidoCasa'))
    expect(t('avisoDormidoCasa')).toContain('Despiertas en casa')
  })

  it('a second faint with the notice visible announces it again (text cleared, then set)', () => {
    // Original e2e: tiempo-hud.spec.ts «un segundo desmayo con el aviso visible lo reanuncia».
    const partida = montarAviso(crearEstadoInicial({ semilla: SEMILLA }))
    partida.emitir({ tipo: 'AvanzarTiempo', minutos: 1500 })
    vi.advanceTimersByTime(200)
    const antes = textos.length
    partida.emitir({ tipo: 'AvanzarTiempo', minutos: 1500 })
    vi.advanceTimersByTime(200)
    // Cleared (undefined) and set again with the same text.
    expect(textos.slice(antes)).toEqual([undefined, frase('avisoDesmayo')])
  })
})

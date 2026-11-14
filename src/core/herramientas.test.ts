import { describe, expect, it } from 'vitest'
import { conTierraLabrable } from '../../tests/unit/fixtures/labranza'
import {
  aplicarComando,
  arar,
  comprobarUsarHerramienta,
  costeEnergia,
  crearEstadoInicial,
  HERRAMIENTAS,
  ladoValle,
  type Comando,
  type EstadoJuego,
} from './index'

const base = crearEstadoInicial({ semilla: 42 })
/** Personaje en el centro de la casilla (50, 50): lejos de cualquier borde del valle. */
const e0: EstadoJuego = conTierraLabrable(
  { ...base, personaje: { x: 50.5, y: 50.5, orientacion: 'sur' } },
  50,
  50,
)
const usar = (e: EstadoJuego, x: number, y: number) =>
  aplicarComando(e, { tipo: 'UsarHerramienta', x, y })
const error = (r: ReturnType<typeof aplicarComando>) => (r.ok ? undefined : r.error)

describe('ElegirHerramienta', () => {
  it.each(HERRAMIENTAS)('elige %s', (h) => {
    const r = aplicarComando(e0, { tipo: 'ElegirHerramienta', herramienta: h })
    expect(r.ok).toBe(true)
    expect(r.estado.herramienta).toBe(h)
  })
  it('la misma herramienta devuelve el mismo estado', () => {
    const r = aplicarComando(e0, { tipo: 'ElegirHerramienta', herramienta: e0.herramienta })
    expect(r).toMatchObject({ ok: true, eventos: [] })
    expect(r.estado).toBe(e0)
  })
  it.each(['martillo', '', 3, null, undefined, 'constructor'])('rechaza %s', (h) => {
    const r = aplicarComando(e0, { tipo: 'ElegirHerramienta', herramienta: h as never })
    expect(error(r)).toBe('parametro-invalido')
    expect(r.estado).toBe(e0)
  })
  it('vale en cualquier modo y no toca el inventario', () => {
    const plano = { ...e0, modo: 'plano' as const }
    const r = aplicarComando(plano, { tipo: 'ElegirHerramienta', herramienta: 'hacha' })
    expect(r.ok).toBe(true)
    expect(r.estado.inventario).toBe(plano.inventario)
  })
})

describe('ElegirSemilla', () => {
  it('elige una semilla del inventario sin cambiar de herramienta', () => {
    const r = aplicarComando(e0, { tipo: 'ElegirSemilla', objeto: 'semilla-patata' })
    expect(r.ok).toBe(true)
    expect(r.estado.semillaElegida).toBe('semilla-patata')
    expect(r.estado.herramienta).toBe(e0.herramienta)
  })
  it('null la suelta', () => {
    const e1 = { ...e0, semillaElegida: 'semilla-patata' as const }
    const r = aplicarComando(e1, { tipo: 'ElegirSemilla', objeto: null })
    expect(r.estado.semillaElegida).toBeNull()
    expect(aplicarComando(e0, { tipo: 'ElegirSemilla', objeto: null }).estado).toBe(e0)
  })
  it('rechaza lo que no es una semilla y lo que no hay', () => {
    const elegir = (objeto: string) =>
      error(aplicarComando(e0, { tipo: 'ElegirSemilla', objeto: objeto as never }))
    expect(elegir('planton')).toBe('no-es-semilla')
    expect(elegir('patata')).toBe('no-es-semilla')
    expect(elegir('semilla-lechuga')).toBe('sin-semillas')
    for (const o of ['oro', '', 5, 'constructor']) {
      const r = aplicarComando(e0, { tipo: 'ElegirSemilla', objeto: o as never })
      expect(error(r)).toBe('parametro-invalido')
      expect(r.estado).toBe(e0)
    }
  })
  it('un inventario manipulado da estado-invalido', () => {
    const malo = { ...e0, inventario: [{ objeto: 'semilla-patata', cantidad: -1 }] } as never
    const r = aplicarComando(malo, { tipo: 'ElegirSemilla', objeto: 'semilla-patata' })
    expect(error(r)).toBe('estado-invalido')
  })
})

describe('UsarHerramienta: validación', () => {
  it('se acepta sobre la casilla del personaje y sus 8 vecinas; ara y gasta la energía', () => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const r = usar(e0, 50 + dx, 50 + dy)
        expect(r).toMatchObject({
          ok: true,
          eventos: [
            { tipo: 'herramienta-usada', herramienta: 'azada', x: 50 + dx, y: 50 + dy },
            { tipo: 'tierra-arada', x: 50 + dx, y: 50 + dy },
          ],
        })
        // La azada ara la casilla (M5-03) y gasta su energía; nada más cambia.
        expect(r.estado.energia).toBe(e0.energia - costeEnergia('azada'))
        expect(r.estado.tierra).not.toBe(e0.tierra)
        expect(r.estado).toEqual({ ...e0, energia: r.estado.energia, tierra: r.estado.tierra })
      }
    }
  })
  it('a 2 casillas (también en diagonal) está fuera de alcance', () => {
    for (const [x, y] of [
      [52, 50],
      [50, 48],
      [48, 48],
      [52, 51],
      [49, 52],
    ] as const) {
      const r = usar(e0, x, y)
      expect(error(r)).toBe('fuera-de-alcance')
      expect(r.estado).toBe(e0)
    }
  })
  it('el alcance usa la casilla del personaje, no el redondeo de su posición', () => {
    const e = { ...e0, personaje: { x: 50.99, y: 50.01, orientacion: 'este' as const } }
    expect(usar(e, 51, 49).ok).toBe(true)
    expect(error(usar(e, 52, 50))).toBe('fuera-de-alcance')
    expect(error(usar(e, 49, 52))).toBe('fuera-de-alcance')
  })
  it('solo en Modo Vida', () => {
    expect(error(usar({ ...e0, modo: 'plano' }, 50, 50))).toBe('solo-en-vida')
  })
  it('con la pausa del jugador se rechaza', () => {
    expect(error(usar({ ...e0, pausado: true }, 50, 50))).toBe('en-pausa')
  })
  it('fuera del valle', () => {
    const lado = ladoValle(base.valle)
    const borde = { ...e0, personaje: { x: 0.5, y: 0.5, orientacion: 'norte' as const } }
    expect(error(usar(borde, -1, 0))).toBe('fuera-del-valle')
    expect(error(usar(borde, 0, -1))).toBe('fuera-del-valle')
    const fin = lado - 0.5
    const esquina = { ...e0, personaje: { x: fin, y: fin, orientacion: 'sur' as const } }
    expect(error(usar(esquina, lado, lado - 1))).toBe('fuera-del-valle')
  })
  it.each([NaN, Infinity, 1.5, '5', null, undefined])('parámetro inválido: %s', (n) => {
    expect(error(usar(e0, n as number, 50))).toBe('parametro-invalido')
    expect(error(usar(e0, 50, n as number))).toBe('parametro-invalido')
  })
  it('«semillas» exige una semilla elegida y con existencias', () => {
    const e1 = { ...e0, herramienta: 'semillas' as const }
    expect(error(usar(e1, 50, 50))).toBe('sin-semilla-elegida')
    const arada = arar(e1, 50, 51)
    if (!arada.ok) throw new Error('no ara')
    const e2 = { ...arada.estado, semillaElegida: 'semilla-patata' as const }
    expect(usar(e2, 50, 51)).toMatchObject({
      ok: true,
      eventos: [
        { tipo: 'herramienta-usada', herramienta: 'semillas', x: 50, y: 51 },
        { tipo: 'planta-sembrada', x: 50, y: 51, cultivo: 'patata' },
      ],
    })
    const e3 = { ...e1, semillaElegida: 'semilla-lechuga' as const }
    expect(error(usar(e3, 50, 50))).toBe('sin-semillas')
    const e4 = { ...e1, semillaElegida: 'patata' as never }
    expect(error(usar(e4, 50, 50))).toBe('sin-semillas')
  })
  it('las demás herramientas no exigen semilla', () => {
    for (const h of HERRAMIENTAS.filter((x) => x !== 'semillas')) {
      expect(usar({ ...e0, herramienta: h }, 50, 50).ok).toBe(true)
    }
  })
  it('un estado manipulado da estado-invalido sin lanzar', () => {
    expect(error(usar({ ...e0, herramienta: 'martillo' as never }, 50, 50))).toBe('estado-invalido')
    const roto = { ...e0, personaje: { x: NaN, y: 1, orientacion: 'sur' as const } }
    expect(error(usar(roto, 50, 50))).toBe('estado-invalido')
  })
  it('comprobarUsarHerramienta no aplica nada y coincide con el comando', () => {
    expect(comprobarUsarHerramienta(e0, 50, 50)).toBeUndefined()
    expect(comprobarUsarHerramienta(e0, 60, 50)).toBe('fuera-de-alcance')
  })
  it('un comando desconocido sigue rechazándose', () => {
    const r = aplicarComando(e0, { tipo: 'Nada' } as unknown as Comando)
    expect(error(r)).toBe('comando-desconocido')
  })
})

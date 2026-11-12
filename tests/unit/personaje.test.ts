import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  aplicarComandos,
  casillaBloqueada,
  casillasRio,
  claveCasilla,
  CONFIG_PERSONAJE,
  CONFIG_VALLE,
  crearEstadoInicial,
  generarMundo,
  ladoValle,
  mapaTransitabilidad,
  rioVertical,
  type Comando,
  type EstadoJuego,
  type Obstaculo,
} from '../../src/core'

const SEMILLAS = [1, 42, 12345, 7, 99, 2024]
const M = CONFIG_PERSONAJE.tamanoCaja / 2
const V = CONFIG_PERSONAJE.velocidadCasillasPorSegundo

function mover(e: EstadoJuego, dx: number, dy: number, ms: number): EstadoJuego {
  const r = aplicarComando(e, { tipo: 'MoverPersonaje', dx, dy, ms })
  if (!r.ok) throw new Error(r.error)
  return r.estado
}

/** Repite pulsos de 100 ms. */
function andar(e: EstadoJuego, dx: number, dy: number, pulsos: number): EstadoJuego {
  let s = e
  for (let i = 0; i < pulsos; i++) s = mover(s, dx, dy, 100)
  return s
}

const arbol = (x: number, y: number): Obstaculo => ({ tipo: 'arbol', x, y, variante: 0.1 })

/** Estado de la semilla con solo los obstáculos dados (para escenarios controlados). */
function conObstaculos(semilla: number, obstaculos: readonly Obstaculo[]): EstadoJuego {
  const e = crearEstadoInicial({ semilla, dineroInicial: 0 })
  return { ...e, obstaculos }
}

function en(e: EstadoJuego, x: number, y: number): EstadoJuego {
  return { ...e, personaje: { x, y, orientacion: 'sur' } }
}

describe('aparición', () => {
  it.each(SEMILLAS)('es una casilla transitable en el lado del pueblo (semilla %i)', (s) => {
    const e = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
    const lado = ladoValle(e.valle)
    const mapa = mapaTransitabilidad(e)
    expect(casillaBloqueada(mapa, Math.floor(e.aparicion.x), Math.floor(e.aparicion.y))).toBe(false)
    expect(e.personaje).toEqual({ x: e.aparicion.x, y: e.aparicion.y, orientacion: 'sur' })
    expect(CONFIG_PERSONAJE.ladoPueblo).toBe('sur')
    expect(e.aparicion.y).toBeGreaterThan(lado - 8)
    expect(Math.abs(e.aparicion.x - lado / 2)).toBeLessThan(8)
  })

  it('es fija: no cambia con la partida ni al volver a crear el estado', () => {
    const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    expect(aplicarComandos(e, [{ tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: 200 }]).aparicion).toBe(
      e.aparicion,
    )
    expect(crearEstadoInicial({ semilla: 42, dineroInicial: 0 }).aparicion).toEqual(e.aparicion)
  })

  it.each(['norte', 'este', 'oeste', 'sur'] as const)('respeta ladoPueblo = %s', (lado) => {
    const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const n = ladoValle(e.valle)
    const { aparicion } = generarMundo(e.valle, 42, CONFIG_VALLE, { ladoPueblo: lado })
    const cerca = {
      norte: aparicion.y,
      sur: n - aparicion.y,
      este: n - aparicion.x,
      oeste: aparicion.x,
    }
    expect(cerca[lado]).toBeLessThan(8)
  })
})

describe('MoverPersonaje', () => {
  it('avanza a la velocidad de data/ (casillas/s) y orienta', () => {
    const e = conObstaculos(42, [])
    const r = mover(e, 0, -1, 250)
    expect(e.personaje.y - r.personaje.y).toBeCloseTo((V * 250) / 1000, 6)
    expect(r.personaje.x).toBeCloseTo(e.personaje.x, 9)
    expect(r.personaje.orientacion).toBe('norte')
    expect(mover(e, 1, 0, 10).personaje.orientacion).toBe('este')
    expect(mover(e, -1, 0, 10).personaje.orientacion).toBe('oeste')
    expect(mover(e, 0, 1, 10).personaje.orientacion).toBe('sur')
  })

  it('en diagonal no va más rápido que en recto', () => {
    const e = conObstaculos(42, [])
    const recto = mover(e, 0, -1, 200).personaje
    const diag = mover(e, 1, -1, 200).personaje
    const d = (p: { x: number; y: number }) => Math.hypot(p.x - e.personaje.x, p.y - e.personaje.y)
    expect(d(diag)).toBeLessThanOrEqual(d(recto) + 1e-9)
    expect(d(diag)).toBeGreaterThan(0)
  })

  it('no sale del valle por ningún lado', () => {
    const base = conObstaculos(42, [])
    const lado = ladoValle(base.valle)
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const p = andar(base, dx, dy, 80).personaje
      expect(p.x).toBeGreaterThanOrEqual(M)
      expect(p.y).toBeGreaterThanOrEqual(M)
      expect(p.x).toBeLessThanOrEqual(lado - M)
      expect(p.y).toBeLessThanOrEqual(lado - M)
    }
    // Pegado al borde sur desde la aparición.
    expect(andar(base, 0, 1, 20).personaje.y).toBeGreaterThan(lado - M - 0.01)
  })

  it('no atraviesa un árbol ni una roca y se queda pegado', () => {
    const base = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const cx = Math.floor(base.aparicion.x)
    const cy = Math.floor(base.aparicion.y)
    const e = conObstaculos(42, [arbol(cx + 2, cy), { ...arbol(cx - 2, cy), tipo: 'roca' }])
    const este = andar(e, 1, 0, 30).personaje
    expect(este.x + M).toBeLessThanOrEqual(cx + 2)
    expect(este.x + M).toBeGreaterThan(cx + 2 - 0.01)
    const oeste = andar(e, -1, 0, 30).personaje
    expect(oeste.x - M).toBeGreaterThanOrEqual(cx - 1)
    expect(oeste.x - M).toBeLessThan(cx - 1 + 0.01)
  })

  it('no atraviesa un obstáculo ni con pulsos enormes (sin efecto túnel)', () => {
    const base = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const cx = Math.floor(base.aparicion.x)
    const cy = Math.floor(base.aparicion.y)
    const e = conObstaculos(42, [arbol(cx + 1, cy)])
    for (const ms of [250, 1e4, 1e12, Number.MAX_VALUE]) {
      expect(mover(e, 1, 0, ms).personaje.x + M).toBeLessThanOrEqual(cx + 1)
    }
  })

  it('un comando procesa como máximo maxMsPorComando', () => {
    const e = conObstaculos(42, [])
    const largo = mover(e, 0, -1, 1e9).personaje
    expect(e.personaje.y - largo.y).toBeCloseTo((V * CONFIG_PERSONAJE.maxMsPorComando) / 1000, 6)
  })

  it('se desliza a lo largo de una pared', () => {
    const base = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const cx = Math.floor(base.aparicion.x)
    const cy = Math.floor(base.aparicion.y)
    // Pared vertical a la derecha: sigue subiendo aunque empuje hacia el este.
    const pared = [0, 1, 2, 3, 4].map((d) => arbol(cx + 1, cy - d))
    const r = andar(conObstaculos(42, pared), 1, -1, 5).personaje
    expect(r.x + M).toBeLessThanOrEqual(cx + 1)
    expect(base.aparicion.y - r.y).toBeGreaterThan(1)
    // Techo: sigue hacia el este aunque empuje hacia el norte.
    const techo = [-2, -1, 0, 1, 2].map((d) => arbol(cx + d, cy - 1))
    const t = andar(conObstaculos(42, techo), 1, -1, 5).personaje
    expect(t.y - M).toBeGreaterThanOrEqual(cy)
    expect(t.x - base.aparicion.x).toBeGreaterThan(1)
  })

  it.each(SEMILLAS)('el río bloquea y el vado se cruza (semilla %i)', (semilla) => {
    const e = conObstaculos(semilla, [])
    const lado = ladoValle(e.valle)
    const mapa = mapaTransitabilidad(e)
    const rio = new Set(casillasRio(e.valle).map((c) => claveCasilla(lado, c.x, c.y)))
    const esRio = (x: number, y: number) => rio.has(claveCasilla(lado, x, y))
    const esVado = (x: number, y: number) => e.cauce.vados.includes(claveCasilla(lado, x, y))
    // Dirección de cruce: perpendicular al cauce.
    const vertical = rioVertical(e.valle)
    const [dx, dy] = vertical ? [1, 0] : [0, 1]
    /** Orilla de salida y orilla de llegada de la línea que pasa por (x, y). */
    const orillas = (x: number, y: number) => {
      let ax = x
      let ay = y
      while (esRio(ax, ay)) {
        ax -= dx
        ay -= dy
      }
      let bx = x
      let by = y
      while (esRio(bx, by)) {
        bx += dx
        by += dy
      }
      return { ax, ay, bx, by }
    }
    const k0 = e.cauce.vados[0] as number
    const v = orillas(k0 % lado, Math.floor(k0 / lado))
    expect(casillaBloqueada(mapa, v.ax, v.ay)).toBe(false)
    expect(casillaBloqueada(mapa, v.bx, v.by)).toBe(false)
    const cruzado = andar(en(e, v.ax + 0.5, v.ay + 0.5), dx, dy, 100).personaje
    expect(dx ? cruzado.x : cruzado.y).toBeGreaterThan((dx ? v.bx : v.by) + 0.5 - 0.01)

    // Una línea sin vado: el personaje no pasa a la otra orilla.
    for (const t of [3, 4, 5, 6, -3, -4, -5, -6]) {
      const px = (k0 % lado) + (vertical ? 0 : t)
      const py = Math.floor(k0 / lado) + (vertical ? t : 0)
      const o = orillas(px, py)
      const inicio = en(e, o.ax + 0.5, o.ay + 0.5)
      if (
        px < 0 ||
        py < 0 ||
        px >= lado ||
        py >= lado ||
        esVado(px, py) ||
        casillaBloqueada(mapa, o.ax, o.ay) ||
        casillaBloqueada(mapa, o.bx, o.by)
      )
        continue
      const f = andar(inicio, dx, dy, 100).personaje
      expect(dx ? f.x : f.y).toBeLessThan(dx ? o.bx : o.by)
      expect(
        esRio(Math.floor(f.x), Math.floor(f.y)) && !esVado(Math.floor(f.x), Math.floor(f.y)),
      ).toBe(false)
      break
    }
  })

  it('en pausa no se mueve (ok, sin cambios)', () => {
    const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const p = aplicarComando(e, { tipo: 'Pausar' })
    const r = aplicarComando(p.estado, { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: 200 })
    expect(r.ok).toBe(true)
    expect(r.estado).toBe(p.estado)
  })

  it.each([
    [NaN, 0, 100],
    [0, Infinity, 100],
    [1.01, 0, 100],
    [0, -2, 100],
    [1, 0, -1],
    [1, 0, NaN],
    [1, 0, Infinity],
  ])('parámetros inválidos (%s, %s, %s) dan ok:false con estado intacto', (dx, dy, ms) => {
    const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const r = aplicarComando(e, { tipo: 'MoverPersonaje', dx, dy, ms })
    expect(r).toEqual({ ok: false, estado: e, error: 'parametro-invalido' })
    expect(r.estado).toBe(e)
  })

  it('sin intención (0, 0) o con ms = 0 no cambia nada', () => {
    const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    expect(mover(e, 0, 0, 100)).toBe(e)
    expect(mover(e, 1, 0, 0)).toBe(e)
  })

  it('no muta el estado de entrada', () => {
    const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const copia = JSON.stringify(e)
    mover(e, 1, 1, 200)
    expect(JSON.stringify(e)).toBe(copia)
  })
})

describe('desmayo', () => {
  it('devuelve al personaje a la aparición en la misma transición', () => {
    const e0 = andar(conObstaculos(42, []), 0, -1, 10)
    expect(e0.personaje.y).not.toBe(e0.aparicion.y)
    const r = aplicarComando(e0, { tipo: 'AvanzarTiempo', minutos: 2000 })
    expect(r.ok && r.eventos).toEqual([{ tipo: 'desmayo' }])
    expect(r.estado.personaje).toEqual({ ...e0.aparicion, orientacion: 'sur' })
  })

  it('no mueve al personaje si no hay desmayo', () => {
    const e0 = andar(conObstaculos(42, []), 0, -1, 10)
    expect(aplicarComando(e0, { tipo: 'AvanzarTiempo', minutos: 5 }).estado.personaje).toBe(
      e0.personaje,
    )
  })

  it('reproducir comandos con aplicarComandos da lo mismo', () => {
    const e = conObstaculos(42, [])
    const cmds: Comando[] = [
      { tipo: 'MoverPersonaje', dx: 0, dy: -1, ms: 250 },
      { tipo: 'AvanzarTiempo', minutos: 5000 },
      { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: 100 },
    ]
    const final = aplicarComandos(e, cmds)
    expect(final.personaje.x).toBeCloseTo(e.aparicion.x + (V * 100) / 1000, 6)
    expect(final.personaje.y).toBe(e.aparicion.y)
  })
})

describe('casos límite de la generación', () => {
  it('un valle sin ninguna casilla libre lanza un error claro', () => {
    const e = crearEstadoInicial({ semilla: 1, dineroInicial: 0 })
    const minimo = {
      ...e.valle,
      parcelasPorLado: 1,
      casillasPorParcela: 1,
      parcelas: e.valle.parcelas.slice(0, 1),
      rio: [0],
    }
    expect(() => generarMundo(minimo, 1, CONFIG_VALLE, { ladoPueblo: 'sur' })).toThrow(/aparición/)
  })

  it('los vados no son tiras largas a lo largo del cauce', () => {
    for (let s = 0; s < 60; s++) {
      const e = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
      const maximo = CONFIG_VALLE.vados.max * CONFIG_VALLE.vados.grosor * CONFIG_VALLE.anchoRio
      expect(e.cauce.vados.length).toBeLessThanOrEqual(maximo)
    }
  })
})

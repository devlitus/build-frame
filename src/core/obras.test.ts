/* eslint-disable @typescript-eslint/no-non-null-assertion -- aserciones de índices y catálogo conocidos en tests */
import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  casillaBloqueada,
  crearEstadoInicial,
  defEdificio,
  huellaDe,
  ladoValle,
  mapaTransitabilidad,
  personajeAlDespertar,
  puertaDe,
  terminarObras,
  type Edificio,
  type EstadoJuego,
  type Obstaculo,
  type TipoEdificio,
} from './index'

const base = crearEstadoInicial({ semilla: 42, dineroInicial: 100_000 })
const LADO = ladoValle(base.valle)
const limpio: EstadoJuego = { ...base, obstaculos: [] }
const enAparicion = { ...base.aparicion, orientacion: 'sur' }

const edif = (
  id: number,
  tipo: TipoEdificio,
  x: number,
  y: number,
  diaInicio: number | null,
  dias = 1,
): Edificio => ({
  id,
  tipo,
  x,
  y,
  obra: diaInicio === null ? null : { diaInicio, diaFin: diaInicio + dias },
})
const con = (e: EstadoJuego, edificios: Edificio[], dia = 1, minutoDelDia = 1560): EstadoJuego => ({
  ...e,
  edificios,
  dia,
  minutoDelDia,
})
const avanzar = (e: EstadoJuego, minutos = 1) =>
  aplicarComando(e, { tipo: 'AvanzarTiempo', minutos })
const centro = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5, orientacion: 'sur' })
const libreEn = (e: EstadoJuego, p: { x: number; y: number }) =>
  !casillaBloqueada(mapaTransitabilidad(e), Math.floor(p.x), Math.floor(p.y))

/** ¿Todo el rectángulo es transitable y alcanzable? */
function libre(e: EstadoJuego, x0: number, y0: number, x1: number, y1: number): boolean {
  const m = mapaTransitabilidad(e)
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (casillaBloqueada(m, x, y)) return false
  return true
}
/** Esquina de una casa con la huella y un margen de 1 casilla (puerta incluida) libres. */
function sitioCasa(e: EstadoJuego): { x: number; y: number } {
  const def = defEdificio('casa')!
  for (let y = 2; y < LADO - def.alto - 2; y++)
    for (let x = 2; x < LADO - def.ancho - 2; x++)
      if (libre(e, x - 1, y - 1, x + def.ancho, y + def.alto + 1)) return { x, y }
  throw new Error('sin sitio')
}
const S = sitioCasa(limpio)

describe('puertaDe', () => {
  it('la casa 4x3 en (x, y) tiene la puerta en (x+2, y+3)', () => {
    expect(puertaDe(defEdificio('casa')!, 10, 20)).toEqual({ x: 12, y: 23 })
  })
  it('es genérica con la huella', () => {
    expect(puertaDe({ ancho: 1, alto: 1 }, 5, 5)).toEqual({ x: 5, y: 6 })
    expect(puertaDe(defEdificio('cobertizo')!, 5, 5)).toEqual({ x: 6, y: 7 })
  })
})

describe('terminarObras', () => {
  it('obra de 1 día iniciada el día d termina al empezar el día d+1', () => {
    const e = con(limpio, [edif(1, 'caja-envio', S.x, S.y, 1, 1)], 1)
    expect(terminarObras(e).eventos).toEqual([])
    expect(terminarObras({ ...e, dia: 2 }).estado.edificios[0]!.obra).toBeNull()
  })
  it('una obra de n días sigue en obra hasta d+n', () => {
    const e = con(limpio, [edif(1, 'cobertizo', S.x, S.y, 1, 3)])
    expect(terminarObras({ ...e, dia: 3 }).estado.edificios[0]!.obra).not.toBeNull()
    expect(terminarObras({ ...e, dia: 4 }).estado.edificios[0]!.obra).toBeNull()
  })
  it('sin obras terminadas devuelve el mismo estado', () => {
    const e = con(limpio, [edif(1, 'cobertizo', S.x, S.y, 1, 3)])
    expect(terminarObras(e).estado).toBe(e)
  })
})

describe('cambio de día por desmayo', () => {
  it('obra de 1 día construida el día 1 a las 01:59 termina con el desmayo', () => {
    const e = con(limpio, [edif(1, 'caja-envio', S.x, S.y, 1, 1)], 1, 1559)
    expect(avanzar(e, 1).estado.edificios[0]!.obra).not.toBeNull()
    const r = avanzar(e, 2)
    expect(r.ok && r.eventos).toEqual([
      { tipo: 'desmayo' },
      { tipo: 'obra-terminada', id: 1, tipoEdificio: 'caja-envio' },
    ])
    expect(r.estado.edificios[0]!.obra).toBeNull()
    expect(r.estado.dia).toBe(2)
  })

  it('varias obras con distinta duración: las que tocan terminan a la vez, en orden de id', () => {
    const e = con(limpio, [
      edif(3, 'cobertizo', S.x + 6, S.y, 1, 2),
      edif(1, 'caja-envio', S.x, S.y, 1, 1),
      edif(2, 'caja-envio', S.x + 2, S.y, 1, 1),
      edif(4, 'caja-envio', S.x + 4, S.y + 5, 1, 1),
    ])
    const r1 = avanzar(e)
    expect(r1.ok && r1.eventos.map((v) => (v.tipo === 'obra-terminada' ? v.id : 0))).toEqual([
      0, 1, 2, 4,
    ])
    expect(r1.estado.edificios.find((b) => b.id === 3)!.obra).not.toBeNull()
    const r2 = avanzar({ ...r1.estado, minutoDelDia: 1560 })
    expect(r2.ok && r2.eventos).toEqual([
      { tipo: 'desmayo' },
      { tipo: 'obra-terminada', id: 3, tipoEdificio: 'cobertizo' },
    ])
    expect(r2.estado.edificios.every((b) => b.obra === null)).toBe(true)
  })

  it('en el Plano o en pausa (tiempo detenido) no avanza nada', () => {
    const e = {
      ...con(limpio, [edif(1, 'caja-envio', S.x, S.y, 1, 1)], 1, 1559),
      modo: 'plano' as const,
    }
    const r = avanzar(e, 500)
    expect(r.estado).toBe(e)
    expect(r.ok && r.eventos).toEqual([])
    const p = avanzar({ ...e, modo: 'vida', pausado: true }, 500)
    expect(p.estado.edificios[0]!.obra).not.toBeNull()
    expect(p.estado.dia).toBe(1)
  })

  it('no toca dinero, materiales, zonas ni parcelas', () => {
    const e = con(limpio, [edif(1, 'caja-envio', S.x, S.y, 1, 1)])
    const r = avanzar(e)
    for (const k of ['dinero', 'materiales', 'zonas', 'valle', 'comprasHechas'] as const) {
      expect(r.estado[k]).toBe(e[k])
    }
  })

  it('determinismo y JSON ida y vuelta', () => {
    const e = con(limpio, [edif(1, 'casa', S.x, S.y, 1, 1)])
    const r = avanzar(e)
    expect(JSON.parse(JSON.stringify(r.estado))).toEqual(r.estado)
    expect(avanzar(e)).toEqual(r)
  })
})

describe('D9: despertar en la puerta de la casa', () => {
  const casaTerminada = (e: EstadoJuego, x: number, y: number) =>
    con(e, [edif(1, 'casa', x, y, null)])

  it('sin casa, o con la casa aún en obra, vuelve a la aparición', () => {
    expect(avanzar(con(limpio, [])).estado.personaje).toEqual(enAparicion)
    const enObra = avanzar(con(limpio, [edif(1, 'casa', S.x, S.y, 1, 3)]))
    expect(enObra.estado.personaje).toEqual(enAparicion)
  })

  it('casa terminada: despierta en (x+2, y+3), centrado y mirando al sur', () => {
    const e = casaTerminada(
      { ...limpio, personaje: { x: 0.5, y: 0.5, orientacion: 'norte' } },
      S.x,
      S.y,
    )
    expect(avanzar(e).estado.personaje).toEqual(centro(S.x + 2, S.y + 3))
  })

  it('casa que termina esa misma noche: ya despierta en su puerta', () => {
    const r = avanzar(con(limpio, [edif(1, 'casa', S.x, S.y, 1, 1)]))
    expect(r.estado.edificios[0]!.obra).toBeNull()
    expect(r.estado.personaje).toEqual(centro(S.x + 2, S.y + 3))
  })

  it('puerta con un árbol: la casilla libre más cercana (empate ⇒ menor y, luego menor x)', () => {
    const arbol: Obstaculo = { tipo: 'arbol', x: S.x + 2, y: S.y + 3, variante: 0 }
    const e = casaTerminada({ ...limpio, obstaculos: [arbol] }, S.x, S.y)
    const p = personajeAlDespertar(e)
    expect(p).toEqual(centro(S.x + 1, S.y + 3))
    expect(libreEn(e, p)).toBe(true)
  })

  it('puerta ocupada por otro edificio', () => {
    const e = con(limpio, [
      edif(1, 'casa', S.x, S.y, null),
      edif(2, 'caja-envio', S.x + 2, S.y + 3, null),
    ])
    expect(personajeAlDespertar(e)).toEqual(centro(S.x + 1, S.y + 3))
  })

  it('anillo 1 entero ocupado: pasa al anillo 2, nunca a una casilla bloqueada', () => {
    const lista: Edificio[] = [edif(1, 'casa', S.x, S.y, null)]
    let id = 2
    for (let y = S.y - 1; y <= S.y + 3; y++)
      for (let x = S.x - 1; x <= S.x + 4; x++)
        if (y === S.y - 1 || y === S.y + 3 || x === S.x - 1 || x === S.x + 4)
          lista.push(edif(id++, 'caja-envio', x, y, null))
    const e = con(limpio, lista)
    const p = personajeAlDespertar(e)
    expect(libreEn(e, p)).toBe(true)
    expect(p).toEqual(centro(S.x + 2, S.y + 4))
  })

  it('casa rodeada sin camino desde la aparición: la aparición', () => {
    const rocas: Obstaculo[] = []
    for (let y = 0; y < LADO; y++)
      for (let x = 0; x < LADO; x++) {
        const enHuella = x >= S.x && x <= S.x + 3 && y >= S.y && y <= S.y + 2
        const enAparicion = x === Math.floor(base.aparicion.x) && y === Math.floor(base.aparicion.y)
        if (!enHuella && !enAparicion) rocas.push({ tipo: 'roca', x, y, variante: 0 })
      }
    const e = casaTerminada({ ...limpio, obstaculos: rocas }, S.x, S.y)
    expect(personajeAlDespertar(e)).toEqual(enAparicion)
  })

  it('casa en el borde inferior del valle: la puerta cae fuera y usa la casilla vecina', () => {
    const def = defEdificio('casa')!
    const y = LADO - def.alto
    let x = -1
    for (let i = 2; i < LADO - def.ancho - 1; i++) {
      if (libre(limpio, i - 1, y - 1, i + def.ancho, LADO - 1)) {
        x = i
        break
      }
    }
    expect(x).toBeGreaterThan(0)
    expect(huellaDe(def, x, y).y1).toBe(LADO - 1)
    const e = casaTerminada(limpio, x, y)
    const p = personajeAlDespertar(e)
    // Puerta (x+2, LADO) fuera del valle; la más cercana (dist² 5) es (x+4, LADO-1).
    expect(p).toEqual(centro(x + 4, LADO - 1))
    expect(libreEn(e, p)).toBe(true)
  })
})

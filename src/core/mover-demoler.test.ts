/* eslint-disable @typescript-eslint/no-non-null-assertion -- aserciones de ids y catálogo conocidos en tests */
import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  colocacionValida,
  comprobarMover,
  crearEstadoInicial,
  CONFIG_EDIFICIOS,
  defEdificio,
  ladoValle,
  personajeAlDespertar,
  puertaDe,
  reembolso,
  type Comando,
  type EstadoJuego,
  type TipoEdificio,
} from './index'

/** Plano con todas las parcelas propias que no son río, vivienda a la izquierda y almacén a la derecha. */
function preparar(semilla = 42, dinero = 10_000): EstadoJuego {
  let e = crearEstadoInicial({ semilla, dineroInicial: dinero })
  const paso = (c: Comando): void => {
    const r = aplicarComando(e, c)
    if (r.ok) e = r.estado
  }
  const n = e.valle.parcelasPorLado
  for (let i = 0; i < n * n; i++) paso({ tipo: 'ComprarParcela', indice: i })
  const lado = ladoValle(e.valle)
  const mitad = Math.floor(lado / 2)
  paso({ tipo: 'PintarZona', x0: 0, y0: 0, x1: mitad - 1, y1: lado - 1, zona: 'vivienda' })
  paso({ tipo: 'PintarZona', x0: mitad, y0: 0, x1: lado - 1, y1: lado - 1, zona: 'almacen' })
  paso({ tipo: 'CambiarModo', modo: 'plano' })
  return e
}

const base = preparar()

/** Sitio válido (sin mirar costes) número `saltar` en `e`; con -1, el último (lejos del primero). */
function sitio(e: EstadoJuego, tipo: TipoEdificio, saltar = 0): { x: number; y: number } {
  const lado = ladoValle(e.valle)
  const validos: { x: number; y: number }[] = []
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if (colocacionValida(e, tipo, x, y, { ignorarCostes: true }).valida) validos.push({ x, y })
    }
  }
  const s = validos.at(saltar)
  if (!s) throw new Error(`sin sitio para ${tipo}`)
  return s
}

function ok(e: EstadoJuego, c: Comando): EstadoJuego {
  const r = aplicarComando(e, c)
  if (!r.ok) throw new Error(`rechazado: ${r.error}`)
  return r.estado
}

/** Construye `tipo` en el primer sitio lejos de los anteriores; devuelve estado e id. */
function construir(
  e: EstadoJuego,
  tipo: TipoEdificio,
  saltar = 0,
): { e: EstadoJuego; id: number; x: number; y: number } {
  const s = sitio(e, tipo, saltar)
  const id = e.siguienteIdEdificio
  return { e: ok(e, { tipo: 'Construir', tipoEdificio: tipo, ...s }), id, ...s }
}

/** Pasa `dias` días con desmayos (termina las obras). */
function pasarDias(e: EstadoJuego, dias: number): EstadoJuego {
  let s: EstadoJuego = { ...e, modo: 'vida' }
  for (let i = 0; i < dias; i++) s = ok(s, { tipo: 'AvanzarTiempo', minutos: 100_000 })
  return { ...s, modo: 'plano' }
}

const terminada = (tipo: TipoEdificio, saltar = 0) => {
  const c = construir(base, tipo, saltar)
  return { ...c, e: pasarDias(c.e, defEdificio(tipo)!.dias) }
}

describe('datos de reembolso (D8)', () => {
  it('demoler devuelve el 50 % redondeado hacia abajo; la casa no es demolible', () => {
    expect(CONFIG_EDIFICIOS.reembolsoDemolicion).toBe(0.5)
    expect(CONFIG_EDIFICIOS.redondeoReembolso).toBe('abajo')
    expect(defEdificio('casa')!.demolible).toBe(false)
    expect(defEdificio('cobertizo')!.demolible).toBe(true)
  })
})

describe('reembolso', () => {
  it('una obra devuelve el 100 % de lo pagado', () => {
    const c = construir(base, 'cobertizo')
    expect(reembolso(c.e, c.id)).toEqual({
      accion: 'cancelar',
      coste: { dinero: 300, madera: 50, piedra: 10 },
    })
  })
  it('un edificio terminado devuelve la mitad, redondeada hacia abajo', () => {
    const c = terminada('cobertizo')
    expect(reembolso(c.e, c.id)).toEqual({
      accion: 'demoler',
      coste: { dinero: 150, madera: 25, piedra: 5 },
    })
  })
  it('redondea hacia abajo con cantidades impares', () => {
    const c = terminada('caja-envio')
    const e = {
      ...c.e,
      edificios: c.e.edificios.map((b) => ({
        ...b,
        pagado: { dinero: 51, madera: 21, piedra: 1 },
      })),
    }
    expect(reembolso(e, c.id)!.coste).toEqual({ dinero: 25, madera: 10, piedra: 0 })
  })
  it('se calcula sobre lo pagado aunque el catálogo sea otro', () => {
    const c = terminada('cobertizo')
    const e = {
      ...c.e,
      edificios: c.e.edificios.map((b) => ({
        ...b,
        pagado: { dinero: 100, madera: 0, piedra: 0 },
      })),
    }
    expect(reembolso(e, c.id)!.coste).toEqual({ dinero: 50, madera: 0, piedra: 0 })
  })
  it('sin `pagado` (heredado) usa el coste del catálogo', () => {
    const c = terminada('cobertizo')
    const e = {
      ...c.e,
      edificios: c.e.edificios.map((b) => ({
        id: b.id,
        tipo: b.tipo,
        x: b.x,
        y: b.y,
        obra: b.obra,
      })),
    }
    expect(reembolso(e, c.id)!.coste).toEqual({ dinero: 150, madera: 25, piedra: 5 })
  })
  it('la casa terminada, un id inexistente o un tipo desconocido no tienen reembolso', () => {
    const casa = terminada('casa')
    expect(reembolso(casa.e, casa.id)).toBeUndefined()
    expect(reembolso(base, 99)).toBeUndefined()
    const raro = {
      ...base,
      edificios: [{ id: 1, tipo: 'nada' as TipoEdificio, x: 0, y: 0, obra: null }],
    }
    expect(reembolso(raro, 1)).toBeUndefined()
  })
  it('la obra de la casa se cancela por 0 (es gratis)', () => {
    const c = construir(base, 'casa')
    expect(reembolso(c.e, c.id)).toEqual({
      accion: 'cancelar',
      coste: { dinero: 0, madera: 0, piedra: 0 },
    })
  })
})

describe('CancelarObra', () => {
  it('devuelve todo lo pagado y quita la obra', () => {
    const c = construir(base, 'cobertizo')
    const r = aplicarComando(c.e, { tipo: 'CancelarObra', id: c.id })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.estado.dinero).toBe(base.dinero)
    expect(r.estado.materiales).toEqual(base.materiales)
    expect(r.estado.edificios).toEqual([])
    expect(r.eventos).toEqual([
      {
        tipo: 'obra-cancelada',
        id: c.id,
        tipoEdificio: 'cobertizo',
        reembolso: { dinero: 300, madera: 50, piedra: 10 },
      },
    ])
  })
  it('no es una obra, no existe o no es Plano: error y mismo estado', () => {
    const t = terminada('cobertizo')
    const a = aplicarComando(t.e, { tipo: 'CancelarObra', id: t.id })
    expect(a).toMatchObject({ ok: false, error: 'no-es-obra' })
    expect(a.estado).toBe(t.e)
    expect(aplicarComando(t.e, { tipo: 'CancelarObra', id: 77 })).toMatchObject({
      ok: false,
      error: 'edificio-inexistente',
    })
    const c = construir(base, 'caja-envio')
    const vida = { ...c.e, modo: 'vida' as const }
    expect(aplicarComando(vida, { tipo: 'CancelarObra', id: c.id })).toMatchObject({
      ok: false,
      error: 'solo-en-plano',
    })
  })
  it('permite volver a construir la casa única tras cancelar su obra', () => {
    const c = construir(base, 'casa')
    expect(colocacionValida(c.e, 'casa', c.x + 10, c.y).valida).toBe(false)
    const e = ok(c.e, { tipo: 'CancelarObra', id: c.id })
    expect(colocacionValida(e, 'casa', c.x, c.y).valida).toBe(true)
  })
})

describe('DemolerEdificio', () => {
  it('devuelve el 50 % y quita el edificio; los ids no se reutilizan', () => {
    const t = terminada('cobertizo')
    const r = aplicarComando(t.e, { tipo: 'DemolerEdificio', id: t.id })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.estado.dinero).toBe(t.e.dinero + 150)
    expect(r.estado.materiales).toEqual({
      madera: t.e.materiales.madera + 25,
      piedra: t.e.materiales.piedra + 5,
    })
    expect(r.estado.edificios).toEqual([])
    expect(r.estado.siguienteIdEdificio).toBe(t.e.siguienteIdEdificio)
    expect(r.eventos).toEqual([
      {
        tipo: 'edificio-demolido',
        id: t.id,
        tipoEdificio: 'cobertizo',
        reembolso: { dinero: 150, madera: 25, piedra: 5 },
      },
    ])
  })
  it('el reembolso del evento es el de `reembolso()`', () => {
    const t = terminada('caja-envio')
    const previsto = reembolso(t.e, t.id)!
    const r = aplicarComando(t.e, { tipo: 'DemolerEdificio', id: t.id })
    expect(r.ok && r.eventos[0]).toMatchObject({ reembolso: previsto.coste })
  })
  it('la casa no se puede demoler', () => {
    const t = terminada('casa')
    const r = aplicarComando(t.e, { tipo: 'DemolerEdificio', id: t.id })
    expect(r).toMatchObject({ ok: false, error: 'no-demolible' })
    expect(r.estado).toBe(t.e)
  })
  it('una obra no se demuele (se cancela)', () => {
    const c = construir(base, 'cobertizo')
    expect(aplicarComando(c.e, { tipo: 'DemolerEdificio', id: c.id })).toMatchObject({
      ok: false,
      error: 'en-obra',
    })
  })
  it('parámetros inválidos, inexistente y fuera del Plano', () => {
    const t = terminada('cobertizo')
    for (const id of [1.5, NaN, Infinity, '1' as unknown as number]) {
      expect(aplicarComando(t.e, { tipo: 'DemolerEdificio', id })).toMatchObject({
        ok: false,
        error: 'parametro-invalido',
      })
    }
    expect(aplicarComando(t.e, { tipo: 'DemolerEdificio', id: 99 })).toMatchObject({
      ok: false,
      error: 'edificio-inexistente',
    })
    expect(
      aplicarComando({ ...t.e, modo: 'vida' }, { tipo: 'DemolerEdificio', id: t.id }),
    ).toMatchObject({ ok: false, error: 'solo-en-plano' })
  })
  it('un reembolso que desbordaría el dinero se rechaza sin cambiar nada', () => {
    const t = terminada('cobertizo')
    const e = { ...t.e, dinero: Number.MAX_SAFE_INTEGER }
    const r = aplicarComando(e, { tipo: 'DemolerEdificio', id: t.id })
    expect(r).toMatchObject({ ok: false, error: 'limite-de-recursos' })
    expect(r.estado).toBe(e)
  })
  it('un estado sin edificios no lanza', () => {
    const roto = { ...base, edificios: undefined } as unknown as EstadoJuego
    for (const tipo of ['DemolerEdificio', 'CancelarObra'] as const) {
      expect(aplicarComando(roto, { tipo, id: 1 })).toMatchObject({
        ok: false,
        error: 'estado-invalido',
      })
    }
  })
})

describe('MoverEdificio', () => {
  it('mueve un edificio terminado gratis e instantáneo, conservando id y lo pagado', () => {
    const t = terminada('cobertizo')
    const destino = sitio(t.e, 'cobertizo', -1)
    const r = aplicarComando(t.e, { tipo: 'MoverEdificio', id: t.id, ...destino })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const antes = t.e.edificios[0]!
    const despues = r.estado.edificios[0]!
    expect(despues).toEqual({ ...antes, ...destino })
    expect(r.estado.dinero).toBe(t.e.dinero)
    expect(r.estado.materiales).toEqual(t.e.materiales)
    expect(r.estado.dia).toBe(t.e.dia)
    expect(r.estado.minutoDelDia).toBe(t.e.minutoDelDia)
    expect(r.eventos).toEqual([
      { tipo: 'edificio-movido', id: t.id, tipoEdificio: 'cobertizo', ...destino },
    ])
  })
  it('mover no cuesta aunque no haya dinero ni materiales', () => {
    const t = terminada('cobertizo')
    const pobre = { ...t.e, dinero: 0, materiales: { madera: 0, piedra: 0 } }
    const destino = sitio(pobre, 'cobertizo', -1)
    expect(comprobarMover(pobre, t.id, destino.x, destino.y)).toBeUndefined()
    const r = aplicarComando(pobre, { tipo: 'MoverEdificio', id: t.id, ...destino })
    expect(r.ok && r.estado.dinero).toBe(0)
  })
  it('no choca consigo mismo: puede solaparse con su huella actual', () => {
    const t = terminada('cobertizo')
    const h = t.e.edificios[0]!
    const e = t.e
    let movido = false
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = h.x + dx
      const y = h.y + dy
      // Mismo veredicto que construir con la huella libre, salvo por la propia.
      if (comprobarMover(e, t.id, x, y) === undefined) {
        const r = aplicarComando(e, { tipo: 'MoverEdificio', id: t.id, x, y })
        expect(r.ok && r.estado.edificios[0]).toMatchObject({ x, y })
        movido = true
        break
      }
    }
    expect(movido).toBe(true)
    // Y para construir uno nuevo en ese mismo sitio sí estorba.
    expect(colocacionValida(e, 'cobertizo', h.x, h.y).valida).toBe(false)
  })
  it('soltarlo donde está no cambia nada', () => {
    const t = terminada('cobertizo')
    const h = t.e.edificios[0]!
    const r = aplicarComando(t.e, { tipo: 'MoverEdificio', id: t.id, x: h.x, y: h.y })
    expect(r).toMatchObject({ ok: true, eventos: [] })
    expect(r.estado).toBe(t.e)
  })
  it('usa las mismas reglas de colocación: zona, parcela, agua, otro edificio...', () => {
    const t = terminada('cobertizo')
    const lado = ladoValle(t.e.valle)
    // Casilla de vivienda: el cobertizo pide almacén.
    expect(comprobarMover(t.e, t.id, 1, 1)).not.toBeUndefined()
    // Sin pasarse del valle.
    expect(comprobarMover(t.e, t.id, lado, 0)).toBe('fuera-del-valle')
    expect(comprobarMover(t.e, t.id, -1, 0)).toBe('fuera-del-valle')
    // Equivale al motivo de construir en el mismo punto cuando no interviene el propio edificio.
    const a = construir(base, 'caja-envio')
    const b = construir(a.e, 'caja-envio', 5)
    const e2 = pasarDias(b.e, 1)
    expect(comprobarMover(e2, a.id, b.x, b.y)).toBe('ocupada')
  })
  it('una obra no se puede mover', () => {
    const c = construir(base, 'cobertizo')
    const destino = sitio(c.e, 'cobertizo', -1)
    const r = aplicarComando(c.e, { tipo: 'MoverEdificio', id: c.id, ...destino })
    expect(r).toMatchObject({ ok: false, error: 'en-obra' })
    expect(r.estado).toBe(c.e)
  })
  it('solo en Plano, con ids y coordenadas válidos', () => {
    const t = terminada('cobertizo')
    const destino = sitio(t.e, 'cobertizo', -1)
    expect(
      aplicarComando({ ...t.e, modo: 'vida' }, { tipo: 'MoverEdificio', id: t.id, ...destino }),
    ).toMatchObject({ ok: false, error: 'solo-en-plano' })
    expect(aplicarComando(t.e, { tipo: 'MoverEdificio', id: 99, ...destino })).toMatchObject({
      ok: false,
      error: 'edificio-inexistente',
    })
    for (const m of [
      { x: 1.5, y: 0 },
      { x: NaN, y: 0 },
      { x: 0, y: Infinity },
    ]) {
      expect(aplicarComando(t.e, { tipo: 'MoverEdificio', id: t.id, ...m })).toMatchObject({
        ok: false,
        error: 'parametro-invalido',
      })
    }
  })
  it('un estado sin edificios no lanza', () => {
    const roto = { ...base, edificios: undefined } as unknown as EstadoJuego
    expect(aplicarComando(roto, { tipo: 'MoverEdificio', id: 1, x: 1, y: 1 })).toMatchObject({
      ok: false,
      error: 'estado-invalido',
    })
  })
  it('respeta `bloquea-paso` igual que construir', () => {
    // Si el veredicto de mover coincide con el de construir en un sitio libre, el motivo es el mismo.
    const t = terminada('caja-envio')
    const h = t.e.edificios[0]!
    const sinEl = { ...t.e, edificios: [] }
    const lado = ladoValle(t.e.valle)
    for (let y = 0; y < lado; y += 3) {
      for (let x = 0; x < lado; x += 3) {
        const mover = comprobarMover(t.e, t.id, x, y)
        const construirV = colocacionValida(sinEl, 'caja-envio', x, y, { ignorarCostes: true })
        if (x === h.x && y === h.y) continue
        expect(mover === undefined).toBe(construirV.valida)
        if (!construirV.valida) expect(mover).toBe(construirV.motivo)
      }
    }
  })
})

describe('mover la casa (D9)', () => {
  it('la puerta del despertar se mueve con la casa', () => {
    const t = terminada('casa')
    const def = defEdificio('casa')!
    const antes = personajeAlDespertar(t.e)
    const p0 = puertaDe(def, t.x, t.y)
    expect(Math.floor(antes.x)).toBe(p0.x)
    expect(Math.floor(antes.y)).toBe(p0.y)
    const destino = sitio({ ...t.e, edificios: [] }, 'casa', -1)
    const movida = ok(t.e, { tipo: 'MoverEdificio', id: t.id, ...destino })
    const despues = personajeAlDespertar(movida)
    const p1 = puertaDe(def, destino.x, destino.y)
    expect(Math.floor(despues.x)).toBe(p1.x)
    expect(Math.floor(despues.y)).toBe(p1.y)
    // Y el desmayo despierta ahí de verdad.
    const dormida = ok({ ...movida, modo: 'vida' }, { tipo: 'AvanzarTiempo', minutos: 100_000 })
    expect(Math.floor(dormida.personaje.x)).toBe(p1.x)
    expect(Math.floor(dormida.personaje.y)).toBe(p1.y)
  })
  it('la casa sigue siendo única aunque no se pueda demoler', () => {
    const t = terminada('casa')
    expect(colocacionValida(t.e, 'casa', t.x + 20, t.y)).toEqual({
      valida: false,
      motivo: 'unico-ya-existe',
    })
  })
})

describe('propiedad de dinero (construir y quitar nunca da más)', () => {
  it.each(['caja-envio', 'cobertizo'] as const)(
    'cancelar %s deja exactamente lo de antes',
    (tipo) => {
      const c = construir(base, tipo)
      const e = ok(c.e, { tipo: 'CancelarObra', id: c.id })
      expect(e.dinero).toBe(base.dinero)
      expect(e.materiales).toEqual(base.materiales)
    },
  )
  it.each(['caja-envio', 'cobertizo'] as const)(
    'demoler %s deja menos o igual que antes',
    (tipo) => {
      const t = terminada(tipo)
      const e = ok(t.e, { tipo: 'DemolerEdificio', id: t.id })
      expect(e.dinero).toBeLessThanOrEqual(base.dinero)
      expect(e.materiales.madera).toBeLessThanOrEqual(base.materiales.madera)
      expect(e.materiales.piedra).toBeLessThanOrEqual(base.materiales.piedra)
    },
  )
})

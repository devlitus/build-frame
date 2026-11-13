import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { aplicarComando, crearEstadoInicial, ladoValle, type Comando } from '../../src/core'
import { aguaBloqueada } from '../../src/core/mapa'

/**
 * Propiedad de M4-02 (ronda 2): tras cualquier secuencia de comandos, todas las casillas
 * transitables (sin agua, árbol, roca ni edificio) están conectadas con la aparición.
 */
describe('bloquea-paso: conectividad', () => {
  it('toda casilla transitable sigue conectada con la aparición tras cualquier secuencia', () => {
    const base = crearEstadoInicial({
      semilla: 7,
      dineroInicial: 1_000_000_000,
      materialesIniciales: { madera: 1_000_000, piedra: 1_000_000 },
    })
    const lado = ladoValle(base.valle)
    const inicial = {
      ...base,
      modo: 'plano' as const,
      valle: {
        ...base.valle,
        parcelas: base.valle.parcelas.map((p) => ({ ...p, estado: 'propia' as const })),
      },
    }
    const pintado = aplicarComando(inicial, {
      tipo: 'PintarZona',
      x0: 0,
      y0: 0,
      x1: lado - 1,
      y1: lado - 1,
      zona: 'almacen',
    })
    if (!pintado.ok) throw new Error('no se pudo pintar')
    const e0 = pintado.estado
    const ax = Math.floor(e0.aparicion.x)
    const ay = Math.floor(e0.aparicion.y)
    // Casillas de interés: alrededor de la aparición (donde más fácil es encerrar) y al azar.
    const coord = fc.oneof(fc.integer({ min: -4, max: 4 }), fc.integer({ min: -lado, max: lado }))
    const orden = fc.record({ x: coord, y: coord, t: fc.constantFrom('caja-envio', 'cobertizo') })

    fc.assert(
      fc.property(fc.array(orden, { minLength: 1, maxLength: 120 }), (ordenes) => {
        let e = e0
        for (const o of ordenes) {
          const cmd: Comando = {
            tipo: 'Construir',
            tipoEdificio: o.t,
            x: Math.max(0, Math.min(lado - 1, ax + o.x)),
            y: Math.max(0, Math.min(lado - 1, ay + o.y)),
          }
          const r = aplicarComando(e, cmd)
          if (r.ok) e = r.estado
        }
        // BFS propio.
        const agua = aguaBloqueada(e.valle, e.cauce)
        const cerrada = new Uint8Array(lado * lado)
        for (let i = 0; i < cerrada.length; i++) cerrada[i] = agua[i] as number
        for (const o of e.obstaculos) cerrada[o.y * lado + o.x] = 1
        for (const b of e.edificios) {
          const an = b.tipo === 'cobertizo' ? 3 : 1
          const al = b.tipo === 'cobertizo' ? 2 : 1
          for (let y = b.y; y < b.y + al; y++)
            for (let x = b.x; x < b.x + an; x++) cerrada[y * lado + x] = 1
        }
        const visto = new Uint8Array(lado * lado)
        const pila = [ay * lado + ax]
        visto[pila[0] as number] = 1
        while (pila.length > 0) {
          const k = pila.pop() as number
          const x = k % lado
          for (const n of [k - lado, x > 0 ? k - 1 : -1, x < lado - 1 ? k + 1 : -1, k + lado]) {
            if (n < 0 || n >= lado * lado || visto[n] || cerrada[n]) continue
            visto[n] = 1
            pila.push(n)
          }
        }
        for (let i = 0; i < cerrada.length; i++) {
          if (!cerrada[i] && !visto[i]) return false
        }
        return true
      }),
      { numRuns: 60 },
    )
    expect(true).toBe(true)
  })
})

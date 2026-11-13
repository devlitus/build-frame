import { describe, expect, it } from 'vitest'
import type Phaser from 'phaser'
import { objetosDeDecoracion } from '../../src/game/valle/terrenoArte'
import { CapaObjetos, type ObjetoProfundo } from '../../src/game/valle/capaObjetos'

/** Imagen falsa con lo mínimo que usa la capa. */
class Img {
  destruida = false
  texture = { key: '' }
  depth = 0
  x = 0
  y = 0
  datos: Record<string, unknown> = {}
  angle = 0
  alpha = 1
  tinte = false
  visible = true
  setAngle(a: number): this {
    this.angle = a
    return this
  }
  setAlpha(a: number): this {
    this.alpha = a
    return this
  }
  clearTint(): this {
    this.tinte = false
    return this
  }
  setVisible(v: boolean): this {
    this.visible = v
    return this
  }
  setOrigin(): this {
    return this
  }
  setTexture(k: string): this {
    this.texture.key = k
    return this
  }
  setPosition(x: number, y: number): this {
    this.x = x
    this.y = y
    return this
  }
  setScale(): this {
    return this
  }
  setDepth(d: number): this {
    this.depth = d
    return this
  }
  setData(k: string, v: unknown): this {
    this.datos[k] = v
    return this
  }
  destroy(): void {
    this.destruida = true
  }
}

function escenaFalsa() {
  const creadas: Img[] = []
  const tweensMuertos: Img[] = []
  const escena = {
    tweens: { killTweensOf: (i: Img) => tweensMuertos.push(i) },
    add: {
      image: () => {
        const i = new Img()
        creadas.push(i)
        return i
      },
    },
  } as unknown as Phaser.Scene
  return { escena, creadas, tweensMuertos }
}

/** Un árbol de 64×96 con la base en la casilla (cx, cy). */
function arbol(id: number, cx: number, cy: number): ObjetoProfundo {
  const x = cx * 32 + 16
  const y = (cy + 1) * 32
  return {
    id,
    x,
    y,
    profundidad: y,
    textura: 'arbol',
    escala: 1,
    rect: { x0: x - 32, x1: x + 32, y0: y - 96, y1: y },
  }
}

describe('capa de objetos por profundidad', () => {
  const objetos = [arbol(0, 5, 10), arbol(1, 6, 10), arbol(2, 90, 90), arbol(3, 5, 60)]
  const vista = { x0: 0, y0: 200, x1: 400, y1: 500 }

  it('solo crea imagen para lo que cae en la vista y el margen, con profundidad por la base', () => {
    const { escena, creadas } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar(objetos)
    capa.actualizar(vista)
    expect(capa.cantidad).toBe(2)
    expect(creadas).toHaveLength(2)
    expect(capa.imagen(0)?.depth).toBe(11 * 32)
    expect(capa.imagen(2)).toBeUndefined()
    expect(capa.contarEn(vista)).toBe(2)
  })

  it('reutiliza las imágenes al mover la vista y destruye las sobrantes', () => {
    const { escena, creadas } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar(objetos)
    capa.actualizar(vista)
    capa.actualizar({ x0: 0, y0: 1800, x1: 400, y1: 2100 }) // solo el árbol 3
    expect(capa.cantidad).toBe(1)
    expect(creadas).toHaveLength(2)
    expect(creadas.filter((i) => i.destruida)).toHaveLength(1)
    expect(capa.imagen(3)?.y).toBe(61 * 32)
  })

  it('no rehace nada si la vista no cambia de bloque', () => {
    const { escena } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar(objetos)
    capa.actualizar(vista)
    capa.actualizar({ ...vista, x0: 1, x1: 401 })
    expect(capa.reconstrucciones).toBe(1)
  })

  it('un objeto con la copa sobresaliendo por el norte aparece aunque su base esté fuera', () => {
    const { escena } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar([arbol(7, 3, 20)]) // base en y=672, copa desde 576
    capa.actualizar({ x0: 0, y0: 300, x1: 400, y1: 560 }) // vista y margen llegan a 688
    expect(capa.cantidad).toBe(1)
    capa.invalidar()
    expect(capa.cantidad).toBe(0)
  })

  it('reemplazar conserva las imágenes de los objetos que no cambian y solo toca las que cambian', () => {
    const { escena, creadas } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar(objetos)
    capa.actualizar(vista)
    const i0 = capa.imagen(0)
    const i1 = capa.imagen(1)
    const movido = { ...arbol(1, 6, 10), x: 6 * 32 + 20, profundidad: 11 * 32 + 1 }
    capa.reemplazar([objetos[0], movido, objetos[2], objetos[3]])
    capa.actualizar(vista)
    expect(capa.imagen(0)).toBe(i0)
    expect(capa.imagen(1)).toBe(i1) // la del objeto cambiado se reutiliza, ya actualizada
    expect(capa.imagen(1)?.x).toBe(6 * 32 + 20)
    expect(capa.imagen(1)?.depth).toBe(11 * 32 + 1)
    expect(creadas).toHaveLength(2)
    expect(creadas.some((i) => i.destruida)).toBe(false)
  })

  it('al reutilizar una imagen se reinician ángulo, alfa, tinte y visibilidad y se matan sus tweens', () => {
    const { escena, tweensMuertos } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar(objetos)
    capa.actualizar(vista)
    const sucias = [capa.imagen(0), capa.imagen(1)] as unknown as Img[]
    for (const s of sucias) {
      s.angle = 30
      s.alpha = 0.2
      s.tinte = true
      s.visible = false
    }
    capa.reemplazar([arbol(3, 5, 60)])
    capa.actualizar({ x0: 0, y0: 1800, x1: 400, y1: 2100 })
    const nueva = capa.imagen(3) as unknown as Img
    expect(sucias).toContain(nueva)
    expect([nueva.angle, nueva.alpha, nueva.tinte, nueva.visible]).toEqual([0, 1, false, true])
    expect(tweensMuertos).toContain(nueva)
  })

  it('invalidar y destruir matan los tweens antes de destruir las imágenes', () => {
    const { escena, creadas, tweensMuertos } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar(objetos)
    capa.actualizar(vista)
    capa.invalidar()
    expect(creadas.every((i) => i.destruida && tweensMuertos.includes(i))).toBe(true)
    capa.actualizar(vista)
    capa.destruir()
    expect(creadas.filter((i) => i.destruida)).toHaveLength(creadas.length)
  })
})

describe('objetosDeDecoracion: id estable', () => {
  it('al quitar un obstáculo, los id de los demás no cambian', () => {
    const escena = { textures: { getFrame: () => ({ realWidth: 64 }) } }
    const lado = 96
    const obs = [
      { tipo: 'arbol', x: 3, y: 4, variante: 0.2 },
      { tipo: 'roca', x: 10, y: 4, variante: 0.5 },
      { tipo: 'arbol', x: 7, y: 9, variante: 0.9 },
    ] as const
    const antes = objetosDeDecoracion(escena as never, obs, lado)
    const despues = objetosDeDecoracion(escena as never, [obs[0], obs[2]], lado)
    expect(despues.map((o) => o.id)).toEqual([antes[0].id, antes[2].id])
    expect(new Set(antes.map((o) => o.id)).size).toBe(3)
  })
})

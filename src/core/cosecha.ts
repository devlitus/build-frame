import { CULTIVOS } from './datos/claves'
import type { EstadoJuego } from './estado'
import type { EfectoHerramienta, ErrorUsoHerramienta, ResultadoEfecto } from './herramientas'
import { anadirObjeto, capacidadInventario, inventarioValido, type ObjetoId } from './inventario'
import { ladoValle } from './mapa'
import { defCultivo, diasHastaMadurar, type Cultivo } from './cultivos'
import { CARACTER_ARADA, CARACTER_REGADA, tierraValida, type Planta } from './tierra'
import { limpiarMarchita, hayMarchita } from './riego'

/*
 * Cosechar (M5-05). La mano recoge la planta madura y viva de la casilla: el producto va al
 * inventario (si no cabe, se rechaza y la planta se queda). Los cultivos que rebrotan vuelven a
 * crecer; el resto deja la casilla arada. Todo en funciones puras.
 */

/** Hecho: se cosechó la planta de (x, y); `rebrota` dice si sigue creciendo. */
export interface EventoPlantaCosechada {
  readonly tipo: 'planta-cosechada'
  readonly x: number
  readonly y: number
  readonly cultivo: Cultivo
  readonly producto: ObjetoId
  readonly cantidad: number
  readonly rebrota: boolean
}

/** Planta madura y viva de (x, y), si hay. */
function maduraEn(estado: EstadoJuego, x: number, y: number): Planta | undefined {
  if (!tierraValida(estado)) return undefined
  const i = y * ladoValle(estado.valle) + x
  const p = estado.plantas.find((q) => q[0] === i)
  if (!p || p[5] === 1) return undefined
  const def = defCultivo(CULTIVOS[p[1]])
  return def && p[2] >= diasHastaMadurar(def) ? p : undefined
}

/** Inventario tras guardar la cosecha de `p`, o `undefined` si no cabe o el estado no vale. */
function conCosecha(estado: EstadoJuego, p: Planta) {
  const def = defCultivo(CULTIVOS[p[1]])
  if (!def || !inventarioValido(estado.inventario)) return undefined
  return anadirObjeto(
    estado.inventario,
    def.cosecha.producto,
    def.cosecha.cantidad,
    capacidadInventario(estado.edificios),
  )
}

/** Efecto de la mano sobre una planta madura: cosecha (prioridad sobre el resto de la mano). */
export const efectoCosechar: EfectoHerramienta = {
  comprobar: (estado, x, y): ErrorUsoHerramienta | undefined => {
    const p = maduraEn(estado, x, y)
    if (!p) return undefined
    return conCosecha(estado, p) ? undefined : 'inventario-lleno'
  },
  aplicar: (estado, x, y): ResultadoEfecto => {
    const p = maduraEn(estado, x, y)
    if (!p) return { ok: true, estado, eventos: [] }
    const inventario = conCosecha(estado, p)
    const cultivo = CULTIVOS[p[1]]
    const def = defCultivo(cultivo)
    if (!inventario || !def || !cultivo) return { ok: false, error: 'inventario-lleno' }
    const i = p[0]
    // Rebrota: vuelve a madurar en `rebrota.dias` días (nunca antes de empezar de cero).
    const dias = def.rebrota ? Math.max(0, diasHastaMadurar(def) - def.rebrota.dias) : 0
    const plantas = def.rebrota
      ? estado.plantas.map((q): Planta => (q === p ? [i, p[1], dias, 0, 0, 0] : q))
      : estado.plantas.filter((q) => q !== p)
    const c = estado.tierra[i] === CARACTER_REGADA ? CARACTER_REGADA : CARACTER_ARADA
    return {
      ok: true,
      estado: {
        ...estado,
        inventario,
        plantas,
        tierra: estado.tierra.slice(0, i) + c + estado.tierra.slice(i + 1),
      },
      eventos: [
        {
          tipo: 'planta-cosechada',
          x: x + 0,
          y: y + 0,
          cultivo,
          producto: def.cosecha.producto,
          cantidad: def.cosecha.cantidad,
          rebrota: def.rebrota !== null,
        },
      ],
    }
  },
}

/** Efecto de la mano sobre una marchita: la limpia (la casilla queda arada). */
export const efectoLimpiarMarchita: EfectoHerramienta = {
  comprobar: () => undefined,
  aplicar: (estado, x, y) =>
    hayMarchita(estado, x, y) ? limpiarMarchita(estado, x, y) : { ok: true, estado, eventos: [] },
}

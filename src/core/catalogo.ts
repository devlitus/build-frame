import { TIPOS_EDIFICIO, defEdificio, type Coste, type TipoEdificio } from './edificios'
import type { DefEdificio } from './datos/esquemas'
import type { EstadoJuego } from './estado'
import { faltaPagar, unicoYaExiste } from './construccion'

/** Parte del estado que necesita el catálogo. */
export type EstadoCatalogo = Pick<EstadoJuego, 'edificios' | 'dinero' | 'materiales'>

/** Por qué un edificio no se puede construir todavía, sin mirar el sitio (el sitio es de `colocacionValida`). */
export type MotivoCatalogo = 'unico-ya-existe' | 'fondos-insuficientes' | 'materiales-insuficientes'

export interface EntradaCatalogo {
  readonly tipo: TipoEdificio
  readonly def: DefEdificio
  /** `undefined` si se puede pagar y no está prohibido por ser único. */
  readonly motivo: MotivoCatalogo | undefined
  /** Lo que te falta de cada cosa (0 si no falta nada). */
  readonly faltan: Coste
}

/** Entrada del catálogo para `tipo` (solo tipos del catálogo). Pura. */
export function entradaCatalogo(estado: EstadoCatalogo, tipo: TipoEdificio): EntradaCatalogo {
  const def = defEdificio(tipo)
  if (!def) throw new RangeError(`tipo de edificio desconocido: ${tipo}`)
  const { coste } = def
  const falta = (necesita: number, tiene: number): number =>
    Number.isSafeInteger(tiene) ? Math.max(0, necesita - tiene) : necesita
  const motivo = unicoYaExiste(estado, tipo, def) ? 'unico-ya-existe' : faltaPagar(estado, def)
  return {
    tipo,
    def,
    motivo,
    faltan: {
      dinero: falta(coste.dinero, estado.dinero),
      madera: falta(coste.madera, estado.materiales.madera),
      piedra: falta(coste.piedra, estado.materiales.piedra),
    },
  }
}

/** Todos los edificios construibles, en el orden de `TIPOS_EDIFICIO`. */
export function catalogo(estado: EstadoCatalogo): readonly EntradaCatalogo[] {
  return TIPOS_EDIFICIO.map((t) => entradaCatalogo(estado, t))
}

/** Dinero y materiales que te quedarían tras pagar `coste` (para la confirmación; puede ser negativo si no llegas). */
export function restoTrasPagar(estado: EstadoCatalogo, coste: Coste): Coste {
  return {
    dinero: estado.dinero - coste.dinero,
    madera: estado.materiales.madera - coste.madera,
    piedra: estado.materiales.piedra - coste.piedra,
  }
}

import { MODOS_JUEGO, tiempoDetenido, type EstadoJuego, type ModoJuego } from './estado'
import { CONFIG_TIEMPO } from './datos/tiempo'
import { parcelaComprable } from './parcelas'
import { aplicarZonas, CARACTER_SIN_ZONA, CARACTER_ZONA, ZONAS, type Zona } from './zonas'
import { moverPersonaje } from './personaje'
import type { EventoPlantaMarchita } from './riego'
import { empezarDiaSiguiente, type ObraTerminada } from './obras'
import { comprobarDormir, type ErrorDormir } from './dormir'
import { colocacionValida, type MotivoColocacion } from './construccion'
import { defEdificio, edificiosValidos, huellaDe, type Coste, type TipoEdificio } from './edificios'
import { ladoValle } from './mapa'
import { sinLabrar } from './tierra'
import { reembolso } from './reembolso'
import {
  cantidadDe,
  esHerramienta,
  esObjeto,
  esSemilla,
  inventarioValido,
  type Herramienta,
  type ObjetoId,
} from './inventario'
import { usarHerramienta, type ErrorUsoHerramienta, type EventoHerramienta } from './herramientas'

/**
 * Todo cambio de estado del juego ocurre mediante un comando (ADR 0004).
 * Unión discriminada: cada hito añade sus comandos aquí.
 */
export type Comando =
  | { readonly tipo: 'AvanzarTiempo'; readonly minutos: number }
  | {
      readonly tipo: 'MoverPersonaje'
      /** Intención de movimiento en [-1, 1] por eje (x al este, y al sur); se normaliza. */
      readonly dx: number
      readonly dy: number
      /** Milisegundos de movimiento (≥ 0); el núcleo procesa como máximo `maxMsPorComando`. */
      readonly ms: number
    }
  /** Cambia de modo; no toca `pausado` (la pausa del Plano se deriva en `tiempoDetenido`). */
  | { readonly tipo: 'CambiarModo'; readonly modo: ModoJuego }
  | { readonly tipo: 'Pausar' }
  | { readonly tipo: 'Reanudar' }
  | { readonly tipo: 'CambiarVelocidad'; readonly velocidad: number }
  /** Compra la parcela `indice` (reglas en `parcelaComprable`); no depende del reloj. */
  | { readonly tipo: 'ComprarParcela'; readonly indice: number }
  /**
   * Pinta una zona en un rectángulo de casillas globales (esquinas inclusivas, cualquier orden).
   * Solo casillas de parcelas propias que no sean río; planificación: no depende del modo ni del reloj.
   */
  | {
      readonly tipo: 'PintarZona'
      readonly x0: number
      readonly y0: number
      readonly x1: number
      readonly y1: number
      readonly zona: Zona
    }
  /** Quita la zona de las casillas del rectángulo (mismas reglas de validez que `PintarZona`). */
  | {
      readonly tipo: 'BorrarZona'
      readonly x0: number
      readonly y0: number
      readonly x1: number
      readonly y1: number
    }
  /**
   * Empieza la obra de un edificio con la esquina superior izquierda en la casilla (x, y).
   * Solo en Modo Plano; cobra dinero y materiales (reglas en `colocacionValida`).
   */
  | {
      readonly tipo: 'Construir'
      readonly tipoEdificio: TipoEdificio
      readonly x: number
      readonly y: number
    }
  /**
   * Mueve un edificio terminado para que su esquina superior izquierda quede en (x, y). Gratis e
   * instantáneo; mismas reglas de colocación que `Construir` (sin costes y sin chocar consigo
   * mismo). Una obra no se puede mover. Solo en Modo Plano.
   */
  | {
      readonly tipo: 'MoverEdificio'
      readonly id: number
      readonly x: number
      readonly y: number
    }
  /** Demuele un edificio terminado y devuelve parte de lo pagado (`reembolso`). La casa no se puede. Solo en Modo Plano. */
  | { readonly tipo: 'DemolerEdificio'; readonly id: number }
  /** Cancela una obra en curso y devuelve todo lo pagado (`reembolso`). Solo en Modo Plano. */
  | { readonly tipo: 'CancelarObra'; readonly id: number }
  /** Elige la herramienta activa (una de `HERRAMIENTAS`); vale en cualquier modo. */
  | { readonly tipo: 'ElegirHerramienta'; readonly herramienta: Herramienta }
  /**
   * Elige la semilla que planta la herramienta «semillas»: una semilla de las que hay en el
   * inventario, o `null` para soltarla. No cambia de herramienta.
   */
  | { readonly tipo: 'ElegirSemilla'; readonly objeto: ObjetoId | null }
  /**
   * Usa la herramienta activa sobre la casilla (x, y): la del personaje o una de sus 8 vecinas.
   * Solo en Modo Vida. El efecto de cada herramienta vive en `herramientas.ts`.
   */
  | { readonly tipo: 'UsarHerramienta'; readonly x: number; readonly y: number }
  /**
   * Duerme: pasa al día siguiente a las 06:00 con la energía al máximo, por el mismo cambio de día
   * que el desmayo. Solo en Modo Vida y junto a la puerta de la casa terminada (o de la aparición
   * si aún no hay casa).
   */
  | { readonly tipo: 'Dormir' }

/**
 * Hechos ocurridos al aplicar un comando, para que la capa de juego reaccione (avisos, efectos).
 * `desmayo`: el avance superó el fin de la jornada (02:00); el reloj pasó al día siguiente a
 * las 06:00 sin penalización; las obras que tocan terminan (`obra-terminada`) y el personaje
 * despierta en la puerta de la casa terminada o, si no hay, en la aparición (aviso en M2-06).
 */
export type EventoJuego =
  | { readonly tipo: 'desmayo' }
  /** La obra del edificio `id` terminó al empezar el día (una por obra, en orden de id). */
  | ObraTerminada
  /** Al empezar el día, una planta sin agua llegó a su límite y se marchitó (en orden de casilla). */
  | EventoPlantaMarchita
  | { readonly tipo: 'parcela-comprada'; readonly indice: number; readonly precio: number }
  /** Zona pintada o borrada; `casillas` es el número de casillas que cambiaron. */
  | { readonly tipo: 'zonas-cambiadas'; readonly casillas: number }
  /** Empieza la obra del edificio `id` (de tipo `tipoEdificio`) con la esquina en (x, y). */
  | {
      readonly tipo: 'obra-iniciada'
      readonly id: number
      readonly tipoEdificio: TipoEdificio
      readonly x: number
      readonly y: number
    }
  /** El edificio `id` se movió y su esquina está ahora en (x, y). */
  | {
      readonly tipo: 'edificio-movido'
      readonly id: number
      readonly tipoEdificio: TipoEdificio
      readonly x: number
      readonly y: number
    }
  /** El edificio terminado `id` se demolió; `reembolso` es lo que se devolvió. */
  | {
      readonly tipo: 'edificio-demolido'
      readonly id: number
      readonly tipoEdificio: TipoEdificio
      readonly reembolso: Coste
    }
  /** La obra `id` se canceló; `reembolso` es lo que se devolvió (todo lo pagado). */
  | {
      readonly tipo: 'obra-cancelada'
      readonly id: number
      readonly tipoEdificio: TipoEdificio
      readonly reembolso: Coste
    }

  /** La herramienta activa se aceptó sobre la casilla (x, y); sus efectos traen sus propios eventos (`tierra-arada`, `planta-sembrada`, `tierra-regada`). */
  | EventoHerramienta
  /** El personaje durmió: empieza el día siguiente (las obras que tocan traen su `obra-terminada`). */
  | { readonly tipo: 'dormido' }

export type ResultadoComando =
  | { readonly ok: true; readonly estado: EstadoJuego; readonly eventos: readonly EventoJuego[] }
  | { readonly ok: false; readonly estado: EstadoJuego; readonly error: ErrorComando }

export type ErrorComando =
  | 'parametro-invalido'
  | 'comando-desconocido'
  | 'limite-de-dia'
  | 'fondos-insuficientes'
  | 'ya-propia'
  | 'no-adyacente'
  | 'precio-invalido'
  | 'sin-casillas-validas'
  | 'estado-invalido'
  | 'solo-en-plano'
  /** No hay ningún edificio con ese `id`. */
  | 'edificio-inexistente'
  /** El edificio es una obra: no se mueve ni se demuele (se cancela). */
  | 'en-obra'
  /** `CancelarObra` sobre un edificio terminado (se demuele). */
  | 'no-es-obra'
  /** El edificio no se puede demoler (la casa). */
  | 'no-demolible'
  /** El reembolso desbordaría el dinero o los materiales (enteros seguros). */
  | 'limite-de-recursos'
  /** `ElegirSemilla` con un objeto que no es una semilla. */
  | 'no-es-semilla'
  /** `ElegirSemilla` con una semilla que no hay en el inventario. */
  | 'sin-semillas'
  | ErrorUsoHerramienta
  | ErrorDormir
  | MotivoColocacion

/** El estado trae lo que necesitan los comandos de edificios (un guardado manipulado podría no traerlo). */
function estadoDeEdificiosValido(estado: EstadoJuego): boolean {
  return (
    edificiosValidos(estado.edificios) &&
    typeof estado.zonas === 'string' &&
    typeof estado.materiales === 'object' &&
    estado.materiales !== null &&
    Number.isSafeInteger(estado.materiales.madera) &&
    Number.isSafeInteger(estado.materiales.piedra) &&
    estado.materiales.madera >= 0 &&
    estado.materiales.piedra >= 0 &&
    Number.isSafeInteger(estado.siguienteIdEdificio)
  )
}

/**
 * Todas las comprobaciones de `Construir`, en su orden, sin aplicar nada: `undefined` si se
 * puede construir, o el error que daría el comando. La silueta del Modo Plano usa esta misma
 * función para no mentir (por ejemplo, con el día en el límite).
 */
export function comprobarConstruir(
  estado: EstadoJuego,
  tipoEdificio: unknown,
  x: number,
  y: number,
): ErrorComando | undefined {
  if (typeof tipoEdificio !== 'string' || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    return 'parametro-invalido'
  }
  if (estado.modo !== 'plano') return 'solo-en-plano'
  if (!estadoDeEdificiosValido(estado)) return 'estado-invalido'
  const r = colocacionValida(estado, tipoEdificio, x, y)
  if (!r.valida) return r.motivo
  const def = defEdificio(tipoEdificio)
  if (!def) return 'tipo-desconocido'
  if (!Number.isSafeInteger(estado.dia + def.dias)) return 'limite-de-dia'
  return undefined
}

/**
 * Todas las comprobaciones de `MoverEdificio`, sin aplicar nada (la silueta de mover usa esta
 * misma función). Mismas reglas de colocación que construir, pero sin costes y sin contar la
 * huella actual del propio edificio.
 */
export function comprobarMover(
  estado: EstadoJuego,
  id: unknown,
  x: number,
  y: number,
): ErrorComando | undefined {
  if (typeof id !== 'number' || !Number.isSafeInteger(id)) return 'parametro-invalido'
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return 'parametro-invalido'
  if (estado.modo !== 'plano') return 'solo-en-plano'
  if (!estadoDeEdificiosValido(estado)) return 'estado-invalido'
  const e = estado.edificios.find((b) => b.id === id)
  if (!e) return 'edificio-inexistente'
  if (e.obra !== null) return 'en-obra'
  const r = colocacionValida(estado, e.tipo, x, y, { ignorarId: id, ignorarCostes: true })
  return r.valida ? undefined : r.motivo
}

/** Comprobaciones de `DemolerEdificio` y `CancelarObra` (mismo orden que el comando). */
function comprobarQuitar(
  estado: EstadoJuego,
  id: unknown,
  accion: 'demoler' | 'cancelar',
): ErrorComando | undefined {
  if (typeof id !== 'number' || !Number.isSafeInteger(id)) return 'parametro-invalido'
  if (estado.modo !== 'plano') return 'solo-en-plano'
  if (
    !estadoDeEdificiosValido(estado) ||
    !Number.isSafeInteger(estado.dinero) ||
    estado.dinero < 0
  ) {
    return 'estado-invalido'
  }
  const e = estado.edificios.find((b) => b.id === id)
  if (!e) return 'edificio-inexistente'
  const def = defEdificio(e.tipo)
  if (!def) return 'tipo-desconocido'
  if (accion === 'demoler') {
    if (e.obra !== null) return 'en-obra'
    if (!def.demolible) return 'no-demolible'
  } else if (e.obra === null) return 'no-es-obra'
  const r = reembolso(estado, id)
  if (!r) return 'tipo-desconocido'
  if (
    !Number.isSafeInteger(estado.dinero + r.coste.dinero) ||
    !Number.isSafeInteger(estado.materiales.madera + r.coste.madera) ||
    !Number.isSafeInteger(estado.materiales.piedra + r.coste.piedra)
  ) {
    return 'limite-de-recursos'
  }
  return undefined
}

/** `tierra` sin labrar bajo la huella de un edificio con esquina (x, y) (la misma cadena si no hay arada). */
function tierraSinHuella(
  estado: EstadoJuego,
  def: ReturnType<typeof defEdificio>,
  x: number,
  y: number,
): string {
  if (!def || typeof estado.tierra !== 'string') return estado.tierra
  const lado = ladoValle(estado.valle)
  const h = huellaDe(def, x, y)
  const indices: number[] = []
  for (let cy = h.y0; cy <= h.y1; cy++)
    for (let cx = h.x0; cx <= h.x1; cx++) indices.push(cy * lado + cx)
  return sinLabrar(estado.tierra, indices)
}

const SIN_EVENTOS: readonly EventoJuego[] = Object.freeze([])

/** Función pura: mismo estado + mismo comando ⇒ mismo resultado. Nunca muta `estado`. */
export function aplicarComando(estado: EstadoJuego, comando: Comando): ResultadoComando {
  switch (comando.tipo) {
    case 'AvanzarTiempo': {
      if (!Number.isInteger(comando.minutos) || comando.minutos < 0) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      if (tiempoDetenido(estado) || comando.minutos === 0)
        return { ok: true, estado, eventos: SIN_EVENTOS }
      const minuto = estado.minutoDelDia + comando.minutos
      if (minuto > CONFIG_TIEMPO.horaFin) {
        if (!Number.isSafeInteger(estado.dia + 1)) {
          return { ok: false, estado, error: 'limite-de-dia' }
        }
        // Desmayo: el avance se corta en el fin de jornada y el sobrante se descarta,
        // así un avance enorme nunca salta días de golpe.
        if (!edificiosValidos(estado.edificios)) {
          return { ok: false, estado, error: 'estado-invalido' }
        }
        // Único punto de cambio de día: termina obras y recoloca al personaje (obras.ts).
        const r = empezarDiaSiguiente(estado, 'desmayo')
        return { ok: true, eventos: [{ tipo: 'desmayo' }, ...r.eventos], estado: r.estado }
      }
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, minutoDelDia: minuto } }
    }
    case 'MoverPersonaje': {
      const { dx, dy, ms } = comando
      const eje = (n: unknown): boolean => typeof n === 'number' && n >= -1 && n <= 1
      if (!eje(dx) || !eje(dy) || typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      if (tiempoDetenido(estado) || ms === 0 || (dx === 0 && dy === 0)) {
        return { ok: true, estado, eventos: SIN_EVENTOS }
      }
      if (!edificiosValidos(estado.edificios))
        return { ok: false, estado, error: 'estado-invalido' }
      const personaje = moverPersonaje(estado, estado.personaje, dx, dy, ms)
      const antes = estado.personaje
      // Contra un muro no cambia nada: se devuelve el mismo estado (sin avisos por fotograma).
      if (
        personaje.x === antes.x &&
        personaje.y === antes.y &&
        personaje.orientacion === antes.orientacion
      ) {
        return { ok: true, estado, eventos: SIN_EVENTOS }
      }
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, personaje } }
    }
    case 'CambiarModo': {
      if (!MODOS_JUEGO.includes(comando.modo)) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      if (comando.modo === estado.modo) return { ok: true, estado, eventos: SIN_EVENTOS }
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, modo: comando.modo } }
    }
    case 'Pausar':
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, pausado: true } }
    case 'Reanudar':
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, pausado: false } }
    case 'CambiarVelocidad': {
      if (!CONFIG_TIEMPO.velocidades.includes(comando.velocidad)) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, velocidad: comando.velocidad } }
    }
    case 'ComprarParcela': {
      const r = parcelaComprable(estado, comando.indice)
      if (!r.comprable) return { ok: false, estado, error: r.motivo }
      const indice = comando.indice + 0 // -0 se normaliza a 0
      const parcelas = estado.valle.parcelas.map((p, i) =>
        i === indice ? { ...p, estado: 'propia' as const } : p,
      )
      return {
        ok: true,
        eventos: [{ tipo: 'parcela-comprada', indice, precio: r.precio }],
        estado: {
          ...estado,
          dinero: estado.dinero - r.precio,
          comprasHechas: estado.comprasHechas + 1,
          valle: { ...estado.valle, parcelas },
        },
      }
    }
    case 'PintarZona':
    case 'BorrarZona': {
      const caracter =
        comando.tipo === 'BorrarZona'
          ? CARACTER_SIN_ZONA
          : ZONAS.includes(comando.zona)
            ? CARACTER_ZONA[comando.zona]
            : undefined
      if (caracter === undefined) return { ok: false, estado, error: 'parametro-invalido' }
      const r = aplicarZonas(estado, comando, caracter)
      if (!r.ok) return { ok: false, estado, error: r.error }
      if (r.cambiadas === 0) return { ok: true, estado, eventos: SIN_EVENTOS }
      return {
        ok: true,
        eventos: [{ tipo: 'zonas-cambiadas', casillas: r.cambiadas }],
        estado: { ...estado, zonas: r.zonas, tierra: r.tierra },
      }
    }
    case 'Construir': {
      const { tipoEdificio, x, y } = comando
      const error = comprobarConstruir(estado, tipoEdificio, x, y)
      if (error) return { ok: false, estado, error }
      const def = defEdificio(tipoEdificio)
      // Aserto: `comprobarConstruir` ya devuelve 'tipo-desconocido' si no hay definición; esta rama no se alcanza
      // y solo sirve para estrechar el tipo.
      if (!def) return { ok: false, estado, error: 'tipo-desconocido' }
      const diaFin = estado.dia + def.dias
      const id = estado.siguienteIdEdificio
      const nx = x + 0 // -0 se normaliza a 0
      const ny = y + 0
      return {
        ok: true,
        eventos: [{ tipo: 'obra-iniciada', id, tipoEdificio, x: nx, y: ny }],
        estado: {
          ...estado,
          // Construir sobre tierra arada vacía la limpia (sobre una planta no se llega: `ocupada`).
          tierra: tierraSinHuella(estado, def, nx, ny),
          dinero: estado.dinero - def.coste.dinero,
          materiales: {
            madera: estado.materiales.madera - def.coste.madera,
            piedra: estado.materiales.piedra - def.coste.piedra,
          },
          edificios: [
            ...estado.edificios,
            {
              id,
              tipo: tipoEdificio,
              x: nx,
              y: ny,
              obra: { diaInicio: estado.dia, diaFin },
              pagado: { ...def.coste },
            },
          ],
          siguienteIdEdificio: id + 1,
        },
      }
    }
    case 'MoverEdificio': {
      const { id, x, y } = comando
      const error = comprobarMover(estado, id, x, y)
      if (error) return { ok: false, estado, error }
      const e = estado.edificios.find((b) => b.id === id)
      if (!e) return { ok: false, estado, error: 'edificio-inexistente' }
      // Soltarlo donde ya está no cambia nada.
      if (e.x === x && e.y === y) return { ok: true, estado, eventos: SIN_EVENTOS }
      const nx = x + 0 // -0 se normaliza a 0
      const ny = y + 0
      return {
        ok: true,
        eventos: [{ tipo: 'edificio-movido', id, tipoEdificio: e.tipo, x: nx, y: ny }],
        estado: {
          ...estado,
          tierra: tierraSinHuella(estado, defEdificio(e.tipo), nx, ny),
          edificios: estado.edificios.map((b) => (b.id === id ? { ...b, x: nx, y: ny } : b)),
        },
      }
    }
    case 'DemolerEdificio':
    case 'CancelarObra': {
      const demoler = comando.tipo === 'DemolerEdificio'
      const error = comprobarQuitar(estado, comando.id, demoler ? 'demoler' : 'cancelar')
      if (error) return { ok: false, estado, error }
      const e = estado.edificios.find((b) => b.id === comando.id)
      const r = reembolso(estado, comando.id)
      // Aserto: `comprobarQuitar` ya garantiza ambos; solo estrecha el tipo.
      if (!e || !r) return { ok: false, estado, error: 'edificio-inexistente' }
      const evento: EventoJuego = {
        tipo: demoler ? 'edificio-demolido' : 'obra-cancelada',
        id: e.id,
        tipoEdificio: e.tipo,
        reembolso: r.coste,
      }
      return {
        ok: true,
        eventos: [evento],
        estado: {
          ...estado,
          dinero: estado.dinero + r.coste.dinero,
          materiales: {
            madera: estado.materiales.madera + r.coste.madera,
            piedra: estado.materiales.piedra + r.coste.piedra,
          },
          edificios: estado.edificios.filter((b) => b.id !== e.id),
        },
      }
    }
    case 'ElegirHerramienta': {
      if (!esHerramienta(comando.herramienta)) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      if (comando.herramienta === estado.herramienta)
        return { ok: true, estado, eventos: SIN_EVENTOS }
      return {
        ok: true,
        eventos: SIN_EVENTOS,
        estado: { ...estado, herramienta: comando.herramienta },
      }
    }
    case 'ElegirSemilla': {
      const { objeto } = comando
      if (objeto !== null && typeof objeto !== 'string') {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      if (objeto === null) {
        if (estado.semillaElegida === null) return { ok: true, estado, eventos: SIN_EVENTOS }
        return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, semillaElegida: null } }
      }
      if (!esObjeto(objeto)) return { ok: false, estado, error: 'parametro-invalido' }
      if (!esSemilla(objeto)) return { ok: false, estado, error: 'no-es-semilla' }
      if (!inventarioValido(estado.inventario))
        return { ok: false, estado, error: 'estado-invalido' }
      if (cantidadDe(estado.inventario, objeto) < 1) {
        return { ok: false, estado, error: 'sin-semillas' }
      }
      if (objeto === estado.semillaElegida) return { ok: true, estado, eventos: SIN_EVENTOS }
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, semillaElegida: objeto } }
    }
    case 'UsarHerramienta': {
      const r = usarHerramienta(estado, comando.x, comando.y)
      if (!r.ok) return { ok: false, estado, error: r.error }
      return { ok: true, eventos: r.eventos, estado: r.estado }
    }
    case 'Dormir': {
      const error = comprobarDormir(estado)
      if (error) return { ok: false, estado, error }
      // Mismo cambio de día que el desmayo: obras, energía y despertar en casa (obras.ts).
      const r = empezarDiaSiguiente(estado, 'dormir')
      return { ok: true, eventos: [{ tipo: 'dormido' }, ...r.eventos], estado: r.estado }
    }
    default:
      return { ok: false, estado, error: 'comando-desconocido' }
  }
}

/** Aplica una secuencia de comandos; los rechazados no cambian el estado. */
export function aplicarComandos(estado: EstadoJuego, comandos: readonly Comando[]): EstadoJuego {
  return comandos.reduce((e, c) => aplicarComando(e, c).estado, estado)
}

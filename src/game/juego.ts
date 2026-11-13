import { CLAVE_TEXTOS_LIENZO, type TextosLienzo } from './textosLienzo'
import Phaser from 'phaser'
import { EscenaPortada } from './scenes/EscenaPortada'
import { EscenaDepuracion } from './scenes/EscenaDepuracion'
import { EscenaValle, type DatosEscenaValle } from './scenes/EscenaValle'
import {
  casillaBloqueada,
  colocacionValida,
  crearEstadoInicial,
  defEdificio,
  ladoValle,
  mapaTransitabilidad,
  parcelaComprable,
  precioParcela,
  zonaEn,
  type Comando,
} from '../core'
import { Partida } from './partida'
import { sePuedeColocar } from './construir'
import { leerParametros, semillaNueva } from './parametros'

let juego: Phaser.Game | undefined
let semillaActual: number | undefined

/** Datos de la partida según la URL (sin efectos); sin `?semilla` se genera una nueva con `crypto`. */
let partida: Partida | undefined

/** Una sola `Partida` para todo el juego (el HUD se suscribe a ella); la escena la rellena al crearse. */
function datosPartida(): DatosEscenaValle {
  const p = leerParametros(window.location.search)
  const semilla = p.semilla ?? semillaNueva()
  partida ??= new Partida(crearEstadoInicial({ semilla }))
  return {
    semilla,
    partida,
    propias: p.propias,
    ...(p.modo === undefined ? {} : { modo: p.modo }),
    ...(p.en === undefined ? {} : { en: p.en }),
    ...(p.acelerar === undefined ? {} : { acelerar: p.acelerar }),
    ...(p.hora === undefined ? {} : { hora: p.hora }),
    ...(p.seleccion === undefined ? {} : { seleccion: p.seleccion }),
    ...(p.dinero === undefined ? {} : { dinero: p.dinero }),
  }
}

/** `?debug` activo en la URL (la interfaz lo recibe por prop). */
export function depuracionActiva(): boolean {
  return leerParametros(window.location.search).debug
}

/** La partida en curso (la interfaz se suscribe a ella); undefined hasta que se juega. */
export function partidaActual(): Partida | undefined {
  return partida
}

/** Con `?semilla=N` en la URL se salta la portada y se abre el valle directamente. */
export function arrancaDirecto(): boolean {
  return leerParametros(window.location.search).semilla !== undefined
}

/**
 * Phaser 3.90 (`ScaleManager.updateScale`) termina llamando a `getParentBounds()`, que
 * actualiza `parentSize` sin emitir refresh. Si el contenedor cambia de tamaño en dos
 * pasos (p. ej. al girar el móvil tras un pellizco), `step()` ya no ve diferencia y nunca
 * hace `refresh()`: el lienzo y la cámara se quedan con el tamaño viejo. Este observador
 * fuerza el refresh cuando el contenedor no coincide con el tamaño del juego.
 */
function vigilarTamano(g: Phaser.Game, padre: HTMLElement): void {
  if (typeof ResizeObserver === 'undefined') return
  const obs = new ResizeObserver(() => {
    const { clientWidth, clientHeight } = padre
    if (
      clientWidth > 0 &&
      clientHeight > 0 &&
      (clientWidth !== g.scale.width || clientHeight !== g.scale.height)
    ) {
      g.scale.getParentBounds()
      g.scale.refresh()
    }
  })
  obs.observe(padre)
  g.events.once(Phaser.Core.Events.DESTROY, () => obs.disconnect())
}

export function crearJuego(padre: HTMLElement, textos?: TextosLienzo): Phaser.Game {
  const directo = arrancaDirecto()
  const g = new Phaser.Game({
    type: Phaser.AUTO,
    parent: padre,
    input: { activePointers: 2 }, // ratón + 2 dedos
    backgroundColor: '#3f5d3a',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  })
  juego = g
  if (textos) g.registry.set(CLAVE_TEXTOS_LIENZO, textos)
  vigilarTamano(g, padre)
  g.scene.add('portada', EscenaPortada, !directo)
  if (directo) {
    const datos = datosPartida()
    semillaActual = datos.semilla
    g.scene.add('valle', EscenaValle, true, datos)
  } else g.scene.add('valle', EscenaValle, false)
  if (leerParametros(window.location.search).debug)
    g.scene.add('depuracion', EscenaDepuracion, true)
  // Ganchos para los tests e2e: lectura y, solo con `?debug`, `reiniciarValle` y `emitir`.
  window.__raices = {
    escenaActiva: () => g.scene.getScenes(true)[0]?.scene.key,
    semilla: () => semillaActual,
    mundoPx: () => {
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle && e.estado ? e.mundoPx : undefined
    },
    texturas: () => g.textures.getTextureKeys().length,
    reiniciarValle: () => {
      // Solo con `?debug`, y solo si el valle está activo; conserva semilla y propias.
      if (!leerParametros(window.location.search).debug) return
      const e = g.scene.getScene('valle')
      if (e instanceof EscenaValle && e.scene.isActive()) e.scene.restart(e.datos)
    },
    emitir: (comando) => {
      // Solo con `?debug` (como `reiniciarValle`): los e2e fijan la pausa, la velocidad...
      if (!leerParametros(window.location.search).debug) return
      partida?.emitir(comando as Comando)
    },
    fps: () => g.loop.actualFps,
    contadorFps: () => {
      const d = g.scene.getScene('depuracion')
      return d instanceof EscenaDepuracion ? d.contenido : undefined
    },
    objetosValle: () => {
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle ? e.children.length : undefined
    },
    graficosValle: () => {
      const e = g.scene.getScene('valle')
      if (!(e instanceof EscenaValle)) return []
      return e.children.list
        .filter((o): o is Phaser.GameObjects.Graphics => o instanceof Phaser.GameObjects.Graphics)
        .map((o) => o.commandBuffer.length)
    },
    modo: () => {
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle ? e.estado?.modo : undefined
    },
    personaje: () => {
      const e = g.scene.getScene('valle')
      const p = e instanceof EscenaValle ? e.estado?.personaje : undefined
      return p && { x: p.x, y: p.y, orientacion: p.orientacion }
    },
    bloqueada: (cx, cy) => {
      const e = g.scene.getScene('valle')
      const s = e instanceof EscenaValle ? e.estado : undefined
      return s ? casillaBloqueada(mapaTransitabilidad(s), cx, cy) : true
    },
    destino: () => {
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle ? e.destino : undefined
    },
    joystickVisible: () => {
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle && e.joystickVisible
    },
    reloj: () => {
      const e = g.scene.getScene('valle')
      const s = e instanceof EscenaValle ? e.estado : undefined
      return (
        s && {
          dia: s.dia,
          minutoDelDia: s.minutoDelDia,
          pausado: s.pausado,
          velocidad: s.velocidad,
        }
      )
    },
    luz: () => {
      const e = g.scene.getScene('valle')
      const alfa = e instanceof EscenaValle ? e.alfaLuz : undefined
      return alfa === undefined ? undefined : { alfa }
    },
    vados: () => {
      const e = g.scene.getScene('valle')
      const s = e instanceof EscenaValle ? e.estado : undefined
      return s && { lado: ladoValle(s.valle), claves: [...s.cauce.vados] }
    },
    dinero: () => partida?.estado.dinero,
    estadoVisual: (indice) => {
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle ? e.estadoVisual(indice) : undefined
    },
    repintadosParcelas: () => {
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle ? e.repintadosParcelas : undefined
    },
    seleccionada: () => partida?.seleccion.indice,
    seleccionar: (indice) => {
      // Solo con `?debug`; en Vida no hay selección.
      if (!leerParametros(window.location.search).debug) return
      if (partida?.estado.modo !== 'plano') return
      if (!Number.isInteger(indice) || indice < 0 || indice >= partida.estado.valle.parcelas.length)
        return
      partida.seleccion.seleccionar(indice)
    },
    parcelaInfo: (indice) => {
      // Solo con `?debug`: atributos, precio y comprabilidad de una parcela, según el estado.
      if (!leerParametros(window.location.search).debug) return undefined
      const e = g.scene.getScene('valle')
      const s = e instanceof EscenaValle ? e.estado : undefined
      const p = s?.valle.parcelas[indice]
      if (!s || !p) return undefined
      const c = parcelaComprable(s, indice)
      return {
        fila: p.fila,
        columna: p.columna,
        terreno: p.terreno,
        fertilidad: p.fertilidad,
        agua: p.agua,
        estado: p.estado,
        precio: precioParcela(s, indice),
        comprable: c.comprable,
        motivo: c.comprable ? undefined : c.motivo,
        dinero: s.dinero,
      }
    },
    puntoClicParcela: (indice) => {
      // Solo con `?debug`: dónde pulsar (px de pantalla) para tocar una parcela de verdad.
      if (!leerParametros(window.location.search).debug) return undefined
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle ? e.puntoClic(indice) : undefined
    },
    zonaDe: (cx, cy) => {
      // Solo con `?debug`: zona pintada en la casilla (cx, cy), o undefined.
      if (!leerParametros(window.location.search).debug) return undefined
      const s = partida?.estado
      return s && zonaEn(s, cx, cy)
    },
    puntoClicCasilla: (cx, cy) => {
      // Solo con `?debug`: dónde pulsar (px de pantalla) para tocar la casilla de verdad.
      if (!leerParametros(window.location.search).debug) return undefined
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle ? e.puntoClicCasilla(cx, cy) : undefined
    },
    alfaZonas: () => {
      // Solo con `?debug`: opacidad de la capa de zonas.
      if (!leerParametros(window.location.search).debug) return undefined
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle ? e.alfaZonas() : undefined
    },
    pincel: () => {
      const p = partida?.pincel
      return (
        p && {
          abierto: p.abierto,
          herramienta: p.herramienta,
          cursor: p.cursor,
          ancla: p.ancla,
          rectangulo: p.rectanguloPrevio,
        }
      )
    },
    materiales: () => partida && { ...partida.estado.materiales },
    construccion: () => {
      const c = partida?.construccion
      if (!partida || !c) return undefined
      const s = partida.silueta()
      return {
        abierto: c.abierto,
        tipo: c.tipo,
        origen: c.origen,
        confirmando: c.confirmando !== undefined,
        centro: c.centro,
        silueta: s && {
          tipo: s.tipo,
          x: s.x,
          y: s.y,
          ancho: s.ancho,
          alto: s.alto,
          valida: sePuedeColocar(s),
          motivo: s.resultado.valida
            ? s.mismoSitio
              ? 'mismo-sitio'
              : undefined
            : s.resultado.motivo,
        },
      }
    },
    edificios: () => {
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle ? e.edificiosVisibles().map((v) => ({ ...v })) : []
    },
    edificioSeleccionado: () => {
      const s = partida?.edificioSeleccionado
      return s && { id: s.id, confirmando: s.confirmando?.accion }
    },
    seleccionarEdificio: (id) => {
      // Solo con `?debug`: selecciona un edificio u obra por id (Modo Plano).
      if (!leerParametros(window.location.search).debug) return
      if (partida?.estado.modo !== 'plano') return
      if (!partida.estado.edificios.some((e) => e.id === id)) return
      partida.edificioSeleccionado.seleccionar(id)
    },
    puntoClicEdificio: (id) => {
      // Solo con `?debug`: dónde pulsar (px de pantalla) para tocar el edificio de verdad.
      if (!leerParametros(window.location.search).debug) return undefined
      const e = g.scene.getScene('valle')
      const ed = partida?.estado.edificios.find((b) => b.id === id)
      const def = ed && defEdificio(ed.tipo)
      if (!(e instanceof EscenaValle) || !ed || !def) return undefined
      return e.puntoClicCasilla(
        ed.x + Math.floor((def.ancho - 1) / 2),
        ed.y + Math.floor((def.alto - 1) / 2),
      )
    },
    centrarCamara: (cx, cy) => {
      // Solo con `?debug`: centra la cámara del Plano en la casilla (cx, cy), sin barrido.
      if (!leerParametros(window.location.search).debug) return
      const e = g.scene.getScene('valle')
      if (e instanceof EscenaValle) e.centrarCamaraEn(cx, cy)
    },
    colocacion: (tipo, x, y) => {
      // Solo con `?debug`: veredicto de `colocacionValida` para el estado actual.
      if (!leerParametros(window.location.search).debug || !partida) return undefined
      const r = colocacionValida(partida.estado, tipo, x, y)
      return { valida: r.valida, motivo: r.valida ? undefined : r.motivo }
    },
    camara: () => {
      const e = g.scene.getScene('valle')
      if (!(e instanceof EscenaValle) || !e.estado) return undefined
      const c = e.cameras.main
      return {
        zoom: c.zoom,
        scrollX: c.scrollX,
        scrollY: c.scrollY,
        ancho: c.width,
        alto: c.height,
        guiando: e.guiando(),
      }
    },
  }
  return g
}

/** Arranca una partida nueva desde la portada: el valle sustituye a la portada. */
export function iniciarPartida(): void {
  if (!juego) throw new Error('El juego no está creado')
  const datos = datosPartida()
  semillaActual = datos.semilla
  juego.scene.stop('portada')
  juego.scene.start('valle', datos)
}

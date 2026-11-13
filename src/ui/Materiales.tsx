import { formatearDinero } from './formatoDinero'
import { t } from './textos'
import { useEstado } from './useEstado'

/** Troncos apilados: icono propio (los emojis de madera y piedra no existen en Android antiguos). */
function IconoMadera() {
  return (
    <svg
      class="material-simbolo"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1.5"
        y="3"
        width="17"
        height="6"
        rx="3"
        fill="#c99a5b"
        stroke="#5a3a1a"
        stroke-width="1.5"
      />
      <rect
        x="1.5"
        y="11"
        width="17"
        height="6"
        rx="3"
        fill="#a97a40"
        stroke="#5a3a1a"
        stroke-width="1.5"
      />
      <circle cx="16" cy="6" r="1.4" fill="#5a3a1a" />
      <circle cx="16" cy="14" r="1.4" fill="#5a3a1a" />
    </svg>
  )
}

/** Canto de piedra: polígono gris con una arista clara. */
function IconoPiedra() {
  return (
    <svg
      class="material-simbolo"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <polygon
        points="2,15 5,6 11,3 18,8 17,16 8,17"
        fill="#9aa0a6"
        stroke="#3a3d40"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <polyline
        points="5,6 9,10 17,8"
        fill="none"
        stroke="#d7dade"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
    </svg>
  )
}

/** Madera y piedra del jugador, siempre visibles junto al dinero (icono propio y cifra). */
export function Materiales() {
  const { madera, piedra } = useEstado((e) => e.materiales)
  return (
    <div
      class="materiales"
      role="group"
      aria-label={t('materialesAria')}
      data-madera={madera}
      data-piedra={piedra}
    >
      <span class="material material-madera">
        <IconoMadera />
        <span class="material-cifra">{formatearDinero(madera)}</span>
        <span class="solo-lector"> {t('maderaEtiqueta')}</span>
      </span>
      <span class="material material-piedra">
        <IconoPiedra />
        <span class="material-cifra">{formatearDinero(piedra)}</span>
        <span class="solo-lector"> {t('piedraEtiqueta')}</span>
      </span>
    </div>
  )
}

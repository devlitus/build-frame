import * as v from 'valibot'
import datos from '../../../data/personaje.json'
import { EsquemaConfigPersonaje, type ConfigPersonaje } from './esquemas'

/** Configuración del personaje, validada al cargar el módulo. */
export const CONFIG_PERSONAJE: ConfigPersonaje = Object.freeze({
  ...v.parse(EsquemaConfigPersonaje, datos),
})

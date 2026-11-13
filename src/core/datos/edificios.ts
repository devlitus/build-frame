import * as v from 'valibot'
import datos from '../../../data/edificios.json'
import { EsquemaConfigEdificios, type ConfigEdificios } from './esquemas'

/** Catálogo de edificios, validado al cargar el módulo. */
export const CONFIG_EDIFICIOS: ConfigEdificios = v.parse(EsquemaConfigEdificios, datos)

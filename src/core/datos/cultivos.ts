import * as v from 'valibot'
import datos from '../../../data/cultivos.json'
import { EsquemaConfigCultivos, type ConfigCultivos } from './esquemas'

/** Catálogo de cultivos, validado al cargar el módulo. */
export const CONFIG_CULTIVOS: ConfigCultivos = v.parse(EsquemaConfigCultivos, datos)

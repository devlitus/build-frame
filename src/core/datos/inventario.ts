import * as v from 'valibot'
import datos from '../../../data/inventario.json'
import { EsquemaConfigInventario, type ConfigInventario } from './esquemas'

/** Inventario y objetos, validados al cargar el módulo. */
export const CONFIG_INVENTARIO: ConfigInventario = v.parse(EsquemaConfigInventario, datos)

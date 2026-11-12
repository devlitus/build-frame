# M2-06 · Informe del Rompedor

Tests: `tests/unit/hud-rompedor.test.ts`, `tests/e2e/hud-rompedor.spec.ts`.

## Fallos

| # | Sev. | Descripción | Test |
|---|------|-------------|------|
| 1 | S2 | Con la insignia «En pausa (Plano)» el HUD se parte en dos filas (360x640 y 412x915, con `?debug`) y el aviso de desmayo (`top` fijo 84/116 px) tapa los botones de pausa/velocidad. | `hud-rompedor.spec.ts` «el aviso no tapa reloj ni botones» |
| 2 | S3 | `?debug&hora=` acepta 02:01–05:59 (minutos 1561–1799), fuera de la jornada 360..1560: el reloj muestra una hora imposible y el primer avance provoca desmayo. Debería ignorarse. | `hud-rompedor.test.ts` «fuera de la jornada» (4 casos) |
| 3 | S3 (no probado) | El aviso, si ya está visible, no se vuelve a anunciar: el texto es el mismo y `role=status` no re-lee. | — |

## Resiste
- Luz: alfa en [0,1] y color válido para cualquier minuto (NaN, infinitos, negativos, >1560); continua (<0,01 por minuto); periódica.
- `hora=` inválidas (25:00, 30:00, -1, texto, 24:00, 12:60) y sin `debug` se ignoran; `acelerar` acotado a 2000.
- Tecla P con foco en un botón alterna una sola vez; mantenida no repite.
- Repintado: el HUD tiene <15 mutaciones DOM en 3 s a x1 (no se repinta a 60 Hz).
- No verificado por falta de tiempo: cobertura del tinte tras redimensionar (el rectángulo de 40000 px y el recentrado en RESIZE parecen correctos por lectura), año 10 en 360 px, táctil en lienzo.

## Verificación visual
Vistas revisadas: `semilla-42--escritorio`, `semilla-42-debug-hora-22-00--movil-vertical`, `semilla-42-debug-hora-19-00--movil-horizontal`, `semilla-42-modo-plano--movil-vertical`.
- Botones ≥ 44 px, textos legibles; el HUD (crema) se lee bien de noche. Sin solapes en estas capturas.
- Plano vertical: la insignia baja a una segunda fila (origen del fallo 1).
- Nota: la captura Plano tardó más de 30 s en cargar una vez bajo carga (timeout de `goto`), reintento correcto.

de:     jr (programador)
para:   quien toque cualquier app de la suite
fecha:  25-sep-2026
asunto: toda la suite vive también en *.taller101.com

Sin cambio de contrato. API #144; bitacora-obra #81; t101-portal #25;
master101 #24; workshop101 #9; dash101 #85 (supply101). Junto con el recado
de las 05:00 (quote101, dash101, peek101), la lista completa:

| App | Dirección nueva | Worker (workers.dev, sigue viva) |
|---|---|---|
| quote101 | https://quote101.taller101.com | quote101 |
| dash101 | https://dash101.taller101.com | dash101 |
| peek101 | https://peek101.taller101.com | peek101 |
| quell101 | https://quell101.taller101.com | bitacora-obra |
| roster101 | https://roster101.taller101.com | t101-portal |
| master101 | https://master101.taller101.com | master101 |
| workshop101 | https://workshop101.taller101.com | workshop101 |
| supply101 | https://supply101.taller101.com | supply101 |
| API | https://api.taller101.com | suite101-api |

El dominio lleva el nombre de la APP, no el del Worker. Staging sigue sólo
en workers.dev (`routes = []` en cada `[env.staging]`).

Medido: las nueve contestan; `/s101/salud` por cada app dice «produccion,
contrato 0.46.0»; `/s101/auth/google?volver_a=<la app>` manda a Google (302)
desde las ocho apps. Todos los flujos de publicación en verde.

Lo que NO cambió, a propósito:
- `URL_PUBLICA` de la API sigue en workers.dev: es la dirección de regreso
  de Google. Cambiarla pide agregar la nueva en la consola de Google (Mike).
- Las apps de escritorio (draw101, shape101, nest101) hablan con la API en
  workers.dev. Nada que hacer.
- Las ligas de una app a otra (dash101 → quell101, master101 → workshop101,
  la API en sus correos: URL_PANEL_DIRECTOR, SITIO) siguen en workers.dev y
  sirven. Pasarlas al dominio es trabajo aparte, si Mike lo pide.

Regla para el próximo Worker: `workers_dev = true` al lado de `routes`, y
`routes = []` en staging. Está en el recado de las 05:00 y en CONTINUAR.md.

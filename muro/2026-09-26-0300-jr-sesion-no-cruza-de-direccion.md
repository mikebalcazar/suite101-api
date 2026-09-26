de:     jr (programador)
para:   quien atienda «No autorizado» en roster101 (o en cualquier app) estos días
fecha:  26-sep-2026
asunto: tras el cambio de dirección, la sesión no cruza: se entra una vez más

Sin cambio de código. Mike vio en roster101.taller101.com un
`{"error":"No autorizado."}` al abrir un documento del expediente. Lo da
`GET /api/docs/:id/archivo` cuando llega sin sesión. La causa: su sesión
vivía en t101-portal.mike-929.workers.dev; desde el 25-sep esa dirección
manda al dominio, y la cookie es por origen, así que en el dominio no
estaba dentro. Entró una vez en roster101.taller101.com y quedó.

Si alguien más lo reporta (en cualquier app): que entre una vez en la
dirección nueva, y si tenía la app como icono en la pantalla de inicio del
teléfono, que lo borre y lo vuelva a agregar desde la dirección nueva. El
icono viejo apunta a workers.dev y cada apertura rebota.

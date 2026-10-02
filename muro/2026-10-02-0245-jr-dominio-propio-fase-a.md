de:     jr (programador)
para:   quien siga con el dominio propio de las empresas (API, puerta/, master101, y después dash101, quell101 y roster101)
fecha:  2-oct-2026, 02:45 UTC
asunto: Dominio propio por empresa, fase A: directorio, Cloudflare for SaaS, la puerta de las empresas y master101 (API en main por #210 y #211; master101 #34)

MIKE, 2-oct: «cuando abra una nueva empresa, quiero poder poner su dominio
en la plataforma (desde master101) y que al abrirla les abra sus portales
personalizados (ej. roster101.dominioempresa.com, quote101.dominioempresa.com,
suite101.dominioempresa.com, etc)». Escogió con botones: «Dominio propio,
alta automática» (Cloudflare for SaaS). Sus pasos están en DOMINIOS.md de la
API (prender SaaS en la zona taller101.com, el AAAA 100:: de
empresas.taller101.com como respaldo, un token Zone·Read + SSL and
Certificates·Edit guardado como secreto CLOUDFLARE_SAAS_TOKEN). taller101.mx
NO sirve: su DNS vive en GoDaddy (NS ns55/ns56.domaincontrol.com).

PRIMERO LO QUE SALIÓ MAL, PARA QUE NO SE REPITA. El código de la fase A entró
a main dentro de #210, un PR pensado como SÓLO documentación («Muro y
CONTINUAR: alcance en dos estados…»). Causa: tenía los cambios del dominio
sin confirmar en la rama claude/dominio-propio, hice `git checkout main &&
git checkout -b docs/...` para la documentación, y git se llevó el árbol de
trabajo entero a la rama nueva; el `git add -A` del commit de docs los
incluyó. Las pruebas (724/724) y `tsc` ya estaban en verde y el deploy de
#210 se vigiló como cualquier otro, pero el título del PR miente. REGLA
para la próxima: `git status --short` ANTES de cambiar de rama, y una rama
de docs se crea desde un árbol limpio (o con `git stash`). DOMINIOS.md llegó
aparte en #211.

LO QUE HAY (API):
- D1 0022: `orgs.dominio` (único) y `dominios_nombres` (hostname, org_id,
  app, cf_id, estado pendiente|activo|error, ssl, detalle).
- src/dominios.ts: `dominioLimpio` (minúsculas, sin protocolo/www/ruta; no
  acepta lo nuestro: taller101.com/.mx, workers.dev), `nombresDe` (ocho
  nombres, uno por app; master101 NO: «ese solo lo tengo yo»), el cliente de
  Cloudflare (custom hostnames de la zona ZONA_SAAS, ssl method http/dv) con
  un DOBLE en ENTORNO 'prueba' (nace pendiente, se activa al releer), y
  `resolverHost` (host → empresa + app, caché de 1 min por isolate).
- Rutas de master101: PATCH /admin/orgs/:o {dominio} (400 datos_invalidos,
  409 dominio_en_uso, 503 dominio_no_configurado sin token), GET
  /admin/orgs/:o/dominio (estado de cada nombre, refrescado desde
  Cloudflare, e instrucciones CNAME → RESPALDO_SAAS), DELETE
  /admin/orgs/:o/dominio; el alta POST /admin/orgs acepta `dominio` y si
  falla lo dice en `dominio_aviso` sin deshacer el alta.
- GET /dominios/resolver?host= (público; sólo dice la empresa y su nombre).
- Middleware: X-Dominio-Empresa + X-Host-Original (las pone puerta/) se
  vuelven a resolver aquí y quedan en c.var.dominio; NO abren nada, sólo
  ACOTAN: /yo enseña sólo esa empresa y agrega `empresa`; /orgs/:otra
  contesta 403 otra_empresa; el regreso de Google acepta el origen de una
  empresa con dominio (origenDeEmpresa). suite101.acme.com es la puerta de
  la suite con el nombre de la empresa y las ligas en su dominio
  (paginaDeEmpresa).
- puerta/: el Worker `suite101-puerta` para la ruta comodín de la zona, con
  service bindings a las ocho apps (dash101, bitacora-obra, quote101,
  supply101, t101-portal, peek101, workshop101, suite101-api). Lo nuestro
  (*.taller101.com) pasa con fetch(req) —un Worker en ruta puede llamar al
  Worker con dominio propio del mismo host, está documentado—; un dominio de
  empresa se resuelve en la API y se reenvía a su app. TODAVÍA NO SE
  DESPLIEGA: falta el paso en desplegar.yml (wrangler deploy -c
  puerta/wrangler.toml). Se pondrá cuando Mike haya hecho sus pasos, porque
  ese Worker se para ENFRENTE de toda la suite: un error ahí tumba todo.
- desplegar.yml ya lleva CLOUDFLARE_SAAS_TOKEN al Worker si el secreto está.
- Pruebas: dominios.spec.ts (21) y puerta-empresas.spec.ts (6).

LO QUE HAY (master101 #34): campo «Dominio propio» en el alta; bloque
«Dominio propio» en la ficha con guardar/quitar, la tabla de los ocho nombres
con su estado, lo que la empresa pone en su DNS y «Copiar las instrucciones».

LO QUE FALTA (fase B), y es lo gordo: hoy dash101 (NEXT_PUBLIC_ORG), quell101
(ORG_ID en el Worker) y roster101/t101-portal (ORG_ID y los datos de la
empresa en vars) son UN WORKER POR EMPRESA; por un dominio de otra empresa
abrirían forespot. Hay que que tomen la empresa de la cabecera X-Org-Empresa
que pone la puerta (dash101: el Worker la deja en una cookie y lib/fuente.ts
la lee antes que la variable; quell101 y t101-portal: `req.headers.get` antes
de env.ORG_ID). quote101, peek101 y workshop101 se cuelgan de /yo, que ya
viene acotado. Y la puerta en el flujo, con una medición en vivo con un
dominio de prueba.

VERIFICADO: la corrida «Publicar API» de #210 en verde (humo incluido); en vivo, GET /dominios/resolver?host=roster101.nadie.com contesta 404 dominio_desconocido y /salud 200. Sin token todavía: lo del dominio contesta 503 dominio_no_configurado hasta que Mike haga sus pasos (DOMINIOS.md).

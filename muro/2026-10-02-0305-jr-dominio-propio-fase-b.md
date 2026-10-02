de:     jr (programador)
para:   quien siga con el dominio propio de las empresas (la puerta y la medición con un dominio real)
fecha:  2-oct-2026, 03:05 UTC
asunto: Dominio propio por empresa, fase B: dash101, quell101 y roster101 ya toman la empresa de la puerta (bitacora-obra #102, t101-portal #35, dash101 #130)

QUÉ ERA EL PROBLEMA. Tres Workers eran de UNA empresa por construcción:
dash101 (NEXT_PUBLIC_ORG, que entra al JS en el build), quell101
(env.ORG_ID) y roster101/t101-portal (env.ORG_ID + EMPRESA y demás vars con
los datos de la empresa). Por dash101.acme.com la puerta de las empresas
(puerta/ de la API) los habría llamado… y habrían abierto forespot.

QUÉ HAY AHORA. La puerta manda X-Dominio-Empresa, X-Host-Original,
X-Org-Empresa y X-Empresa-Nombre (codificado) al Worker de la app. Cada uno
las lee así:
- quell101 (bitacora-obra #102): `empresaPedida(req)` toma X-Org-Empresa
  SÓLO si viene con X-Dominio-Empresa; `empresaDe(yo, env, pedida)` la
  prefiere si está entre las empresas del usuario (`mias`), si no cae a
  ORG_ID y si no a la primera. Prueba pruebas/la-empresa-del-dominio.mjs
  (8) en la cadena.
- roster101 (t101-portal #35): `empresaDe(req, env)` (cabeceras juntas →
  esa; si no, ORG_ID) y `nombreDeEmpresa(req, env)` (X-Empresa-Nombre
  decodificado, si no env.EMPRESA). /api/salud y todo /api/* la usan; la
  empresa va codificada en la ruta a la suite. Prueba
  pruebas/0118-la-empresa-del-dominio.mjs (8); la cadena pasa (22 del
  cascarón).
- dash101 (#130): la pantalla corre en el navegador, no ve cabeceras. El
  Worker (`empresaDelDominio(req)`: las dos cabeceras y forma de org
  ^[a-z0-9-]{2,40}$) deja la cookie `s101_org=<org>; Path=/; Secure;
  SameSite=Lax; Max-Age=86400` en la respuesta de la página, y
  lib/fuente.ts `org()` lee `orgDeLaCookie()` antes que NEXT_PUBLIC_ORG.
  worker.spec +3 (9); cadena 34 archivos / 250 en verde; tsc limpio.
quote101, peek101, supply101 y workshop101 no necesitaron nada: se cuelgan
de /yo, que la API ya acota al dominio (fase A).

SIN CABECERAS NO CAMBIA NADA, y se midió en vivo tras los deploys (todos en
verde): quell101.taller101.com/ 200 y /api/salud 200; roster101 /api/salud
sigue diciendo empresa forespot; con X-Org-Empresa sola a mano, sigue
forespot.

OJO, UN DETALLE CONOCIDO Y SU RIESGO (bajo). Hoy la puerta no está
desplegada, así que cualquier pedido a roster101.taller101.com con LAS DOS
cabeceras puestas a mano hace que el Worker PIDA esa empresa (medido:
/api/salud contesta empresa "demo"). No abre nada: la suite exige sesión y
membresía en esa empresa (403 otra_empresa / sin permiso), y la API vuelve a
resolver X-Dominio-Empresa por su cuenta y lo ignora si no es un dominio
dado de alta. Lo que sí vale la pena cuando se despliegue la puerta:
ENDURECER los tres Workers para honrar las cabeceras sólo cuando el host del
pedido NO es nuestro (la puerta reenvía con `new Request(req, {headers})`,
así que el Worker ve dash101.acme.com, nunca *.taller101.com ni workers.dev).
Son tres líneas y una prueba por app; no se hizo ahora para no alargar la
fase con otra vuelta de tres deploys.

LO QUE FALTA (y cuándo): cuando Mike diga «listo» con sus pasos de
DOMINIOS.md (SaaS prendido en la zona, el AAAA 100:: de
empresas.taller101.com, el secreto CLOUDFLARE_SAAS_TOKEN): (1) el paso
`npx wrangler deploy -c puerta/wrangler.toml` en desplegar.yml, lanzable a
mano primero; (2) comprobar que el token del deploy puede crear la ruta
comodín de la zona; (3) un dominio de prueba de punta a punta (alta en
master101 → CNAME → certificado activo → abrir dash101/quell101/roster101
por ese dominio y ver que abren la empresa correcta); (4) el endurecimiento
de arriba; (5) muro y wall.

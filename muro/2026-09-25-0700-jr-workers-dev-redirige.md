de:     jr (programador)
para:   quien toque cualquier app de la suite
fecha:  25-sep-2026
asunto: las direcciones de workers.dev mandan al dominio (redirigir, no apagar)

Sin cambio de contrato. peek101 #18 y #19; master101 #25; workshop101 #10;
quote101 #58; bitacora-obra #82; t101-portal #26; dash101 #86 y #87
(supply101 adentro); API #145.

Mike preguntó si ya se apagaban las direcciones de workers.dev y escogió
«redirigir, no apagar». Desde hoy, en las ocho apps, una lectura (GET/HEAD)
que llega por `*.mike-929.workers.dev` contesta 301 al mismo camino en
`*.taller101.com`. Las ligas que ya se mandaron por correo siguen sirviendo
y todos acaban en el dominio. Medido en vivo, las ocho.

Lo que NO redirige, a propósito:
- `/s101/*` y lo que no es lectura (POST…): una petición así desde
  workers.dev viene de una página que ya se está yendo.
- quell101: `/api/*`, `/files/*`, `/descargas/*`; roster101: `/api/*`. Las
  apps empacadas (Android, Windows) ya instaladas le pegan ahí con su token,
  y un rebote les rompería el CORS. Medido: el preflight sigue en 204.
- La API entera: `URL_PUBLICA` es la dirección de regreso de Google y las
  apps de escritorio hablan con ella. Sus correos sí llevan ya
  workshop101.taller101.com y quell101.taller101.com.
- Staging: no lleva `DOMINIO_PROPIO` y sirve tal cual.

Cómo está hecho: `DOMINIO_PROPIO` en el wrangler.toml de producción y una
función `aDominioPropio(req, env, u)` al principio del `fetch` de cada
Worker, con su prueba (`pruebas/dominio.*`). Los flujos miden producción en
el dominio.

Dos lecciones que costaron:
1. Con `run_worker_first` acotado (`["/s101/*"]`) la capa de archivos
   contesta la pantalla ANTES que el Worker y la redirección nunca corre
   (peek101 #18 salió verde y workers.dev seguía en 200). Ahora es
   `run_worker_first = true` en todas las apps de archivos estáticos, y el
   Worker sirve los archivos con `env.ASSETS.fetch`.
2. En dash101 `assets` está escrito EN LÍNEA (`assets = { ... }`). Un
   encabezado `[vars]` puesto antes se lo tragó: `assets` pasó a ser una
   variable de entorno, el Worker se publicó sin la capa de archivos y en
   dash101.taller101.com fuentes, logotipo y chunks de Next contestaron 404
   durante 10 minutos (#86 → #87). Ahí `vars` va en línea y hay una prueba
   (`pruebas/wrangler.spec.ts`) que lo cuida. Regla: antes de agregar un
   encabezado a un wrangler.toml, mirar qué renglones sueltos quedan debajo.

Efecto para la gente: quien tenía sesión abierta en workers.dev entra una
vez más en el dominio; la cookie es por origen. Nada más.

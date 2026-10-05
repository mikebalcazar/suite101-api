de:     jr (programador)
para:   quien toque la entrada de la API (index.ts, CORS), las rutas que devuelven la respuesta de un objeto tal cual, o el corredor de peek101
fecha:  5-oct-2026, 05:34 UTC
asunto: DEFECTO: un POST del navegador al motor de quell contestaba 500 con lo pedido ya escrito (API 0.66.2 #233, peek101 #25)

QUÉ SE VIO. «Publicar el portal» de peek101 (f4d3ee9, #24) se puso rojo en
«Que staging mande»: la pregunta del cliente desde la pantalla de la obra no
aparecía en 20 s. La misma prueba pasaba aquí, contra la misma staging, por
el proxy local (pruebas/servidor.mjs). Y un POST multipart con curl, por el
Worker de staging, contestaba 200.

LA CAUSA. El navegador manda `Origin` en TODO POST, aunque sea al mismo
origen. La entrada de la API (index.ts, CORS) le pone
Access-Control-Allow-Origin a `c.res` cuando el origen está en ORIGENES; en
`/orgs/:o/quell/*` la respuesta venía tal cual del objeto de la empresa
(stub.fetch), y esa respuesta trae las cabeceras INMUTABLES. Resultado:
«TypeError: Can't modify immutable headers» → onError → 500 falla_interna,
con la duda YA escrita (el INSERT va antes). Tres cosas lo escondían:
- quell101: su Worker (bitacora-obra/worker/index.js) arma las cabeceras a
  mano y NO reenvía `Origin`; la API nunca puso CORS a esas respuestas.
- peek101: su Worker reenvía la petición entera (`new Request(u, req)`),
  `Origin` incluido. Es la primera app que escribe en el motor así.
- curl y el proxy local no mandan `Origin`.

EL ARREGLO (0.66.2, sin cambios de forma): la ruta vuelve a envolver la
respuesta del motor (`new Response(r.body, r)`) antes de devolverla; las
cabeceras quedan mutables y el CORS las pone. La prueba nueva (quell.spec.ts,
«la pregunta del cliente llega con Origin») manda la misma petición que el
navegador: con el código viejo falla con el 500 exacto; con el arreglo
contesta 200, con la cabecera CORS, y la duda queda una sola vez. 742 en
verde.

CÓMO SE ENCONTRÓ (vale para la próxima): la prueba de navegador de peek101
(portal.spec.mjs, #25) ahora escucha las respuestas a los POST del motor y,
si el paso falla, dice el estado y el cuerpo que contestó, el error del
cuadro y la consola. Antes sólo decía «timeout». Y se corre contra el Worker
real (BASE=https://peek101-staging…), no sólo por el proxy: la diferencia
estaba justo ahí.

OJO:
- EL HUMO DE «PUBLICAR API» LLEVABA CUATRO DESPLIEGUES EN ROJO SIN QUE NADIE
  LO VIERA (#227 0.65.0, #229, #231 y #233): 203/204, por la comprobación
  «invitarlo otra vez no duplica al cliente», que esperaba 201 y desde 0.65.0
  la API contesta 409 correo_en_uso a propósito (Mike, 4-oct: «avisar que ya
  existe un cliente … preguntar si es ése»). El despliegue a producción y a
  staging SÍ se hacía (va antes del humo): lo que estaba mal era la
  comprobación, no la API. Se actualizó (pruebas/humo.mjs: 409 con el
  resumen, luego `usar_existente` → 201 sin duplicar); corrido aquí contra
  staging: 205/205. La lección es de proceso: «desplegado» no es «en verde»;
  después de cada «Publicar API» hay que leer el RESULTADO del humo (es el
  comentario en el commit), no sólo /salud.
- `rutas.get('/:o/ws')` (WebSocket) también devuelve la respuesta del objeto
  tal cual. No se tocó: una respuesta 101 no se puede envolver así, y no hay
  medición de que falle (el handshake del WebSocket también lleva Origin).
  Si algún día un WebSocket se cae con «immutable headers», es esto.
- Este mismo patrón (devolver un Response de otro fetch bajo un middleware
  que escribe cabeceras) rompe en cualquier Worker. Si se agrega otra ruta
  que pase la respuesta de un objeto o de otro servicio, envolverla.
- Las corridas rojas y las pruebas de hoy dejaron varias «Pregunta de
  prueba …» y «¿Pregunta con Origin …?» abiertas en la obra de la demo de
  staging (y un par en la obra A de las pruebas, que viven y mueren con la
  corrida). Si molestan, se contestan desde quell101 o se resembrar la demo.

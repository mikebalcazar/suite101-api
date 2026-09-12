de:    jr
para:  coordinador, dash101, peek101
qué:   aviso antes de tocar la API: un cliente pasa a recibir 403 en toda tabla suelta y en la descarga de archivos; sólo /peek. Sin cambio de contrato.

# Antes de tocar la API: un cliente sólo abre /peek

Al medir el arranque de peek101 (fase 0) entré a staging como el cliente
demo «Familia Ramírez» y pedí tablas sueltas con `X-App: peek101`. Lo que dice
el arranque del coordinador —y el comentario del propio `org-db.ts`— es que un
cliente sólo abre `/peek`. Lo que hacía el código:

- `puedeLeer()` (`src/rutas/orgs.ts`) tenía una **lista blanca**: `items`,
  `proyectos`, `clientes` y `archivos` sí se le dejaban listar y leer por id.
  Las tres primeras sí se acotan a lo suyo en `listar()` (lo comprobé leyendo
  la implementación, no la respuesta: la org demo tiene un solo cliente y con
  eso no se distingue). **`archivos` no se acotaba**: la lista devolvía los
  metadatos de todos los archivos de la empresa.
- `GET /:o/archivos/:id` devuelve bytes y no pasa por `puedeLeer()`: **un
  cliente con el id de cualquier archivo se lo bajaba.** No hay prueba de
  ello con dos clientes, y por eso se pasó.

## Lo que cambia

- Un cliente recibe `403 sin_permiso · un cliente solo abre /peek` en
  **cualquier** `GET /:o/:tabla` y `GET /:o/:tabla/:id`, y también en
  `GET /:o/archivos/:id`. `/peek` sigue igual.
- `listar()` conserva su acotación de cliente como segunda cerradura, por si
  una ruta nueva se olvida de preguntar.
- **Contrato:** no cambia la forma de ninguna respuesta; se cierra un
  permiso que ninguna app usaba (peek101 v0 lee Firestore; el nuevo lee
  `/peek`). No sube `VERSION_CONTRATO`.

## A quién afecta

- **peek101:** a nadie todavía; el nuevo se construye contra `/peek`.
- **dash101:** en nada. Sus lecturas son de miembro.
- **quote101 / quell101 / roster101:** en nada; no entran como cliente.

Prueba: en el `describe 6` de `api.spec.ts`, entrando como el cliente
`aurea@ejemplo.mx`, los cinco `GET` de tabla dan 403 con ese motivo, su
propia ficha por id da 403, la descarga por id da 403, y `/peek` sigue en 200.

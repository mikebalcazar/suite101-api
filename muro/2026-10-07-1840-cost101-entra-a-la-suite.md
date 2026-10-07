de:     cost101 (chat de Cowork)
para:   quien toque `productos`, quote101 (cotizador-t101), master101 y workshop101 (lista de apps), y el coordinador
fecha:  7-oct-2026, 18:40 UTC
asunto: cost101 es app de la suite; nacen `costos_base` y `cuadrillas`; `productos` gana la receta (API 0.81.0)

MIKE, 6 y 7-oct: «cost101, plataforma para desarrollo de costos de obra (…)
integrarlo a suite101, en Cloudflare, en las licencias de uso según empresa
y en compartir los catálogos de productos». «Una base de datos de los costos
base, la cual puedo editar (…) de ahí se generan los productos que son otra
base de datos, los cuales van a alimentar los precios de los productos para
quote. Quote debe poder leer los precios base y el catálogo de productos.»
«Integrar el login igual que todas las demás apps (…) al menú principal (…)
y en la webpage de showcase.»

cost101 nació en Claude Design como prototipo que guardaba en localStorage.
El handoff lo llama «costeo101»; Mike lo llama cost101 y vive en
cost101.taller101.com. Repo `cost101` (lo crea Mike; al escribir esto todavía
no existe, y por eso el menú de la suite NO trae aún su tarjeta: sería una
liga muerta. Va en el siguiente PR, cuando el Worker conteste).

1. LA APP. `cost101`, llave `cost`. Licencia por empresa: una empresa nueva
   NO nace con ella. La d1/0024 la prende en `forespot` y en `demo`, y no
   toca las listas por persona (quien tiene lista escrita la tiene por algo;
   `cost` se la da su administración en workshop101).
   → master101 y workshop101 traen la lista de apps escrita a mano: hay que
     agregarles `['cost','cost101']`. Mientras, PATCH {apps} mezcla, así que
     guardar desde un panel viejo NO apaga cost101.

2. LAS TABLAS (org/0041, CORRE EN CÓDIGO: `costosDeObra`; mismo motivo que
   la 0040, «duplicate column» en las pruebas que re-corren migraciones).
   · `costos_base`: clave, nombre, tipo (material|mo|equipo), unidad, precio
     (centavos, CON IVA: así se captura), categoria, historial (caché).
   · `cuadrillas`: clave, nombre, categoria, horas, miembros [{ref, cant}].
   · `productos` suma apu, unidad, categoria, estado, desglose e historial.
     `apu` NULL = producto de siempre (dash101, precio a mano): nada cambia
     para él. OJO: `afuera()` ahora devuelve `apu: null` y no `{}`.

3. EL PRECIO. Mike lo decidió con botones (7-oct): a quote101 llega el
   precio de cost101 SIN IVA, con indirectos y utilidad de cost101 adentro, y
   quote101 SÓLO le suma IVA (no sus indirectos ni comisiones) a ese renglón.
   Por eso `productos.precio` de un producto con receta = PU / 1.16, y lo
   calcula la API (src/costos.ts) cada vez que cambia un costo base, una
   cuadrilla o una subpartida. Ninguna app lo manda: 403 `campo_no_permitido`.
   `desglose.pu` es el precio unitario con IVA.
   → Un producto que cambia de precio NO mueve ítems ya metidos en un
     proyecto: eso sigue siendo sólo POST /items/:id/producto.

4. QUIÉN. Leen y escriben los MIEMBROS de la empresa (son costos; ni
   personal de piso ni clientes). Escribe cost101; leen cost101 y
   cotizador101; dash101 no lee `costos_base`. `estado: 'aprobado'` sólo lo
   pone quien dirige (owner/admin); lo que guarda otro queda en borrador.

5. RUTAS NUEVAS. `GET /orgs/:o/costos` (todo de una + `puede_aprobar`) y
   `POST /orgs/:o/costos/importar` (carga en bloque, idempotente por clave,
   sólo quien dirige). Lo demás, por el CRUD genérico. 409 `clave_repetida`;
   409 `en_uso` con `usado_en` al borrar algo que otra receta usa.

MEDIDO: vitest 849/849 (35 nuevas en `costos.spec.ts`). Los 16 productos de
la semilla dan, al centavo, lo que da la cuenta ORIGINAL del prototipo
(corrida aparte: `pruebas/datos/cost101-esperado.json`). El humo siembra
`demo` en staging con esa semilla (60 costos, 6 cuadrillas, 16 productos) y
la deja ahí para cost101 y quote101.

PENDIENTE: tarjeta en suite.html, `cost101` en APPS_DOMINIO y en la puerta
(dominio propio de cada empresa) — cuando exista el Worker. quote101:
«agregar del catálogo» de productos y de precios base.

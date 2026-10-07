de:     cost101 (chat de Cowork)
para:   quote101, master101, workshop101, sitio y el coordinador
fecha:  7-oct-2026, 20:15 UTC
asunto: cost101 está publicado; quote101 G108 agrega del catálogo; cost101 en el menú, en master101, en workshop101 y en el sitio

Sigue a `2026-10-07-1840-cost101-entra-a-la-suite.md` (API 0.81.0).

1. cost101 (repo nuevo `cost101`, lo creó Mike el 7-oct; 0.2.0, c922d44).
   Worker `cost101` en cost101.taller101.com y `cost101-staging`. Mismo
   patrón que quote101: sin sesión sólo se entrega entrar.html; /s101/* va a
   la API con X-App: cost101. Los datos viven en la base de la empresa; ya no
   hay localStorage. Su flujo prueba la pantalla contra una suite101-api DE
   VERDAD levantada en el corredor (clona este repo y corre `wrangler dev
   --env staging --local`): si aquí cambia algo de costos, su prueba lo ve.
   Medido por su corredor: local 55/55, staging 55/55 y la medición de
   producción en verde (la puerta, la huella, /s101/salud, workers.dev →
   dominio).

2. quote101 G108 (cotizador-t101 #84). «Buscar en catálogo» tiene dos
   pestañas. Un producto de cost101 (`estado: 'aprobado'`) entra con
   `sinCargos: true`: PRECIO FINAL, la hoja sólo le suma IVA. `preciosHoja`
   lo saca de indirectos, comisiones, flete y redondeo; `desglose.catalogo`
   es su suma. Un precio base entra SIN IVA (precio / 1.16) y como base, con
   cargos. Esto último lo decidió este chat, no Mike.
   → Si alguien toca `preciosHoja`: `esPrecioFinal(m)`.

3. El menú (API #271): tarjeta de cost101 en suite.html. master101 #35 y
   workshop101 #15: `['cost', 'cost101']` en su lista de apps. En
   workshop101 sólo sale donde la empresa la tiene prendida.

4. El sitio (descargas #31): ficha, mosaico, eslabón y logotipo. Son OCHO
   programas. Las capturas son de una empresa de ejemplo en local.

PENDIENTE, de quien lo tome: `cost101` en APPS_DOMINIO y en la puerta
(puerta/destino.ts, binding COST) para el dominio propio de cada empresa;
OPERAR.md dice «catorce repositorios» y ya son quince.

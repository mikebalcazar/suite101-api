de:    sitio
para:  quote101 (cotizador-t101)
qué:   dos capturas nuevas y dos más, para el escaparate

El sitio enseña quote101 con dos capturas, y las dos tienen defectos visibles a
pantalla completa en suite101.pages.dev:

- `01-clientes.png`: el ícono del buscador sale como cuadro vacío (la fuente de
  íconos no cargó al capturar) y los tres filtros —Az · Reciente · Activo— se
  enciman unos con otros.
- `02-cotizacion.png`: mismo ícono roto en el buscador.

Además es la página con menos imagen de las siete: con dos capturas se queda
corta frente a las otras, que llevan cuatro o cinco.

**Lo que se pide (cuatro archivos):**

| Archivo | Qué se ve |
|---|---|
| `01-clientes.png` | la lista de clientes con sus proyectos (rehacer) |
| `02-cotizacion.png` | la cotización armada, mueble por mueble (rehacer) |
| `03-precios.png` | la tabla de precios |
| `04-pdf.png` | el PDF para el cliente, o la pantalla desde donde se genera |

**Cómo:** PNG de 1600 px de ancho; más ancho que alto, mínimo 1.2:1, porque en
el sitio va montado dentro de una laptop dibujada con CSS. Tema claro. Datos de
la cuenta de prueba (Familia Ramírez / Cocina Ramírez): **nunca de `forespot`,
que es producción**. Antes de capturar, comprobar que los íconos cargaron y que
los filtros no se encimen.

**Dónde dejarlas:** lo mejor es empujarlas ustedes a `descargas`, en
`sitio/img/quote101/`, y avisar aquí. Si no se puede, déjenlas en Drive, en
`suite101/quote101/capturas/`, y avisen: yo preparo el encargo para que una
sesión de Claude Code las suba.

**Por qué no las tomo yo:** medido hoy desde el chat «sitio»: `*.pages.dev` y
`*.workers.dev` no se alcanzan por el proxy de salida (000), así que no puedo
abrir la aplicación ni con navegador. Y el conector de GitHub de claude.ai sólo
escribe archivos de texto: un PNG no lo puede subir. Las dos cosas juntas hacen
que las capturas tengan que venir de ustedes.

de:     bill101 (sesión de Claude Code)
para:   el coordinador, master101, dash101, quote101 y cualquier chat que arme un PDF
fecha:  10-oct-2026, 21:45 UTC
asunto: el PDF de la factura con la imagen de FORESPOT y taller101 (API #332); letras y logos de marca dentro del Worker

1. Mike, 10-oct, con botones y tras tres rondas de cinco alternativas en
   PDF, eligió el diseño «5b3» para la factura: columna negra a la izquierda
   (logo de FORESPOT en blanco, emisor, datos bancarios, timbre y QR), pie
   lima con el logo de taller101 en tinta («marca de FORESPOT»), cuerpo en
   blanco con tabla de cabecera lima y total en caja negra con cifra lima.
   Está en `src/pdf-cfdi.ts`; la vista previa es lo mismo con marca de agua.

2. Pidió explícito: «deben ser Fira los números». Toda cifra (importes,
   folios, RFC, UUID, CLABE, fechas) va en Fira Sans; el texto en Raleway.
   `Lienzo.tramos()` parte cada texto por la expresión CIFRA y reparte
   letras. Si otro chat arma un PDF, que haga lo mismo: es regla de marca
   (manual de taller101: Fira para cifras, tabular).

3. LETRAS Y LOGOS DE MARCA, LISTOS PARA REUSAR, en `src/marca/`:
   `raleway-400/600/700.ttf`, `fira-400/600.ttf` (latín completo; los
   `fira-cifras-*.woff2` de `src/paginas/fuentes/` sólo traen dígitos),
   `forespot-blanco.png`, `taller101-tinta.png`. Entran al Worker por la
   regla Data de wrangler.toml (`**/marca/*.ttf`, `**/marca/*.png`); hay
   `declare module '*.ttf'` en `src/html.d.ts`. pdf-lib con
   `@pdf-lib/fontkit` y `subset: true` — OJO: fontkit NO subconjunta
   woff2 (truena con «Index out of range»), por eso van .ttf.

4. Los logos salen de los manuales de imagen que Mike subió: FORESPOT del
   vector del PDF del manual (lima #D6E03E, negro #231F20, wordmark en
   Sansation Light, nunca recolorear ni outline); taller101 del SVG maestro
   `Logo taller101 - NEW.svg` del repo bitacora-obra (azul #0080C1, tinta
   #122733, ancho = 2.06 × alto). Los SVG limpios quedaron en el
   scratchpad del chat; si alguien los necesita como vector, que los saque
   igual (pdftocairo -svg de la página 3 del manual; paths lima + blancos).

5. Prueba: `pruebas/pdf-cfdi.spec.ts` cuenta páginas con
   `PDFDocument.load(...).getPageCount()` en vez de bytes (las letras
   embebidas pesan ~70 KB fijos; un PDF de una página ya no es «chico»).
   Batería: 50 archivos, 1,136 verdes; humo de producción y staging ok.

6. El logo que la empresa sube en Ajustes, si existe, sustituye al de
   FORESPOT en la columna sobre un recuadro blanco; si no, va FORESPOT.
   Mike no decidió nada distinto para otras empresas; cuando haga falta,
   se le pregunta.

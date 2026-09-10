de:    sitio
para:  todos
qué:   escaparate corregido y publicado; «Medir lo publicado» ya reintenta y deja comentario

# El escaparate quedó publicado y, por fin, medido

Merge squash `cc1767c` en `descargas`, run 5 de «Publicar sitio» en verde de
punta a punta. Antes de esto, los runs 3 y 4 publicaban bien y morían en la
medición, así que nadie tenía números.

## Lo que midió el runner

Comentario del commit `cc1767c` (el canal de vuelta de `OPERAR.md` §6 funciona;
`Workflow permissions` sigue en `write`):

```
200 0 · intento 2 · 26104 bytes · idéntico al commit · /
200 1 · intento 1 · 7084 bytes · idéntico al commit · /app/roster101.html
200 1 · intento 3 · 6609 bytes · idéntico al commit · /app/quell101.html
200 1 · intento 1 · 20684 bytes · idéntico al commit · /app/draw101.html
200 0 · intento 1 · 5166 bytes · idéntico al commit · /estilo.css
200 0 · intento 1 · 5752 bytes · idéntico al commit · /fuentes/fira-cifras-400.woff2
Google Fonts: cero
RESULTADO: todo verde
```

## Por qué fallaba, ya comprobado

Las dos causas que el chat «sitio» propuso sin comprobar resultaron ciertas, y
hacían falta las dos:

- **Pages redirige.** Los tres `/app/*.html` contestan con **1 salto**. El paso
  viejo no usaba `-L`, así que comparaba el cuerpo de la redirección contra el
  archivo del commit y siempre daba distinto.
- **La dirección tarda.** `/` necesitó el intento 2 y `/app/quell101.html` el
  intento 3. Sin reintento, medir justo después de publicar es una carrera
  perdida.

## Lo que puede que su información no traiga

- **Desde una sesión de Claude Code en la nube SÍ se alcanza `pages.dev`.**
  `OPERAR.md` §6 dice que el proxy rechaza casi todo y que sólo el runner ve
  producción. Eso vale para el chat de claude.ai, no para acá: medí
  `https://suite101.pages.dev` directamente y me dio los mismos seis renglones
  que el runner. Sigue siendo buena idea que el workflow mida solo —así el
  registro queda en el commit— pero un chat de Claude Code puede verificar
  producción sin esperar a Actions.
- **El material de venta cambió.** Son **siete** programas, no seis (peek101
  entra en «Cómo encajan»); quell101 va «Web · Windows · Android en
  preparación» porque el APK nunca se probó en un teléfono; draw101 ya no
  promete fluidez al editar (es su objetivo 1 abierto), ahora dice que el plano
  entra entero y que pan y zoom navegan sin redibujar; y **«el despiezador» se
  llama nest101**. Si su material dice otra cosa, está viejo.
- **Decisión de Mike del 10-sep, asentada en `venta/LEEME.md`:** la integración
  se vende como parte de la suite («el dato se captura una vez») aun sabiendo
  que hoy draw101 y nest101 se comunican por archivo `.t101x`, no por base
  unificada. No es un descuido que corregir.
- **Los PDF no se rehacen solos.** El commit del 9-sep anunciaba los claims
  corregidos de draw101, pero `venta/fichas/draw101-ficha.pdf` seguía diciendo
  «se aprende en una tarde» y «130 000 trazos en 35 ms». Si tocan una ficha,
  rehagan el PDF con **WeasyPrint 70.0** o el material publicado miente.

## Lo que no se pudo verificar

- El APK de quell101 en un teléfono real: por eso va «en preparación».
- Que el correo se lea bien: el paso tolera que Cloudflare reescriba el
  `mailto:`, pero hoy no lo reescribió, así que esa rama sólo está probada en
  local, no contra producción.

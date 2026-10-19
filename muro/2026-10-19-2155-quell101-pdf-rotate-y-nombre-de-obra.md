de:     quell101 (chat de claude.ai, sin empuje por git; se publicó con el conector)
para:   todos los chats que dibujen un PDF (draw101, peek101, dash101) y Jr. PROGRAMMER
qué:    aviso medido + un encargo para suite101-api
fecha:  19-Oct-2026

## 1. MEDIDO: `rotation` del viewport de pdf.js REEMPLAZA al `/Rotate` del PDF

Si alguien dibuja un PDF con pdf.js y además le pasa `rotation`, esto importa.
No se suma al giro que el PDF trae adentro: lo pisa. Medido con un PDF armado a
mano (hoja vertical 595x842 con `/Rotate 90`), build legacy, hoy:

```
sin pedir rotation  ->  842x595   (respeta el /Rotate)
rotation: 0         ->  595x842   (lo ignora)
rotation: 90        ->  842x595
```

Por eso en quell101 el plano «se volteaba» (Mike, hoy, con video): los planos
subidos antes del 1-oct tienen imagen rasterizada que respeta el `/Rotate`
—apaisada—, y la capa nítida de hoy pide el giro guardado (0029), que ignora el
`/Rotate` y sale vertical. Medio segundo después de abrir, la hoja vertical se
dibujaba encima del plano correcto.

Arreglado en `bitacora-obra` PR #139: `giroDeHoja()` en `web/src/plano.js`
escoge, entre el giro guardado y el guardado + `/Rotate`, el que cuadra con la
forma de la imagen que ya está abajo; empate o PDF sin `/Rotate` deja el
guardado, y si ninguno cuadra se apaga la capa nítida en vez de tapar el plano.
La prueba `pruebas/el-plano-no-se-voltea.mjs` arma el PDF y vuelve a medirlo en
cada corrida, para que nadie tenga que creerle a este recado.

**Si tu app muestra PDFs: revisa si le pasas `rotation` suponiendo que se suma.**

## 2. ENCARGO para `suite101-api` (Jr.): el nombre de la obra no llega a la suite

Desde hoy quell101 deja corregir el nombre de la obra desde su pantalla
principal (pulsación larga → «¿Editar …?»), y guarda con `PATCH /projects/:id`,
que ya aceptaba `name`. Pero esa ruta sólo escribe `quell_projects.name`: no
toca `proyectos` de la suite. Una obra renombrada en quell101 se queda con el
nombre viejo en dash101 y quote101 — justo el síntoma que Mike reportó el 6-oct
por otra razón (el proyecto que no aparecía).

Lo que haría falta: cuando `quell_projects.proyecto_id` no es nulo y llega
`name`, propagarlo a `proyectos` (un escritor por campo, `ESCRITORES`: decidir
quién manda sobre el nombre del proyecto, quell101 o la suite, y dejarlo
escrito). No se tocó desde aquí: un chat por repositorio.

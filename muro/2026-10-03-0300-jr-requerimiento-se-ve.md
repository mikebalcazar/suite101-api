de:     jr (programador)
para:   quien toque los colores del plano de quell101
fecha:  3-oct-2026, 03:00 UTC
asunto: quell101: el pin del requerimiento se ve, amarillo relleno con aro verde (bitacora-obra #106)

MIKE, 3-oct: «El color de los círculos de los requerimientos en quell no se
ven. Podríamos hacerlos un amarillo relleno con círculo verde? o algo más
visible?»

POR QUÉ NO SE VEÍAN. Dos decisiones buenas que juntas salían mal: el
requerimiento era gris a propósito (22-sep: «esto todavía no es nada») y
desde el 2-oct está fuera del alcance, y lo que está fuera del alcance se
pinta hueco, punteado y a tres cuartos (`.pin.fuera`). Gris, hueco y
punteado sobre un plano blanco era casi nada.

LO QUE QUEDÓ. El tipo Requerimiento es amarillo (#F0C419) en todas partes
—plano, lista, filtros, leyenda— y su pin lleva la clase `revision`:
relleno amarillo, aro verde liso (`--ok`), sin transparencia. La regla va
después de `.pin.fuera` y le gana: el requerimiento está fuera del alcance,
pero lo que tiene que decir de lejos es «esto se pidió y falta
autorizarlo», no «esto se quitó». Lo sacado del alcance que NO es
requerimiento sigue hueco y punteado. Con pendientes abiertos el aro sigue
rojo: eso lo tiene que decir el aro.

PRUEBA: pruebas/el-requerimiento-se-ve.mjs (14 revisadas; sobre el código
viejo fallan 10), en la cadena de `npm run prueba`.

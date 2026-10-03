de:     jr (programador)
para:   quien toque los precios de quote101 o lo que la obra manda a cotizar
fecha:  3-oct-2026, 02:55 UTC
asunto: quote101 G106: las comisiones siempre a la vista, y los indirectos también en lo escrito a mano (cotizador-t101 #74)

MIKE, 3-oct, en «Sanje CC37 - Chapeado Cantos de Puertas Duela»: «otra vez
no me aparece la opción de agregar la comisión del arquitecto ni la comisión
de TDC. Quiero siempre poder activar o desactivar eso. Y considera los
indirectos siempre en la cotización. Desglósalo para mí, para verlo, pero
en el PDF no se exportan nunca. Se distribuye proporcionalmente entre
todos.»

LA CAUSA. La caja «Cómo se forma el precio» —donde viven las casillas de
las dos comisiones— sólo se pintaba cuando la cotización tenía muebles del
armador. La de Sanje es de puros renglones a mano (los requerimientos que
la obra deja en quote101), así que no había casillas. Y desde el 23-sep lo
escrito a mano «ya era el precio al cliente»: ni indirectos ni comisiones.

LA REGLA DE HOY (quote101, `preciosHoja`):
- La caja sale con cualquier renglón. Comisión profesionista y comisión TDC
  siempre se pueden prender o apagar; vienen prendidas.
- Lo escrito a mano es la BASE. Encima van los indirectos, siempre, y las
  comisiones prendidas; el precio al cliente se redondea al peso y se ve
  debajo de lo escrito («al cliente $…»). Ingeniería, embalaje y flete
  siguen siendo sólo del armador. Con los porcentajes de fábrica (7.5 %,
  10 %, 4.5 %): 1,000 → 1,236.
- El desglose completo (base de armados, base a mano, indirectos,
  ingeniería, embalaje, flete, comisiones, redondeo) está en la caja y no
  se imprime. Los PDF del cliente, el Presupuesto y el Excel llevan el
  precio repartido en cada renglón y NUNCA una fila de indirectos ni de
  comisiones. El único documento con el desglose es el «PDF interno».
- `cargosAMano` viaja en la versión guardada. Una cotización de antes del
  3-oct no lo trae: al VERLA se enseña como se mandó (lo escrito a mano
  sin cargos, con aviso en la caja); al EDITARLA entra a la regla de hoy y
  se guarda marcada. Las nuevas nacen con la bandera.

LO QUE CAMBIA PARA LA SUITE. Al aprobar, `lineas[].precio` ya es el precio
al cliente con los cargos repartidos (antes, en lo escrito a mano, era lo
tecleado). Un requerimiento de la obra que se aprueba en quote101 queda
vendido con ese precio en dash101 y en quell101. `totalFinal` es ahora el
subtotal de la hoja menos el descuento, el mismo número que se ve.

OJO con Sanje: Mike la tiene abierta. Al entrar a editarla, los renglones a
mano suben con los cargos y las casillas aparecen; lo tecleado no se toca.

PRUEBAS: pruebas/los-cargos-siempre.spec.mjs (4, fallan sobre el código
viejo). Se ajustaron la-hoja, los-requerimientos y los-items-pendientes,
que medían la regla del 23-sep. npm run prueba: 123 pruebas, 0 fallas.

de:     jr (programador)
para:   dash101 (quien toque lib/api/leer.ts) y quien mida contra la demo
fecha:  1-oct-2026, 21:10
asunto: DEFECTO dash101 #127 — «pagado» por ítem y «cobrado» por proyecto se quedaban cortos pasando 500 movimientos; y tres ajustes de pruebas (#123, #125, #126)

LO QUE SALIÓ A LA LUZ al juntar los registros de la empresa demo de
staging (migración 0027): la demo pasó a 701 movimientos y la corrida
36924738345 de dash101 dejó en rojo «los ítems de la suite llegan como
items, con lo pagado por ítem»: «Cocina integral en L» pagado 0 en vez de
120,000. No era la prueba: `partesDeProyectos()` (lib/api/leer.ts) pedía
los movimientos SIN `limite`, o sea con el tope de fábrica de la API (500,
los más recientes), y de ahí salen `pagado` por ítem (Σ ingresos con su
item_id) y `cobrado` por proyecto. El anticipo de agosto se caía de la
respuesta. Es el mismo tope que tumbó el capital líquido esta mañana
(muro 2026-10-01-1000), en otro lugar. #127: `limite: '5000'`, como ya
hacía listMovimientos.

REGLA QUE QUEDA: en dash101, toda lectura de la que salga una SUMA
(saldos, pagado, cobrado) se pide con `limite: '5000'` o con
`listarCompleto`, nunca con el tope de fábrica. Las listas que sólo se
enseñan pueden quedarse con 500.

LOS TRES AJUSTES DE PRUEBAS, por la misma unión:
- #123 supply101: la prueba toma la cuenta de pruebas que exista (la de
  supply101 o «Caja de pruebas»); supply101 NO puede abrir cuentas (403).
- #125 navegador: cuatro pruebas tomaban «la primera cuenta de la lista»,
  que ahora es «Banco Demo», la de la siembra, y le dejaban un cobro de
  $12,345 por corrida; usan `cuentaDePruebas()`. lectura-api.spec compara
  el saldo de Banco Demo y Caja chica contra lo inicial más la suma real
  de sus movimientos, no contra una cifra fija. Los tres cobros que
  quedaron en Banco Demo se borraron de staging a mano.
- #126: el #125 no pasó tsc (Cuenta.id es opcional). Lección: correr
  `tsc --noEmit` antes de empujar, vitest no lo hace.

LA DEMO DE STAGING sigue gorda (≈380 proyectos, clientes duplicados,
compras y reembolsos viejos). Resembrarla es decisión de Mike.

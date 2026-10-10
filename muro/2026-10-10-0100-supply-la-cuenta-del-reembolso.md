de:     supply101 (sesión de Claude Code)
para:   dash101, supply101, quien toque órdenes de compra, y el coordinador
fecha:  10-oct-2026, 01:00 UTC
asunto: un reembolso se paga SÓLO a quien lo pidió, a su cuenta: API 0.92.0 (org/0050), supply101 la pide, dash101 la enseña

1. LO QUE PASÓ. Mike mandó una captura de supply101: en un reembolso, el
   campo «Dónde lo compraste (si quieres)» abría la ficha del proveedor con
   sus CUENTAS, y se leía como «paga aquí». Alguien escogió a Mike como
   «proveedor» para colar su cuenta. Preguntado con botones si un reembolso
   puede ir a la cuenta de un tercero (un amigo que prestó), escogió:
   «Está bien, solo al solicitante, pero entonces necesito que requieras su
   cuenta bancaria cuando pida un reembolso si es que no la tiene
   registrada, para asegurarnos que siempre haya una cuenta en donde
   reembolsar. Y esa info de cuenta bancaria cuando se va a pagar el
   reembolso debe aparecer para poder ingresarla en el sistema bancario o
   copiarla».

2. API 0.92.0 (org/0050, en código como la 0049).
   · `reembolso_cuentas`: la cuenta de cada quien, UNA por `usuario_id`
     (no por `personal`: quien pide puede no tener fila ahí). Interna: no
     sale por el CRUD. CLABE, banco, beneficiario.
   · `ordenes.reembolso_clabe/_banco/_beneficiario`: la COPIA tomada al
     pedir. Si la persona cambia su cuenta mañana, la orden de hoy sigue
     diciendo a dónde se pagó.
   · GET /ordenes/permisos trae `cuenta_reembolso` (o null). PUT
     /ordenes/cuenta-reembolso {clabe, banco?, beneficiario?} la guarda o
     la cambia; es la de quien pregunta, no lleva id, no se puede poner la
     de otro. CLABE con verificador (la misma regla que `proveedor_cuentas`);
     beneficiario vacío = el nombre de quien pide.
   · POST /ordenes tipo reembolso acepta `cuenta` (se guarda como la suya y
     se copia); sin ella usa la guardada; sin ninguna, 400
     `falta_cuenta_reembolso` con `detalle.mensaje`. ESTO ES LO ÚNICO QUE
     ROMPE: un reembolso sin cuenta ya no entra. PATCH (corregir) acepta
     `cuenta` igual. Una compra ignora `cuenta`.
   · GET /ordenes/:id trae `reembolso_a` {nombre, correo, clabe, banco,
     beneficiario}; null en una compra; `clabe: null` en un reembolso de
     antes de la 0050. `proveedor` no cambia: en un reembolso es sólo dónde
     se compró.
   · Pagar no cambia: el egreso sigue a nombre de la persona, categoría
     `reembolso`.

3. MEDIDO. `pruebas/ordenes.spec.ts`: 4 casos nuevos (mi cuenta: no la
   tengo, no la aceptan mal, la guardo, es sólo mía; con la guardada el
   reembolso entra sin mandarla y la orden se queda con la copia aunque la
   cambie; una CLABE mala no entra ni con la orden y una compra ignora
   `cuenta`; quien paga la ve, al corregir se cambia, sin cuenta no vuelve
   al buzón). Los dos casos viejos de reembolso ahora dan la cuenta.
   `pruebas/migracion-0050.spec.ts`: base en la 0049 con compras y
   reembolsos, migrada; filas idénticas en las columnas viejas, las nuevas
   en nulo, `foreign_key_check` vacío, correrla dos veces no truena, y el
   motor lee un reembolso viejo con `clabe: null` y uno nuevo con la suya.
   `migracion-0045.spec.ts` toma su foto justo después de la 0045 (la 0050
   le agrega columnas a `ordenes`). Batería completa: 1,131 en verde (50 archivos).

4. PARA dash101 Y supply101 (va en el mismo trabajo, dash101 PR aparte):
   supply101 pide la cuenta al pedir un reembolso si `permisos` no la trae,
   y en modo reembolso ya NO abre la ficha del proveedor con cuentas.
   dash101 enseña «Para reembolsarle» con CLABE para copiar, en vez de la
   ficha del proveedor, en un reembolso.

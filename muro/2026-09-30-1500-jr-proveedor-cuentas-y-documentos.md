de:     jr (programador)
para:   quien toque proveedores (orgs.ts, tablas.ts), archivos, o supply101
fecha:  30-sep-2026, 15:00
asunto: varias cuentas por proveedor con alias, documentos de respaldo, y la ficha en supply101 (0.55.0)

Mike, 30-sep, tres mensajes seguidos sobre supply: dar de alta el
proveedor desde la orden nueva (eso ya existía desde el 29-sep, botón
«＋ Dar de alta un proveedor nuevo» dentro de «Pedir»), «sus datos
bancarios y de contacto (…) igualito que un administrador», «adjuntar
uno o más documentos de respaldo (carátula bancaria, foto de la
tarjeta)», y «más de una cuenta bancaria con un ALIAS para
identificarla».

API 0.55.0 (#180). Migración org 0023: tabla proveedor_cuentas (id,
proveedor_id, alias, clabe, banco, beneficiario, notas, creado_at),
índice por proveedor, ON DELETE CASCADE. La cuenta que ya estaba en
columnas de proveedores (0022) pasa a ser la fila «Principal»; las
columnas se quedan porque el contrato las expone (dash101 no las lee
todavía). Va por el CRUD genérico: DEFS, TABLAS, ESCRITORES (dash101
todo; supply101 proveedor_id, alias, clabe, banco, beneficiario, notas);
`revisarCuenta` normaliza y revisa la CLABE y el alias como
`revisarProveedor`. Los documentos van en `archivos` con de_tabla =
'proveedores' (no hacía falta tabla); nueva DELETE /orgs/:o/archivos/:id
(borra el objeto de R2 y luego la fila; un cliente no). Cuatro pruebas
en proveedores.spec.ts; 642 en verde.

supply101 (dash101 #101). El alta: lista de cuentas con alias, CLABE,
banco y beneficiario («Principal» de fábrica, «＋ Otra cuenta»);
documentos (foto o PDF, las fotos se achican); se guarda en orden
proveedor → cuentas → documentos, y si una cuenta la rechaza la API se
señala SU fila y al reintentar no se crea otro proveedor (pvCreado). La
ficha del proveedor ya existente («Ver la ficha» al escoger uno): datos,
cuentas (agregar y quitar) y documentos (subir, abrir, quitar): es la
puerta para los proveedores de ayer. el-proveedor-nuevo.mjs lo mide todo
contra la API fingida. Verificado en vivo.

Pendiente que no pidió: dash101 no enseña las cuentas ni los documentos
del proveedor. Cuando lo pida, es leer proveedor_cuentas y archivos por
proveedor; la API ya lo da.

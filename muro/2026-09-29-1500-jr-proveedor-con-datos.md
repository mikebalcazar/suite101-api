de:     jr (programador)
para:   quien toque proveedores (API: tablas.ts, permisos.ts, rutas/orgs.ts) o supply101 (dash101/supply101/publico)
fecha:  29-sep-2026
asunto: el proveedor con datos para pagarle y encontrarlo; supply101 los da de alta desde «Pedir» (API 0.54.0)

Mike, 29-sep: «En supply. Hay que poner la opción de dar de alta a un
nuevo proveedor, y dentro de los datos deben poder agregar: nombre, RFC,
número de cuenta (CLABE y banco y beneficiario), email de contacto,
teléfono de contacto, ubicación (si se puede guardar una ubicación de
Google Maps).»

Qué había: `proveedores` (0001) con nombre, rfc, categoria, correo,
telefono, terminos_pago, notas. supply101 sólo LEÍA la lista; un
proveedor que no existía se escribía a mano en la orden
(`proveedor_nombre`) y nunca entraba al catálogo. Lo escribían dash101
(todo) y quote101 (nombre, correo, teléfono).

Decisiones (#165, contrato 0.54.0):
· Migración org 0022: `clabe`, `banco`, `beneficiario`, `direccion`,
  `maps_url`. La ubicación es la liga que Google Maps comparte
  (maps.app.goo.gl o google.com/maps…), no lat/lng sueltos: es lo que la
  gente pega y lo que abre el mapa en el teléfono. `direccion` en texto
  aparte, para leerla sin abrir el mapa.
· supply101 escribe proveedores por el CRUD genérico con esta lista:
  nombre, rfc, correo, telefono, clabe, banco, beneficiario, direccion,
  maps_url, notas. NO categoria, terminos_pago ni creado_en_app: eso es
  de administración (dash101) o lo pone la API.
· La API revisa al crear y al cambiar (`revisarProveedor` en
  rutas/orgs.ts): CLABE de 18 dígitos con verificador (pesos 3-7-1,
  `clabeValida` exportada), RFC de 12 o 13, correo con arroba y punto,
  liga de Google Maps. Normaliza: RFC en mayúsculas y sin espacios,
  CLABE sin espacios ni guiones, correo en minúsculas. 400
  `datos_invalidos` con `errores` por campo. Vacío se acepta: sólo el
  nombre es obligatorio. Vale para todas las apps, dash101 incluida.
· `Proveedor` en tipos.ts trae los cinco campos.

supply101 (dash101 #98): bajo «A quién se le compra», «＋ Dar de alta un
proveedor nuevo» despliega el formulario dentro de «Pedir» (no se sale
de la compra a medias). «📍 Aquí» usa navigator.geolocation y arma
https://www.google.com/maps?q=lat,lng; «Abrir en Google Maps» la
comprueba. Al guardar, el nuevo queda escogido en la compra. Un 400 con
`errores` marca los campos (`.campo-mal`) y no cierra el formulario.
Prueba pruebas/el-proveedor-nuevo.mjs (API fingida, geolocalización
fingida por Playwright), en publicar.yml antes de staging.

Lo que NO está: editar o ver la ficha del proveedor en supply101 (sólo
alta), y en dash101 la pantalla de proveedores no enseña todavía la
cuenta ni la ubicación; los datos ya están en la API para cuando haga
falta. Medido: proveedores.spec.ts (7), suite 611/611; API 0.54.0 en
staging y producción; supply101 publicado.

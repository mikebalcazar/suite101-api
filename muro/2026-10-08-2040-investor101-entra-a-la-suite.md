de:     investor101 (chat de Cowork)
para:   dash101, master101 y workshop101 (lista de apps), sitio, quien toque la puerta de /orgs o `movimientos`, y el coordinador
fecha:  8-oct-2026, 20:40 UTC
asunto: investor101 es app de la suite: rondas de inversión y préstamos a la empresa (API 0.82.0 #275 #276 #277, investor101 0.1.0, dash101 #146)

MIKE, 8-oct: «Necesito hacer una plataforma para inversionistas o personas que
hacen préstamos/créditos a taller101 durante periodos de tiempo definidos.
Pueden ser semanas o meses, pero no más (…) taller tiene un periodo de falta
de flujo (necesita pagar 30k durante las siguientes 3 semanas (90k total)) y
esto sea una herramienta para pedir prestado a uno o varios inversionistas
(…) abrirles una cuenta de inversionista y que ellos puedan ver cuánto tienen
invertido y durante cuánto tiempo y sepan qué día se les paga (…) Esto se
tiene que reflejar en la proyección de flujos de dash (…) desde dash donde
tenemos déficit de flujos, poder seleccionar esa parte y generar una ronda».

LAS DIEZ DECISIONES DE MIKE, una por una y con botones (8-oct):
 1. Interés: LIBRE POR PRÉSTAMO (mensual, anual o fija por el plazo).
 2. Ofertas: quedan pendientes; él aprueba, ajusta o rechaza cada una.
 3. Entrada del inversionista: correo + contraseña, como la suite.
 4. El inversionista ve de una ronda SÓLO EL AVANCE TOTAL, nunca a los demás.
 5. Aviso de ronda: correo automático + WhatsApp a mano.
 6. Los pagos se registran en DASH101; investor101 los refleja.
 7. El préstamo ARRANCA cuando él marca el depósito recibido.
 8. Pagaré en PDF automático; se firma a mano y se sube firmado.
 9. Pagar antes o atrasarse: se edita la tabla a mano, con historial.
10. Lo construye este chat, completo.

1. LA APP. `investor101`, llave `investor`. Licencia por empresa: una
   empresa nueva NO nace con ella. La d1/0025 la prende en `forespot` y en
   `demo`. Worker `investor101` en investor101.taller101.com y
   `investor101-staging`. Repo `investor101` (lo creó Mike el 8-oct).
   → master101 y workshop101 traen la lista de apps escrita a mano: falta
     `['investor', 'investor101']`. PATCH {apps} mezcla, así que guardar desde
     un panel viejo no la apaga.

2. UNA CLASE NUEVA DE QUIEN ENTRA: `inversionista`. No es miembro, cliente ni
   personal. Su permiso vive en `accesos_inversion` (D1; la llave es
   persona + empresa, no una fila por persona como `accesos`: un
   inversionista puede ser además cliente, y prestarle a dos empresas).
   OJO, quien toque la puerta de /orgs: muchas rutas sólo dicen «un cliente
   no». Por eso al inversionista NO se le confía a cada ruta: la puerta le
   cierra todo lo que no sea /orgs/:o/inversion/*, y sólo con X-App:
   investor101. `Quien.clase` tiene ahora cuatro valores.
   `/yo` suma `inversion: [{org_id, nombre, ref_id}]`.

3. LAS TABLAS (org/0042, SQL plano, sólo CREATE IF NOT EXISTS): 
   `inversionistas`, `rondas`, `ronda_ofertas`, `prestamos`,
   `prestamo_pagos`, `inversion_archivos`, `inversion_eventos`. Internas: NO
   salen por el CRUD genérico. Folios RON- y PRE-.

4. LA CUENTA (src/inversion.ts, pura, en BigInt). Tasa en PUNTOS BASE
   (250 = 2.50 %). `mensual`: mes entero = un mes, días sueltos entre 30.
   `anual`: días reales entre 365. `fija`: por todo el plazo, pareja entre
   pagos. `unico` o `parcialidades` (capital parejo, interés sobre saldo;
   los centavos que sobran, al último pago). Tope: 24 meses. Estas reglas
   las decidió este chat, no Mike; están en investor101/claude/continuar.md.

5. EL DINERO, para quien toque `movimientos`:
   · marcar un depósito recibido → un INGRESO, categoria `prestamo_recibido`;
   · pagar → uno o dos EGRESOS: `prestamo_capital` y `prestamo_interes`;
   · contraparte_tipo `inversionista`, contraparte_id su fila.
   Son dinero que entra y sale de la cuenta, pero el capital NO es venta ni
   gasto: quien sume utilidad tiene que apartar `prestamo_recibido` y
   `prestamo_capital`. El interés sí es gasto (financiero). dash101 todavía
   no los aparta en ningún reporte.

6. LAS RUTAS, todas bajo /orgs/:o/inversion (src/rutas/inversion.ts). Dos
   papeles: `admin` (owner o admin; con X-App investor101 o dash101) e
   `inversionista` (sólo lo suyo; un préstamo ajeno es 404, no 403).
   La licencia que cuenta es la de investor101 aunque se llegue por dash101
   (#276: lo encontró la prueba de dash101 el mismo día).
   Para dash101: GET /flujo ({pagos, depositos}), GET /pagos (el buzón),
   POST /pagos/:id/pagar, POST /prestamos/:id/recibido, POST /rondas (nace
   en borrador, con `origen`), POST /archivos (multipart).
   POST /simular da la tabla sin guardar: las pantallas no hacen cuentas.

7. dash101 (#146). `lib/proyeccion.ts` gana la fuente `prestamos` (clase
   «prestamo») y `rondaParaCubrir`. /flujo: casilla en cada bloque en
   negativo y «Generar la ronda» (borrador en investor101). /inversion
   («Préstamos» en el menú): depósitos por confirmar y pagos por pagar.

8. CORREOS (src/inversion-correo.ts, sobre propio: el pie no manda a «quien
   administra la Suite 101 en tu empresa», que a un inversionista no le dice
   nada). Ronda abierta, oferta recibida/aceptada/rechazada, depósito
   recibido, pago hecho, tabla cambiada. Variable nueva URL_INVESTOR.

MEDIDO.
  · API: inversion.spec.ts, 46 (11 de la cuenta —los ejemplos de Mike al
    centavo—, 35 de las rutas, con lo que un inversionista NO abre). Batería
    895 (849 antes). Deploy #275 y #276: pruebas, publicar, humo y verificar
    en verde.
  · investor101 (d9de24c): pantalla.spec.mjs, 67 — dos personas en dos
    navegadores (1440×900 y 390×844), el camino completo, cada paso en la
    pantalla y en la API. Local 67/67, staging 67/67, y la medición de
    producción en verde (la puerta, la huella, /s101/salud, workers.dev →
    dominio).
  · dash101: proyeccion.spec 24 (+6), inversion-api.spec 8.

PENDIENTE, de quien lo tome: `investor101` en APPS_DOMINIO y en la puerta de
empresas (puerta/destino.ts); master101 y workshop101; el sitio (ficha y
logotipo); que dash101 aparte el capital de los préstamos en sus reportes;
OPERAR.md dice «catorce repositorios» y ya son dieciséis. Y DE MIKE: que un
abogado revise el texto del pagaré y diga si avisar de rondas a una lista de
prospectos necesita algún cuidado.

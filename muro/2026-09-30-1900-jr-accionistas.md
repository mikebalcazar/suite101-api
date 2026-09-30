de:     jr (programador)
para:   quien toque movimientos (org-db.ts, orgs.ts) o el dinero de dash101
fecha:  30-sep-2026, 19:00
asunto: accionistas y retiros de utilidades (API 0.57.0 #185, dash101 #110)

Mike, 30-sep: «El dash, necesito un módulo de accionistas donde se
registren pagos a los accionistas como retiro de utilidades».

API 0.57.0. Migración org 0025: tabla `accionistas` (negocio_id, nombre,
nombre_norm, rfc, correo, telefono, porcentaje, notas, activo), por el CRUD
genérico; la escribe dash101 y la ve quien ve dinero (está en
TABLAS_DINERO). revisarAccionista: nombre con algo, participación entre 0 y
100, RFC y correo con la vara de proveedores (normaliza igual).

EL RETIRO NO TIENE TABLA, y es a propósito: es un egreso en `movimientos`
con categoria = 'retiro_utilidades' (CATEGORIA_RETIRO_UTILIDADES) y
contraparte_tipo = 'accionista' (se sumó al tipo del contrato). Así baja
la cuenta de la que salió, sale en Movimientos, en la conciliación y en el
flujo como cualquier dinero que se fue, se corrige o se borra como
cualquier movimiento, y la categoría es lo que lo aparta de los gastos:
un retiro no es un gasto del negocio, es utilidad que se reparte. Si
alguien arma un estado de resultados, que excluya esa categoría.
`porcentaje` es REAL (esquema.spec lo admite con nombre): es
participación, no dinero. Un negocio con accionistas colgados no se borra
(409 en_uso), como con todo.

dash101 #110. Menú «Accionistas» (después de Raya). Una sola pantalla,
primero para el teléfono: tarjetas con nombre, participación y lo
retirado; «Nuevo accionista» y «Registrar retiro» se abren ahí mismo. El
retiro pide monto, fecha, de qué cuenta sale (con su saldo) y concepto;
si no viene concepto, «Retiro de utilidades · <nombre>». Dar de baja no
borra: lo retirado sigue en su renglón, en «dados de baja». Abajo, la
lista de retiros con total y liga a Movimientos. lib/accionistas.ts es
sólo API (como la raya) y lee los egresos COMPLETOS (listarCompleto), no
las 500 de siempre.

Medido: accionistas.spec.ts en la API (8; 8/8 fallan sobre el código
viejo con tabla_desconocida), 653 en verde; en dash101
pruebas/accionistas.spec.ts contra staging (5: pesos de ida y vuelta,
2500.5 baja 2500.5; el egreso con su categoría y contraparte; los
errores de la API dichos en claro; la baja sin perder lo retirado) y una
prueba en navegador.spec.mjs a 390×844 (alta, retiro de $1,234.50, el
egreso en la API, sin barrido horizontal, baja). API en producción con
contrato 0.57.0; dash101 publicado y verificado (huella 68b38b9).

Lo que costó: la primera corrida de #110 se quedó en staging porque las
etiquetas del formulario no estaban ligadas a sus campos y Playwright no
encontró «Participación %». #111: htmlFor/id en cada campo (que además
es lo que un lector de pantalla necesita).

Lo que NO se hizo, porque Mike no lo pidió: reparto automático de
utilidades por porcentaje (el porcentaje sólo se enseña), y el retiro
desde la pantalla de «nuevo movimiento» (ahí no hay accionista como
contraparte; se registra desde Accionistas).

de:    jr (sesión de Claude Code; ejecuta T3 y el backlog B1 de dash101)
para:  todos — en especial quien mantenga suite101-api, peek101 y quell101
qué:   aviso previo (arranque §10.2 y OPERAR §5): dos tablas nuevas para la conciliación semanal y una columna en `negocios`; el contrato sube a 0.4.0. Nada de lo de 0.3.1 cambia.

# Antes de tocar `suite101-api`: la conciliación semanal (B1 del backlog de dash101)

Lo pidió Mike el 11-sep y lo dejó escrito el chat de dash101 en Drive
(`suite101/dash101/2026-09-11-tarea-conciliacion-semanal.md`). Va ahora porque
su condición ya se cumplió: dash101 lee y escribe por la API desde anoche.

## Qué es, en una línea

Una vez por semana, un owner o un admin captura el saldo real de cada cuenta;
la API guarda el saldo que tenía registrado, el real y la diferencia, y crea
un movimiento de ajuste para que dash101 quede igual a la realidad. La suma de
todos los ajustes es cuánto dinero se escapa del registro.

## Qué cambia

1. **Tabla `conciliaciones`:** `id`, `negocio_id`, `corte_at` (la hora exacta
   del corte), `hecha_por`, `creado_at`.
2. **Tabla `conciliacion_cuentas`:** `id`, `conciliacion_id`, `cuenta_id`,
   `saldo_registrado`, `saldo_real`, `diferencia` (centavos enteros) y
   `movimiento_id` del ajuste, nulo si esa cuenta cuadró.
3. **`negocios.dia_conciliacion`:** entero 0–6 (0 domingo), por omisión **1**,
   lunes. Es la única columna que se agrega a una tabla que ya existe.
4. **Migración `0003`**, que aplica el Durable Object al despertar, como las
   anteriores. No borra ni cambia nada de lo que hay.
5. **Las dos tablas son append-only**, como `avances`: `PATCH` y `DELETE`
   contestan 403. Una conciliación pasada nunca se edita; si mañana alguien
   captura un gasto con fecha vieja, eso aparece en la conciliación siguiente,
   no cambia la anterior. Si se recalculara, la estadística mentiría.
6. **`POST /orgs/:o/conciliaciones`**: una sola ruta que, en una transacción
   del SQLite, calcula el saldo registrado de cada cuenta al corte, guarda la
   conciliación con sus renglones y crea los ajustes. O queda todo, o no queda
   nada. Sólo **owner y admin**, comprobado en el servidor, no en la pantalla.
7. **`GET /orgs/:o/conciliaciones/estadistica`**: lo que se escapó por corte,
   por cuenta y el acumulado.
8. El ajuste es un movimiento normal con `categoria = 'ajuste_conciliacion'` y
   **sin `proyecto_id`**: por eso no mueve `cobrado`, `pagado_prov` ni el
   compromiso de ningún proyecto.
9. Contrato **0.4.0**: se agregan dos tablas y dos rutas; ninguna respuesta
   existente cambia.

## A quién le toca

- **peek101:** nada. El cliente no ve conciliaciones (no están entre las
  cuatro tablas que puede leer) ni ve movimientos.
- **quell101:** nada. Una persona sin `ve_dinero` tampoco las lee: las tablas
  entran a la lista de tablas de dinero.
- **dash101:** las usa; la pantalla va en la entrega que sigue a este recado.
- **quien mantenga la API:** `TABLAS` pasa de 14 a 16.

Se empuja en cuanto las pruebas lo midan, con los números de la tarea.

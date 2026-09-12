de:    jr (sesión de Claude Code; B1 del backlog de dash101)
para:  todos — en especial quien mantenga suite101-api, peek101 y quell101
qué:   la conciliación semanal ya está publicada: API contrato 0.4.0 (#38) y pantalla en dash101 (#18). Con números.

# La conciliación semanal, publicada

Sale de `suite101/dash101/2026-09-11-tarea-conciliacion-semanal.md`, con las
cinco decisiones de Mike del 11-sep sin reinterpretar. Aviso previo:
`2026-09-12-0140-jr-antes-de-tocar-la-api-conciliacion.md`.

## Qué quedó

- Migración `0003` del OrgDB: `conciliaciones`, `conciliacion_cuentas` y
  `negocios.dia_conciliacion` (0–6, lunes por omisión). Los Durable Objects
  nacen ahora en **versión 3** y las bases que ya existían la corren al
  despertar. **Si algo esperaba la versión 2, ahí es donde va a fallar.**
- `POST /orgs/:o/conciliaciones` (sólo dash101, y sólo owner o admin,
  comprobado en el servidor) y `GET /orgs/:o/conciliaciones/estadistica`.
- Las dos tablas nuevas son **append-only**: `PATCH` y `DELETE` dan 403, como
  `avances`. El 403 dice por qué ruta se escribe cada una.
- El ajuste es un movimiento con `categoria = 'ajuste_conciliacion'`, **sin
  proyecto** y con contraparte «Sin identificar».
- Contrato **0.4.0**. `TABLAS` pasa de 14 a 16. Producción y staging
  contestan `0.4.0` en `/salud`, medido desde esta sesión.

## Lo medido

| Prueba | Resultado |
|---|---|
| `migracion-0003.py` (sqlite3, con 0001 y 0002 aplicadas) | ninguna tabla pierde filas; las cuatro sumas de dinero idénticas al centavo; `foreign_key_check` e `integrity_check` limpios; aplicarla dos veces truena |
| workerd, con el DO y el D1 de verdad | **113 de 113** |
| dash101 contra la org demo de staging | **38 de 38** |

Los números del corte, en centavos: banco registrado 34,500,000 contra real
34,420,000 da ajuste **egreso de 80,000**; la caja cuadra y **no** recibe
ajuste; la tarjeta queda en −3,050,000, igual al estado de cuenta; la cuenta
con 30,000 de más recibe **ingreso**. Segunda semana: 20,000 nuevos y
acumulado 120,000 (faltante 150,000, sobrante 30,000). Un gasto capturado
después con fecha anterior **no** cambia el corte pasado. `cobrado` y
`pagado_prov` de los proyectos, iguales antes y después.

## A quién le toca

- **peek101 y quell101:** nada que cambiar. El cliente no lee estas tablas, y
  una persona sin `ve_dinero` tampoco: entraron a la lista de tablas de
  dinero.
- **Quien tenga una prueba que espere `org_db_version === 2`:** ahora es 3.

## No verificado

Que `transactionSync` deshaga una caída a media escritura. La atomicidad
viene de ahí; lo que se midió es que un corte rechazado no deja nada escrito.

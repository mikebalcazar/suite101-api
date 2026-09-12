-- OrgDB v3 — la conciliación semanal (B1 del backlog de dash101, 12-sep-2026).
--
-- Qué resuelve: `cuentas` no guarda saldo; el registrado se calcula sumando
-- los movimientos. Eso dice lo que dash101 cree, no lo que hay en el banco.
-- Una vez por semana alguien captura el saldo real de cada cuenta y aquí
-- queda, para siempre, la diferencia entre los dos: cuánto dinero se escapó
-- del registro esa semana.
--
-- Append-only, como `avances`: una conciliación pasada nunca se edita. Si
-- mañana se captura un gasto con fecha vieja, eso sale en la conciliación
-- siguiente; recalcular la anterior haría mentir a la estadística.
--
-- La aplica el Durable Object al despertar, como 0001 y 0002. Nunca se edita
-- después de salir: las bases que ya la corrieron no la volverían a correr.
--
-- Dinero: INTEGER en centavos. Nunca REAL.

CREATE TABLE conciliaciones (
  id          TEXT PRIMARY KEY,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id),
  -- La hora exacta del corte. El saldo registrado se congela a esta hora.
  corte_at    TEXT NOT NULL,
  hecha_por   TEXT NOT NULL,                       -- usuarios.id del D1
  creado_at   TEXT NOT NULL
);
CREATE INDEX conciliaciones_negocio ON conciliaciones(negocio_id, corte_at);

CREATE TABLE conciliacion_cuentas (
  id               TEXT PRIMARY KEY,
  conciliacion_id  TEXT NOT NULL REFERENCES conciliaciones(id),
  cuenta_id        TEXT NOT NULL REFERENCES cuentas(id),
  saldo_registrado INTEGER NOT NULL,
  saldo_real       INTEGER NOT NULL,
  -- registrado − real. Positiva: dash101 decía más de lo que hay, o sea
  -- salidas que nadie registró. Negativa: entradas que faltaban.
  diferencia       INTEGER NOT NULL,
  -- El movimiento de ajuste que dejó la cuenta igual al real. NULL si cuadró.
  movimiento_id    TEXT REFERENCES movimientos(id),
  creado_at        TEXT NOT NULL
);
CREATE INDEX conciliacion_cuentas_conc   ON conciliacion_cuentas(conciliacion_id);
CREATE INDEX conciliacion_cuentas_cuenta ON conciliacion_cuentas(cuenta_id);

-- El día en que toca conciliar, 0 domingo … 6 sábado, como `opex.dia_semana`.
-- Por omisión el lunes, que es lo que decidió Mike el 11-sep.
ALTER TABLE negocios ADD COLUMN dia_conciliacion INTEGER NOT NULL DEFAULT 1;

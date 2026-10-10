-- 0050: la cuenta a la que se reembolsa (10-oct-2026).
--
-- Mike, 10-oct: un reembolso se le paga SÓLO a quien lo pidió, nunca a la
-- cuenta de un proveedor ni de un tercero. «Necesito que requieras su cuenta
-- bancaria cuando pida un reembolso si es que no la tiene registrada, para
-- asegurarnos que siempre haya una cuenta en donde reembolsar. Y esa info de
-- cuenta bancaria cuando se va a pagar el reembolso debe aparecer para poder
-- ingresarla en el sistema bancario o copiarla».
--
-- Dos piezas:
--   · `reembolso_cuentas`: la cuenta de cada quien, UNA por usuario, por su
--     `usuario_id` (no por `personal`: quien pide puede no tener fila ahí).
--     Se guarda la primera vez que pide un reembolso y se reusa después.
--     Es tabla interna: no sale por el CRUD genérico, sólo por /ordenes.
--   · `ordenes.reembolso_*`: la COPIA de esa cuenta en la orden, tomada al
--     pedirla. Si la persona cambia su cuenta mañana, la orden de hoy sigue
--     diciendo a dónde se pagó: es lo que se compara contra el banco.
--
-- Corre en código (`OrgDB.cuentaDeReembolso`), como la 0049: SQLite no tiene
-- ADD COLUMN IF NOT EXISTS y hay pruebas que regresan la versión.
CREATE TABLE IF NOT EXISTS reembolso_cuentas (
  usuario_id    TEXT PRIMARY KEY,
  clabe         TEXT NOT NULL,
  banco         TEXT,
  beneficiario  TEXT,
  actualizado_at TEXT NOT NULL
);
ALTER TABLE ordenes ADD COLUMN reembolso_clabe TEXT;
ALTER TABLE ordenes ADD COLUMN reembolso_banco TEXT;
ALTER TABLE ordenes ADD COLUMN reembolso_beneficiario TEXT;

-- OrgDB v23 — un proveedor puede tener más de una cuenta bancaria, cada una
-- con un alias para saber cuál es.
--
-- Mike, 30-sep-2026, para supply101: «en el proveedor, necesito que se
-- puedan registrar más de una cuenta bancaria con un ALIAS para
-- identificarla». La 0022 dejó UNA cuenta en columnas de `proveedores`
-- (clabe, banco, beneficiario). Esas columnas se quedan —el contrato las
-- expone y dash101 podría leerlas— pero la verdad vive aquí: una fila por
-- cuenta. La que ya estaba en columnas pasa a ser la cuenta «Principal».
--
-- Los documentos de respaldo (carátula bancaria, foto de la tarjeta) no
-- necesitan tabla: van en `archivos` con de_tabla = 'proveedores'.
CREATE TABLE IF NOT EXISTS proveedor_cuentas (
  id            TEXT PRIMARY KEY,
  proveedor_id  TEXT NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  alias         TEXT NOT NULL,           -- «Principal», «Nómina», «Dólares»…
  clabe         TEXT NOT NULL,           -- 18 dígitos; la API revisa que cuadre
  banco         TEXT,
  beneficiario  TEXT,
  notas         TEXT,
  creado_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS proveedor_cuentas_proveedor ON proveedor_cuentas(proveedor_id);

INSERT INTO proveedor_cuentas (id, proveedor_id, alias, clabe, banco, beneficiario, notas, creado_at)
  SELECT '0' || upper(substr(hex(randomblob(13)), 1, 25)), id, 'Principal', clabe, banco, beneficiario, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM proveedores WHERE clabe IS NOT NULL AND trim(clabe) <> '';

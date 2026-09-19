-- OrgDB v7 — roster101 vive aquí (los expedientes de trabajadores, por empresa).
--
-- POR QUÉ
--
-- Hasta el 19-sep roster101 tenía una base D1 y un bucket R2 por empresa,
-- cada uno en su propio Worker. Mike decidió el 19-sep que TODO lo de una
-- empresa viva en su base de la suite: éstas son las tablas de roster101,
-- tal cual las tenía (schema.sql más su migración 0001), con el prefijo
-- `roster_` para que no choquen con las de la suite (`personal` de la suite
-- es quien cobra en dash101; `roster_trabajadores` es el expediente laboral
-- con NSS, CURP y CLABE; son cosas distintas y se quedan distintas). El
-- motor que las usa es src/roster/motor.js, el mismo código que corría en el
-- Worker de roster101, y sus reglas no cambian.
--
-- LO QUE SE QUEDÓ ATRÁS
--
-- Las tablas de la contraseña del panel (claves_admin, codigos_admin,
-- intentos_admin) y las columnas hash/sal/vueltas/debe_cambiar de
-- administradores: el panel entra por la suite desde el 16-sep y ya estaban
-- vacías. La sesión del trabajador no está en ninguna tabla: es una cookie
-- firmada, como siempre.
--
-- Aquí no hay dinero: `tamano` son bytes, `expira` y `borra_el` son
-- segundos desde 1970.

-- El expediente. Un renglón por persona; el correo es su llave de entrada.
CREATE TABLE IF NOT EXISTS roster_trabajadores (
  id                TEXT PRIMARY KEY,
  folio             INTEGER,
  email             TEXT NOT NULL UNIQUE,
  nombre            TEXT DEFAULT '',
  apellido_paterno  TEXT DEFAULT '',
  apellido_materno  TEXT DEFAULT '',
  celular           TEXT DEFAULT '',
  nss               TEXT DEFAULT '',
  curp              TEXT DEFAULT '',
  rfc               TEXT DEFAULT '',
  banco             TEXT DEFAULT '',
  clabe             TEXT DEFAULT '',
  beneficiario      TEXT DEFAULT '',
  emerg_nombre      TEXT DEFAULT '',
  emerg_parentesco  TEXT DEFAULT '',
  emerg_telefono    TEXT DEFAULT '',
  emerg_email       TEXT DEFAULT '',
  puesto            TEXT DEFAULT '',
  estado            TEXT NOT NULL DEFAULT 'borrador',  -- borrador | completo
  creado_en         TEXT NOT NULL,
  actualizado_en    TEXT NOT NULL,
  confirmado_en     TEXT
);

-- Los documentos que subió. `llave` es relativa (`trabajadores/{id}/…`): el
-- motor la lee bajo `orgs/{org}/roster/` en el bucket de la suite.
CREATE TABLE IF NOT EXISTS roster_documentos (
  id             TEXT PRIMARY KEY,
  trabajador_id  TEXT NOT NULL REFERENCES roster_trabajadores(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL,      -- foto | firma_bancaria | ine | ine_reverso | acta | nss | csf | curp | caratula | dc3 | otro
  etiqueta       TEXT DEFAULT '',    -- nombre libre cuando tipo = otro
  nombre_archivo TEXT NOT NULL,
  llave          TEXT NOT NULL,
  mime           TEXT NOT NULL,
  tamano         INTEGER NOT NULL,
  subido_en      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_roster_docs_trab ON roster_documentos(trabajador_id);

-- El código de seis dígitos que se le manda al trabajador. Uno por correo,
-- vence a los 10 minutos, cinco intentos.
CREATE TABLE IF NOT EXISTS roster_codigos (
  email      TEXT PRIMARY KEY,
  hash       TEXT NOT NULL,
  expira     INTEGER NOT NULL,
  intentos   INTEGER NOT NULL DEFAULT 0,
  enviado_en INTEGER NOT NULL
);

-- Todo lo que pasa: accesos, altas, subidas, exportaciones, cuentas.
CREATE TABLE IF NOT EXISTS roster_bitacora (
  id        INTEGER PRIMARY KEY,
  cuando    TEXT NOT NULL,
  quien     TEXT NOT NULL,
  accion    TEXT NOT NULL,
  detalle   TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_roster_bitacora_cuando ON roster_bitacora(cuando DESC);
CREATE INDEX IF NOT EXISTS idx_roster_bitacora_accion ON roster_bitacora(accion);

-- Constancia de que el trabajador leyó y aceptó el aviso de privacidad.
CREATE TABLE IF NOT EXISTS roster_consentimientos (
  trabajador_id TEXT PRIMARY KEY,
  version       TEXT NOT NULL,
  aceptado_en   TEXT NOT NULL
);

-- Papelera. Dar de baja no borra: se apunta aquí y a los 30 días se borra de
-- verdad, con todo y documentos. Antes de eso se puede restaurar.
CREATE TABLE IF NOT EXISTS roster_papelera (
  trabajador_id TEXT PRIMARY KEY,
  borrado_en    TEXT NOT NULL,   -- ISO, para mostrarlo
  borra_el      INTEGER NOT NULL -- segundos desde 1970: cuándo toca borrar de verdad
);

-- Las cuentas del panel de la empresa: de qué nivel es cada quien. Con qué
-- entra no está aquí: entra con su cuenta de la suite y se casa por correo.
--   nivel   'dueno' maneja las cuentas; 'admin' hace todo lo demás;
--           'consulta' solo ve expedientes y saca fichas.
--   activo  0 = se le quitó el acceso sin borrar su rastro en la bitácora.
CREATE TABLE IF NOT EXISTS roster_administradores (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,   -- en minúsculas
  nombre        TEXT NOT NULL DEFAULT '',
  nivel         TEXT NOT NULL DEFAULT 'consulta' CHECK (nivel IN ('dueno','admin','consulta')),
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL,
  creado_por    TEXT NOT NULL DEFAULT '',
  ultimo_acceso TEXT
);

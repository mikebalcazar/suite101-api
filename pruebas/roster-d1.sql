-- La D1 de roster101 tal cual la tenía el portal de Taller 101 (schema.sql +
-- migración 0001): la siembra la prueba de la mudanza para traerla a una
-- empresa de mentiras. Es una copia; la de verdad no se toca desde aquí.

-- Portal de Trabajadores Taller 101 — esquema D1
CREATE TABLE IF NOT EXISTS trabajadores (
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
  emerg_telefono    TEXT DEFAULT '',
  emerg_email       TEXT DEFAULT '',
  puesto            TEXT DEFAULT '',
  estado            TEXT NOT NULL DEFAULT 'borrador',  -- borrador | completo
  creado_en         TEXT NOT NULL,
  actualizado_en    TEXT NOT NULL,
  confirmado_en     TEXT
);

CREATE TABLE IF NOT EXISTS documentos (
  id             TEXT PRIMARY KEY,
  trabajador_id  TEXT NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL,      -- foto | firma_bancaria | ine | nss | csf | curp | caratula | dc3 | otro
  etiqueta       TEXT DEFAULT '',    -- nombre libre cuando tipo = otro
  nombre_archivo TEXT NOT NULL,
  llave          TEXT NOT NULL,      -- key en R2
  mime           TEXT NOT NULL,
  tamano         INTEGER NOT NULL,
  subido_en      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_trab ON documentos(trabajador_id);

CREATE TABLE IF NOT EXISTS codigos (
  email      TEXT PRIMARY KEY,
  hash       TEXT NOT NULL,
  expira     INTEGER NOT NULL,
  intentos   INTEGER NOT NULL DEFAULT 0,
  enviado_en INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bitacora (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  cuando    TEXT NOT NULL,
  quien     TEXT NOT NULL,
  accion    TEXT NOT NULL,
  detalle   TEXT DEFAULT ''
);
-- Se lee al revés y acotada a los últimos días: sin índice se recorre entera.
CREATE INDEX IF NOT EXISTS idx_bitacora_cuando ON bitacora(cuando DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_accion ON bitacora(accion);

-- Constancia de que el trabajador leyó y aceptó el aviso de privacidad.
-- Tabla aparte (y no columnas nuevas en "trabajadores") para que el esquema se
-- pueda volver a aplicar sobre una base que ya existe sin romper nada.
CREATE TABLE IF NOT EXISTS consentimientos (
  trabajador_id TEXT PRIMARY KEY,
  version       TEXT NOT NULL,
  aceptado_en   TEXT NOT NULL
);

-- Freno contra la adivinación de la clave de administración. Un renglón por
-- dirección de internet: los fallos seguidos, cuántas veces ya se le castigó
-- (para que cada bloqueo dure más que el anterior) y hasta cuándo dura el
-- bloqueo vigente, en segundos desde 1970.
CREATE TABLE IF NOT EXISTS intentos_admin (
  llave           TEXT PRIMARY KEY,
  fallos          INTEGER NOT NULL DEFAULT 0,
  castigos        INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER NOT NULL DEFAULT 0,
  visto_en        INTEGER NOT NULL DEFAULT 0
);

-- Papelera. Dar de baja a alguien no borra nada: se apunta aquí y su expediente
-- deja de aparecer en el panel, en el CSV, en el ZIP y en las fichas. A los 30
-- días se borra de verdad, con todo y documentos. Antes de eso se puede
-- restaurar, o borrar de inmediato si así se decide.
CREATE TABLE IF NOT EXISTS papelera (
  trabajador_id TEXT PRIMARY KEY,
  borrado_en    TEXT NOT NULL,   -- ISO, para mostrarlo
  borra_el      INTEGER NOT NULL -- segundos desde 1970: cuándo toca borrar de verdad
);

-- La clave del panel de la empresa deja de vivir en el repositorio y pasa a
-- vivir aquí, hasheada. Se guardan también las que ya se usaron, para poder
-- negar que alguien vuelva a poner una de los últimos seis meses.
--
-- Nunca se guarda la clave: se guarda el resultado de derivarla con PBKDF2 y su
-- sal. Para saber si una clave nueva ya se usó hay que derivarla contra la sal
-- de cada clave vieja, que es justo lo que hace el código.
CREATE TABLE IF NOT EXISTS claves_admin (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  hash       TEXT NOT NULL,
  sal        TEXT NOT NULL,
  vueltas    INTEGER NOT NULL,
  creada_en  TEXT NOT NULL,
  vigente    INTEGER NOT NULL DEFAULT 0,   -- 1 = es la que abre hoy
  quien      TEXT DEFAULT ''               -- 'cambio' | 'restauracion' | 'bootstrap'
);
CREATE INDEX IF NOT EXISTS idx_claves_vigente ON claves_admin(vigente);
CREATE INDEX IF NOT EXISTS idx_claves_creada ON claves_admin(creada_en DESC);

-- Códigos para recuperar la clave cuando se olvidó. Van al correo configurado
-- de la empresa, no a uno que se escriba en la pantalla: si se pudiera escribir,
-- cualquiera pediría el código a su propio correo.
CREATE TABLE IF NOT EXISTS codigos_admin (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  hash       TEXT NOT NULL,
  expira     INTEGER NOT NULL,
  intentos   INTEGER NOT NULL DEFAULT 0,
  enviado_en INTEGER NOT NULL
);

-- Las cuentas del panel de la empresa. Antes había una sola clave para todos
-- (claves_admin); ahora cada persona entra con su correo y su contraseña, y la
-- bitácora dice quién exportó qué. La contraseña se guarda como en claves_admin:
-- derivada con PBKDF2, con su sal y sus vueltas, nunca en claro.
--   nivel         'dueno' maneja las cuentas; 'admin' hace todo lo demás;
--                 'consulta' solo ve expedientes y saca fichas.
--   activo        0 = se le quitó el acceso sin borrar su rastro en la bitácora.
--   debe_cambiar  1 = alguien más le puso la contraseña (alta o reinicio): la
--                 tiene que cambiar al entrar, para que nadie más la sepa.
CREATE TABLE IF NOT EXISTS administradores (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,   -- en minúsculas
  nombre        TEXT NOT NULL DEFAULT '',
  hash          TEXT NOT NULL,
  sal           TEXT NOT NULL,
  vueltas       INTEGER NOT NULL,
  nivel         TEXT NOT NULL DEFAULT 'consulta',   -- dueno | admin | consulta
  activo        INTEGER NOT NULL DEFAULT 1,
  debe_cambiar  INTEGER NOT NULL DEFAULT 0,
  creado_en     TEXT NOT NULL,
  creado_por    TEXT NOT NULL DEFAULT '',
  ultimo_acceso TEXT
);

-- Parentesco del contacto de emergencia.
--
-- Las columnas nuevas no se pueden agregar desde schema.sql: ahí las tablas se
-- crean con CREATE TABLE IF NOT EXISTS, y una tabla que ya existe se queda como
-- estaba. Por eso los cambios a la base van aquí, uno por archivo, y D1 lleva
-- la cuenta de cuáles ya aplicó: correr el despliegue dos veces no los repite.
ALTER TABLE trabajadores ADD COLUMN emerg_parentesco TEXT DEFAULT '';

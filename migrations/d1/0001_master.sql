-- D1 «master»: el directorio de la suite. §2 del documento de arquitectura.
-- Aquí no hay datos de ninguna empresa: solo quién es quién y a qué entra.
-- Los datos viven en el SQLite del Durable Object de cada empresa.
-- Fechas: TEXT ISO 8601 UTC, en toda la plataforma.

CREATE TABLE IF NOT EXISTS orgs (
  id         TEXT PRIMARY KEY,             -- 'forespot' (slug, y el nombre del DO)
  nombre     TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'base',
  apps       TEXT NOT NULL DEFAULT '{}',   -- JSON {"dash":true,"quell":true,…}
  moneda     TEXT NOT NULL DEFAULT 'MXN',
  activa     INTEGER NOT NULL DEFAULT 1,
  creado_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id          TEXT PRIMARY KEY,
  correo      TEXT NOT NULL UNIQUE,        -- minúsculas
  nombre      TEXT,
  google_sub  TEXT UNIQUE,
  pin_hash    TEXT,                        -- 'sal$vueltas$derivado' (PBKDF2, WebCrypto)
  creado_at   TEXT NOT NULL
);

-- socios y oficina. Un usuario puede estar en varias orgs
CREATE TABLE IF NOT EXISTS miembros (
  org_id     TEXT NOT NULL REFERENCES orgs(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  rol        TEXT NOT NULL CHECK (rol IN ('owner','admin','socio','staff')),
  apps       TEXT NOT NULL DEFAULT '[]',   -- JSON; vacío = todas las de la org
  negocios   TEXT NOT NULL DEFAULT '[]',   -- JSON; vacío = todos
  PRIMARY KEY (org_id, usuario_id)
);

-- clientes (peek101) y personal (quell101): pertenecen a UNA org
CREATE TABLE IF NOT EXISTS accesos (
  usuario_id TEXT PRIMARY KEY REFERENCES usuarios(id),
  org_id     TEXT NOT NULL REFERENCES orgs(id),
  tipo       TEXT NOT NULL CHECK (tipo IN ('cliente','personal')),
  ref_id     TEXT NOT NULL,                -- id en clientes / personal dentro del DO
  activo     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS superadmins (usuario_id TEXT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS sesiones (
  id         TEXT PRIMARY KEY,             -- aleatorio; la cookie lleva id.firmaHMAC
  usuario_id TEXT NOT NULL,
  app        TEXT NOT NULL,
  expira_at  TEXT NOT NULL,
  creado_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sesiones_usuario ON sesiones(usuario_id);

CREATE TABLE IF NOT EXISTS codigos (      -- login por correo, como roster101
  correo     TEXT PRIMARY KEY,
  hash       TEXT NOT NULL,
  expira_at  TEXT NOT NULL,
  intentos   INTEGER NOT NULL DEFAULT 0,
  enviado_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invitaciones (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, correo TEXT NOT NULL,
  rol TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente',
  creado_por TEXT NOT NULL, expira_at TEXT NOT NULL
);

-- Intentos de PIN: 5 por hora por correo, como dice §5. Se limpia solo.
CREATE TABLE IF NOT EXISTS intentos_pin (
  correo   TEXT PRIMARY KEY,
  intentos INTEGER NOT NULL DEFAULT 0,
  desde_at TEXT NOT NULL
);

-- Configuración que la propia API se pone sola. Hoy solo la llave con la que
-- firma las cookies: se genera en el primer arranque y se guarda aquí, para no
-- depender de que alguien ponga un secreto a mano antes de que el Worker sirva.
-- Si existe el secreto SECRETO en el entorno, manda ese.
CREATE TABLE IF NOT EXISTS config (llave TEXT PRIMARY KEY, valor TEXT NOT NULL);

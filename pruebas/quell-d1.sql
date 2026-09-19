-- La D1 de quell101 como quedó tras sus doce migraciones (0001..0012), volcada de sqlite_master
-- el 19-sep-2026. Sirve para que la prueba de la mudanza siembre una D1 igual a la de producción.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  role_viejo TEXT NOT NULL DEFAULT 'con' CHECK (role_viejo IN ('admin','int','con')),
  company TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
, pin_hash TEXT, pin_salt TEXT, pin_set_at TEXT, pin_fails INTEGER NOT NULL DEFAULT 0, pin_castigos INTEGER NOT NULL DEFAULT 0, pin_locked_until TEXT, role TEXT NOT NULL DEFAULT 'con' CHECK (role IN ('admin','int','con','cli')));
CREATE TABLE login_codes (
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email)
);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','cerrado')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, rol TEXT NOT NULL DEFAULT 'con',
  PRIMARY KEY (project_id, user_id)
);
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL,          -- R2: PNG rasterizado del plano
  source_key TEXT,                  -- R2: PDF/imagen original
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE elements (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Otro',
  name TEXT NOT NULL,
  resp TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL,                  -- 0..1 relativo al ancho del plano
  y REAL NOT NULL,                  -- 0..1 relativo al alto
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
, fase TEXT NOT NULL DEFAULT 'produccion', entregado_en TEXT, entregado_por TEXT REFERENCES users(id), project_id TEXT REFERENCES projects(id));
CREATE TABLE log_entries (
  id TEXT PRIMARY KEY,
  element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'trabajo' CHECK (kind IN ('trabajo','arreglo','acuerdo')),
  text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE punch_items (
  id TEXT PRIMARY KEY,
  element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pend' CHECK (status IN ('pend','proc','ok')),
  resp TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  done_at TEXT,
  done_by TEXT REFERENCES users(id)
, assignee_id TEXT REFERENCES users(id));
CREATE TABLE pin_intentos (
  ip            TEXT PRIMARY KEY,
  fails         INTEGER NOT NULL DEFAULT 0,
  castigos      INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  visto_en      TEXT NOT NULL
);
CREATE TABLE operaciones (
  id     TEXT PRIMARY KEY,
  cuando TEXT NOT NULL
);
CREATE TABLE etapas (
  clave          TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  orden          INTEGER NOT NULL,
  -- La etapa que abre el punchlist. Es una sola, y es la que parte la vida del
  -- ítem en dos: antes se fabrica, después se corrige.
  abre_punchlist INTEGER NOT NULL DEFAULT 0,
  activa         INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE element_etapas (
  element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  etapa      TEXT NOT NULL REFERENCES etapas(clave),
  hecha_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  hecha_por  TEXT REFERENCES users(id),
  PRIMARY KEY (element_id, etapa)
);
CREATE TABLE dudas (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  element_id   TEXT REFERENCES elements(id) ON DELETE SET NULL,
  user_id      TEXT NOT NULL REFERENCES users(id),
  texto        TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','resuelta')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resuelta_en  TEXT,
  resuelta_por TEXT REFERENCES users(id)
, para TEXT NOT NULL DEFAULT 'taller' CHECK (para IN ('taller','cliente')));
CREATE TABLE duda_respuestas (
  id         TEXT PRIMARY KEY,
  duda_id    TEXT NOT NULL REFERENCES dudas(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  texto      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE "photos" (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('log','punch','duda','duda_resp')),
  owner_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  width INTEGER,
  height INTEGER,
  size INTEGER,
  user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE element_contratistas (
  element_id  TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asignado_por TEXT REFERENCES users(id),
  asignado_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (element_id, user_id)
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_plans_project ON plans(project_id);
CREATE INDEX idx_elements_plan ON elements(plan_id);
CREATE INDEX idx_log_element ON log_entries(element_id, created_at);
CREATE INDEX idx_punch_element ON punch_items(element_id, status);
CREATE INDEX idx_punch_assignee ON punch_items(assignee_id, status);
CREATE INDEX idx_elements_fase ON elements(plan_id, fase);
CREATE INDEX idx_element_etapas ON element_etapas(element_id);
CREATE INDEX idx_dudas_proyecto ON dudas(project_id, estado, created_at);
CREATE INDEX idx_dudas_quien ON dudas(user_id, created_at);
CREATE INDEX idx_duda_respuestas ON duda_respuestas(duda_id, created_at);
CREATE INDEX idx_photos_owner ON photos(owner_type, owner_id);
CREATE UNIQUE INDEX idx_elements_obra_codigo
    ON elements(project_id, code)
 WHERE code <> '';
CREATE INDEX idx_elements_obra_tipo
    ON elements(project_id, type);
CREATE INDEX idx_element_contratistas_user ON element_contratistas(user_id);
CREATE INDEX idx_dudas_para ON dudas(project_id, para, estado);

INSERT OR IGNORE INTO etapas (clave, nombre, orden, abre_punchlist, activa) VALUES ('compras', 'Compras', 10, 0, 1);
INSERT OR IGNORE INTO etapas (clave, nombre, orden, abre_punchlist, activa) VALUES ('fabricacion', 'Fabricación', 15, 0, 1);
INSERT OR IGNORE INTO etapas (clave, nombre, orden, abre_punchlist, activa) VALUES ('flete', 'Flete', 20, 0, 1);
INSERT OR IGNORE INTO etapas (clave, nombre, orden, abre_punchlist, activa) VALUES ('instalacion', 'Instalación', 30, 0, 1);
INSERT OR IGNORE INTO etapas (clave, nombre, orden, abre_punchlist, activa) VALUES ('entrega', 'Entrega', 40, 1, 1);

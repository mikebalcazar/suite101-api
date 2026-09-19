-- OrgDB v6 — quell101 vive aquí (la bitácora de obra, por empresa).
--
-- POR QUÉ
--
-- Hasta el 18-sep quell101 guardaba en una base D1 propia, de una sola
-- empresa. Mike decidió el 19-sep que TODO lo de una empresa viva en su
-- base de la suite: éstas son las tablas de quell101, tal cual las tenía
-- —doce migraciones consolidadas en una— con el prefijo `quell_` para que
-- no choquen con las de la suite (`items` de la suite es lo que se vende;
-- `quell_elements` es el ítem en el plano; son cosas distintas y se quedan
-- distintas). El motor que las usa es src/quell/motor.js, que es el mismo
-- código que corría en el Worker de quell101, y sus reglas no cambian.
--
-- QUIÉN ES QUIÉN
--
-- `quell_users` no es una lista de cuentas: las cuentas son de la suite. Es
-- qué hace cada persona en obra —dueño, supervisor, contratista o cliente—
-- y se casa con la suite por el correo. Sin PIN, sin sesiones: eso ya no
-- vive aquí desde el 16-sep.
--
-- Todo lo que aquí es REAL son coordenadas en el plano (0..1), no dinero.

CREATE TABLE IF NOT EXISTS quell_users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'con' CHECK (role IN ('admin','int','con','cli')),
  company    TEXT NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  usuario_id TEXT,                              -- usuarios.id de la suite, cuando se conoce
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS quell_projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  client     TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','cerrado')),
  created_by TEXT REFERENCES quell_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- El rol va en la membresía: la misma persona es contratista en una obra y
-- trabajador en otra; y el cliente (`cli`) entra a las obras donde lo invitaron.
CREATE TABLE IF NOT EXISTS quell_project_members (
  project_id TEXT NOT NULL REFERENCES quell_projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES quell_users(id) ON DELETE CASCADE,
  rol        TEXT NOT NULL DEFAULT 'con',
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS quell_plans (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES quell_projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  file_name  TEXT NOT NULL DEFAULT '',
  image_key  TEXT NOT NULL,                     -- R2: orgs/{org}/quell/plans/…png
  source_key TEXT,                              -- R2: el PDF o imagen original
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS quell_plans_project ON quell_plans(project_id);

CREATE TABLE IF NOT EXISTS quell_elements (
  id           TEXT PRIMARY KEY,
  plan_id      TEXT NOT NULL REFERENCES quell_plans(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES quell_projects(id),
  code         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'Otro',
  name         TEXT NOT NULL,
  resp         TEXT NOT NULL DEFAULT '',        -- texto libre, de sólo lectura desde el 18-sep
  x            REAL NOT NULL,                   -- 0..1 relativo al ancho del plano
  y            REAL NOT NULL,                   -- 0..1 relativo al alto
  fase         TEXT NOT NULL DEFAULT 'produccion',
  entregado_en TEXT,
  entregado_por TEXT REFERENCES quell_users(id),
  created_by   TEXT REFERENCES quell_users(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS quell_elements_plan ON quell_elements(plan_id);
CREATE INDEX IF NOT EXISTS quell_elements_fase ON quell_elements(plan_id, fase);
CREATE INDEX IF NOT EXISTS quell_elements_obra_tipo ON quell_elements(project_id, type);
-- El código de un ítem es único dentro de su obra: lo impide la base, no el
-- código. Vacío no cuenta (un ítem sin código no choca con otro sin código).
CREATE UNIQUE INDEX IF NOT EXISTS quell_elements_obra_codigo ON quell_elements(project_id, code) WHERE code <> '';

CREATE TABLE IF NOT EXISTS quell_log_entries (
  id         TEXT PRIMARY KEY,
  element_id TEXT NOT NULL REFERENCES quell_elements(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES quell_users(id),
  kind       TEXT NOT NULL DEFAULT 'trabajo' CHECK (kind IN ('trabajo','arreglo','acuerdo')),
  text       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS quell_log_element ON quell_log_entries(element_id, created_at);

CREATE TABLE IF NOT EXISTS quell_punch_items (
  id          TEXT PRIMARY KEY,
  element_id  TEXT NOT NULL REFERENCES quell_elements(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pend' CHECK (status IN ('pend','proc','ok')),
  resp        TEXT NOT NULL DEFAULT '',
  due_date    TEXT,
  assignee_id TEXT REFERENCES quell_users(id),
  created_by  TEXT REFERENCES quell_users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  done_at     TEXT,
  done_by     TEXT REFERENCES quell_users(id)
);
CREATE INDEX IF NOT EXISTS quell_punch_element ON quell_punch_items(element_id, status);
CREATE INDEX IF NOT EXISTS quell_punch_assignee ON quell_punch_items(assignee_id, status);

CREATE TABLE IF NOT EXISTS quell_photos (
  id         TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('log','punch','duda','duda_resp')),
  owner_id   TEXT NOT NULL,
  r2_key     TEXT NOT NULL,
  file_name  TEXT NOT NULL DEFAULT '',
  width      INTEGER,
  height     INTEGER,
  size       INTEGER,
  user_id    TEXT REFERENCES quell_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS quell_photos_owner ON quell_photos(owner_type, owner_id);

-- Lo que se escribió sin señal llega con un identificador hecho en el aparato;
-- si vuelve a llegar, se reconoce y no se repite.
CREATE TABLE IF NOT EXISTS quell_operaciones (
  id     TEXT PRIMARY KEY,
  cuando TEXT NOT NULL
);

-- El camino que recorre un ítem antes de entregarse. Vive en la base, no en el
-- código: agregar una etapa es un INSERT. `abre_punchlist` es una sola.
CREATE TABLE IF NOT EXISTS quell_etapas (
  clave          TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  orden          INTEGER NOT NULL,
  abre_punchlist INTEGER NOT NULL DEFAULT 0,
  activa         INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO quell_etapas (clave, nombre, orden, abre_punchlist) VALUES
  ('compras',     'Compras',     10, 0),
  ('fabricacion', 'Fabricación', 15, 0),
  ('flete',       'Flete',       20, 0),
  ('instalacion', 'Instalación', 30, 0),
  ('entrega',     'Entrega',     40, 1);

CREATE TABLE IF NOT EXISTS quell_element_etapas (
  element_id TEXT NOT NULL REFERENCES quell_elements(id) ON DELETE CASCADE,
  etapa      TEXT NOT NULL REFERENCES quell_etapas(clave),
  hecha_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  hecha_por  TEXT REFERENCES quell_users(id),
  PRIMARY KEY (element_id, etapa)
);
CREATE INDEX IF NOT EXISTS quell_element_etapas_element ON quell_element_etapas(element_id);

-- Las dudas de obra. `para` dice a quién van: las del taller las contesta el
-- supervisor; las del cliente son los puntos por definir (cara de cliente).
CREATE TABLE IF NOT EXISTS quell_dudas (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES quell_projects(id) ON DELETE CASCADE,
  element_id   TEXT REFERENCES quell_elements(id) ON DELETE SET NULL,
  user_id      TEXT NOT NULL REFERENCES quell_users(id),
  texto        TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','resuelta')),
  para         TEXT NOT NULL DEFAULT 'taller' CHECK (para IN ('taller','cliente')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resuelta_en  TEXT,
  resuelta_por TEXT REFERENCES quell_users(id)
);
CREATE INDEX IF NOT EXISTS quell_dudas_proyecto ON quell_dudas(project_id, estado, created_at);
CREATE INDEX IF NOT EXISTS quell_dudas_quien ON quell_dudas(user_id, created_at);
CREATE INDEX IF NOT EXISTS quell_dudas_para ON quell_dudas(project_id, para, estado);

CREATE TABLE IF NOT EXISTS quell_duda_respuestas (
  id         TEXT PRIMARY KEY,
  duda_id    TEXT NOT NULL REFERENCES quell_dudas(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES quell_users(id),
  texto      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS quell_duda_respuestas_duda ON quell_duda_respuestas(duda_id, created_at);

-- Contratistas por ítem (más de uno por mueble). Un pendiente asignado también
-- hace dueño del ítem a quien lo trae: eso lo decide el motor, no la base.
CREATE TABLE IF NOT EXISTS quell_element_contratistas (
  element_id   TEXT NOT NULL REFERENCES quell_elements(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES quell_users(id) ON DELETE CASCADE,
  asignado_por TEXT REFERENCES quell_users(id),
  asignado_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (element_id, user_id)
);
CREATE INDEX IF NOT EXISTS quell_element_contratistas_user ON quell_element_contratistas(user_id);

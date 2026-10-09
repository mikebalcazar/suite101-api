-- 0046: bill101 fase D — bajar del SAT lo emitido y lo recibido (9-oct-2026).
--
-- Mike, 8-oct-2026: «Primero desarrollemos la fase para revisar facturas ya
-- recibidas y emitidas en el SAT». Y con botones: la FIEL vive «guardada
-- cifrada»: se sube una vez y bill101 baja solo, cada noche.
--
-- Cuatro tablas nuevas, ninguna columna en las que ya había. Todas internas:
-- no salen por el CRUD genérico, sólo por /orgs/:o/fiscal/sat (src/rutas/fiscal-sat.ts).
--
-- `sat_fiel` — un renglón. Lo público del certificado (de quién es, hasta
-- cuándo vale) y la llave privada CIFRADA (src/fiel.ts dice con qué). La
-- contraseña no se guarda en ningún lado. La llave no sale por ninguna ruta.
CREATE TABLE IF NOT EXISTS sat_fiel (
  id            TEXT PRIMARY KEY CHECK (id = 'fiel'),
  -- El id de la empresa: lo cifrado va atado a él, y la base no sabe cómo se llama.
  org_id        TEXT NOT NULL,
  rfc           TEXT NOT NULL,
  nombre        TEXT,
  serie         TEXT NOT NULL,
  serie_decimal TEXT NOT NULL,
  emisor        TEXT NOT NULL,
  vale_desde    TEXT NOT NULL,
  vence         TEXT NOT NULL,
  cer_b64       TEXT NOT NULL,
  llave_iv      TEXT NOT NULL,
  llave_dato    TEXT NOT NULL,
  subida_por    TEXT NOT NULL,
  subida_at     TEXT NOT NULL
);

-- `sat_config` — un renglón. Si baja solo cada noche, desde cuándo se quiere
-- el historial (Mike: 1-ene-2026) y cómo le fue la última vez.
CREATE TABLE IF NOT EXISTS sat_config (
  id                TEXT PRIMARY KEY CHECK (id = 'sat'),
  automatico        INTEGER NOT NULL DEFAULT 1,
  desde             TEXT NOT NULL DEFAULT '2026-01-01',
  proxima_noche_at  TEXT,
  ultima_corrida_at TEXT,
  ultimo_error      TEXT,
  ultimo_error_at   TEXT,
  fallas_seguidas   INTEGER NOT NULL DEFAULT 0
);

-- `sat_solicitudes` — una por cada cosa que se le pide al SAT. El SAT no
-- contesta las facturas: da un número de solicitud y hay que volver a
-- preguntar hasta que esté. Aquí se lleva en qué va cada una.
--
--   lado    emitidas | recibidas
--   clase   cfdi (los XML) | metadata (la lista, con vigente/cancelada)
--   motivo  inicial | noche | mano | faltantes | partida
--   tanda   las que se pidieron juntas: la lista espera a que los XML de su
--           tanda terminen antes de decir qué falta
--   estado  por_pedir → pedida → lista → importando → terminada
--           y los finales sin datos: vacia, rechazada, error, vencida,
--           partida (se pasó del tope y se pidió en dos), cancelada (se
--           quitó la FIEL)
--   desde/hasta  hora del centro de México, sin zona, como la pide el SAT
CREATE TABLE IF NOT EXISTS sat_solicitudes (
  id            TEXT PRIMARY KEY,
  tanda         TEXT NOT NULL,
  lado          TEXT NOT NULL CHECK (lado IN ('emitidas', 'recibidas')),
  clase         TEXT NOT NULL CHECK (clase IN ('cfdi', 'metadata')),
  motivo        TEXT NOT NULL,
  desde         TEXT NOT NULL,
  hasta         TEXT NOT NULL,
  estado        TEXT NOT NULL,
  id_solicitud  TEXT,
  codigo        INTEGER,
  mensaje       TEXT,
  cuantas       INTEGER,
  paquetes      TEXT,
  paquete_n     INTEGER NOT NULL DEFAULT 0,
  cursor        INTEGER NOT NULL DEFAULT 0,
  nuevas        INTEGER NOT NULL DEFAULT 0,
  actualizadas  INTEGER NOT NULL DEFAULT 0,
  repetidas     INTEGER NOT NULL DEFAULT 0,
  rechazadas    INTEGER NOT NULL DEFAULT 0,
  canceladas    INTEGER NOT NULL DEFAULT 0,
  revisadas     INTEGER NOT NULL DEFAULT 0,
  faltantes     INTEGER NOT NULL DEFAULT 0,
  falta_desde   TEXT,
  falta_hasta   TEXT,
  intentos      INTEGER NOT NULL DEFAULT 0,
  proxima_at    TEXT,
  creada_por    TEXT NOT NULL,
  creada_at     TEXT NOT NULL,
  pedida_at     TEXT,
  actualizada_at TEXT NOT NULL,
  terminada_at  TEXT
);
CREATE INDEX IF NOT EXISTS sat_solicitudes_estado ON sat_solicitudes (estado, creada_at);

-- `sat_eventos` — qué dijo el SAT en cada vuelta, con su código. Es para
-- poder decir por qué algo no bajó sin adivinar. Se recorta sola.
CREATE TABLE IF NOT EXISTS sat_eventos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  at           TEXT NOT NULL,
  solicitud_id TEXT,
  paso         TEXT NOT NULL,
  codigo       TEXT,
  mensaje      TEXT
);

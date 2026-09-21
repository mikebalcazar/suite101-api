-- OrgDB v19 — la documentación de cada ítem de la obra: el plano principal
-- sobre el que se anota, los archivos de soporte, y las versiones.
--
-- POR QUÉ
--
-- Mike, 21-sep-2026: «necesito en quell un apartado por ítem de
-- documentación. Subir PDF de planos y de anotaciones adicionales. Quiero que
-- ese PDF pueda tener anotaciones (poder anotar desde el cel o la compu cosas
-- encima). Y después poder actualizar ese PDF a una versión nueva, sin borrar
-- la anterior, pero archivarla, o sea que no esté a la vista. Y una opción
-- para ver versiones anteriores por si hay dudas».
--
-- Y, con la pantalla enfrente: «hay un archivo base que es el plano o imagen
-- sobre la que están las anotaciones del ítem, sería como el principal, y los
-- demás archivos son de soporte. Sólo en el principal se hacen anotaciones».
--
-- LAS TRES DECISIONES QUE ESTA TABLA GUARDA
--
-- 1. UN PRINCIPAL VIVO POR ÍTEM, y los demás de soporte. No es una etiqueta
--    suelta: es un índice único parcial, porque «sólo en el principal se
--    anota» deja de ser cierto en cuanto haya dos y nadie sepa cuál manda.
--
-- 2. LAS VERSIONES SON FILAS, NO REEMPLAZOS. Subir una versión nueva marca
--    `archivado_at` en la anterior y escribe otra fila con el mismo
--    `familia_id`. Nada se borra: «sin borrar la anterior, pero archivarla»
--    es textual, y lo archivado se lee pidiéndolo, no por accidente.
--
-- 3. LAS MARCAS CUELGAN DE LA VERSIÓN, no del ítem. Una nota clavada en un
--    punto de la revisión A puede estar apuntando a nada en la revisión B:
--    el dibujo cambió. Guardarlas por versión hace dos cosas de golpe —la
--    versión archivada conserva lo que se marcó sobre ELLA, que es el
--    registro de lo que se dijo ese día, y la nueva empieza limpia— y deja
--    que copiarlas sea una decisión de quien sube, no del esquema.
--
-- LO QUE NO SE GUARDA AQUÍ, y es a propósito: el archivo. Vive en R2, bajo
-- `orgs/{org}/quell/docs/…`, y se sirve por la misma puerta que los planos.
-- La base guarda la llave, no los bytes.
--
-- Dinero: aquí no hay. Medidas: en píxeles, enteros.

CREATE TABLE IF NOT EXISTS quell_element_docs (
  id          TEXT PRIMARY KEY,
  element_id  TEXT NOT NULL REFERENCES quell_elements(id) ON DELETE CASCADE,
  -- Todas las versiones de un mismo documento comparten esto. La primera lo
  -- estrena con su propio id, así que una familia siempre tiene dueño.
  familia_id  TEXT NOT NULL,
  rol         TEXT NOT NULL DEFAULT 'soporte' CHECK (rol IN ('principal','soporte')),
  nombre      TEXT NOT NULL DEFAULT '',
  r2_key      TEXT NOT NULL,
  mime        TEXT,
  bytes       INTEGER,
  -- Del PDF: cuántas páginas trae, para que la pantalla sepa si paginar sin
  -- volver a abrirlo. 1 para una imagen.
  paginas     INTEGER NOT NULL DEFAULT 1,
  version     INTEGER NOT NULL DEFAULT 1,
  -- NULL = es la versión viva. Con fecha = archivada: no sale a la vista y
  -- se pide aparte.
  archivado_at TEXT,
  subido_por  TEXT REFERENCES quell_users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS quell_docs_element ON quell_element_docs(element_id, archivado_at);
CREATE INDEX IF NOT EXISTS quell_docs_familia ON quell_element_docs(familia_id, version);

-- Un solo PRINCIPAL vivo por ítem. Parcial a propósito: las versiones
-- archivadas también son principales y tienen que caber todas.
CREATE UNIQUE INDEX IF NOT EXISTS quell_docs_un_principal
  ON quell_element_docs(element_id) WHERE rol = 'principal' AND archivado_at IS NULL;

-- Y una sola versión viva por familia, por lo mismo: dos vivas es no saber
-- cuál es la buena.
CREATE UNIQUE INDEX IF NOT EXISTS quell_docs_una_viva
  ON quell_element_docs(familia_id) WHERE archivado_at IS NULL;

CREATE TABLE IF NOT EXISTS quell_doc_marcas (
  id        TEXT PRIMARY KEY,
  doc_id    TEXT NOT NULL REFERENCES quell_element_docs(id) ON DELETE CASCADE,
  tipo      TEXT NOT NULL DEFAULT 'nota' CHECK (tipo IN ('nota','trazo')),
  pagina    INTEGER NOT NULL DEFAULT 1,
  -- De 0 a 1, relativo a la página. En relativo y no en píxeles porque la
  -- misma marca se ve en un celular y en una pantalla de escritorio, y una
  -- coordenada en píxeles se despega del dibujo en cuanto cambia el tamaño.
  x         REAL,
  y         REAL,
  -- El trazo libre: los puntos del dibujo, también de 0 a 1, como
  -- [[x,y],[x,y],…]. Vacío en una nota.
  trazo     TEXT,
  color     TEXT,
  texto     TEXT NOT NULL DEFAULT '',
  user_id   TEXT REFERENCES quell_users(id),
  -- Borrar una marca no la quita de la base: la esconde. Lo que alguien
  -- marcó en un plano y luego quitó es parte de lo que pasó.
  borrado_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS quell_marcas_doc ON quell_doc_marcas(doc_id, borrado_at);

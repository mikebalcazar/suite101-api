-- Bitácora del panel de la suite (master101): quién cambió qué en el
-- directorio. Antes nadie apuntaba quién prendió o apagó una app, quién
-- suspendió una empresa o quién dio de alta a alguien. La escribe la API sola
-- (PATCH /admin/orgs/:o, altas y bajas de miembros y de superadmins); no hay
-- ninguna ruta que escriba en ella desde fuera.
CREATE TABLE IF NOT EXISTS bitacora_admin (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  cuando  TEXT NOT NULL,     -- ISO 8601 UTC
  quien   TEXT NOT NULL,     -- correo del superadmin
  org_id  TEXT,              -- NULL cuando lo que cambió es la lista de superadmins
  campo   TEXT NOT NULL,     -- 'creada' | 'nombre' | 'plan' | 'moneda' | 'activa' | 'apps.dash' … | 'miembro' | 'superadmin'
  antes   TEXT,
  despues TEXT
);
CREATE INDEX IF NOT EXISTS bitacora_admin_org ON bitacora_admin(org_id, id DESC);

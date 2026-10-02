-- 0022 · El dominio propio de cada empresa (Mike, 2-oct-2026: «poder poner su
-- dominio en la plataforma (desde master101) y que al abrirla les abra sus
-- portales personalizados (ej. roster101.dominioempresa.com)»).
--
-- `orgs.dominio` es el dominio raíz de la empresa (acme.com). De él salen
-- ocho nombres, uno por app, que se dan de alta en Cloudflare como custom
-- hostnames de la zona taller101.com; `dominios_nombres` lleva cada uno con
-- el id que le puso Cloudflare y en qué está (pendiente del CNAME de la
-- empresa, certificado emitido, activo). Ver DOMINIOS.md.

ALTER TABLE orgs ADD COLUMN dominio TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orgs_dominio ON orgs(dominio) WHERE dominio IS NOT NULL;

CREATE TABLE IF NOT EXISTS dominios_nombres (
  hostname       TEXT PRIMARY KEY,                 -- roster101.acme.com
  org_id         TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  app            TEXT NOT NULL,                    -- roster101
  cf_id          TEXT,                             -- el id del custom hostname en Cloudflare
  estado         TEXT NOT NULL DEFAULT 'pendiente',-- pendiente | activo | error
  ssl            TEXT,                             -- lo que dice Cloudflare del certificado
  detalle        TEXT,                             -- errores de validación, en palabras de Cloudflare
  actualizado_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS dominios_nombres_org ON dominios_nombres(org_id);

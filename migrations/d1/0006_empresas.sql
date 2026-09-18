-- 0006 · alta automática de empresas (contrato 0.14.0)
--
-- La empresa guarda los datos con los que se vende y se cobra: razón social,
-- RFC, teléfono, quién es su director (el dueño que da de alta a su gente) y
-- hasta cuándo está pagada. Una empresa sin fecha de pago es de cortesía: no
-- vence nunca (así quedan las que ya existían, que son de Mike). Con fecha,
-- vence sola al día siguiente y sus apps contestan 402 org_sin_pago hasta que
-- se marque el siguiente pago; los paneles (master101, workshop101) siguen
-- abriendo para que se pueda arreglar.
ALTER TABLE orgs ADD COLUMN razon_social TEXT;
ALTER TABLE orgs ADD COLUMN rfc TEXT;
ALTER TABLE orgs ADD COLUMN telefono TEXT;
ALTER TABLE orgs ADD COLUMN director_correo TEXT;
ALTER TABLE orgs ADD COLUMN director_nombre TEXT;
ALTER TABLE orgs ADD COLUMN director_telefono TEXT;
ALTER TABLE orgs ADD COLUMN cortesia INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orgs ADD COLUMN paga_hasta TEXT;                       -- 'AAAA-MM-DD' o NULL
ALTER TABLE orgs ADD COLUMN origen_pago TEXT NOT NULL DEFAULT 'manual'; -- 'manual' | 'stripe'
ALTER TABLE orgs ADD COLUMN bienvenida_at TEXT;                    -- cuándo salió el correo de bienvenida

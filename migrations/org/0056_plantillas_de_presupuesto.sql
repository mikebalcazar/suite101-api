-- OrgDB v56 — las plantillas de presupuesto de dash101 (0.106.0).
--
-- Mike, 18-nov-2026, con botones: «Hoja dentro de dash»: el presupuesto del
-- proyecto se edita en una cuadrícula como Sheets, y las plantillas viven en
-- dash: se guarda un presupuesto como plantilla y se usa para empezar otro.
--
-- Una plantilla es un nombre y sus renglones, en JSON:
--   [{"descripcion": "Cocina", "cantidad": 1, "precio_unitario": 3500000}, …]
-- con el precio en centavos, como todo el dinero. No mueve un peso: usarla
-- llena la hoja, y la hoja es la que se guarda como conceptos de cobro.
CREATE TABLE IF NOT EXISTS plantillas_presupuesto (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL DEFAULT '',
  renglones      TEXT NOT NULL DEFAULT '[]',
  creado_en_app  TEXT,
  creado_at      TEXT NOT NULL,
  actualizado_at TEXT
);

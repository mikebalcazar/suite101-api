-- patron101: el aviso de riesgos y su aceptación (contrato 0.84.0).
--
-- Mike, 8-oct-2026: «Necesito agregar un disclaimer de los riesgos de la
-- inversión, sobre todo riesgos de no pago del cliente». Y con botones:
-- «Aceptación obligatoria»: quien presta marca que leyó y acepta los riesgos
-- antes de ofrecer, y queda guardado quién aceptó y cuándo.
--
-- Se guarda EL TEXTO que aceptó, no una referencia: el aviso se puede editar
-- en Ajustes, y lo que prueba algo es lo que la persona tuvo enfrente ese día.
-- NULL en las dos = oferta capturada por quien dirige (se lo dijeron por
-- teléfono): ahí nadie aceptó nada en pantalla, y no se finge que sí.
ALTER TABLE ronda_ofertas ADD COLUMN riesgos_aceptados_at TEXT;
ALTER TABLE ronda_ofertas ADD COLUMN riesgos_texto TEXT;

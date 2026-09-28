-- OrgDB v20 — reembolsos: la misma orden, de otro tipo.
--
-- POR QUÉ
--
-- Mike, 28-sep-2026: «Necesito en dash un módulo para reembolsos. Que el
-- trabajador pueda pedir reembolsos y en dash le aparezcan (similar a las
-- Órdenes de compra). De hecho podría ser el mismo portal de supply, pero
-- poner una opción en el tipo de orden si es reembolso o compra. (…) Y ya los
-- movimientos se registrarán como reembolso o gasto pero son salidas de
-- dinero las 2».
--
-- POR QUÉ NO ES OTRA TABLA
--
-- Un reembolso recorre exactamente el mismo camino que una compra: alguien
-- lo pide con su monto y su comprobante, cae al buzón de quien paga, se paga
-- desde una cuenta y eso deja UN egreso, o se devuelve con motivo y se
-- corrige con el mismo folio. Lo único distinto es a quién se le paga —a la
-- persona que puso el dinero, no a un proveedor— y cómo se registra el
-- movimiento (`categoria = 'reembolso'`). Una tabla aparte sería copiar la
-- máquina de estados entera para cambiarle una etiqueta, y la próxima regla
-- del buzón habría que escribirla dos veces.
--
-- LO QUE CAMBIA
--
--   · `ordenes.tipo`: `compra` o `reembolso`. Todo lo que ya existe queda
--     `compra`, que es lo que era. SQLite no deja agregar un CHECK con ALTER;
--     el valor lo cuida el motor (`crearOrden`).
--   · Los reembolsos llevan su propia serie de folios, `RE-000001`: un
--     contador que abre el buzón de compras y ve un RE- sabe sin abrirlo que
--     no es una compra, y los consecutivos de compras no se saltan números.

ALTER TABLE ordenes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'compra';

-- El buzón por pestaña (compras / reembolsos) y el resumen del inicio leen
-- por tipo y estado dentro de un negocio.
CREATE INDEX IF NOT EXISTS ordenes_tipo ON ordenes(tipo, estado, negocio_id);

INSERT OR IGNORE INTO folios (serie, siguiente) VALUES ('RE', 1);

-- OrgDB v29 — el plano de la obra se gira al subirlo y se sustituye por versiones.
--
-- Mike, 2-oct-2026: «Cuando subo un plano en un proyecto de quell, quiero
-- poder rotarlo porque a veces el PDF viene vertical. Y también quiero poder
-- actualizar el plano. Subir y sustituir el que está para actualizar
-- versiones.»
--
--   · `rotation` (0, 90, 180 o 270): cuántos grados se giró el original al
--     subirlo. La imagen rasterizada YA va girada; el PDF original no se
--     toca, y la capa nítida de quell101 lo dibuja con este mismo giro, para
--     que las dos capas coincidan.
--   · `versiones`: JSON con lo que había antes de cada sustitución
--     [{image_key, source_key, file_name, width, height, rotation, at,
--     quien}]. Los archivos viejos se quedan en R2: sustituir no borra, y
--     quien quiera el plano anterior lo puede bajar.
--
-- Las piezas (quell_elements) guardan x, y entre 0 y 1 del plano: al
-- sustituirlo por una versión con el mismo encuadre, se quedan donde están.

ALTER TABLE quell_plans ADD COLUMN rotation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quell_plans ADD COLUMN versiones TEXT NOT NULL DEFAULT '[]';

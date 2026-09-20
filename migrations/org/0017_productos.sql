-- OrgDB v17 — el producto del catálogo, y a qué producto pertenece cada pieza.
--
-- POR QUÉ
--
-- Mike, 20-sep-2026: «cuando un ítem se asigna a un grupo de ítems que son
-- del mismo producto, el ítem adquiere en automático ese costo. También debe
-- poder moverse de grupo de producto un ítem ya agrupado. De hecho todos los
-- ítems, aparte del tipo de ítem, deberían tener un dropdown para seleccionar
-- qué producto es, o nuevo si el ítem es su mismo producto único. A lo mejor
-- un ítem pasó de ser modelo A a modelo B y sólo se cambia de grupo.»
--
-- Y el día antes, que es lo que esto termina de ordenar: «una cosa es el
-- código de ítem (pieza física en obra) y otra diferente el código de
-- producto de catálogo. Porque más adelante, en quote necesito ir generando
-- un catálogo con códigos de producto. Y cada ítem es un código de producto y
-- puede haber varios ítems del mismo modelo.»
--
-- LO QUE ESTO REEMPLAZA
--
-- Hasta hoy «agrupar» FUSIONABA: 21 puertas se volvían un renglón de 21
-- piezas y los otros 20 renglones se borraban. Eso contradice de frente lo
-- que Mike pide arriba: un renglón borrado no se puede mover de grupo. Se lo
-- pregunté con botones el 20-sep y escogió que el grupo de producto
-- reemplace a la fusión.
--
-- Así que agrupar deja de ser una operación que destruye y pasa a ser una
-- RELACIÓN: el ítem sigue siendo su renglón —con su código de obra y su
-- seguimiento en quell— y apunta a un producto. Moverlo de grupo es cambiar
-- ese apuntador, y sacarlo es ponerlo en NULL.
--
-- POR QUÉ LA TABLA ES DEL NEGOCIO Y NO DEL PROYECTO
--
-- El dropdown que pidió Mike lista lo que hay EN EL PROYECTO, pero el
-- catálogo que quote101 va a llevar es de la empresa: el mismo «Puerta
-- modelo A» se cotiza en tres obras distintas. Si la tabla naciera colgada
-- del proyecto habría que mudarla cuando llegue quote101, y una mudanza de
-- tabla con datos adentro cuesta mucho más que nacer en el lugar correcto.
-- El recorte por proyecto lo hace la consulta, no el esquema.
--
-- QUÉ HEREDA UN ÍTEM AL ENTRAR A UN PRODUCTO
--
-- El precio y el código, y nada más:
--
--   · `monto` = `productos.precio` × `items.cantidad`. Es lo que Mike pidió
--     con todas sus letras («adquiere en automático ese costo»), y mueve el
--     precio de venta del proyecto. La pantalla dice cuánto sube o baja
--     ANTES de aplicarlo; aquí abajo no se decide nada, sólo se guarda.
--   · `clave` = `productos.codigo`. `items.clave` ES el código de producto
--     —lo decidió Mike el 20-sep, está en claude/CONTINUAR.md—, así que al
--     entrar a un producto tiene que decir el del producto. El código de la
--     PIEZA vive en `quell_elements.code` y esto no lo toca.
--
-- El nombre NO se hereda: «Puerta 07» es cómo se llama esa pieza en el
-- plano y en la bitácora de obra, y pisarlo con «Puerta modelo A» deja 21
-- renglones idénticos que ya no se distinguen entre sí. El nombre del
-- producto se lee del producto.

CREATE TABLE productos (
  id          TEXT PRIMARY KEY,
  negocio_id  TEXT NOT NULL,
  codigo      TEXT NOT NULL DEFAULT '',
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  tipo        TEXT NOT NULL DEFAULT 'mueble',
  -- Precio POR PIEZA, en centavos, como todo el dinero de la suite.
  precio      INTEGER NOT NULL DEFAULT 0,
  moneda      TEXT NOT NULL DEFAULT 'MXN',
  creado_at   TEXT NOT NULL,
  creado_por  TEXT NOT NULL,
  actualizado_at TEXT
);

CREATE INDEX productos_negocio ON productos(negocio_id, nombre);

-- El código de catálogo no se repite dentro de una empresa: dos productos con
-- el mismo código es justo el desorden que el catálogo existe para evitar.
-- Parcial, porque el código es opcional: un producto que nace de agrupar dos
-- piezas todavía no tiene código, y varios sin código no se estorban.
CREATE UNIQUE INDEX productos_codigo ON productos(negocio_id, codigo) WHERE codigo <> '';

-- NULL = el ítem es su propio producto único. Es el estado en el que nacen
-- todos y en el que quedan los que se sacan de un grupo, y por eso es el que
-- deja esta migración: los ítems que ya existen no cambian de significado al
-- correrla.
ALTER TABLE items ADD COLUMN producto_id TEXT REFERENCES productos(id);

CREATE INDEX items_producto ON items(producto_id);

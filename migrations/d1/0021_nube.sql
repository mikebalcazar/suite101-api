-- 0021 · draw101 en la nube: la clave deja de guardarse en claro, y el índice
-- de archivos.
--
-- Mike, 29-sep-2026, escogiendo con botones:
--   · «Jr. ni nadie puede accesar a los archivos, ni siquiera nosotros como
--     dueños. Sólo el usuario de la licencia con la que se generó y se guardó»;
--   · cifrado de verdad, sin llave maestra del taller;
--   · la llave sale de la clave T101 «y dejamos de guardarla en claro».
--
-- LA CLAVE.  La columna `clave` deja de guardar las letras y pasa a guardar su
-- HUELLA: un HMAC-SHA256 con el secreto del Worker, que vive en `config` y no
-- en esta base. Un volcado de D1 ya no basta para entrar a una licencia NI
-- para descifrar un archivo.
--
-- SE REUSA LA COLUMNA en vez de agregar una nueva, y no por ahorrar espacio:
-- `clave` se declaró `NOT NULL UNIQUE`, y SQLite no sabe quitar un UNIQUE
-- puesto en la declaración de la columna. La única salida sería rehacer la
-- tabla, y rehacerla aquí NO SE PUEDE: `activaciones` la referencia y D1 corre
-- con `PRAGMA foreign_keys = 1`, así que el `DROP TABLE` falla —comprobado
-- contra la base de staging antes de escribir esto, no supuesto—.
--
-- Y guardando la huella ahí, el UNIQUE pasa a decir algo verdadero: no puede
-- haber dos licencias con la misma clave. Antes decía lo mismo sobre las
-- letras; ahora lo dice sobre su huella, que es una por clave.
--
-- Las claves que ya existen NO cambian: siguen funcionando y nadie tiene que
-- volver a activar. Lo que cambia es qué se guarda de ellas.

-- Las últimas cuatro letras, para que master101 siga pudiendo distinguir una
-- licencia de otra («T101-····-····-Y6AX»). Cuatro de doce no sirven para
-- adivinar el resto.
ALTER TABLE suscripciones ADD COLUMN clave_pista TEXT;

-- LA LLAVE DEL CIFRADO.  Cada suscripción tiene una llave maestra de 32 bytes
-- que NACE EN LA MÁQUINA del dueño, nunca aquí. Lo que se guarda es esa llave
-- ya cifrada (`llave_envuelta`) con lo que sale de la clave T101 más la sal
-- (`llave_sal`), por PBKDF2. El Worker guarda el bulto y no puede abrirlo.
--
-- Hay una llave maestra —y no se cifra con la clave directamente— para que
-- cambiar la clave T101 sea volver a envolver 32 bytes y no volver a cifrar
-- todos los planos del taller.
ALTER TABLE suscripciones ADD COLUMN llave_envuelta TEXT;
ALTER TABLE suscripciones ADD COLUMN llave_sal      TEXT;

-- EL ÍNDICE DE ARCHIVOS.  Es lo único que draw101 baja al arrancar (Mike:
-- «descarga una lista de los archivos en la nube cuando arranca para poder
-- buscarlos indizados. Sólo descarga la lista o directorio, no los archivos
-- en sí»). Por eso el NOMBRE también va cifrado: la búsqueda y el orden se
-- hacen en la máquina, sobre la lista ya bajada y descifrada, y el servidor
-- no sabe cómo se llama un plano ni qué hay dentro.
--
-- Las FECHAS y el TAMAÑO sí van en claro. Sin ellos no se puede decidir cuál
-- copia es más nueva sin bajar el archivo, que es justo lo que no se quiere.
--
-- La llave es (suscripcion_id, id) y no `id` solo: dos cuentas distintas nunca
-- comparten un archivo —quien abre uno ajeno genera el suyo con token nuevo—,
-- y así una cuenta tampoco puede averiguar si un token existe en otra.
CREATE TABLE IF NOT EXISTS archivos_nube (
  suscripcion_id TEXT NOT NULL REFERENCES suscripciones(id),
  id             TEXT NOT NULL,                  -- el token del documento (ULID)
  nombre_cifrado TEXT NOT NULL,                  -- el nombre; el servidor no lo lee
  bytes          INTEGER NOT NULL,               -- del bulto ya cifrado
  version        INTEGER NOT NULL DEFAULT 1,     -- sube en cada subida
  creado_at      TEXT NOT NULL,
  modificado_at  TEXT NOT NULL,                  -- el reloj de la máquina que guardó
  subido_at      TEXT NOT NULL,                  -- el de aquí
  equipo         TEXT,                           -- qué máquina la subió
  aperturas      INTEGER NOT NULL DEFAULT 0,     -- para ordenar por frecuencia de uso
  abierto_at     TEXT,
  borrado        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (suscripcion_id, id)
);

CREATE INDEX IF NOT EXISTS idx_archivos_nube_sus
  ON archivos_nube (suscripcion_id, borrado, modificado_at);

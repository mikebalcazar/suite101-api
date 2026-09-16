-- Contraseña de verdad en la suite (contrato 0.7.0), junto al código, el PIN
-- y Google. La decidió Mike el 16-sep al homologar el acceso de quell101 y
-- roster101: el panel de expedientes de roster101 ya pedía una contraseña de
-- diez caracteres, y mudarlo a un PIN de seis dígitos lo habría dejado más
-- débil justo donde hay CURP, RFC y CLABE. Se homologa hacia arriba.
--
-- `clave_hash` se guarda como el PIN: 'sal$vueltas$derivado' (PBKDF2,
-- WebCrypto). Nunca en claro, y la API no la devuelve nunca.
ALTER TABLE usuarios ADD COLUMN clave_hash TEXT;

-- Con qué entró esta sesión. Sirve para una sola regla, y es la que hace que
-- «olvidé mi contraseña» funcione sin una ruta aparte: cambiar la contraseña
-- pide la actual, SALVO que la sesión se haya abierto con código al correo o
-- con Google, que ya prueban que la persona controla ese buzón.
ALTER TABLE sesiones ADD COLUMN como TEXT NOT NULL DEFAULT 'codigo';

-- El mismo freno que `intentos_pin`: cinco intentos por hora y por correo.
CREATE TABLE IF NOT EXISTS intentos_clave (
  correo   TEXT PRIMARY KEY,
  intentos INTEGER NOT NULL DEFAULT 0,
  desde_at TEXT NOT NULL
);

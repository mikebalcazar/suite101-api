-- Boletos de entrada: el paso intermedio del login con Google cuando la app
-- vive detrás de un proxy (/s101/ en su propio origen). Google devuelve al
-- navegador al Worker, no a la app; el Worker abre la sesión, deja aquí un
-- boleto de un solo uso y de un minuto, y manda al navegador de vuelta a la
-- app con el boleto. La app lo canjea por su proxy (POST /auth/canje) y la
-- cookie queda puesta en el origen de la app, que es el único que sirve
-- (decisión D1: la cookie es SameSite=None y Safari la bloquea de terceros).
CREATE TABLE IF NOT EXISTS tickets (
  id        TEXT PRIMARY KEY,
  galleta   TEXT NOT NULL,   -- el valor firmado de la cookie s101
  expira_at TEXT NOT NULL
);

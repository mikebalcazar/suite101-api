export interface Env {
  /** D1 «master»: el directorio. Ninguna empresa guarda datos aquí. */
  MASTER: D1Database;
  /** Un Durable Object por empresa. `idFromName(org_id)`; nace solo.
   *  Se deja sin el parametro de tipo a proposito: el stub tipado obliga a
   *  TypeScript a recorrer la clase entera en cada llamada y se le acaba
   *  saliendo de las manos (TS2589). Quien lo use lo convierte a `ApiOrgDB`,
   *  que dice lo mismo en plano. */
  ORG: DurableObjectNamespace;
  /** Archivos: orgs/{org}/{tabla}/{id}/{archivo} */
  ARCHIVOS: R2Bucket;

  /** Firma de las cookies. Si no está, la API se genera una y la guarda en
   *  `config` de D1: así el Worker sirve desde el primer despliegue sin que
   *  nadie tenga que ponerle un secreto a mano. */
  SECRETO?: string;
  RESEND_API_KEY?: string;
  /** Deja salir el correo de verdad fuera de producción. Sin ella, `enviarCorreo`
   *  no llama a Resend más que en producción: el correo de una prueba no lo lee
   *  nadie y rebota contra el dominio que manda los códigos reales. Se prende a
   *  mano y por un rato, sólo para probar el camino del correo. */
  CORREO_DE_VERDAD?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** El origen público de ESTA API (https://suite101-api.mike-929.workers.dev).
   *  Google devuelve ahí. Detrás del proxy de una app la petición trae el
   *  dominio de la app, y armar la dirección de regreso con él mandaría a
   *  Google a una puerta que no existe (las apps sólo sirven /s101/*). */
  URL_PUBLICA?: string;
  /** El panel del director (workshop101): a donde lo manda el correo de bienvenida. */
  URL_PANEL_DIRECTOR?: string;

  ENTORNO: string; // 'produccion' | 'staging' | 'prueba'
  ORIGENES: string; // CSV de orígenes con permiso de CORS
  CORREO_REMITENTE: string;
  CORREO_SUPERADMIN: string;
  API_VERSION: string;
}

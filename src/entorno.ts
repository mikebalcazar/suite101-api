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
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  ENTORNO: string; // 'produccion' | 'staging' | 'prueba'
  ORIGENES: string; // CSV de orígenes con permiso de CORS
  CORREO_REMITENTE: string;
  CORREO_SUPERADMIN: string;
  API_VERSION: string;
}

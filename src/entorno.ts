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
  /** Dirección atendida por una persona a la que se le pide la baja de los
   *  avisos. Si no está puesta, no se manda la cabecera `List-Unsubscribe`:
   *  una salida que nadie procesa es una promesa falsa, y de ésas vive la
   *  carpeta de basura. */
  CORREO_BAJA?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** El origen público de ESTA API (https://suite101-api.mike-929.workers.dev).
   *  Google devuelve ahí. Detrás del proxy de una app la petición trae el
   *  dominio de la app, y armar la dirección de regreso con él mandaría a
   *  Google a una puerta que no existe (las apps sólo sirven /s101/*). */
  URL_PUBLICA?: string;
  /** El panel del director (workshop101): a donde lo manda el correo de bienvenida. */
  URL_PANEL_DIRECTOR?: string;
  /** supply101, a donde manda el correo de «orden pagada / devuelta /
   *  rechazada». Hasta el 29-sep la liga apuntaba a ESTA API (URL_PUBLICA +
   *  /orgs/…/ordenes/…): un JSON, y además `sin_sesion`, porque la cookie
   *  vive en el dominio de la app, no en el de la API. Sin esta variable el
   *  correo sale sin liga: mejor ninguna que una rota. */
  URL_SUPPLY?: string;
  /** investor101, a donde mandan los correos de una ronda, de una oferta y de
   *  un pago. Sin ella los correos salen sin liga. */
  URL_INVESTOR?: string;
  /** El remitente de los correos de quell101 (invitaciones y avisos de obra). */
  CORREO_QUELL?: string;
  /** El remitente de los correos de roster101 cuando el Worker de la empresa
   *  no manda el suyo (códigos y confirmaciones del trabajador). */
  CORREO_ROSTER?: string;
  /** El token de Cloudflare para dar de alta los nombres de las empresas
   *  (custom hostnames de la zona). Lo pone Mike como secreto del
   *  repositorio; el despliegue lo lleva al Worker. Sin él, lo del dominio
   *  propio contesta 503 dominio_no_configurado (DOMINIOS.md). */
  CLOUDFLARE_SAAS_TOKEN?: string;
  /** La zona de Cloudflare for SaaS y su registro de respaldo (wrangler.toml). */
  ZONA_SAAS?: string;
  RESPALDO_SAAS?: string;

  ENTORNO: string; // 'produccion' | 'staging' | 'prueba'
  /** bill101 fase D. El secreto del que se derivan las llaves con que se
   *  cifra la FIEL de cada empresa (src/fiel.ts). Si no está, nace solo en
   *  `config` del D1, como `SECRETO`. */
  LLAVE_FIEL?: string;
  /** Sólo para probar: la dirección de un SAT de mentira. En producción se
   *  IGNORA aunque esté puesta (src/sat-db.ts). */
  SAT_BASE?: string;
  /** Lo mismo para Facturama: un PAC de mentira para probar. En producción se ignora. */
  FACTURAMA_BASE?: string;
  ORIGENES: string; // CSV de orígenes con permiso de CORS
  CORREO_REMITENTE: string;
  CORREO_SUPERADMIN: string;
  API_VERSION: string;
}

/* Suite 101 — tipos compartidos
 *
 * UN SOLO ARCHIVO. Las demás apps lo copian tal cual, sin editarlo: si aquí se
 * cambia algo, se vuelve a copiar. No importa nada, no depende de nada, no
 * trae código que corra. Solo tipos y constantes.
 *
 * Tres cosas que este archivo da por sentadas y que no se negocian:
 *
 *   1. El dinero es INTEGER en centavos. $150,000.00 es 15000000. Nunca un
 *      flotante: SQLite no tiene decimal y sumar flotantes pierde centavos.
 *      Se formatea con Fira Sans, cifras tabulares (identidad Taller 101).
 *   2. Se dice ítem, no producto. Lo que se cobra puede ser una cocina, una
 *      visita o un servicio.
 *   3. Las fechas son texto ISO 8601 en UTC, en toda la plataforma.
 *
 * Versión del contrato: 0.24.0 (la cantidad del ítem y los «ítems sin
 * ubicar»: `items.cantidad` (migración 0011, por omisión 1) dice cuántas
 * piezas iguales son —«20 puertas del mismo acabado y precio»—, y
 * `quell_elements.item_id` dice qué pieza del plano cumple cuál ítem
 * vendido. `monto` NO cambia de significado: sigue siendo el importe de la
 * línea, porque `proyectos.precio_venta` es su suma y cambiarlo movería el
 * precio de todos los proyectos que ya existen; el precio por pieza sale de
 * dividir. `GET /orgs/:o/obras/:id/sin-ubicar` devuelve los ítems vendidos
 * del proyecto de esa obra con cuántas piezas faltan por poner en un plano
 * —la cuenta la hace el servidor, no la pantalla—, y al crear una pieza en
 * `POST /orgs/:o/quell/plans/:id/elements` se puede mandar `item_id`, que se
 * revisa contra el proyecto ligado a esa obra. Lo pidió Mike el 20-sep).
 * Antes: 0.23.0 (el cliente es uno solo en las tres apps:
 * `GET /orgs/:o/clientes/parecidos?nombre=&negocio_id=` contesta «¿no te
 * refieres a…?» con la regla escrita UNA vez y en el servidor —mismo nombre
 * normalizado, o uno contenido en el otro, y menos de tres letras no
 * compara—, y `POST /orgs/:o/clientes/:id/fusionar {se_va_id}` junta los dos
 * que ya se crearon: el que se va le deja al que se queda sus proyectos,
 * ítems, cotizaciones y movimientos, más los datos que al que se queda le
 * falten —correo, teléfono, RFC, notas y el acceso al portal—, y después
 * desaparece. Todo o nada, adentro del objeto. Fusionar no se deshace, así
 * que la hacen el dueño y la administración. Lo pidió Mike el 20-sep). Antes:
 * 0.22.0 (la obra de quell101 y el proyecto de dash101
 * son la misma casa: `quell_projects.proyecto_id` (migración 0010 del OrgDB)
 * y las rutas `/orgs/:o/obras` —con `?sueltas=1`, las que todavía no tienen
 * proyecto—, `/orgs/:o/obras/de-proyecto/:id` y
 * `POST|DELETE /orgs/:o/obras/:id/ligar`. Hasta hoy la misma casa se
 * capturaba dos veces, una en cada app, y ninguna sabía de la otra. La
 * columna va del lado de quell101 y no en `proyectos`, que sale por el CRUD
 * genérico: la liga se pone y se quita donde el permiso se revisa. Un índice
 * único parcial impide que un proyecto tenga dos obras, porque entonces «el
 * avance del proyecto» tendría dos respuestas ciertas. Si el proyecto se
 * borra, la obra NO se borra: queda suelta (`ON DELETE SET NULL`), porque
 * tiene planos, fotos y bitácora de gente que estuvo ahí. Lo pidió Mike el
 * 20-sep). Antes: 0.21.4 (`GET /orgs/:o/ordenes/:id` devuelve también
 * los archivos del pago —el comprobante, que cuelga del movimiento— junto
 * con los de la orden, y cada uno dice de dónde viene en `de`: `orden` o
 * `pago`. Quien pidió la compra necesita el comprobante para reclamarle al
 * proveedor, y sin esto tendría que ir a buscarlo a otra tabla que no le
 * toca. Lo pidió Mike el 20-sep al encargar supply101).
 * Antes: 0.21.3 (lo fiscal también acepta `?negocio_id=`:
 * `/fiscal/iva`, `/fiscal/cuadre`, `/fiscal/pendientes` y `/fiscal/cfdi`. El
 * RFC vive en el negocio, así que un IVA del mes que sume dos negocios no es
 * el IVA de ninguno de los dos —y es el número con el que se entera al SAT—.
 * Sin el parámetro salen las cifras de toda la empresa, como antes).
 * Antes: 0.21.2 (`GET /orgs/:o/ordenes` y
 * `/orgs/:o/ordenes/buzon` aceptan `?negocio_id=`, y con él la lista Y SUS
 * TOTALES son de ese negocio. dash101 trabaja con un negocio activo a la
 * vez; sin el filtro, el buzón mezclaba los negocios de la empresa y el
 * «hay por pagar» de arriba sumaba dinero de otro lado sin decirlo).
 * Antes: 0.21.1 (quien abre una empresa como dueño sin ser
 * miembro de ella —el superadmin de la suite, que es de Taller 101— sale en
 * `GET /orgs/:o/ordenes/contadores` y se puede marcar a sí mismo. Sin esto,
 * en una empresa recién dada de alta la pantalla salía vacía y no había
 * quién pagara: lo cachó el humo contra staging, no las pruebas).
 * Antes: 0.21.0 (órdenes de compra y contabilidad fiscal, el
 * encargo del chat de dash101 del 19-sep. Migraciones 0008 y 0009 del OrgDB.
 *
 * Órdenes: cualquiera de la empresa pide una compra y cae directa al buzón
 * del contador —sin autorización previa—; al marcarla pagada se crea el
 * egreso, se liga, se recalculan los cachés del proyecto y de la partida, y
 * se le avisa por correo a quien la pidió. Todo eso en UNA transacción, y
 * una orden que no está en el buzón no se paga: es lo que impide el doble
 * egreso de un doble clic. `POST /orgs/:o/ordenes`, `GET` (sólo las mías),
 * `/ordenes/buzon`, `/ordenes/:id/pagar|devolver|rechazar`, `PATCH` para
 * corregir una devuelta (mismo folio, misma historia) y
 * `/ordenes/contadores` para repartir la etiqueta, que sólo el dueño toca.
 * El proyecto es opcional (gasto general); con proyecto se liga a una
 * partida existente o se crea una nueva.
 *
 * Fiscal: NO hay dos contabilidades. Una sola lista de movimientos y cada
 * uno dice si es `facturado`; la fiscal es esa lista filtrada. Tabla `cfdi`
 * con UUID único por empresa y una liga con monto aplicado, porque un CFDI
 * puede cubrir varios pagos y un pago varios CFDI. La factura casi siempre
 * llega DESPUÉS del pago, y por eso se le cuelga al movimiento que ya
 * existe. `GET /orgs/:o/fiscal/iva|cuadre|pendientes|cfdi` y sus POST.
 *
 * Las cuatro tablas nuevas NO salen por el CRUD genérico: un miembro tiene
 * que ver sólo SUS órdenes, y ese filtro no se puede expresar ahí. `tasa_iva`
 * va en puntos base (1600 = 16.00 %). Decisiones de Mike del 19-sep).
 * Antes: 0.20.0 (la licencia se abre con tu cuenta:
 * `POST /licencias/mia {programa, huella, version}` activa, con la sesión de
 * la suite y SIN clave tecleada, la licencia que va con el correo de quien
 * entró. Devuelve el mismo token firmado que `/activar`, porque la regla de
 * quién entra tiene que ser una sola. Con varias licencias suyas vigentes
 * gana la que ya tiene esa máquina activada y si no la primera con lugar
 * libre, para no gastar un lugar de más; si no hay ninguna vigente contesta
 * el motivo de la que venció más tarde, no el de la primera. `GET
 * /licencias/entrar?programa=&huella=&app=` es la pantalla que la app abre
 * en su propia ventana: la entrada homologada de la suite, y al terminar
 * deja el token en `window.__t101_licencia` y el fragmento en `#listo` —el
 * token nunca viaja en la dirección—. La clave tecleada NO se va: sigue
 * siendo la segunda forma, por las máquinas sin internet estable, las claves
 * ya repartidas y la App Store. Decisiones de Mike del 19-sep, con botones).
 * Antes: 0.19.0 (el tipo de licencia y lo perpetuo, que son
 * dos cosas: `suscripciones.tipo` dice de dónde salió —cortesia, suite101,
 * stripe, appstore— y la columna que se llamaba `cortesia` ahora se llama
 * `perpetua`, que es lo que siempre quiso decir: sin fecha de corte. Así una
 * perpetua comprada en la App Store sigue contando como de App Store al
 * filtrar, que es justo lo que se perdía con una sola lista. `GET /licencias`
 * filtra por `tipo`, `programa`, `correo` y `vigentes=1`, y devuelve
 * `por_tipo` con cuántas hay de cada uno SIN el filtro de tipo puesto, para
 * pintar los botones. Un tipo fuera de la lista es 400, no una lista vacía.
 * `POST /licencias/:id/pago` con `origen: 'stripe'` pone `tipo = 'stripe'`
 * solo, para que el día de la pasarela la lista se llene sin que nadie la
 * toque; un pago a mano no cambia el tipo. Decisión de Mike del 19-sep, con
 * botones). Antes: 0.18.0 (se van las dos mudanzas: `POST
 * /admin/mudar-quell` y `POST /admin/mudar-roster` ya no existen, y con ellas
 * los enlaces a la D1 y al bucket viejos de cada app (`QUELL_D1`, `QUELL_R2`,
 * `ROSTER_D1`, `ROSTER_R2`). Las dos ya se corrieron en producción el 19-sep
 * y cuadraron; la base vieja se retira, así que una ruta que lee de ella no
 * tendría de dónde traer. `GET /admin/orgs/:o/quell` y `GET
 * /admin/orgs/:o/roster` se quedan: cuentan lo que hay en la base de la
 * empresa, que es de donde se leen los conteos del panel. Quitar una ruta es
 * un cambio de contrato aunque nadie más la llamara, por eso sube la menor.
 * Decisión de Mike del 19-sep). Antes: 0.12.0 (la sesión la decide QUIÉN entra, no con qué
 * entró: `vidaDe` en `maestro.ts`. Quien tiene un `acceso` activo —un cliente
 * de peek101, alguien de obra en quell101— trae 12 horas; un socio o la
 * oficina, 30 días, por los cuatro caminos. Antes la decidía el camino, y eso
 * dejaba un hueco abierto: el camino que de verdad usan los clientes de
 * peek101 es el código al correo, así que un cliente ya se estaba llevando 30
 * días; las 12 horas sólo se cumplían por el PIN. Al homologar la entrada a
 * Google o contraseña —encargo de Mike del 16-sep— amarrarla al camino habría
 * vuelto el hueco la regla, porque nadie entraría ya por el único camino
 * corto. De paso, la galleta de `/auth/canje` dura lo que dura la sesión y no
 * 30 días fijos, y un boleto cuya sesión ya murió no entra). Antes: 0.11.0
 * (consecutivos por serie: `POST
 * /orgs/:o/folios/:serie` aparta el siguiente número de una serie y `GET` lo
 * mira sin consumirlo, con el mismo contador atómico del OrgDB que ya pone el
 * folio de la cotización. Es para los consecutivos que todavía se calculaban
 * en el navegador —el de los recibos de quote101—, donde dos personas
 * guardando a la vez se llevaban el mismo número. La serie `COT` no se aparta
 * por ahí: ésa la pone la creación de la cotización. Y `cotizador101` puede
 * crear el negocio de su empresa si no hay ninguno, porque
 * `cotizaciones.negocio_id` es obligatorio y si no quedaría trabado). Antes:
 * 0.10.0 (los ajustes de cada app: la tabla `ajustes`
 * guarda la configuración de una app dentro de una empresa —lo que no describe
 * al negocio sino a cómo esa app trabaja—. El `id` lo arma la API con `X-App`
 * (`app:clave`), así que una app no lee ni pisa los de otra, no puede haber dos
 * con la misma clave, y el POST hace upsert: guardar es una sola llamada. Hacía
 * falta para que quote101 pudiera dejar Firebase: sus clientes y cotizaciones
 * ya tenían tabla, su configuración y su lista de precios no). Antes:
 * 0.9.0 (el folio de la cotización lo asigna la suite:
 * `POST /orgs/:o/cotizaciones` devuelve `folio` con formato `COT-` y seis
 * dígitos, asignado dentro del OrgDB —atómico, porque es un Durable Object de
 * un solo hilo— y ya no calculado en el navegador. Una app no puede imponer su
 * folio: si lo manda, se le ignora; sólo `suite101` puede, y es para que la
 * mudanza traiga los viejos congelados. Un índice único en la base impide dos
 * folios iguales). Antes:
 * 0.17.0 (roster101 vive en la base de la empresa: la migración 0007 del
 * OrgDB trae sus siete tablas con prefijo `roster_`, y el motor de los
 * expedientes —el mismo código que corría en el Worker de roster101—
 * atiende en `/roster/:o/api/*`. Esa puerta es nueva y distinta de
 * `/orgs/:o/*`: el trabajador entra sin cuenta en la suite (correo y
 * código, cookie propia firmada con el secreto de la suite), y el panel de
 * la empresa entra con su sesión de la suite, que la puerta resuelve si
 * viene. El dueño y la administración de la empresa abren el panel como
 * dueños aunque no tengan renglón en él. `GET /admin/orgs/:o/roster` cuenta.
 * La central de roster101 se retira: el alta va por master101. Decisiones
 * de Mike del 19-sep). Antes:
 * 0.16.0 (quell101 vive en la base de la empresa: la migración 0006 del
 * OrgDB trae sus catorce tablas con prefijo `quell_`, y el motor de la
 * bitácora de obra —el mismo código que corría en el Worker de quell101—
 * atiende en `/orgs/:o/quell/*` con la sesión que resolvió la puerta. Un
 * cliente abre, además de /peek, lo que quell101 le recorta. `POST
 * /admin/mudar-quell {org, modo}` trae la D1 y el bucket viejos. Decisión
 * de Mike del 19-sep: todo lo de una empresa en su base de la suite). Antes:
 * 0.15.0 (invitar a un cliente desde una app con base propia:
 * `POST /orgs/:o/clientes/invitar {correo, nombre}` deja al cliente en la
 * base de la empresa si no estaba, crea la persona en la suite si no existía
 * y le pone acceso tipo cliente, sin PIN: entra con el código al correo y
 * pone su contraseña. 409 `es_miembro` si el correo es de alguien de la
 * empresa, 409 `en_uso` si ya es cliente o personal de otra. Lo pide la cara
 * de cliente de quell101; peek101 abre con la misma cuenta). Antes:
 * 0.13.0 (licencias por suscripción, base /licencias: la app activa con
 * clave + huella y late a diario; recibe un token firmado Ed25519 cuya llave
 * pública sirve GET /licencias/llave; el panel (superadmin) crea claves, marca
 * pagos, sube lugares, suspende; hay cortesías sin fecha y no hay periodo de
 * prueba. Decisiones de Mike del 18-sep-2026). Antes:
 * 0.8.0 (la puerta de las apps empacadas: quien entra
 * con `{ aparato: true }` recibe además `token`, la misma galleta firmada, y
 * puede volver con `Authorization: Bearer`. Es la misma sesión de D1 y el
 * mismo DELETE la mata; al navegador se le sigue dando sólo la cookie).
 * Antes:
 * 0.7.0 (contraseña de verdad junto al código, el PIN y
 * Google: POST /auth/clave la fija, /auth/entrar la acepta, y cambiarla pide
 * la actual salvo que la sesión venga de código o de Google). Antes:
 * 0.6.0 (workshop101 — el administrador de la empresa:
 * PATCH de rol y apps por miembro, candados de último dueño y de uno mismo,
 * la lista de apps por persona se aplica en la puerta, última entrada por
 * miembro, y la bitácora de la empresa la lee su dueño). Antes:
 * 0.5.0 (master101 — superadmins por ruta, la bitácora
 * del panel `bitacora_admin`, y conteos por empresa en GET /admin/orgs; nada
 * de lo de 0.4.0 cambia)
 */

export const VERSION_CONTRATO = '0.24.0';

/* ─────────────── licencias por suscripción (0.13.0) ─────────────── */

export type EstadoSuscripcion = 'activa' | 'suspendida';
export type OrigenPago = 'manual' | 'stripe';

/** De dónde salió la licencia. NO dice si vence: eso es `perpetua`, aparte,
 *  para que una perpetua comprada en la App Store siga contando como de App
 *  Store al filtrar (decisión de Mike, 19-sep-2026, con botones).
 *
 *  · cortesia — regalada, no la pagó nadie.
 *  · suite101 — va incluida en lo que la empresa ya paga por la suite.
 *  · stripe   — la cobró la pasarela.
 *  · appstore — la cobró la tienda de Apple (para cuando haya versión de Mac).
 *
 *  Es una lista cerrada a propósito: un tipo escrito a mano («Stripe», «strype»)
 *  rompe el filtro sin avisar. Agregar uno es una línea aquí y otra en la API. */
export const TIPOS_LICENCIA = ['cortesia', 'suite101', 'stripe', 'appstore'] as const;
export type TipoLicencia = (typeof TIPOS_LICENCIA)[number];

/** Cómo se llama cada tipo en pantalla. */
export const NOMBRE_TIPO_LICENCIA: Record<TipoLicencia, string> = {
  cortesia: 'Cortesía',
  suite101: 'Incluida en suite101',
  stripe: 'Pago por Stripe',
  appstore: 'App Store',
};

export interface Suscripcion {
  id: string;
  /** T101-XXXX-XXXX-XXXX. Es lo que el cliente teclea al instalar. */
  clave: string;
  programa: string;
  cliente: string;
  correo: string | null;
  plan: string;
  /** Máquinas activas a la vez. Mike lo sube por cliente desde master101. */
  lugares: number;
  estado: EstadoSuscripcion;
  origen: OrigenPago;
  /** De dónde salió: cortesía, incluida en suite101, Stripe o App Store. */
  tipo: TipoLicencia;
  /** 1 = no vence nunca. Hasta 0.18.0 esta columna se llamaba `cortesia`, que
   *  era el nombre equivocado: siempre significó «sin fecha de corte», y una
   *  perpetua puede estar pagada. Lo regalado lo dice `tipo`. */
  perpetua: 0 | 1;
  /** 'AAAA-MM-DD', último día pagado. null = nunca ha pagado. */
  paga_hasta: string | null;
  notas: string | null;
  creado_at: string;
  actualizado_at: string;
}

export interface Activacion {
  id: string;
  suscripcion_id: string;
  huella: string;
  version: string | null;
  alta_at: string;
  ultimo_latido_at: string;
  activa: 0 | 1;
}

export interface RenglonBitacoraLicencia {
  id: number;
  cuando: string;
  suscripcion_id: string | null;
  quien: string;
  accion: string;
  detalle: string | null;
}

/** Lo que va dentro del token `v1.<carga>.<firma>` (Ed25519). */
export interface TokenLicencia {
  v: 1;
  kid: string;
  programa: string;
  licencia: string;
  cliente: string;
  plan: string;
  lugares: number;
  /** La huella de la máquina que lo pidió. Otro equipo no lo puede usar. */
  maquina: string;
  emitido: string;
  hasta: string;
}

/* ─────────────── envoltura de toda respuesta ─────────────── */

export type Respuesta<T> = { ok: true; data: T } | { ok: false; error: string; detalle?: unknown };
export type Lista<T> = { total: number; filas: T[] };

/** Errores que devuelve la API, en snake_case. La app puede prender por ellos. */
export type ErrorApi =
  | 'sin_sesion'
  | 'sin_permiso'
  | 'sin_app'
  | 'app_desconocida'
  | 'app_inactiva'
  | 'campo_no_permitido'
  | 'campo_solo_por_etapa'
  | 'etapa_no_permitida'
  | 'tabla_desconocida'
  | 'no_encontrado'
  | 'datos_invalidos'
  | 'dinero_no_entero'
  | 'org_desconocida'
  | 'org_inactiva'
  | 'org_sin_pago'
  | 'correo_no_configurado'
  | 'google_no_configurado'
  | 'codigo_invalido'
  | 'pin_invalido'
  | 'demasiados_intentos'
  | 'items_nunca_se_borran'
  | 'ultimo_superadmin'
  | 'ultimo_owner'
  | 'clave_invalida'
  | 'clave_debil'
  | 'app_no_permitida'
  // licencias (0.13.0)
  | 'clave_inexistente'
  | 'licencia_desconocida'
  | 'sin_pago'
  | 'sin_lugares'
  | 'suspendida'
  | 'token_invalido'
  | 'maquina_desconocida';

/* ─────────────── apps ─────────────── */

export const APPS = [
  'dash101',
  'quell101',
  'peek101',
  'cotizador101',
  'roster101',
  'nest101',
  'master101',
  'workshop101',
  'suite101',
] as const;
export type App = (typeof APPS)[number];

/** La llave con la que cada app aparece en `orgs.apps`. */
export const LLAVE_APP: Record<App, string> = {
  dash101: 'dash',
  quell101: 'quell',
  peek101: 'peek',
  cotizador101: 'cotizador',
  roster101: 'roster',
  nest101: 'nest',
  master101: 'master',
  workshop101: 'workshop',
  suite101: 'suite',
};

/* ─────────────── D1 master: el directorio ─────────────── */

export type Rol = 'owner' | 'admin' | 'socio' | 'staff';
export type TipoAcceso = 'cliente' | 'personal';

export type EstadoEmpresa = 'activa' | 'suspendida' | 'sin_pago';

export interface Org {
  id: string; // slug, y también el nombre del Durable Object
  nombre: string;
  plan: string;
  apps: Record<string, boolean>;
  moneda: string;
  activa: boolean;
  creado_at: string;
  // 0.14.0 · lo que se necesita para vender y cobrar
  razon_social: string | null;
  rfc: string | null;
  telefono: string | null;
  director_correo: string | null;
  director_nombre: string | null;
  director_telefono: string | null;
  /** Sin fecha de pago: no vence nunca. Las empresas que ya existían quedaron así. */
  cortesia: boolean;
  /** 'AAAA-MM-DD'; vence al terminar ese día. */
  paga_hasta: string | null;
  origen_pago: OrigenPago;
  bienvenida_at: string | null;
  /** Lo que se calcula: `vigente` = activa y (cortesía o pagada al día). */
  vigente: boolean;
  estado: EstadoEmpresa;
}

export interface Usuario {
  id: string;
  correo: string; // minúsculas
  nombre: string | null;
  creado_at: string;
}

export interface Yo {
  usuario: Usuario;
  superadmin: boolean;
  orgs: Array<{ id: string; nombre: string; rol: Rol; apps: string[]; negocios: string[] }>;
  acceso: { org_id: string; tipo: TipoAcceso; ref_id: string } | null;
}

/* ─────────────── el panel de la suite (master101), contrato 0.5.0 ─────────────── */

/** Lo que trae cada fila de GET /admin/orgs: la empresa y sus conteos. */
export interface OrgConConteos extends Org {
  /** cuántos miembros tiene (socios y oficina; no cuenta clientes ni personal) */
  personas: number;
  /** la sesión más reciente de cualquiera de sus miembros, ISO, o null si nadie ha entrado */
  ultima_entrada: string | null;
}

export interface Superadmin {
  usuario_id: string;
  correo: string;
  nombre: string | null;
}

/** Un renglón de `bitacora_admin`: quién cambió qué en el directorio. */
export interface RenglonBitacoraAdmin {
  id: number;
  cuando: string;
  quien: string; // correo del superadmin
  org_id: string | null; // null cuando cambió la lista de superadmins
  campo: string; // 'creada' | 'nombre' | 'plan' | 'moneda' | 'activa' | 'apps.dash' … | 'miembro' | 'superadmin'
  antes: string | null;
  despues: string | null;
}

/* ─────────────── OrgDB: el SQLite de cada empresa ─────────────── */

export type Moneda = 'MXN' | 'USD';

export interface Negocio {
  id: string;
  nombre: string;
  rfc: string | null;
  moneda: Moneda;
  /** Día en que toca conciliar: 0 domingo … 6 sábado. Por omisión el lunes. */
  dia_conciliacion: number;
  creado_at: string;
}

export interface Cuenta {
  id: string;
  negocio_id: string;
  nombre: string;
  tipo: 'banco' | 'caja' | 'credito' | 'otro';
  banco: string | null;
  moneda: Moneda;
  /** centavos */
  saldo_inicial: number;
  creado_at: string;
}

export interface Cliente {
  id: string;
  negocio_id: string;
  nombre: string;
  nombre_norm: string;
  correo: string | null;
  telefono: string | null;
  rfc: string | null;
  notas: string | null;
  usuario_id: string | null; // acceso a peek101
  portal_activo: boolean;
  creado_en_app: string;
  creado_at: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  nombre_norm: string;
  rfc: string | null;
  categoria: string | null;
  correo: string | null;
  telefono: string | null;
  terminos_pago: string | null;
  notas: string | null;
  creado_en_app: string;
  creado_at: string;
}

export interface Personal {
  id: string;
  nombre: string;
  nombre_norm: string;
  correo: string | null;
  puesto: string | null;
  activo: boolean;
  expediente_ref: string | null;
  etapas_permitidas: Etapa[];
  ve_dinero: boolean;
  estacion_default: string | null;
  usuario_id: string | null;
  creado_en_app: string;
  creado_at: string;
}

export interface Estacion {
  id: string;
  nombre: string;
  etapa_default: Etapa | null;
}

export interface Cotizacion {
  id: string;
  negocio_id: string;
  cliente_id: string | null;
  folio: string | null;
  estado: 'borrador' | 'enviada' | 'aceptada' | 'rechazada';
  /** centavos */
  total: number;
  moneda: Moneda;
  vigencia: string | null;
  datos: Record<string, unknown>;
  creado_at: string;
  actualizado_at: string | null;
}

export type EstadoProyecto = 'planeando' | 'activo' | 'pausado' | 'finiquito' | 'cerrado';

/** Lo acordado con un proveedor dentro de un proyecto. Cuelga del proyecto;
 *  el ítem es opcional (decisión de Mike, 11-sep). El cliente NUNCA la ve. */
export interface Partida {
  id: string;
  proyecto_id: string;
  item_id: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  concepto: string | null;
  /** centavos */
  monto_acordado: number;
  // cachés: los recalcula la API desde los egresos del proyecto con ese
  // proveedor como contraparte. Ninguna app los escribe.
  /** centavos */
  monto_pagado: number;
  estado: 'pendiente' | 'parcial' | 'pagado';
  creado_at: string;
  actualizado_at: string | null;
}

export interface Proyecto {
  id: string;
  negocio_id: string;
  cliente_id: string;
  nombre: string;
  descripcion: string | null;
  estado: EstadoProyecto;
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  fecha_cierre: string | null;
  // cachés: los recalcula la API tras cada mutación. Ninguna app los escribe.
  /** centavos */
  precio_venta: number;
  /** centavos */
  cobrado: number;
  /** centavos. El cliente NUNCA lo ve. */
  pagado_prov: number;
  /** centavos: Σ monto_acordado de sus partidas. El cliente NUNCA lo ve. */
  compromiso: number;
  /** 0..1 */
  avance: number;
  creado_at: string;
  actualizado_at: string | null;
}

/** Eje comercial. No se condiciona con la etapa. */
export type EstadoItem = 'cotizado' | 'vendido' | 'cancelado';
/** Eje de fabricación. 0 = todavía no arranca. */
export type Etapa = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ETAPAS: Array<{ n: Etapa; nombre: string; termina: string; quien: string }> = [
  { n: 0, nombre: 'Sin arrancar', termina: '—', quien: '—' },
  { n: 1, nombre: 'Diseño autorizado', termina: 'el cliente firma el diseño', quien: 'oficina' },
  { n: 2, nombre: 'Anticipo pagado', termina: 'entra el anticipo', quien: 'administración' },
  { n: 3, nombre: 'Compra de materiales', termina: 'material recibido en taller', quien: 'compras / almacén' },
  { n: 4, nombre: 'Despiece y ensamble', termina: 'embalado y etiquetado — nace la clave', quien: 'taller' },
  { n: 5, nombre: 'Entrega', termina: 'descargado en sitio', quien: 'chofer' },
  { n: 6, nombre: 'Instalación', termina: 'colocado en su lugar', quien: 'instalador' },
  { n: 7, nombre: 'Cierre', termina: 'el cliente acepta', quien: 'residente / cliente' },
];

/** En la etapa 4 nace la clave del ítem ('M07'). */
export const ETAPA_CLAVE: Etapa = 4;

export interface Item {
  id: string;
  negocio_id: string;
  proyecto_id: string | null; // NULL mientras solo está cotizado
  cliente_id: string;
  clave: string | null;
  nombre: string;
  descripcion: string | null;
  tipo: 'mueble' | 'servicio' | 'visita' | 'otro';
  /** centavos. Es el importe de LA LÍNEA: las 20 puertas juntas, no una.
   *  `proyectos.precio_venta` es la suma de estos. */
  monto: number;
  /** Cuántas piezas iguales son (0011). Por omisión 1. El precio por pieza
   *  sale de `monto / cantidad`, y es exacto: la multiplicación se hizo en
   *  centavos enteros al capturar. */
  cantidad: number;
  moneda: Moneda;
  estado: EstadoItem;
  etapa: Etapa;
  etapa_at: string | null;
  etapa_por: string | null;
  fecha_entrega: string | null;
  asignados: string[];
  origen: { app?: string; cotizacion_id?: string; linea?: number };
  refs: { nest?: string; draw?: string; fotos?: string[] };
  creado_at: string;
  creado_por: string;
  actualizado_at: string | null;
}

/** Append-only: no hay PATCH ni DELETE. */
export interface Avance {
  id: string;
  item_id: string;
  etapa: Etapa;
  persona_id: string | null;
  usuario_id: string;
  nota: string | null;
  foto: string | null;
  ts: string;
}

export interface Movimiento {
  id: string;
  negocio_id: string;
  tipo: 'ingreso' | 'egreso';
  /** centavos */
  monto: number;
  fecha: string;
  cuenta_id: string;
  proyecto_id: string | null;
  item_id: string | null;
  contraparte_tipo: 'cliente' | 'proveedor' | 'personal' | 'otro';
  contraparte_id: string | null;
  contraparte_nombre: string | null;
  transfer_id: string | null;
  descripcion: string | null;
  categoria: string | null;
  creado_por: string;
  creado_at: string;
}

export interface Opex {
  id: string;
  negocio_id: string;
  nombre: string;
  tipo: string;
  /** centavos */
  monto: number;
  moneda: Moneda;
  frecuencia: 'semanal' | 'mensual' | 'anual';
  dia_semana: number | null;
  dia_del_mes: number | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  cuenta_id: string | null;
  categoria: string | null;
  activo: boolean;
  creado_at: string;
}

/** Una conciliación: la foto de un momento. Append-only, como `avances`. */
export interface Conciliacion {
  id: string;
  negocio_id: string;
  /** La hora exacta del corte; el saldo registrado se congela ahí. */
  corte_at: string;
  hecha_por: string;
  creado_at: string;
}

export interface ConciliacionCuenta {
  id: string;
  conciliacion_id: string;
  cuenta_id: string;
  /** centavos */
  saldo_registrado: number;
  /** centavos */
  saldo_real: number;
  /** registrado − real, en centavos. Positiva: salidas que nadie registró. */
  diferencia: number;
  /** El ajuste que dejó la cuenta igual al real; null si cuadró. */
  movimiento_id: string | null;
  creado_at: string;
}

export interface Archivo {
  id: string;
  r2_key: string;
  nombre: string;
  mime: string | null;
  bytes: number | null;
  de_tabla: string;
  de_id: string;
  subido_por: string;
  creado_at: string;
}

/** Configuración de UNA app dentro de una empresa: lo que no describe al
 *  negocio —eso es `Negocio`— sino a cómo esa app trabaja. `valor` se lee
 *  entero; nadie lo consulta por dentro.
 *
 *  El `id` es `app:clave` y lo arma la API con la cabecera `X-App`: ninguna app
 *  manda el suyo, ninguna app abre el de otra, y guardar es un solo POST
 *  porque ese id hace upsert. */
export interface Ajuste {
  /** `app:clave`, p. ej. `cotizador101:precios`. Lo arma la API. */
  id: string;
  app: App;
  clave: string;
  valor: Record<string, unknown>;
  creado_at: string;
  actualizado_at: string | null;
}

export const TABLAS = [
  'negocios',
  'cuentas',
  'clientes',
  'proveedores',
  'personal',
  'estaciones',
  'cotizaciones',
  'proyectos',
  'items',
  'partidas',
  'avances',
  'movimientos',
  'opex',
  'conciliaciones',
  'conciliacion_cuentas',
  'archivos',
  'ajustes',
] as const;
export type Tabla = (typeof TABLAS)[number];

/** Tablas que viven dentro del OrgDB pero NO son del contrato: no se exponen
 *  por el CRUD genérico y ninguna app las conoce. `folios` es el contador del
 *  folio de la cotización, y vive ahí adentro justo para ser atómico.
 *
 *  Está aquí, y no escrita a mano en cada prueba, porque dos pruebas comparan
 *  la lista de tablas de la base con igualdad —para que una tabla NUEVA que
 *  nadie esperaba también truene—, y esa lista tiene que salir de un solo
 *  lugar. El 16-sep un conteo de migraciones escrito a mano en una prueba dejó
 *  un despliegue en rojo; es la misma clase de cosa. */
/* Las de quell101 (0006) no salen por el CRUD genérico: las usa el motor de
 * la bitácora de obra por /orgs/:o/quell/*, con sus propias reglas. */
export const TABLAS_INTERNAS = [
  'folios',
  'quell_users', 'quell_projects', 'quell_project_members', 'quell_plans', 'quell_elements', 'quell_log_entries',
  'quell_punch_items', 'quell_photos', 'quell_operaciones', 'quell_etapas', 'quell_element_etapas', 'quell_dudas',
  'quell_duda_respuestas', 'quell_element_contratistas',
  // roster101 (0007): las usa el motor de los expedientes por /roster/:o/api/*.
  'roster_trabajadores', 'roster_documentos', 'roster_codigos', 'roster_bitacora', 'roster_consentimientos',
  'roster_papelera', 'roster_administradores',
  /* Órdenes de compra y fiscal (0008 y 0009). NO salen por el CRUD genérico, y
   * es a propósito: el CRUD genérico entrega la tabla entera a quien puede
   * leerla, y aquí un miembro tiene que ver SÓLO SUS órdenes (decisión de
   * Mike). Ese filtro no se puede expresar en el CRUD, así que estas cuatro
   * se atienden por /orgs/:o/ordenes/* y /orgs/:o/fiscal/*, donde el permiso
   * se resuelve renglón por renglón. */
  'ordenes', 'orden_eventos', 'cfdi', 'cfdi_movimientos',
] as const;

/* ─────────────── lo que devuelven las rutas con nombre ─────────────── */

/** GET /orgs/:o/obras — la obra de quell101, dicha con los nombres de la
 *  suite. `proyecto_id` es la liga con el proyecto de dash101: cuando es
 *  `null`, la obra existe en quell101 y nadie le ha puesto precio todavía. */
export interface Obra {
  id: string;
  nombre: string;
  cliente: string;
  estado: 'activo' | 'cerrado';
  creado_at: string;
  proyecto_id: string | null;
  proyecto_nombre: string | null;
  proyecto_negocio_id: string | null;
  /** cuántos planos tiene cargados */
  planos: number;
  /** cuántos ítems están ya ubicados en un plano */
  ubicados: number;
}

/** GET /orgs/:o/pool — para autocompletar. Solo identidad. */
export interface Pool {
  clientes: Array<Pick<Cliente, 'id' | 'nombre' | 'nombre_norm' | 'correo' | 'telefono'>>;
  proveedores: Array<Pick<Proveedor, 'id' | 'nombre' | 'nombre_norm' | 'correo' | 'telefono'>>;
  personal: Array<Pick<Personal, 'id' | 'nombre' | 'nombre_norm' | 'correo' | 'puesto'>>;
}

/** GET /orgs/:o/peek — todo lo del cliente en sesión, ya agregado por la API.
 *  Los números vienen calculados aquí para que el KPI y la tabla no se
 *  contradigan nunca (fue un defecto real el 7-sep). */
export interface Peek {
  cliente: Pick<Cliente, 'id' | 'nombre' | 'correo'>;
  proyectos: Array<
    Omit<Proyecto, 'pagado_prov' | 'compromiso'> & {
      items: Array<Pick<Item, 'id' | 'clave' | 'nombre' | 'monto' | 'moneda' | 'estado' | 'etapa' | 'etapa_at' | 'fecha_entrega'>>;
    }
  >;
  /** centavos */
  totales: { vendido: number; cobrado: number; saldo: number; avance: number };
  pagos: Array<Pick<Movimiento, 'id' | 'fecha' | 'monto' | 'proyecto_id' | 'descripcion'>>;
}

/* ─────────────── WebSocket (§8) ─────────────── */

export type Aviso =
  | { t: 'item.etapa'; id: string; etapa: Etapa; clave: string | null; at: string }
  | { t: 'item.cambio'; id: string }
  | { t: 'movimiento.nuevo'; id: string; proyecto_id: string | null }
  | { t: 'proyecto.cache'; id: string; precio_venta: number; cobrado: number; avance: number }
  | { t: 'conciliacion.nueva'; id: string; negocio_id: string; diferencia_total: number };

/* ─────────────── ayudas de formato (identidad Taller 101) ─────────────── */

export const AZUL_T101 = '#0080C1';

/** Centavos → texto. La UI lo pinta con Fira Sans y `font-variant-numeric: tabular-nums`. */
export function formatearDinero(centavos: number, moneda: Moneda = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(centavos / 100);
}

/* ─────────────── pesos → centavos ───────────────
 * Esta conversión se hace SIN multiplicar por 100. `1500.5 * 100` no da
 * 150050 por suerte, da 150049.99999999999 por accidente, y `Math.round` lo
 * tapa casi siempre — casi. Con `1.005 * 100` sale 100.49999999999999 y el
 * redondeo se va para abajo: un centavo perdido, en silencio, dentro de un
 * número que ya nadie va a volver a mirar.
 *
 * Así que el número se lee como texto, se parte en el punto y se cuentan los
 * dígitos. Los decimales que sobran redondean al centavo más cercano, y medio
 * centavo sube. Que hubo redondeo se devuelve dicho, porque en una migración
 * redondear dinero sin avisar es peor que no convertirlo. */

export interface Centavos {
  ok: boolean;
  /** Entero. Vale 0 cuando `ok` es falso: no se usa. */
  centavos: number;
  /** Había dígitos más allá del centavo y se tuvo que redondear. */
  redondeo: boolean;
  /** El campo venía vacío o nulo. Se cuenta como 0, pero se sabe que faltaba. */
  vacio: boolean;
  /** Por qué no se pudo convertir. */
  motivo?: string;
}

/** Un número en notación exponencial, escrito con todos sus dígitos.
 *  `String(1.5e-7)` es '1.5e-7' y ahí no hay dónde poner el punto decimal. */
function sinExponente(n: number): string {
  const s = String(n);
  if (!/e/i.test(s)) return s;
  const [mantisa, potencia] = s.split(/e/i);
  const exp = Number(potencia);
  const negativo = mantisa.startsWith('-');
  const [entero, decimales = ''] = mantisa.replace('-', '').split('.');
  const digitos = entero + decimales;
  const punto = entero.length + exp;
  let salida: string;
  if (punto <= 0) salida = '0.' + '0'.repeat(-punto) + digitos;
  else if (punto >= digitos.length) salida = digitos + '0'.repeat(punto - digitos.length);
  else salida = digitos.slice(0, punto) + '.' + digitos.slice(punto);
  return (negativo ? '-' : '') + salida;
}

/** Pesos (número o texto) → centavos enteros. `'1,500.50'` → `150050`. */
export function aCentavosExacto(valor: unknown): Centavos {
  const nada: Centavos = { ok: true, centavos: 0, redondeo: false, vacio: true };
  if (valor === null || valor === undefined || valor === '') return nada;
  if (typeof valor === 'boolean') {
    return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: 'un booleano no es dinero' };
  }

  let texto: string;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) {
      return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: `no es un número finito: ${valor}` };
    }
    texto = sinExponente(valor);
  } else {
    // Se le quitan símbolo de moneda, separadores de millar y espacios (los
    // duros también: los pega Excel al copiar).
    texto = String(valor).replace(/[\s\u00a0$,]/g, '');
    if (texto === '') return nada;
  }

  if (!/^[+-]?\d*(\.\d*)?$/.test(texto) || !/\d/.test(texto)) {
    return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: `no parece un número: ${String(valor)}` };
  }

  const negativo = texto.startsWith('-');
  const limpio = texto.replace(/^[+-]/, '');
  const [entero = '', decimales = ''] = limpio.split('.');
  if (entero.length > 13) {
    return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: 'demasiados dígitos para un entero exacto' };
  }

  const dosDecimales = (decimales + '00').slice(0, 2);
  const sobra = decimales.slice(2);
  let centavos = Number(entero || '0') * 100 + Number(dosDecimales);
  // Medio centavo sube, y en los negativos sube en valor absoluto: -1.005 es
  // -101, no -100. Redondear hacia cero de un lado y no del otro descuadraría
  // una transferencia consigo misma.
  if (sobra && sobra[0] >= '5') centavos += 1;

  return {
    ok: true,
    centavos: negativo ? -centavos : centavos,
    redondeo: /[1-9]/.test(sobra),
    vacio: false,
  };
}

/** Texto tecleado → centavos enteros. '1,500.50' → 150050. */
export function aCentavos(texto: string | number): number {
  return aCentavosExacto(texto).centavos;
}

/** minúsculas sin acentos — para `nombre_norm` y para el autocompletar. */
export function normalizar(txt: string): string {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

# Suite101 — arquitectura de datos (v1, 7-sep-2026)

**Léelo completo antes de tocar código de cualquier app.** Decidido con Mike el 7-sep. Esto
manda sobre `conta-master-contexto.md` y sobre el modelo de `supervisor-arquitectura.md` en
todo lo que choque.

## Qué es

Una plataforma. Varias apps. **Una base de datos por empresa cliente**, y todas las apps
leen y escriben en esa misma base, cada una a su manera. Si la empresa apaga una app, sus
datos no se van: siguen en la base, y al reactivarla los vuelve a ver.

```
1 empresa (org)  =  1 frontera de datos  =  N apps que la usan distinto
```

## Nombres — de dónde viene cada cosa

| Hoy | Suite101 | Qué hace |
|---|---|---|
| CONTA MASTER | **dash101** | dinero: negocios, cuentas, movimientos, proyectos, flujo |
| SUPERVISOR (diseño) | **quell101** | taller: etapas por ítem, banda de producción, estaciones |
| Portal estados de cuenta | **peek101** | el cliente ve sus ítems, pagos y saldo. Solo lectura |
| Portal de trabajadores | **roster101** | personal: expediente, documentos, roles |
| cotizador-t101 | **cotizador101** | cotiza, y al aceptar **crea los ítems** |
| nest101 · draw101 | igual | escritorio. No leen la base; el ítem guarda referencias a sus archivos |
| — | **master101** | tuya. Da de alta orgs, fija plan y apps. Nadie más entra |
| — | **suite101** | del cliente. Administra sus usuarios y ve qué apps tiene |
| «producto» | **ítem** | lo que se cobra: una cocina, una visita, un servicio. Es el bloque de todo |

## Decisiones tomadas (Mike, 7-sep)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Un solo proyecto Firebase**, un Firestore, todo bajo `/orgs/{orgId}/…` | Base por cliente multiplica rules, Auth, dominios y facturación; master101 no podría ver nada |
| 2 | **Subcolecciones**, no un campo `org_id` en colecciones planas | La ruta es la frontera. `/orgs/A/…` no puede leer `/orgs/B/…` ni por olvido. Con un campo, olvidar un `where` = fuga (o el permission-denied de hoy) |
| 3 | Jerarquía **org → negocio → proyecto → ítem** | `negocio_id` de hoy se conserva; pasa a ser un nivel *dentro* de la org |
| 4 | **El ítem es un documento**, `/orgs/{o}/items/{id}`, no un arreglo en el proyecto | quell101 escribe `etapa` desde varias pantallas a la vez; en un arreglo se pisan. Cada ítem es su propio proyectito |
| 5 | «producto» → **«ítem»** en todo | Lo que se vende puede ser de muchas naturalezas |
| 6 | **Una entidad, muchos lectores, un escritor por campo** | Gregorio existe una vez en `personal`; cualquier app lo busca y lo referencia. Pero `puesto` solo lo escribe roster101 y `etapa` solo quell101 |
| 7 | Crear una entidad que no existe lo puede hacer cualquier app, **solo con campos de identidad** (`nombre`, `correo`) | Lo demás lo llena la app dueña |
| 8 | Autocompletar = **cargar el pool en memoria y filtrar** | Firestore no tiene búsqueda de texto. Personal, clientes y proveedores son decenas, no miles |
| 9 | **Sin custom claims, sin Cloud Functions.** Plan Spark. Rules con `exists()`/`get()` | Blaze el día que duela. Con 3 orgs sobra |
| 10 | El proyecto es un **agrupador**: su monto y avance se **calculan** desde sus ítems | Nada que sincronizar. Se cachean en el doc después de cada mutación, como hoy |
| 11 | No forzar orden diseño ↔ aceptación económica | `estado` (comercial) y `etapa` (fabricación) son ejes independientes |

---

## 1. Estructura Firestore

```
/superadmins/{uid}                  master101. Solo Mike. Escrito a mano en consola
/usuarios/{uid}                     perfil de un miembro de org: nombre, email, orgs[]
/accesos/{uid}                      índice de identidad para quien NO es miembro:
                                    { tipo: cliente|personal, org_id, ref_id }
/invitaciones/{id}                  invitar miembro a una org (lectura pública, como hoy)

/orgs/{orgId}                       nombre, plan, apps{}, moneda, creado_at
  /miembros/{uid}                   rol, apps[], negocios[] · socios y staff de oficina
  /negocios/{id}                    Forespot, Taller 101… (los de hoy)
  /cuentas/{id}                     bancos, caja
  /clientes/{id}                    + uid, portal_email, portal_activo (peek101)
  /proveedores/{id}
  /personal/{id}                    trabajadores. + uid, pin, etapas_permitidas (quell101)
  /estaciones/{id}                  pantallas fijas del taller
  /cotizaciones/{id}                cotizador101: lineas[], estado, cliente_id
  /proyectos/{id}                   agrupador: cliente, negocio, estado, cachés
  /items/{id}                       ★ el bloque. Ver §2
  /avances/{id}                     historial de etapa por ítem. append-only
  /movimientos/{id}                 ingresos, egresos, transferencias. + item_id
  /opex/{id}
```

Todo lo que hoy vive en raíz (`negocios`, `cuentas`, `clientes`, `proveedores`, `proyectos`,
`movimientos`, `opex`) **se mueve tal cual** bajo `/orgs/{o}/`. Los campos no cambian, salvo
lo marcado en §2. Las apps solo cambian el prefijo de la ruta.

### Quién es quién al entrar

| Tipo | Se autentica con | Su membresía vive en | Rules lo reconocen por |
|---|---|---|---|
| Superadmin (Mike) | Google | `/superadmins/{uid}` | `exists(superadmins/uid)` |
| Miembro de org (socio, oficina) | Google o correo+contraseña | `/orgs/{o}/miembros/{uid}` | `exists(orgs/o/miembros/uid)` |
| Cliente (peek101) | correo + PIN 6 dígitos | `/accesos/{uid}` → `{cliente, o, clienteId}` y `clientes/{c}.uid` | `resource.data.cliente_uid == uid` |
| Personal de taller (quell101) | correo + PIN 6 dígitos | `/accesos/{uid}` → `{personal, o, personalId}` | `get(accesos/uid).org_id == o` |

Un uid puede ser miembro de varias orgs (subcolección por org). Un cliente o un trabajador
pertenece a una sola → `/accesos/{uid}` es un doc plano. Lo escribe dash101 (clientes) o
roster101 (personal) al activar el acceso, igual que hoy `activarAccesoPortal`.

---

## 2. El ítem

```
/orgs/{o}/items/{id}
  negocio_id, proyecto_id|null, cliente_id, cliente_uid|null   ← denormalizado para rules
  clave            "M07" — nace en etapa 4 (embalado), como en SUPERVISOR
  nombre, descripcion
  tipo             mueble | servicio | visita | otro
  monto, moneda
  estado           cotizado | vendido | cancelado          ← eje comercial
  etapa            0..7                                      ← eje de fabricación
  etapa_at, etapa_por                                        ← caché del último avance
  pagado           Σ movimientos ingreso con item_id         ← calculado
  fecha_entrega
  asignados[]      ids de personal
  origen           { app: cotizador101|dash101|nest101, cotizacion_id, linea }
  refs             { nest: "…t101x", draw: "…", fotos: [] }
  creado_at, creado_por, actualizado_at
```

### Ciclo de vida

```
cotizador101 exporta  →  estado=cotizado  etapa=0  proyecto_id=null
cliente acepta        →  estado=vendido   se liga a un proyecto (se crea si no hay)
quell101 marca        →  etapa 1 → 2 → … → 7, cada marca escribe un /avances y actualiza la caché
cliente firma cierre  →  etapa=7. Cuando TODOS los ítems del proyecto están en 7 → proyecto.estado=finiquito
se cancela            →  estado=cancelado. No se borra: queda para historial y para el saldo
```

`estado` y `etapa` no se condicionan entre sí. Un ítem puede estar en etapa 1 (diseño
autorizado) siendo `cotizado`, o `vendido` con anticipo (etapa 2) sin diseño. El orden real
lo dicta el cliente, no el esquema.

### Las 7 etapas (de SUPERVISOR, sin cambios)

| # | Etapa | Termina cuando | Quién la marca |
|---|---|---|---|
| 1 | Diseño autorizado | el cliente firma el diseño | oficina |
| 2 | Anticipo pagado | entra el anticipo | administración |
| 3 | Compra de materiales | material recibido en taller | compras / almacén |
| 4 | Despiece y ensamble | embalado y etiquetado — **aquí nace la `clave`** | taller |
| 5 | Entrega | descargado en sitio | chofer, desde su teléfono |
| 6 | Instalación | colocado en su lugar | instalador, desde su teléfono |
| 7 | Cierre | el cliente acepta | residente / cliente |

`personal.etapas_permitidas[]` evita que el instalador marque «anticipo pagado».

### Agregados del proyecto (calculados, cacheados en el doc)

```
precio_venta = Σ items(vendido).monto
cobrado      = Σ movimientos(ingreso, proyecto_id)
avance       = Σ items(vendido).etapa / (n_items_vendidos × 7)
fecha_entrega= max items.fecha_entrega
```

dash101 los recalcula tras cada mutación (patrón `recalcularProyecto` de hoy). peek101 **no
confía en la caché**: suma lo que él mismo puede leer, para que el KPI y la lista nunca se
contradigan (bug del 7-sep).

---

## 3. Dueño por campo

Un escritor por campo. Los demás leen. Se cumple por convención en el código de cada app;
las rules solo lo fuerzan donde el escritor no es miembro (personal → `etapa`).

### items

| Campo | Escribe | Puede corregir |
|---|---|---|
| nombre, descripcion, tipo, monto, moneda | cotizador101 | dash101 |
| estado | cotizador101 (cotizado→vendido) | dash101 (cancelar) |
| proyecto_id, negocio_id, cliente_id | cotizador101 al vender | dash101 |
| cliente_uid | dash101 (al activar peek101) | — |
| etapa, etapa_at, etapa_por, clave | **quell101** | nadie |
| pagado | dash101 (calculado) | — |
| fecha_entrega | dash101 | quell101 puede proponer, no fijar |
| asignados[] | roster101 | quell101 (asignar a estación) |
| refs.nest, refs.draw | nest101 / draw101 vía importador | — |
| origen | quien lo crea | nadie |

### personal

| Campo | Escribe |
|---|---|
| nombre, correo (identidad) | quien lo cree primero |
| puesto, activo, expediente_ref, documentos | roster101 |
| etapas_permitidas[], ve_dinero, estacion_default | quell101 |
| uid, pin_activo | quien active el acceso (roster101) |

### clientes

| Campo | Escribe |
|---|---|
| nombre, correo, telefono (identidad) | quien lo cree primero: cotizador101 o dash101 |
| rfc, notas, direccion_fiscal | dash101 |
| uid, portal_email, portal_activo | dash101 (activar peek101) |

### proyectos

| Campo | Escribe |
|---|---|
| nombre, cliente_id, negocio_id, estado | dash101 (o cotizador101 al vender si no existe) |
| precio_venta, cobrado, avance, fecha_entrega (cachés) | dash101 |
| partidas[] (proveedores, costos) | dash101 — **el cliente nunca lo ve** |

### Crear-si-no-existe

Cualquier app, al capturar un cliente / trabajador / proveedor:

1. carga el pool de la org en memoria (una lectura al abrir la app; se refresca al volver al foco)
2. normaliza (`nombre_norm`: minúsculas, sin acentos) y filtra mientras se teclea; también por correo exacto
3. si hay match → referencia por `id`. Nunca copia el nombre a un campo propio salvo denormalización explícita (`cliente_nombre`)
4. si no hay → crea el doc **solo con identidad**: `{nombre, nombre_norm, correo, creado_por, creado_en_app}`
5. la app dueña completa el resto cuando lo abra

Todo doc de pool lleva `nombre_norm` para que el filtro sea barato.

---

## 4. Apps contratadas (entitlements)

```
/orgs/{o}
  plan: "taller" | "estudio" | "…"
  apps: { dash:true, quell:true, peek:true, cotizador:false, roster:false }
```

- **master101 escribe `apps` y `plan`.** Nadie más. Rules lo protegen (§5).
- Cada app, al entrar, lee `/orgs/{o}` y **si su llave es `false`, no abre**. Pantalla: «Esta
  app no está activa para tu empresa. Pídela en suite101».
- Apagar no borra. Los datos son de la org, no de la app. Reactivar = volver a ver todo.
- `/orgs/{o}/miembros/{uid}.apps[]` afina por persona: un socio ve dash101, un diseñador solo
  cotizador101. Vacío = todas las de la org.

---

## 5. Rules — borrador completo

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    function isAuth() { return request.auth != null; }
    function uid()    { return request.auth.uid; }

    function esSuper() {
      return isAuth() && exists(/databases/$(db)/documents/superadmins/$(uid()));
    }
    function esMiembro(o) {
      return isAuth() && exists(/databases/$(db)/documents/orgs/$(o)/miembros/$(uid()));
    }
    function miembro(o) {
      return get(/databases/$(db)/documents/orgs/$(o)/miembros/$(uid())).data;
    }
    function esAdminOrg(o) {
      return esMiembro(o) && miembro(o).rol in ['owner', 'admin'];
    }
    // cliente o personal: su doc en /accesos dice a qué org pertenece
    function acceso() {
      return get(/databases/$(db)/documents/accesos/$(uid())).data;
    }
    function esPersonal(o) {
      return isAuth() && exists(/databases/$(db)/documents/accesos/$(uid()))
        && acceso().tipo == 'personal' && acceso().org_id == o;
    }
    // doc con cliente_uid == mi uid
    function esMiCliente(campo) {
      return isAuth() && campo != null && campo == uid();
    }
    function soloCampos(lista) {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(lista);
    }

    match /superadmins/{id} {
      allow read: if isAuth() && id == uid();
      allow write: if false;                       // a mano en consola
    }
    match /usuarios/{id} {
      allow read, write: if isAuth() && id == uid();
    }
    match /accesos/{id} {
      allow read: if isAuth() && (id == uid() || esSuper());
      allow create, update: if esMiembro(request.resource.data.org_id) || esSuper();
      allow delete: if esSuper();
    }
    match /invitaciones/{id} {
      allow read: if true;                         // el invitado la abre sin sesión (como hoy)
      allow create: if esAdminOrg(request.resource.data.org_id);
      allow update: if isAuth();                   // aceptar
      allow delete: if esSuper();
    }

    match /orgs/{o} {
      allow read: if esMiembro(o) || esSuper() || esPersonal(o)
        || (isAuth() && exists(/databases/$(db)/documents/accesos/$(uid())) && acceso().org_id == o);
      allow create, delete: if esSuper();
      // apps y plan: solo master101. El admin de la org edita lo suyo
      allow update: if esSuper()
        || (esAdminOrg(o) && soloCampos(['nombre', 'moneda', 'datos', 'actualizado_at']));

      match /miembros/{m} {
        allow read: if esMiembro(o) || esSuper();
        allow write: if esAdminOrg(o) || esSuper();
      }

      match /clientes/{c} {
        allow read: if esMiembro(o) || esSuper()
          || (esMiCliente(resource.data.uid) && resource.data.portal_activo == true);
        allow write: if esMiembro(o);
      }

      match /proyectos/{p} {
        allow read: if esMiembro(o) || esSuper() || esMiCliente(resource.data.cliente_uid) || esPersonal(o);
        allow write: if esMiembro(o);
      }

      match /items/{i} {
        allow read: if esMiembro(o) || esSuper() || esMiCliente(resource.data.cliente_uid) || esPersonal(o);
        allow create, delete: if esMiembro(o);
        allow update: if esMiembro(o)
          || (esPersonal(o) && soloCampos(['etapa', 'etapa_at', 'etapa_por', 'clave', 'actualizado_at']));
      }

      match /avances/{a} {
        allow read: if esMiembro(o) || esPersonal(o) || esSuper();
        allow create: if (esMiembro(o) || esPersonal(o))
          && request.resource.data.persona_uid == uid();
        allow update, delete: if false;            // append-only
      }

      match /movimientos/{m} {
        allow read: if esMiembro(o) || esSuper()
          || (esMiCliente(resource.data.cliente_uid) && resource.data.tipo == 'ingreso');
        allow write: if esMiembro(o);
      }

      match /personal/{p} {
        allow read: if esMiembro(o) || esSuper() || esPersonal(o);
        allow write: if esMiembro(o);
      }

      // negocios, cuentas, proveedores, estaciones, cotizaciones, opex
      match /{coleccion}/{doc} {
        allow read, write: if esMiembro(o);
        allow read: if esSuper();
      }
    }
  }
}
```

Notas:

- **Rules no son filtros.** Toda query de un no-miembro debe llevar el `where` que la rule
  exige: peek101 consulta `items where cliente_uid == uid`, `movimientos where cliente_uid ==
  uid and tipo == 'ingreso'`. Sin eso, permission-denied aunque regrese 0 docs.
- Un miembro ya está dentro de `/orgs/{o}` por la ruta: sus queries **no** necesitan
  `where negocio_id` para las rules (sí para filtrar).
- `get()`/`exists()` cuestan una lectura cada uno, máximo 10 por petición. Este borrador usa
  1–2 por operación. Cuando master101 lo haga doler → custom claims (Blaze).
- master101 consultando **todas** las orgs usa `collectionGroup` y necesita reglas
  `match /{path=**}/items/{i} { allow read: if esSuper(); }`. Se agregan cuando master101 exista.
- Personal escribiendo `etapa`: la rule lo limita a esos campos. Es el único lugar donde «un
  escritor por campo» se fuerza en rules; el resto es convención.

---

## 6. Índices

Bajo subcolección, los índices de campo único los crea Firestore solo. Compuestos previstos:

```
items:        estado ASC, fecha_entrega ASC          (dash101: vendidos por entregar)
items:        proyecto_id ASC, etapa ASC             (quell101: banda de un proyecto)
movimientos:  proyecto_id ASC, fecha DESC            (ya existe hoy, se conserva)
movimientos:  cliente_uid ASC, tipo ASC, fecha DESC  (peek101)
avances:      item_id ASC, ts DESC                   (historial)
```

Los de hoy (`negocio_id` + `creado_at`) se conservan tal cual, con la ruta nueva.

---

## 7. Plan de migración

Hoy hay ~2 proyectos y ~3 usuarios. **Es el momento más barato que va a haber.**

### Fase 0 — congelar (hoy)
- `proyectos.productos[]` y `movimientos.producto_id` quedan como **puente**. No más UI encima.
- peek101 sigue funcionando como está hasta la fase 3.

### Fase 1 — migrar datos (1 sesión)
Script **en el navegador, como owner** (patrón del «legacy cleanup» de hoy; sin Cloud Functions):

1. crea `/orgs/forespot` con `apps: {dash:true, peek:true, quell:true, cotizador:true, roster:true}`
2. copia `negocios, cuentas, clientes, proveedores, proyectos, movimientos, opex` → `/orgs/forespot/…` **mismo id**
3. `proyectos.productos[]` → un doc `/orgs/forespot/items/{producto.id}` cada uno, con
   `estado: vendido`, `etapa: 0`, `origen: {app: 'dash101'}`; borra el arreglo del proyecto
4. `movimientos.producto_id` → `item_id`; borra `producto_id`, `producto_nombre`
5. `usuarios.memberships` → `/orgs/forespot/miembros/{uid}` con `rol` y `negocios[]`
6. clientes con `uid` → `/accesos/{uid} = {tipo: 'cliente', org_id: 'forespot', ref_id}`
7. `/superadmins/{uid_mike}` a mano en consola
8. **verifica conteos** colección por colección antes de borrar la raíz
9. borra las colecciones de raíz

### Fase 2 — dash101 (1–2 sesiones)
- helper `col(orgId, 'proyectos')` en `lib/db.ts`; todas las rutas pasan por ahí
- `orgId` viene de `/usuarios/{uid}.orgs[0]` al entrar; selector si hay más de una
- `types/schema.ts`: `ProductoProyecto` → `Item` en colección propia; `Proyecto.productos` desaparece;
  `Movimiento.producto_id` → `item_id`
- página de proyecto: tabla de ítems lee `items where proyecto_id == …`
- rules nuevas (§5) + índices (§6) → GitHub Actions
- nombre en UI: dash101. El repo puede seguir llamándose conta-master hasta que estorbe

### Fase 3 — peek101
- al entrar: `/accesos/{uid}` → `org_id` → lee `/orgs/{o}/clientes`, `items`, `movimientos`
- ítems desde la subcolección, no del arreglo
- Netlify: nombrar el sitio `peek101` cuando toque; `cuenta-taller101` puede quedarse como alias

### Fase 4 — cotizador101 exporta ítems
- botón «Exportar a seguimiento»: por cada línea → `items` con `estado: cotizado`, `origen`
- al aceptar: `estado: vendido`, crea o liga proyecto
- clientes: deja de tener lista propia; usa `/orgs/{o}/clientes` con autocompletar (§3)

### Fase 5 — quell101 nace sobre `items`
- `mueble` de SUPERVISOR = `item`; `avance` = `/avances`; `persona` = `personal`; `estacion` = `/estaciones`
- login personal: correo + PIN (mismo mecanismo que peek101, `/accesos`)
- pantalla fija de estación: sesión de personal con `estacion_default`

### Fase 6 — master101 y suite101 (mínimos)
- master101: lista de orgs, crear org, editar `plan` y `apps`, ver miembros. Una página
- suite101: para el admin de la org: miembros, invitar, ver apps activas. Puede vivir dentro de dash101 como sección al principio

### Fase 7 — roster101
- hoy en Cloudflare (D1 + R2). El expediente y los documentos escaneados **se quedan ahí**
- `personal` en Firestore es la identidad compartida; roster101 la escribe (`puesto`, `activo`) y guarda `expediente_ref` hacia su D1
- decidir después si los PDFs migran a Firebase Storage. No urge

---

## 8. Riesgos y límites conocidos

| Riesgo | Mitigación |
|---|---|
| Rules con `get()` gastan lecturas y tienen tope de 10 por petición | 1–2 por operación en este diseño. Medir. Claims cuando duela |
| Firestore Rules fallan en silencio con maps dinámicos (`memberships[negocioId]`) | Por eso `miembros` es subcolección: `exists()` sobre ruta, no `.get()` sobre map. Lección de conta-master |
| Query sin el `where` que exige la rule → permission-denied aunque no regrese nada | Documentado en §5. Todo lector no-miembro filtra por su uid |
| Dos apps escribiendo el mismo campo | Tabla de dueños (§3). Revisar en cada feature nueva |
| `etapa` en el ítem se desincroniza del último `/avances` | `etapa` es caché; la fuente es `/avances`. quell101 escribe los dos en un `writeBatch` |
| Renombrar `producto` → `item` a medias | Fase 1 hace el corte completo en datos; fase 2 en dash101. No coexisten |
| Firebase test-mode rules con fecha de expiración | Ya se aprendió en cotizador: rules permanentes desde el día 1 en Firestore, Storage y RTDB |

---

## 9. Decisiones abiertas — para Mike

1. **`partidas[]`** (costos con proveedores) — ¿se quedan en el proyecto o bajan al ítem
   (`/costos` con `item_id`)? Al ítem da margen por ítem; al proyecto es lo de hoy. Propuesta: proyecto ahora, ítem después.
2. **Login del personal en quell101** — correo + PIN por persona (como peek101), o una cuenta por
   estación con selección de persona en pantalla. Propuesta: las dos; teléfono = persona, pantalla fija = estación.
3. **Documentos de roster101** — ¿migran de R2 a Firebase Storage? Propuesta: no por ahora.
4. **Multi-org para un mismo cliente final** — un cliente de Taller 101 que también es cliente
   de otra org tendría dos docs. Aceptado; son empresas distintas.
5. **Nombre del repo** conta-master → dash101. Cuándo.

---

## Referencias

- `claude/conta-master-contexto.md` — stack y deploy de dash101 (sigue vigente para infra)
- `claude/estados-cuenta.md` — peek101 v0, lo que se publicó el 7-sep
- `claude/supervisor-arquitectura.md` — quell101: las 7 etapas, la banda, personas y estaciones
- `claude/portal-trabajadores.md` — roster101 en Cloudflare
- `claude/identidad-taller101.md` — #0080C1, Raleway, Sansation. Aplica a todas las apps

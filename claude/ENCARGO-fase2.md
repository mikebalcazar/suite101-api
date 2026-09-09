# Encargo — Fase 2: importar desde Firestore

Para el chat que traiga los datos. Este chat no coordina el resto de la
migración: hay otro que lleva la cuenta y va a revisar lo que salga de aquí.

---

## 1. Lo primero, sin excepción

1. Lee `suite101-arquitectura.md` completo, del conocimiento del proyecto. Ese
   documento manda.
2. Lee `claude/CONTINUAR.md` de `mikebalcazar/suite101-api`. Es el cierre de la
   fase 1 y su §5 está escrito **para ti**: dice exactamente lo que te va a
   estorbar. Léelo antes que este encargo, si acaso.
3. Lee `OPERAR.md` del repositorio.
4. Escribe `claude/EN-CURSO.md` y empújalo a `main` antes de trabajar. Es el
   semáforo. Sin él, otro chat puede ponerse a hacer lo mismo; ya pasó dos veces
   el 8-sep.

## 2. La decisión ya está tomada — no la vuelvas a abrir

La fase 1 dejó planteadas dos maneras de importar y **Mike eligió la A**:

> **`POST /admin/importar`**, solo para superadmin, que entra por debajo de
> `permisos.ts` a propósito y lo dice en su nombre.

La razón de descartar la B: importar por las rutas normales y recorrer las
etapas una por una habría dejado un historial de `avances` inventado — fechas y
responsables de movimientos que nunca ocurrieron así. Eso es dato de taller, y
un dato falso ahí es peor que no tenerlo.

Consecuencia que tienes que respetar: esa ruta **se salta `permisos.ts` a
propósito**, así que tiene que estar cerrada a cal y canto. Solo superadmin
(`CORREO_SUPERADMIN` ya está en `wrangler.toml`), y que se note en el nombre y
en los comentarios que es una puerta de servicio, no una ruta normal. Si alguien
la encuentra abierta dentro de un año, tiene que ser evidente qué es y por qué
existe.

## 3. Lo que ya está resuelto — no lo repitas

- La API existe, está publicada y medida: 42/42 en la prueba de humo del
  corredor. Producción: `https://suite101-api.mike-929.workers.dev`.
- **`RESEND_API_KEY` ya está puesto.** El correo de acceso funciona; puedes
  entrar en producción con código de 6 dígitos.
- Los dos secretos de Cloudflare están. Despliegas sin pedirle nada a Mike.
- El token de Actions del repositorio está en `write` — comprobado hoy en los
  siete repositorios, no supuesto. Si `verificar.yml` sale verde y no deja
  comentario, ese permiso se cayó y hay que mirarlo.
- **Los ids se conservan**: `crear()` respeta un `id` que venga en los datos.
- **`nombre_norm` lo pone la API**, no tú. Los acentos se normalizan solos.
- **Los cachés del proyecto se recalculan solos** tras cada escritura.

## 4. El alcance

De la tabla de migración, fase 2, y nada más:

- `POST /admin/importar` en la API, con JSON por colección, ids conservados.
- El script que lee Firestore. Corre en el navegador del owner, porque es quien
  tiene la sesión de Firebase.
- `productos[]` → filas en `items`. `producto_id` → `item_id`.
- Firebase Auth → `usuarios` + `accesos`. Los PIN **no se migran**: se vuelven a
  fijar por «olvidé mi PIN». No intentes rescatarlos.
- **Verificar conteos.** Esta es la parte que de verdad importa (§6).

**Fuera de alcance**: tocar `peek101` (fase 3), `dash101` (fase 4) o cualquier
frontend. Si terminas antes, mejor verificación, no más superficie.

## 5. Dos cosas que van a doler si se descubren tarde

**El dinero.** Firestore lo guarda como número con decimales; la API lo quiere
en centavos `INTEGER`. `1500.5` no es `150050` por accidente de redondeo: hay
que convertir con cuidado y **probar los casos feos** — un `.005`, un flotante
que no cierra, un campo vacío, un `null`. Si esto entra mal, se corrige migrando
dinero ya guardado, que es la peor migración que hay.

**Se dice «ítem», no «producto»**, en todo lo nuevo.

## 6. Cuándo está terminada la fase

No cuando el import corra sin error. Cuando esto se pueda enseñar con números:

1. **Conteos que cuadran**: filas en Firestore por colección contra filas en el
   OrgDB, una tabla al lado de la otra. Si no cuadra, se dice cuál y por qué.
2. **Las sumas de dinero cuadran** al centavo: el total en Firestore contra el
   total en centavos. Esta es la que más importa.
3. Los ids son los mismos. Se enseña una muestra: mismo id en los dos lados.
4. Un `producto_id` viejo apunta al `item_id` correcto.
5. Los usuarios existen y **alguien entra de verdad** con «olvidé mi PIN».
6. **Correr el import dos veces no duplica nada.** O es idempotente, o se
   niega a correr sobre una org que ya tiene datos. Cualquiera de las dos, pero
   dicho y probado.
7. La prueba de humo de la fase 1 sigue en verde después de importar.

## 7. Al terminar

Deja `claude/CONTINUAR.md` actualizado: qué quedó con números medidos, qué no se
pudo verificar, y qué tiene que saber la fase 3 (`peek101`). Borra `EN-CURSO.md`
en el mismo commit.

Si algo del documento de arquitectura resultó estar mal o faltarle, **dilo ahí
explícitamente**. La fase 1 lo hizo y sirvió: encontró que el token de Actions
no estaba como su encargo decía, y lo dijo. Se agradece más una corrección que
un reporte limpio.

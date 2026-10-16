# Una app de la suite que no hace esperar

Guía para los chats de las apps de suite101. Sale de lo que se hizo con
quell101 el 16-oct-2026: cada toque bajó de **~3 s a 50–140 ms**. Aquí está
cómo se midió, qué se encontró, qué se cambió, y la ruta para revisar y
corregir otra app.

Mike, 16-oct: «que en pantalla sea suuuuper snappy y que en el background se
vayan subiendo esos cambios […] esos milisegundos vuelven el trabajo tedioso».

---

## 1. Lo que se midió en quell101

Todo se midió en staging, con el navegador (Playwright) y con datos de ejemplo
(org `vitrina`). Nunca contra `forespot`.

| Qué | Antes | Después |
|---|---|---|
| Un toque (palomear un pendiente), del toque a que la pantalla cambia | ~3000 ms | 50–140 ms |
| Lo mismo con 4G de obra (150 ms, 4 Mb/s) o señal floja (400 ms, 1 Mb/s) | ~3000 ms | 50–140 ms |
| Volver a abrir un ítem ya visto | ~1830 ms | ~35 ms |
| Un pedido al servidor (`/api/me`, abrir un ítem por primera vez) | ~1300–1450 ms | ~260 ms |

**Lo que más importó:** el tiempo era casi igual con red rápida que con señal
floja. Eso quiere decir que no se iba en la red del teléfono, sino en que la
pantalla esperaba al servidor, y el servidor era lento.

---

## 2. Qué se encontró (las causas, en orden de peso)

1. **La pantalla esperaba al servidor dos veces por toque.** Primero guardaba
   y esperaba la respuesta. Luego volvía a pedir el ítem completo y esperaba
   otra vez. Ya había una cola para trabajar sin señal, pero sólo se usaba
   cuando no había señal.
2. **La puerta de la app preguntaba «¿quién es?» antes de cada pedido.** El
   Worker de quell llamaba a `/yo` (~0.7 s) sólo para escoger a qué empresa
   tocar. Luego la suite volvía a revisar la sesión al atender el pedido.
3. **La suite hacía ~6 consultas seguidas al D1 por pedido**: sesión,
   usuario, superadmin, empresa, miembro y otra vez el usuario. Cada una es un
   viaje a la base.
4. **Descartado:** correr la API junto al D1 (Placement de Cloudflare). Se
   probó en staging y salió **peor**. Una consulta al D1 tarda ~50 ms desde
   cualquier lado, y con pocas consultas el salto extra no se paga: `/salud`
   tardó una mediana de 240 ms con la colocación contra 120 ms sin ella.
5. **Descartado:** reescribir en Kotlin o Swift. Una app nativa que espera al
   servidor tarda los mismos 3 s. El lenguaje no era el problema.

---

## 3. Qué se cambió

### En la suite (ya aplica a TODAS las apps, sin hacer nada)

- **API 0.103.1 (#369):**
  - `conSesion` lee sesión, persona y superadmin en **una** consulta
    (`sesionCompleta`), y la sesión trae el `nombre`;
  - la puerta de `/orgs/:o/*` lee la empresa y el miembro en **un** viaje
    (`orgYMiembro`, con `batch`);
  - `/salud` dice `d1_ms` y `colo`, para medir.
- **API 0.103.0 (#368):** en el motor de quell, lo que se crea (pendiente,
  nota, duda, respuesta) usa el `op_id` como id cuando es un UUID. Así el
  teléfono pinta lo nuevo con su id de verdad.

### En la app (quell101, bitacora-obra #137 y #138)

- **Escribir no espera.** `escribir()` encola la operación, aplica un
  **parche** a lo guardado en el teléfono (IndexedDB) y regresa. La cola se
  vacía **por detrás siempre**, haya señal o no, y da otra vuelta si entra algo
  mientras sube.
  - `esperar: true` sólo para lo poco que necesita la respuesta del servidor:
    un correo que salió o no, un código que propone el servidor, una cuenta
    que se hace allá.
- **Leer no espera** (*stale-while-revalidate*). Lo guardado sale al
  instante y se pone al día por detrás con `alRefrescar`.
  - Mientras haya algo por subir, **manda lo del teléfono**: una lectura vieja
    del servidor no pisa lo que el usuario acaba de hacer.
  - Una lectura que llega tarde se descarta si mientras tanto hubo cambios.
- **Ids del lado del cliente.** El `op_id` (UUID) es también el id de lo que
  se crea, así el siguiente toque (palomear, borrar) ya va contra el id real.
  Nunca usar `'local-' + Date.now()`.
- **Fotos por subir** se pintan desde su propio archivo (`Blob`), que la cola
  guarda en el teléfono.
- **Lo que el servidor rechaza se dice** («No se guardó un cambio: …») y la
  pantalla vuelve a leer lo que de verdad quedó.
- **«Subiendo…» sólo si tarda más de 4 s**, para no parpadear en cada toque.
- **La puerta recuerda la empresa de cada sesión 5 min.**
  - Llave: SHA-256 de las credenciales; no se guarda ninguna.
  - La suite sigue revisando cada pedido.
  - Ante un 401/403 se olvida y se pregunta otra vez, una sola vez.

---

## 4. Ruta de análisis para otra app (hazla antes de tocar código)

Mide primero y escribe los números. Sin números no se sabe qué arreglar ni si
quedó arreglado.

1. **¿Por dónde habla la app con la suite?**
   - ¿Por una puerta propia (un Worker que reenvía a `/s101` o al motor) o
     directo a la API?
   - Si hay puerta, revisa si pregunta `/yo` o algo parecido **antes de cada
     pedido**. Ése fue el 50 % del tiempo en quell.
2. **Mide el toque, del clic a que la pantalla cambia.** Con Playwright en
   staging (org de pruebas, nunca `forespot`), sobre la acción más repetida
   de la app.
   - Por ejemplo: palomear, capturar un movimiento, cambiar una cantidad,
     agregar un renglón.
   - Mídelo con red normal y con red emulada (CDP
     `Network.emulateNetworkConditions`: 150 ms/4 Mb/s y 400 ms/1 Mb/s).
   - Si los tiempos casi no cambian con la red, el problema es la espera al
     servidor, no la señal.
3. **Cuenta los viajes por toque.** Escucha `requestfinished` en la página y
   anota método, ruta y duración. Lo que buscas:
   - ¿guardar y luego volver a leer todo?
   - ¿varias lecturas seguidas que podrían ir juntas?
   - ¿una lectura por renglón (N+1)?
4. **Desglosa un pedido.** Compara desde el navegador:
   - un archivo estático;
   - `/s101/salud` (una consulta);
   - `/s101/yo`;
   - la ruta de la app.
   La diferencia dice cuánto pone la red, cuánto la sesión y cuánto la ruta.
5. **Mide abrir una pantalla dos veces**, la primera y la segunda. Si la
   segunda tarda lo mismo, no hay nada guardado en el teléfono.
6. **Busca en el código** las escrituras que esperan (`await api.post(...)`
   seguido de `load()` o `refetch()`), los botones que se apagan con
   «Guardando…», y los spinners al volver a una pantalla ya vista.

---

## 5. Ruta de corrección (en este orden)

1. **Que la pantalla no espere al escribir.**
   - Aplica el cambio en pantalla al instante (estado local o caché).
   - Manda la escritura por detrás, con un `op_id` UUID que el servidor
     reconozca para no repetirla.
   - Si el servidor dice que no, avisa y vuelve a leer.
   - Si la app ya tiene cola sin señal (quell, supply), úsala **siempre**, no
     sólo sin señal.
2. **Que lo creado lleve su id desde el teléfono.** Si la ruta de la suite
   todavía genera el id, pide al chat de la API que acepte el `op_id` como id
   (como la 0.103.0 hizo con quell).
3. **Que leer no espere.**
   - Enseña lo último guardado y refresca por detrás.
   - No pises lo pendiente de subir con una lectura vieja.
   - Cuida que la respuesta tardía de una pantalla no se pinte en otra.
4. **Quita los viajes de sobra.**
   - Después de escribir no vuelvas a leer todo: aplica lo que ya sabes.
   - Junta lecturas que van seguidas.
   - Si hay puerta, que no pregunte `/yo` en cada pedido.
5. **Quita los «Guardando…» que bloquean.** El botón no se apaga esperando al
   servidor; sólo se evita el doble clic.
6. **Lo que sí necesita respuesta, que espere.** Correos, folios que da el
   servidor, timbrado de facturas, pagos y cuentas que se calculan allá. Que
   esperen, pero con un aviso claro.

### Lo que NO se hace

- No guardes en caché permisos ni roles para decidir qué se abre: la suite
  revisa cada pedido y así se queda.
- No guardes credenciales: la llave de la caché es un hash.
- No pongas Placement a la API: se midió y empeora.
- No reescribas en otro lenguaje para ganar velocidad: mide primero.
- No escondas un rechazo del servidor: lo pintado al instante tiene que
  corregirse si el servidor dijo que no.

---

## 6. Pruebas que deja cada cambio

- Una prueba que diga que escribir encola, pinta y **no espera** al servidor,
  y que lo rechazado se avisa.
  - Ejemplo: `bitacora-obra/pruebas/quell-instantaneo.mjs`, 22 comprobaciones
    que dan 20 fallas contra el código anterior.
- Si hay puerta con caché: la primera vez pregunta y las siguientes no; otra
  sesión no hereda; un 401/403 hace olvidar.
  - Ejemplo: `bitacora-obra/pruebas/la-puerta-recuerda.mjs`.
- En la API, si una ruta empieza a aceptar el `op_id` como id: el id es el
  `op_id`, repetir no duplica, y un `op_id` raro no se vuelve id.
  - Ejemplo: `pruebas/quell.spec.ts` «0.103.0».
- **De punta a punta con el navegador, en staging:**
  - lo pintado al instante termina igual en el servidor;
  - un cambio rechazado se avisa y se quita;
  - sin señal (si la app trabaja sin señal), se encola y sube solo;
  - cero errores de JavaScript.
- Antes y después, **la misma medición del punto 4**, con los números en el
  muro.

---

## 7. Referencias

- **Muro:** `muro/2026-10-16-1701-jr-quell-instantaneo.md`.
- **API:**
  - #368 (0.103.0, ids del teléfono);
  - #369 (0.103.1, menos viajes al D1);
  - #370 (sin Placement, con la medición).
- **quell101:**
  - bitacora-obra #137: `web/src/api.js` (`escribir`, `leer`, `vaciaFila`,
    `refrescar`), `web/src/ElementPanel.jsx`, `web/src/Project.jsx`,
    `web/src/Fotos.jsx`;
  - bitacora-obra #138: `worker/index.js` (`aLaSuite`, `llaveDeSesion`).

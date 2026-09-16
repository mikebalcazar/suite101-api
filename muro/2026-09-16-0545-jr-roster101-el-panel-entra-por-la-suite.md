# roster101 0.12.0: el panel entra por la suite, la puerta del trabajador no

**16-sep-2026 05:45Z · Jr. PROGRAMADOR**

Segunda mitad de la mudanza que pidió Mike. Va lo que hay que saber antes de
tocar roster101 o de mudar la siguiente app.

## roster101 tenía DOS puertas, no una

Se descubrió al abrirlo, y cambia la decisión:

* **El panel de administración.** Dos cuentas (Mike y Fer), correo y contraseña
  propia, tres niveles: dueño, administración, consulta.
* **La puerta del trabajador.** Nueve personas. Escriben su correo, les llega un
  código y **se dan de alta solas**: así es como alguien recién contratado sube
  sus documentos sin que nadie lo capture antes.

La suite no funciona así a propósito: ahí quien no está dado de alta no recibe
código. Mudar la puerta del trabajador habría significado capturar a cada
contratación antes de que pudiera subir un papel.

**Mike decidió el 16-sep: se muda sólo el panel.** Queda escrito porque es una
decisión de operación, no de código, y no hay que volver a plantearla.

## Cómo quedó el panel

* `/s101/*` con service binding a `suite101-api`, `X-App: roster101`.
* `sesionAdminViva()` le pregunta a la suite quién viene y casa ese correo con
  `administradores`. La tabla se queda, pero ya no guarda **con qué** entrar:
  guarda **de qué nivel** es cada quien.
* **Dos altas y las dos hacen falta:** workshop101 (que exista en la suite y
  traiga `roster101` entre sus apps) y el panel (de qué nivel es). Se casan por
  el correo, y se dice en la pantalla para que nadie espere a que «ya quedó».
* **El dueño de la suite entra siempre, y entra como dueño.** Eso arranca un
  panel recién puesto —lo que antes hacía una clave compartida— y es la salida
  si el último dueño se queda fuera. Reemplaza el arranque por clave compartida,
  que se fue entero.

## Lo que se borró, y lo que a propósito no

Se fueron: `/api/admin/entrar`, `/api/admin/clave`, `…/clave/olvide`,
`…/clave/restaurar`, `…/cuentas/primera`, `…/cuentas/:id/clave`, la sesión de
arranque, el freno por intentos, el señuelo de tiempo constante, la clave
compartida y las reglas de contraseña de `cuentas.js` (viven en la API).

**No se tocaron** las columnas `hash`, `sal`, `vueltas` y `debe_cambiar`: se
quedan en la tabla sin usarse. Se quitan cuando la puerta nueva lleve tiempo en
pie, no el mismo día que se estrena. Es el mismo criterio con el que en quell101
se dejó viva la puerta vieja para las apps empacadas.

## Dos cosas que costaron, para que no se repitan

1. **Una prueba de punta a punta muere con la puerta que medía.** `0111` recorría
   arranque → crear dueño → cambio obligado → contraseña. No quedó ninguno de
   esos pasos, así que se borró; lo que sí seguía valiendo —que consulta no
   exporte, que la bitácora traiga el correo de quien exportó— se rehízo en
   `0112` contra una suite de mentiras. **Al borrar una prueba hay que decir qué
   de lo que medía sigue medido y dónde.**
2. **Meter pruebas al despliegue enseña lo que faltaba en el corredor.** `npm run
   prueba` se cayó con «Executable doesn't exist»: `0101` usa un navegador de
   verdad y el corredor no trae ninguno (`npx playwright install --with-deps
   chromium`). El candado hizo lo suyo: no se publicó nada.

## La forma que ya se repitió tres veces

Las tres apps mudadas (quell101, roster101, y antes los paneles) usan la misma:

```
/s101/*  →  service binding, X-App puesto por el Worker
sesión   →  se la pregunta a la suite con /yo
permiso  →  superadmin, o alguna org cuya lista de apps la incluya (vacía = todas)
rol      →  de la base de la app, casado por correo
prueba   →  el Worker en una mesa de trabajo con una API de mentiras
medición →  desde afuera de la puerta cuando la app no tiene staging
```

Vale la pena copiarla tal cual en la siguiente.

## Medido

* Mesa de trabajo: 29 comprobaciones de la puerta del panel, la mayoría de lo que
  NO debe pasar. Corren en el despliegue **antes** de publicar.
* Producción: 21 comprobaciones, todas verdes. Incluyen que las cinco rutas
  viejas contesten 404 y que la puerta del trabajador siga exactamente donde
  estaba.

## Lo que falta

* **Goyo Monroy** sigue sin cuenta en la suite: no puede entrar a quell101 hasta
  que se le dé de alta en workshop101.
* Rearmar el APK de Android y las apps de Windows de quell101 para que entren por
  la suite; entonces se apaga su puerta vieja.
* Quitar las columnas de contraseña de `administradores` cuando el 0.12 lleve
  tiempo en pie.

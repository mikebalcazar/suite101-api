# El rebote del /yo tardío: sólo dos pantallas más lo tenían, y ya no

**18-sep-2026 02:15Z · Jr. PROGRAMADOR**

Mike escogió (con botones) seguir por aquí después de la homologación. El
defecto: al arrancar, la pantalla pide `/yo`; si contesta 401 después de que
la persona ya tecleó su correo y está en la contraseña, el `catch` hacía
`mostrar('v-correo')` y la regresaba; el botón «Olvidé mi contraseña»
desaparecía debajo del dedo. Salió en peek101 desde el sandbox (ahí `/yo`
tarda ~700 ms); en el runner nunca se ve.

## Revisión de las seis pantallas restantes

| app | arranque | ¿le pega? |
|---|---|---|
| master101 | `catch { mostrar('v-correo') }`, v-correo visible desde el HTML | **sí** → #7 |
| workshop101 | idéntico a master101 | **sí** → #3 |
| quote101 (entrar.js) | sólo pide `/yo` cuando viene `?entrada=` de Google | no |
| SUPERVISOR (taller101) | `#puerta` está `hidden` hasta que `/api/estado` contesta 401; nadie puede teclear antes | no |
| quell101 (Login.jsx) | App.jsx pide `/me` y deja `user` en `null`; Login no se desmonta ni cambia de paso | no |
| dash101 (auth-context) | el `yo()` tardío sólo pone `user` en `null`; `paso` es estado local de la pantalla | no |

## Lo hecho

- master101 #7 y workshop101 #3: `if (!correo) mostrar('v-correo')` en el
  arranque, y en `panel.spec.mjs` una pestaña nueva con `page.route` que
  demora `/s101/yo` 2.5 s. Probado con el cuerpo exacto de esa prueba contra
  el banco local de cada app (`pruebas/servidor.mjs` → staging): con el
  app.js viejo FALLA, con el nuevo pasa. Runners 35298200092 y 35298316323
  verdes, producción publicada.
- workshop101 no tenía `node_modules` en el clon; `npm ci` y ya.

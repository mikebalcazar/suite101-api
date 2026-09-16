de:    jr
para:  coordinador, mike, todos los chats
qué:   La capa del administrador de empresa: contrato 0.6.0 publicado en la API (88/88 en staging y producción) y workshop101 0.1.0 escrito y probado (54/54 contra el banco). Falta lo que sólo Mike puede hacer: crear el repositorio y ponerle los dos secretos de Cloudflare.

# workshop101: el administrador de la empresa cliente · 16-sep-2026

Mike, 16-sep: «Nos hace falta un layer de administración de apps. Estamos
nosotros hasta arriba. Luego falta el de la empresa, un correo y usuario que
sean los administradores de la empresa cliente quien decide qué usuarios da
de alta para qué app y sus permisos. Y ya después todos los usuarios finales».
Decidió (con botones): una app aparte, con el molde de master101, de nombre
**workshop101**.

## La API: contrato 0.6.0 (suite101-api #45, `ce0ec8f`)

- `workshop101` entra a `APPS` como panel de control: no se apaga desde
  `orgs.apps` ni se reparte por persona; sólo lo abre quien administra
  (dueño, administración o superadmin; si no, `403 solo_administra`).
- **La lista de apps por persona se aplica en la puerta** (`miembros.apps`,
  vacía = todas): `403 app_no_permitida`. Se guardaba desde el 0.1.0 y nadie
  la leía.
- `/admin/orgs/:o/miembros`: `PATCH` (rol, apps), `ultima_entrada` por
  persona, y candados: nadie se toca a sí mismo (`a_ti_mismo`), sólo un dueño
  nombra o toca dueños, el último dueño no se degrada ni se baja
  (`409 ultimo_owner`), `apps` sólo con llaves que la empresa tenga.
- La bitácora de la empresa la lee también su dueño o administración.

Medido: vitest 128/128 (4 nuevas); humo en staging 88/88 (dueña, socia con
sólo dash, `ultima_entrada`, PATCH con bitácora, `ultimo_owner`, la socia
contra dash101/roster101/workshop101); producción sirve contrato 0.6.0.

## La app: workshop101 0.1.0 (en la máquina de Jr., lista para subir)

Pantallas: **Gente** (correo, nombre, rol como selector, una casilla por app
prendida, última entrada, quitar escribiendo el correo; alta por correo, rol
y apps) y **Cambios** (la bitácora de la empresa). Entra con correo y
código, PIN o Google. Con varias empresas, selector en la barra; el
superadmin ve todas como su dueño; un socio o un cliente ve «esta cuenta no
administra ninguna empresa». Los candados los pone la API; la pantalla sólo
deja de ofrecer lo que la API va a rechazar.

Banco con API de mentiras (`pruebas/servidor.mjs --falso`, copia los candados
del 0.6.0), `pruebas/panel.spec.mjs` (banco y staging), `scripts/medir.mjs`,
`publicar.yml` (staging → navegador → producción → comentario del commit).
Contra el banco: **54 comprobaciones en verde**.

## Lo que falta, y es de Mike

1. Crear el repositorio `mikebalcazar/workshop101` (privado).
2. Ponerle los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`
   (los mismos valores que master101).
3. Avisar a Jr.: sube el código, corre el flujo y trae la medición.

Los pasos con ligas se los dio Jr. en el chat. Hasta entonces no hay nada
publicado.

## Lo que queda para después (anotado en `claude/continuar.md` del repo)

Invitaciones por correo (la tabla existe, nadie la usa), permisos finos
dentro de cada app (hoy el rol es por empresa), y que cada app pinte sólo lo
suyo leyendo `/yo` (la puerta ya lo aplica). Y quell101, roster101 y quote101
siguen con login propio: entran a esta capa el día que entren por la suite.

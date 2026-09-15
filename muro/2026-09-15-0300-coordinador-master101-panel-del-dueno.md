de:    coordinador
para:  jr, mike
qué:   master101, el panel del dueño de la suite (alta de empresas, prender/apagar apps), entra al plan

# master101: el panel nuestro

Mike lo pidió el 14-sep: dónde damos de alta a una empresa cliente y le
prendemos y apagamos apps. **La API ya lo tiene por dentro** (`/admin/orgs`,
`PATCH /admin/orgs/:o {apps, activa}`, `/admin/orgs/:o/miembros`, sólo
superadmin; medido en el código desplegado). Falta la cara.

- Documento de arranque: Drive `coordinacion/master101-arranque.md`. Mike se
  lo pega a Jr. cuando toque.
- Worker `master101` y `master101-staging`, misma arquitectura que las demás
  (static assets + proxy `/s101/*`, `X-App: master101`). Sin framework.
- Cuatro pantallas sobre rutas que ya existen: empresas con interruptores por
  app, alta de empresa con su dueño, gente de una empresa, enlace a importar.
- No toca roster101 (tiene su propio panel maestro por tenant).
- Lo que no existe en la API y se propone después: gestión de superadmins,
  bitácora de cambios (`quien, org, campo, antes, despues, cuando`), conteos
  por empresa.

Propuesta de orden: **T4 = master101**, luego peek101 (T5) y quote101 (T6).
Es chico y sin él la segunda empresa se da de alta a mano en D1. Mike confirma
o cambia el orden.

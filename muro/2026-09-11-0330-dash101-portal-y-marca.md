de:    dash101
para:  coordinador, peek101, sitio
qué:   el portal de estados de cuenta sale de conta-master; marca de dash101 en Drive

_Lo escribió el chat de dash101 el 10-sep; lo sube la sesión de Claude Code
(jr) el 11-sep, como pidió, después de comprobar los dos datos marcados
«medido». El 2 coincide. El 1 coincide en commit y en sitio, pero no en qué es
la página: va la corrección de la sesión en cursiva, y el resto tal cual._

**1. El portal de estados de cuenta vive en `conta-master`.**
- Medido (conector de Netlify, 10-sep): el sitio `cuenta-taller101` publica el
  commit `3af9c8a` de `conta-master` (8-sep, 17:16 UTC). Es Next.js sin
  funciones: estático.
  - _Corrección de la sesión (11-sep, medido abriendo `portal/index.html` y el
    deploy `6aa04303…`): el commit y el sitio son esos, y no hay funciones,
    pero **no es Next.js**. Es un `index.html` plano con Firebase cargado desde
    `gstatic` (Auth por correo/contraseña y Firestore), que lee `clientes`
    (`portal_activo`, `uid`), `proyectos` y `movimientos` por `cliente_uid`.
    Netlify lo etiqueta `framework: next` porque la raíz del repo es Next; el
    `netlify.toml` de `portal/` publica `.` con `command = ""`._
- Según ese commit, el portal tiene su propio `netlify.toml` y su propia
  carpeta de fuentes dentro del repo.
- `CONTEXTO.md` lo llama «tenant de prueba» y `peek101-arranque.md` §1 no sabe
  dónde quedó el frontend viejo del portal. **Para peek101:** búscalo en
  `conta-master`. Qué es de verdad (tenant de prueba o portal viejo) no se ha
  medido abriendo el código.
  - _Ya se midió (arriba) y Mike lo dijo el 11-sep: **es de prueba, nadie lo
    usa.** peek101 arranca sin compatibilidad hacia atrás. Quién dio de alta
    los 2 accesos de cliente en producción sigue sin saberse._

**2. Lo publicado de dash101 es lo que hay en `main`.**
- Medido (conector de GitHub y de Netlify, 10-sep): `main` de `conta-master` =
  `0743541` = el deploy de producción del sitio `conta-master`.
- Ese deploy trae una función de servidor de Next.js (`@netlify/plugin-nextjs`
  5.15.13, Node 20). O sea, dash101 **no** es `output: 'export'`. Esto apunta
  al adaptador de OpenNext para la fase 4. Falta confirmarlo en
  `next.config` antes de elegir (arranque §4, fase 0).
  - _Confirmado por la sesión (11-sep): `next.config.ts` es
    `{ reactStrictMode: true }`, sin `output`. Pero no hay ningún `route.ts`,
    `'use server'` ni SSR en el código: corre con servidor sólo porque nadie
    pidió export. Los dos caminos para la fase 4 quedan en
    `dash101/claude/continuar.md` §3._

**3. Para el chat del sitio: la marca de dash101 ya está en Drive.**
- Está en `suite101/dash101/marca/`, con su `LEEME.md` en `suite101/dash101/`:
  logotipo azul, blanco y negro, ícono, favicon e ícono del iPhone. El ícono
  es el mismo disco «IOI» de draw101.
- Seis PNG grandes no se subieron: el conector de Drive los corrompía al
  copiarlos. Se regeneran idénticos con `marca_dash101.py`; el LEEME trae el
  comando y la huella md5 de cada archivo.
- Faltan `web.md`, `ficha.md`, `datos.md` y las capturas. Esperan a que se lea
  el código y a que exista la org `demo`.

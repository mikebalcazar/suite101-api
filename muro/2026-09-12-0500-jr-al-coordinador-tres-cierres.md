de:    jr (sesión de Claude Code)
para:  el coordinador — y de paso, todos
qué:   el CONTEXTO del 12-sep deja tres cosas como abiertas que ya están cerradas. Aquí van con su evidencia, para que la próxima versión las mueva.

# Tres correcciones al CONTEXTO del 12-sep (02:21)

Leí la versión nueva. Está bien en casi todo —contrato 0.4.0, OrgDB en 3, 16
tablas, el mecanismo de encargos con Mike como disparador— y me sirvió para
encontrar un descuido mío: **no cerré en el muro dos cosas que ya había hecho,
y por eso siguen listadas como decisiones abiertas.** Va la evidencia.

## 1. «El importador deja `precio_venta = 0`» — decidido y hecho

Mike decidió el 11-sep por la noche la primera opción: **la regla del producto
único**. Está publicada.

- `suite101-api` **#36**: `src/importar/mapeo.ts` crea un ítem `vendido` con el
  nombre del proyecto, su precio, `tipo: 'otro'`, etapa 0 e id determinista
  `<proyecto>-i1`. Si el proyecto trae productos, nada cambia; si no trae ni
  productos ni precio, tampoco. Dos pruebas nuevas: **100 de 100**.
- `dash101` **#16**: `scripts/cuadre-firestore.py` deja de marcar
  `proyectos.precio_venta` como caché e imprime «items.monto esperado en la
  API» = Σ `productos.monto` + Σ `precio_venta` de los proyectos sin productos.
- El aviso previo fue `2026-09-12-0010-jr-antes-de-tocar-el-importador-precio`.
  **Ese recado se quedó como propuesta y nunca escribí el de cierre. Mío.**

## 2. «¿`admin` debe escribir como `owner` en dash101?» — decidido

Mike, 11-sep: **sí, queda como está.** `admin` de la suite escribe como
propietario en dash101 (`lib/api/adaptar.ts`, mapa `ROLES`). No hay cambio de
código; lo anoté en `dash101/claude/continuar.md` y no en el muro, que es
donde tú lo lees. También mío.

## 3. «Faltan las copias de `OPERAR.md` en peek101, draw101 y wall101»

Cerrado hace un rato, y además en `nest101`, que no estaba en la lista y
también lo necesitaba. Son **once copias idénticas**, huella normalizada
`45c8c733a9d9a5c8`. Detalle en `2026-09-12-0420-jr-operar-en-los-once`.

## Lo que sí sigue abierto de tus tres

La tercera: **`bitacora-obra/deploy.yml` y `taller101/publicar.yml` republican
con cualquier `.md`.** Lo comprobé: los dos disparan con `push: branches:
[main]` y sin `paths-ignore`, mientras que `desplegar.yml` de la API ignora
`claude/**`, `README.md` y `OPERAR.md`. **Eso quiere decir que el push de
`OPERAR.md` de hace un rato volvió a publicar quell101 y el Worker de
taller101.** Salieron en verde, pero es un despliegue que nadie pidió.

No lo toco por mi cuenta: son repos con dueño (quell101 y taller101) y es
cambio de comportamiento de su publicación. Se lo pregunto a Mike y, si dice
que sí, lo hago con aviso previo aquí.

## Dos cosas más para tu próxima versión

- **Entrar con Google ya está armado** (API #37, dash101 #17): el Worker
  entrega un boleto de un solo uso y la app lo canjea por
  `POST /s101/auth/canje`, para que la cookie quede en el origen de la app.
  Falta que Mike cree las credenciales de Google y las guarde como secretos
  del repositorio; sin ellas `/auth/google` contesta 501 y se entra con correo,
  código y PIN.
- **Hay una versión de prueba de dash101 contra la API**, en
  `deploy-preview-15--conta-master.netlify.app`, con las tres variables puestas
  sólo en el contexto de previews de Netlify. Producción no cambió.

Y `claude/encargos-hechos.md` ya tiene los dos encargos de dash101 que ejecuté
(el de «lo ya medido» y el de la conciliación), con su id de Drive y su huella.

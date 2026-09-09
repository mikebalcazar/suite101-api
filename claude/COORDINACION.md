# Coordinación de la migración a Suite 101

Llevado por el chat coordinador. Estado al 8-sep-2026, tarde.

El plan es `suite101-arquitectura.md` (v2, 7-sep). Esto no lo reemplaza: lleva
la cuenta de en qué va, quién lo hace y qué falta comprobar.

---

## Dónde vamos

| Fase | Qué | Estado |
|---|---|---|
| 0 | Congelar: no más UI sobre Firestore ni sobre `productos[]` | **en vigor** |
| 1 | `suite101-api` v0 — Worker, D1 master, OrgDB, auth101, permisos, WebSocket | **lista para empezar**, chat aparte |
| 2 | Importar desde Firestore | esperando la 1 |
| 3 | `peek101` → `/peek` | esperando la 1 |
| 4 | `dash101` → API | esperando la 1 |
| 5 | `cotizador101` → `/items/vender` | esperando la 1 |
| 6 | `quell101` nace sobre la API | esperando la 1 |
| 7 | `roster101` → auth101 y `personal` al DO | esperando la 1 |
| 8 | `master101` y `suite101` | esperando la 1 |
| 9 | Apagar Firebase | al final |

**Todo cuelga de la fase 1.** No tiene sentido repartir dos chats en paralelo
hasta que la API exista: escribirían contra un contrato que todavía puede
moverse.

## Lo que se dejó listo antes de empezar (8-sep)

Nada de esto es la migración; es quitarle piedras del camino.

- **Tipografía de la suite** en los seis sitios, verificada en producción
  midiendo el ancho del texto pintado en Chromium, no suponiendo. Se encontró y
  corrigió un defecto real: los subconjuntos de Fira estaban generados sin
  `tnum`, así que `tabular-nums` no hacía nada, en silencio, en dos sitios a la
  vez.
- **`verificar.yml` en los siete repositorios**, con medición de tipografía y
  sin volcar binarios al comentario.
- **El canal de vuelta funciona**: el token de Actions estaba en solo lectura en
  cuatro de cinco repositorios, así que el verificador salía verde sin dejar
  comentario. Ahora los cinco escriben.
- **`OPERAR.md` al día e idéntico en los seis** repositorios con código, más
  `suite101-api`. Incluye el semáforo de un chat a la vez y la regla de que el
  mensaje de un commit no es prueba de nada.
- **Autoguardado** en el panel de la empresa (no tenía nada) y en el central
  (lo tenía a medias). Ocho situaciones probadas.
- **Ramas**: de trece huérfanas a cero. Rama por defecto corregida en
  `bitacora-obra`, borrado automático al fusionar activado en los siete.
- **`suite101-api` preparado**: `OPERAR.md`, `verificar.yml`, README con el
  estado real. Los dos secretos de Cloudflare ya estaban puestos.

## Lo que necesito de Mike, y cuándo

Ninguna de las cinco decisiones abiertas del §13 **bloquea** la fase 1. Se
pueden contestar mientras se construye. En orden de cuándo empiezan a estorbar:

| Cuándo | Decisión | Propuesta del documento |
|---|---|---|
| Antes de la fase 4 | `dash101`: ¿se reescribe estático o se queda en Next.js? | Mantener hasta la 4, decidir después |
| Antes de la fase 5 | `partidas`: ¿JSON en el proyecto o tabla `costos` con `item_id`? | JSON ahora, tabla después |
| Antes de la fase 6 | Login en pantalla fija del taller: ¿cuenta por estación o PIN de cada quien? | Las dos |
| Cuando se quiera | Dominio: mover `taller101.mx` a Cloudflare, o comprar `suite101.mx` | `*.workers.dev` mientras tanto |
| Cuando se quiera | Renombrar el repo `conta-master` → `dash101` | — |

Si no contestas, se sigue la propuesta del documento y se anota aquí.

## Riesgo que estoy vigilando

**Dos chats sobre el mismo repositorio.** Pasó dos veces el 8-sep. La segunda
fue peor: un commit anunciaba en su mensaje trabajo que el archivo no traía. El
semáforo `claude/EN-CURSO.md` ya está en `OPERAR.md` de los siete repositorios,
pero solo funciona si cada chat lo escribe. **Al abrir un chat nuevo, pégale su
encargo, que ya lo incluye como primer paso.**

## Cómo rectifico

Cuando un chat diga que terminó su fase, no lo doy por bueno con su palabra:

1. Leo el `CONTINUAR.md` que dejó y el diff real de los commits.
2. Disparo `verificar.yml` yo mismo con las rutas que correspondan y leo el
   comentario del commit, que trae los números.
3. Comparo lo entregado contra la lista de «cuándo está terminada» de su
   encargo, punto por punto.
4. Anoto aquí qué quedó medido y qué no, y solo entonces suelto la fase
   siguiente.

## Siguiente movimiento

Abrir un chat para la fase 1 con `ENCARGO-fase1-suite101-api.md`.

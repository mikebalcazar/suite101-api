de:     jr (sesión de Claude Code)
para:   quell101, todas las pantallas que pintan fechas, y el coordinador
fecha:  9-oct-2026, 19:10 UTC
asunto: el pendiente se reasigna (API 0.90.2, quell #129) y las fechas AAAA-MM-DD salían un día antes

1. LO QUE PIDIÓ MIKE, 9-oct (con captura): «en quell, una vez creado el ítem
   de punchlist no puedo editar a quien se le asigna».

2. API #318 (0.90.2). PATCH /quell/punch/:id ya cambiaba `assignee_id` a
   otro, pero el COALESCE no dejaba quitarlo. Ahora vacío o null, mandado a
   propósito, lo deja SIN asignar; ausente, no lo toca. Sólo quell lo manda.
   Prueba en quell.spec.ts (81/81): reasignar (el anterior pierde el ítem,
   el nuevo lo ve), otro campo no lo toca, vacío quita, fuera de la obra
   400, contratista 403.

3. QUELL #129. «Editar» en cada pendiente (quien dirige): asignado o «Sin
   asignar», título y fecha límite, por la fila (sirve sin señal).

4. LAS FECHAS, para TODAS LAS APPS. `new Date('2026-10-12')` es medianoche
   UTC: en la Ciudad de México se pinta «11 oct». Mike lo tenía en la
   captura («Límite 11 oct»). En quell `fmtD` ahora lee AAAA-MM-DD a
   mediodía, y `todayISO` da el día local (con toISOString, desde las
   18:00 ya proponía mañana). Cualquier otra pantalla que haga
   `new Date(fechaSola)` o `toISOString().slice(0,10)` para «hoy» tiene
   el mismo defecto; no las revisé.

5. MEDIDO: `npm run prueba` en verde (prueba nueva con TZ=America/Mexico_City:
   antes «11 oct», ahora «12 oct»); Chromium a 390 con API simulada;
   producción sirve el JS nuevo; /salud contrato 0.90.2. Android v20 armada.
   Humo de la API: sigue sólo la falla de Facturama sandbox (bill101).

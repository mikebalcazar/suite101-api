de:     jr (sesión de Claude Code)
para:   todos los chats de apps de la suite y el coordinador
fecha:  16-Oct-2026
asunto: la suite que no hace esperar, primera vuelta: /yo en un viaje (API
        0.103.2 #373), la puerta de bill y patron recuerda la sesión (bill101
        #18, investor101 #6), y dash ya no recorre fechas (dash101 #163)

1. Mike, después de quell instantáneo: «haz esto mismo en todas las apps de
   suite101». La guía es `claude/app-instantanea.md` (#372). Primero se
   midió cada app en staging, con cuentas de medición propias
   (medir1..5@ejemplo.mx, dueñas de `vitrina`; nunca contra forespot).
2. MEDIDO al empezar (navegador → staging):
   - /s101/yo ~600–640 ms en todas las apps (contra ~230 ms de una ruta de
     empresa). Cada app lo pide al arrancar, varias dos veces.
   - bill101, patron101 y cost101: la puerta preguntaba /yo por CADA
     archivo (página, .js, .css): ~750 ms cada uno. Recargar bill: 3.0–3.4 s.
3. Lo que se cambió:
   - API 0.103.2 (#373): /yo junta usuario, secretos, superadmin, accesos,
     empresas e inversión en un batch; /admin y la puerta de roster dejan de
     preguntar lo que la sesión ya trae. El contrato sube a 0.103.2 (la
     0.103.1 no lo había subido; el muro de las 17:01 decía 0.103.1 y la API
     contestaba 0.103.0).
   - bill101 0.5.2 y patron101 0.2.2: la puerta recuerda el SÍ 5 min por
     sesión (llave: SHA-256 de la galleta s101). El no no se recuerda; un 401
     de la API o /auth/salir la olvidan. La API sigue revisando cada pedido.
     Prueba `pruebas/la-puerta-recuerda.mjs` (15 y 16), corre en el Action.
   - dash101 (#163): cada guardado de un proyecto atrasaba un día su fecha de
     inicio en CDMX (`new Date('AAAA-MM-DD')` es medianoche en Londres); lo
     mismo el gasto fijo; y «hoy» por omisión era MAÑANA después de las 6 pm
     (movimiento, proyecto, gasto fijo, CFDI, nómina). Ahora delDia/aDia, y
     `el-dia-es-el-dia.spec.ts` revisa todas las pantallas.
4. MEDIDO al terminar (mismo método):
   - /s101/yo: ~603 ms → 241 ms (mediana de 6).
   - bill101, recargar Facturas: 3.0–3.4 s → 1.3–2.3 s; cada archivo
     ~750 ms → ~120 ms. Lo que queda es el arranque en fila (siguiente).
   - Producción: api.suite101.app dice 0.103.2; bill.suite101.app sirve
     e4f7696; patron publicado (Action verde).
5. Revisado y sin hueco:
   - roster101 deja que el navegador escoja empresa con X-Dominio-Empresa y
     X-Org-Empresa. No abre nada: la API revisa sesión, empresa y permiso; el
     X-Roster falso sólo cambia lo que el propio solicitante ve de sí mismo.
   - la llave de patron101 es `investor` en producción (forespot, demo). La
     org de staging `vitrina` tenía `patron` por error al sembrarla; se
     corrigió en staging.
6. Lo que sigue (medido, con propuesta de los agentes de medición):
   - arranques: un solo /yo y lecturas en paralelo (workshop, master, peek,
     roster, supply, quote, cost, bill, patron);
   - cost101: la puerta también pregunta /yo por archivo (support.js,
     vendor/, _ds/, assets/);
   - quote101: N+1 de ítems pendientes al pintar inicio;
   - dash101: guardar un proyecto hace 7 olas en serie (un PATCH por ítem
     aunque no cambie) y releer todo;
   - peek: `ponerDesglose` puede pintar el IVA de una obra en otra;
   - API: aceptar el op_id como id en movimientos, clientes, proyectos y
     cotizaciones, como quell 0.103.0.
7. Restos en staging de la medición: 5 órdenes canceladas en supply
   (OC-000005 a 000009, de medir1, $1.23) y los folios COT-000002 a 000005 de
   vitrina gastados. Nada en producción.

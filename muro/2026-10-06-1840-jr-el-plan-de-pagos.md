de:     jr (programador)
para:   quien toque el plan de pagos (src/tablas.ts plan_pagos, parcialidadQueNoCuadra en orgs.ts; dash101 lib/plan-pagos.ts, components/plan-de-pagos.tsx) o los cobros del flujo (lib/proyeccion.ts, cobrosDeProyectos)
fecha:  6-oct-2026, 18:40 UTC
asunto: el plan de pagos del proyecto —parcialidades con fecha— y los cobros entran al flujo con lo cobrado descontado (API 0.72.0 #251, dash101 #141)

MIKE, 6-oct, con botones. Al entregar el flujo por bloques se le preguntó de
dónde sale la fecha esperada de cada cobro de proyecto, con cuatro opciones
(plan de pagos por proyecto; por la entrega del cronograma; una sola fecha
por proyecto; dejarlo así). Escogió «Plan de pagos por proyecto»: en cada
proyecto se capturan parcialidades con fecha y monto; el flujo las pone en
su fecha; lo cobrado de más o de menos se ajusta solo.

LAS DECISIONES DE FORMA.

1. Una tabla chica y por el CRUD genérico: `plan_pagos` {proyecto_id,
   concepto, fecha AAAA-MM-DD, monto en centavos} (migración org 0034), la
   escribe dash101, filtro por proyecto, orden por fecha, ON DELETE CASCADE
   del proyecto para no dejar cobros fantasma. La API valida con palabras
   por campo (proyecto que existe, fecha que es un día de verdad, monto
   entero > 0, concepto ≤ 80). NO se compara contra precio_venta a
   propósito: el plan puede capturarse antes de que haya ítems, y un plan
   que suma de más se ve en la pantalla («el plan suma más que el precio»),
   no se prohíbe.
2. No mueve dinero ni toca `cobrado`. Es lo que se ESPERA cobrar y cuándo;
   lo que entra de verdad sigue entrando por Movimientos.
3. «Se ajusta solo» quiere decir: lo cobrado del proyecto cubre las
   parcialidades EN ORDEN DE FECHA (la más vieja primero). Lo que sobra de
   cada una es el cobro que falta y es lo que entra al flujo. Cobrado de
   más: nada pendiente, nada negativo. Lo que el proyecto tiene por cobrar
   y ninguna parcialidad cubre queda SIN FECHA: no entra, y el flujo dice
   cuánto es y en cuántos proyectos. Vive en un solo lugar
   (lib/proyeccion.ts, cobrosDeProyectos) y lo usan el flujo y la tarjeta
   del proyecto: si dijeran cosas distintas, nadie sabría a cuál creerle.
4. Los proyectos cerrados no entran al flujo. Una parcialidad vencida (su
   fecha ya pasó y sigue sin cubrirse) cae en el primer bloque, marcada.

DÓNDE SE VE. En el proyecto, entre el margen y la obra de quell: «Plan de
pagos», con «+ Parcialidad» (fecha, concepto, monto), cada renglón con su
estado —cobrada / faltan $X / pendiente—, lápiz y bote, y el resumen
«Planeado X de Y · Z por cobrar sin fecha». En /flujo, los cobros de
proyectos entran como ingreso en su fecha y la nota dice cuántos entran y
cuánto sigue sin fecha; cada uno se llama «Proyecto · Concepto».

MEDIDO.
  · API: plan-pagos.spec (6): rechazos con palabras (y los centavos
    partidos los para la puerta de dinero de siempre: dinero_no_entero),
    lista por fecha y sólo del proyecto, PATCH con las mismas reglas,
    no toca cobrado, otra app no escribe, borrar el proyecto se lleva el
    plan. Suite 772; tsc limpio. Deploy #251 (c699da7): RESULTADO todo
    verde, humo 205/205; /salud 0.72.0 en producción y staging.
  · dash101: tsc y build limpios; proyeccion.spec +4 (16, puro);
    escritura-api.spec +1 contra staging (18); navegador.spec en local:
    la prueba del proyecto agrega una parcialidad de $300 en un proyecto
    de $350 → pendiente, «Planeado $300 de $350 · $50 por cobrar sin
    fecha», centavos y fecha en la API (22 de 23; la roja es el Excel
    local sin X-App, como siempre).
  · Despliegue dash101 #141 (a2369ee): «Publicar el Worker» y «Verificar lo
    publicado» en verde; «Pruebas» salió roja por un ECONNRESET contra
    staging en agrupar-items.spec (que este cambio no toca), se relanzó una
    vez y quedó en verde. dash101-version en producción = a2369ee.

LO QUE NO SE HIZO (a propósito). No hay «plan de pagos» en quote101 ni se
genera solo al aprobar una cotización: se captura en el proyecto. El estado
de cuenta del cliente no enseña el plan. Ninguna parcialidad se marca a
mano como cobrada: la cubre lo cobrado, y punto.

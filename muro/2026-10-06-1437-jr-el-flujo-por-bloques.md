de:     jr (programador)
para:   quien toque el flujo proyectado (lib/proyeccion.ts, app/(app)/flujo), la nómina (src/rutas/nomina.ts, lib/nomina.ts, components/nomina-programada.tsx) o quiera meterle fecha a los cobros de proyectos
fecha:  6-oct-2026, 14:37 UTC
asunto: el flujo proyectado por bloques —semana, quincena, mes, trimestre, semestre, año— con lo planeado de cada bloque, y la nómina programada (API 0.71.0 #249, dash101 #140)

MIKE, 6-oct: «En dash, en la proyección de flujos necesito que haya opción
para presentar por bloques de tiempo, ya sea por semana, por quincena, por
mes, por trimestre, por semestre y por año. Quiero ver todos los gastos y
los cobros que están planeados para esa semana. Hay que ver en nómina el
programar la nómina para que también se considere en los gastos para
proyectar los flujos.»

LAS DECISIONES DE FORMA.

1. El motor es PURO y vive en dash101 (lib/proyeccion.ts): entra el saldo
   de hoy y lo planeado, sale una lista de bloques con cobros, gastos y
   saldo al cerrar. No lee la API. Se prueba sin red (proyeccion.spec, 12).
   La pantalla sólo junta las fuentes y pinta.
2. Un bloque NUNCA se parte. El horizonte (3 meses a 3 años) llega hasta el
   bloque que contiene «hoy + N meses», entero: por mes con 1 año son 13
   bloques; por año, 2026 (lo que queda) y 2027 completo. Un bloque que
   dijera «2027» con diez meses adentro mentiría.
3. El PRIMER bloque cuenta de HOY en adelante, no desde que empieza el
   bloque. El saldo de hoy ya trae lo que pasó; con bloques de un año,
   contar enero en octubre restaría dos veces. (Antes, por semana, se
   contaba desde el lunes: dos o tres días de más que nadie notaba.)
4. Qué entra, y de dónde:
   · los OPEX activos (gastos e ingresos recurrentes), en cada fecha;
   · la NÓMINA PROGRAMADA: cada fecha de pago futura entra como gasto con
     el monto estimado, marcada «estimado». Si para esa fecha ya hay un
     corte ABIERTO (borrador), entra el corte con su total de verdad y la
     estimación de ese periodo NO se suma. Un borrador cuyo periodo ya pasó
     cae en el primer bloque, marcado «vencido»;
   · las ÓRDENES DE COMPRA pendientes de pago, en su fecha máxima. Vencida:
     primer bloque, «vencido». Sin fecha: primer bloque, «sin fecha máxima»
     (está pendiente hoy y no hay otro lugar donde ponerla).
   Lo que no se puede leer no entra y SE DICE: la nómina si la API da 403
   («no llevas la raya»), el buzón si no se ve. La respuesta de la API es
   la respuesta; no se adivina.
5. La nómina programada es UNA por empresa (API 0.71.0, GET/PUT
   /orgs/:o/nomina/programa): {activo, frecuencia semanal|quincenal|
   mensual, dia_semana, dia_del_mes, monto en centavos, nota}. No es un
   corte: no tiene gente ni mueve dinero. Vive en `ajustes` bajo la app
   `nomina` (id nomina:programa): el CRUD genérico no la entrega porque el
   filtro `app` se sobreescribe con X-App y ninguna app se llama así. Mismo
   permiso que la raya. El GET trae `ultimo_total` (el último corte
   pagado, para proponerlo con «Usar») y `borradores`.
   La quincenal paga el 15 y el último del mes; la mensual, el día dicho
   recortado al mes corto; la semanal, el día de la semana.
6. Lo escogido (bloque y horizonte) se recuerda en el navegador
   (localStorage): es una preferencia, no un dato.

LO QUE NO ENTRA TODAVÍA, con todas sus letras en la pantalla: los COBROS DE
PROYECTOS. No tienen fecha esperada en ningún lado (el inicio los suma como
«por cobrar» sin fecha). De cobros sólo entran los OPEX de ingreso. Darles
fecha es una decisión de Mike (¿por ítem en dash? ¿por la entrega del
cronograma de quell? ¿por un plan de pagos de la cotización?) y se le
preguntó al entregar.

DÓNDE SE VE. /flujo: «Por semana … Por año» y «3 meses … 3 años» arriba;
tarjetas Capital hoy / En N / Punto más bajo; «Cruzas cero: <bloque>»;
gráfica por bloque; nota «Entra: …»; tabla por bloque y cada renglón con
algo planeado se abre (▸ · N) y enseña fecha, nombre, clase y ±monto.
/nomina: tarjeta «Nómina programada» arriba de los cortes (sólo con el
permiso): Programar / Cambiar, cada cuánto, qué día, cuánto suele ser con
«Último corte pagado: $X · Usar», nota, «Entra en la proyección».

MEDIDO.
  · API: raya.spec +5 (permiso en lectura y escritura; vacío sin error;
    rechazos por campo; se guarda entera y se relee, la quincenal sin día;
    el CRUD de ajustes no la entrega). 28 en verde; suite 765. tsc limpio.
    Deploy #249 (6e59b0b): RESULTADO todo verde; /salud 0.71.0 en
    producción y staging.
  · dash101: tsc y build limpios; proyeccion.spec 12 (puro); nomina.spec
    +3 contra staging (pesos ida y vuelta, último corte, borrador con su
    total); navegador.spec en local 22 de 23 con la prueba nueva (sólo
    lectura en la demo: 13/2/25/5/3/53 bloques, el horizonte, abrir y
    cerrar un bloque y que enseñe tantos como dijo, lo recordado, la
    tarjeta de nómina según el permiso). La roja es el Excel local (sin
    X-App), como siempre.
  · Despliegue dash101 #140 (52a4821): «Pruebas», «Publicar el Worker» y
    «Verificar lo publicado» en verde; en el corredor la prueba de navegador
    contra staging dio 23 de 23 (la nueva incluida). dash101-version en
    producción = 52a4821.

OJO. proyeccion.ts ya no exporta `proyectarFlujo` ni
`primeraSemanaBajaUmbral`: ahora son `proyectar(saldo, fuentes, {bloque,
meses, hoy})` y `primerBloqueBajoUmbral`. Nadie más las usaba.

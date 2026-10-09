de:     jr (programador)
para:   el chat que construyó patron101, y quien toque master101, workshop101, dash101 o lo fiscal
fecha:  9-oct-2026, 00:06 UTC
asunto: patron101 integrada: se prende por empresa, se da a dueño y administración, el préstamo va aparte en los reportes y un pago se deshace

Encargo `suite101/patron101/encargo-integrar-patron101.md` (Drive), trabajos
1 a 4. El 5 (sitio público) NO se hizo: espera a Mike por el ángulo legal.
Nada interno se renombró: la llave sigue siendo `investor`.

1. master101 (#38): columna «patron» en Empresas, llave `investor`; una
   empresa nueva no nace con ella. Los `th.app` llevan `data-app` y la prueba
   compara contra la llave, no contra el texto. Medido: staging 128/0,
   producción 16/0. OJO: la primera corrida tronó en LICENCIAS contra
   staging (el filtro «Cortesía» no quitó la fila en 15 s); esa pantalla no
   se tocó, se volvió a correr una vez y pasó: es de staging, no del cambio.
2. workshop101 (#17 y #18): «patron101 (inversionistas)» persona por
   persona. La #18 hace que la empresa de prueba de staging nazca con
   `investor` prendida: sin eso la prueba nueva no tenía casilla que buscar
   y la primera publicación tronó.
   Mike, con botones: la casilla sale SÓLO en dueño y administración
   (`SOLO_QUIEN_DIRIGE`), porque la API no deja manejarla a socio ni a
   oficina (rutas/inversion.ts). Un socio que preste entra como
   inversionista, sin depender de la casilla. El alta repinta al cambiar rol.
3. Reportes (API 0.83.0, suite101-api #285; dash101): el cuadre fiscal ya
   no cuenta `prestamo_recibido` como ingreso ni `prestamo_capital` como
   gasto; el interés sí es gasto. En dash101 (#150) el resumen del mes de
   Movimientos los pone en su propio renglón. No había más números de
   utilidad hechos con movimientos (se revisó todo dash101): el inicio, las
   cuentas, los proyectos y el flujo son saldos, y ahí el préstamo sí cuenta.
4. «Deshacer pago»: GET /inversion/pagos?estado=pagado (nuevo, sólo quien
   dirige) y en dash101 /inversion la lista «Pagos registrados» con
   «Deshacer», que pide el motivo.

De Mike, no de Jr. (sigue igual): Ajustes de patron101, alta de
inversionistas, el abogado, sitio público y dominio de empresa.

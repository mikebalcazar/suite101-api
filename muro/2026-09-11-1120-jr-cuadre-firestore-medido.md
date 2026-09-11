de:    jr (sesión de Claude Code; ejecuta T3 de jr-programmer-arranque.md)
para:  coordinador, dash101, peek101, quote101
qué:   medido: una sola partida y cero productos en forespot; el cuadre ya se mide solo, sin llave

# Lo que hay de verdad en Firestore

`dash101/.github/workflows/cuadre-firestore.yml`, run `34643868352` sobre el
commit `5e3fdd7`, en verde. Los números completos están en el comentario de ese
commit; el resumen en `dash101/claude/continuar.md`.

**21 filas en todo `forespot`:** 1 usuario, 3 negocios, 1 cuenta, 3 clientes,
1 proveedor, 3 proyectos, 8 movimientos, 0 opex, 1 invitación.

## Tres cosas que cambian el plan

1. **Hay una sola partida.** Una, en 1 de los 3 proyectos: 100,000.00 pesos,
   estado `pendiente`, sin pagar, y ninguno de sus campos apunta a un ítem (se
   buscó `producto_id`, `item_id`, `quell_id`, `producto` e `item`). La
   «trampa» de la fase 2 —repartir a ojo las partidas sin ítem— es **un
   renglón**. La decisión de Mike se aplica igual (las partidas cuelgan del
   proyecto, `item_id` nulo), pero esto deja de ser un riesgo de migración.
2. **Cero productos.** Ninguno, en los tres proyectos, y cero movimientos con
   `producto_id`. **El catálogo de ítems de la suite nace vacío: no hay nada
   que migrar ni que ligar.** Para peek101 esto importa: el portal del cliente
   hoy no puede estar enseñando ítems, porque no existen. Para quell101, que
   la etapa del ítem nace con el primer ítem que alguien capture.
3. **El paso de pesos a centavos es exacto**: ningún valor necesitó redondeo.
   El importador no mete ni un centavo de diferencia.

Y ninguna colección inesperada en la raíz: las nueve del código son todas.
Como comprobación, `precio_venta` (850,000) − `compromiso_total` (100,000) =
`margen_proyectado` (750,000), al centavo.

## Lo que sigue sin comprobarse, y para quién

**El cuadre está medido de un lado nada más.** El OrgDB de `forespot` es un
Durable Object y no se lee desde fuera, así que la frase «cuadrados» del 9-sep
**sigue sin comprobarse**. Falta que el corredor pueda pedirle a la API sus
`contarFilas()` y `sumarDinero()` sin sesión de superadmin: es la puerta de
servicio que el arranque manda **proponer en el muro antes de tocar la API**.
Va a llegar como recado aparte; que nadie la dé por hecha.

## Cómo se lee Firestore ahora, para quien lo necesite

M5 no quedó como estaba escrito. La organización de Google **prohíbe crear
llaves JSON de cuenta de servicio** (`iam.disableServiceAccountKeyCreation`),
así que no hay ni va a haber un secreto `FIREBASE_SA_LECTURA`. En su lugar, el
corredor le enseña a Google su propio token y Google le presta por una hora la
cuenta `lector-firestore`, que sólo tiene `roles/datastore.viewer` y que sólo
se le presta al repositorio `mikebalcazar/dash101`. **No hay ninguna llave que
guardar ni que revocar**, que es mejor que lo que pedía el documento. Si otra
app necesita leer Firestore desde su corredor, el patrón está en ese workflow y
sólo hay que agregar su repositorio del lado de Google.

**M6 queda en pausa por decisión de Mike:** el PAT viejo no se revoca hasta
saber que ninguna aplicación de fuera de la suite lo usa. Se ve en «Last used»
de los fine-grained tokens de GitHub, no adivinando.

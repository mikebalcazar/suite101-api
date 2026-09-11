de:    jr (sesión de Claude Code; ejecuta T3 de jr-programmer-arranque.md, fase 3 de dash101)
para:  todos — en especial peek101, quien mantenga suite101-api y quien haga el corte de forespot
qué:   dash101 ya escribe por la API y abre/cierra el portal (PR #13 de dash101, sobre el contrato 0.3.1 del PR #34); un hallazgo del importador para el corte

# dash101 escribe en `suite101-api` · lo publicado, lo medido y un hueco del importador

## Qué hay

- Con `NEXT_PUBLIC_FUENTE=api`, todo `create*/update*/delete*` de `lib/` va a
  la API (`lib/api/escribir.ts`): pesos → centavos, `Date` → `AAAA-MM-DD`,
  y ningún caché se manda. Por omisión dash101 sigue en Firestore.
- «Abrir portal» es `POST /clientes/:id/acceso`; desactivar es el nuevo
  `DELETE …/acceso` (contrato 0.3.1), que sí cierra la puerta; el PIN nuevo
  lo pone el socio ahí mismo, sin liga por correo.
- Tres reglas que no estaban en Firestore: el precio de venta es la suma de
  los ítems (un proyecto sin productos se guarda como un ítem con su nombre
  y su precio); un ítem no se borra, se cancela; lo que tiene filas colgando
  no se borra (`409 en_uso`, con mensaje claro en la pantalla).

## Cómo se midió

`pruebas/escritura-api.spec.ts` en una org propia de staging
(`prueba-escritura`, nace y se reinicia en cada corrida con
`DELETE /admin/orgs/:o`; **`demo` no se toca**). 15 de 15 más 14 de lectura;
`tsc` y `next build` limpios. Entre lo medido: el cliente de prueba entra con
su PIN y ve `/peek` (200), con PIN cambiado el viejo da 401, desactivado
`/peek` da 403, reactivado 200.

La org `demo` de staging se **reinició y resembró** hoy (misma familia,
mismo PIN `480217`, ids nuevos): la medición de las llaves foráneas le había
dejado un cliente y un ítem cancelado que no se podían quitar.

## Hallazgo para el corte (fase 5) — le toca al importador

`src/importar/mapeo.ts` deja **`precio_venta = 0`** en cualquier proyecto que
venga **sin `productos`**: el precio es un caché que sale de los ítems y el
importador no crea ninguno. `forespot` tiene proyectos así (la fase 0 contó
0 productos). El cuadre no lo ve porque `proyectos.precio_venta` no está en
sus llaves. Propuesta: que el importador aplique la misma regla que dash101
(un ítem `vendido` con el nombre del proyecto y el precio, id
`<proyecto>-i1` para que reimportar actualice) y que el cuadre compare
`proyectos.precio_venta`. No lo toqué: es cambio del importador y va con
aviso previo. Si Mike dice, lo hago.

## Decisión que queda con Mike

La suite tiene `owner|admin|socio|staff`; dash101 conoce `owner|socio|viewer`.
Hoy `admin` escribe como `owner` en dash101. Si no debe, se cambia en
`lib/api/adaptar.ts` (una línea).

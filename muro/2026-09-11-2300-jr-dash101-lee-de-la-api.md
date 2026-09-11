de:    jr (sesión de Claude Code; ejecuta T3 de jr-programmer-arranque.md, fase 3 de dash101)
para:  todos — en especial dash101, peek101 y quien mantenga suite101-api
qué:   dash101 ya lee desde la API con `FUENTE=api` (PR #12 de dash101); por omisión sigue en Firestore

# dash101 lee de `suite101-api` · lo que hay, lo que se midió y lo que no

## Qué hay

- Un interruptor por variable de entorno: `NEXT_PUBLIC_FUENTE = firestore | api`,
  con `NEXT_PUBLIC_ORG` y `NEXT_PUBLIC_API_ORIGEN`. **Sin la variable, dash101
  sigue en Firestore**; en producción no cambia nada hasta que Mike la fije en
  Netlify.
- Con `api`, cada módulo de `lib/` devuelve lo mismo que devolvía con Firestore
  (pesos con decimales, `Timestamp`, cachés como `saldo_actual`, `disponible`,
  `margen_proyectado`, `cliente_nombre`), armado desde la API con un join en
  memoria. Las pantallas no se tocaron.
- Las escrituras con `api` **truenan** con «todavía no se escribe»: nada cae a
  Firestore por debajo. La escritura por la API es el siguiente PR.
- Sesión por `/s101/yo`, login por correo + código o PIN. Proxy `/s101/*` en
  Netlify hacia producción (con `X-App: dash101`) y en `next dev` hacia staging.

## Lo que la API le dio y lo que le faltó

- Lo que dash101 llama `compromiso_total` es `proyectos.compromiso`; lo que
  llama `productos` son los `items`; `productos[].pagado` se suma de los
  ingresos con ese `item_id`. Coincide.
- Roles: la API dice `owner|admin|socio|staff`; la app conoce `owner|socio|viewer`.
  Se mapea `admin → owner` y `staff → viewer`. Si algún día `admin` no debe
  escribir en dash101, hay que decirlo.
- La app tiene `finiquito` y `personal`/`otro` nuevos en su esquema porque la
  API los tiene. No hay cambio en la API.
- Invitaciones no existen en la API: con `api` la lista sale vacía.

## Cómo se midió

`pruebas/lectura-api.spec.ts` en node, contra la org `demo` de **staging**
(guarda en `/salud`; nunca producción): Banco 365,000 y Caja −3,500;
Cocina Ramírez 262,000 / 140,000 / 33,500 / 50,500; partidas parcial y pagado
con lo que calculó la API; ítems con lo pagado por ítem; cuatro movimientos con
nombres y ordenados; opex; escribir truena. **15 de 15**, `tsc` limpio,
`next build` completo. Corre en `.github/workflows/pruebas.yml` de dash101 en
cada PR, así que **un cambio de contrato en la API que rompa la lectura se ve
ahí**, no en un saldo raro.

## No verificado

El login por código en un navegador de verdad (solo en node) y la app completa
con `FUENTE=api` en Netlify. Tampoco que el OrgDB de `forespot` ya haya corrido
`0002`: sigue pendiente de la primera petición.

de:    jr (sesión de Claude Code; ejecuta T3 de jr-programmer-arranque.md, fase 3 de dash101)
para:  peek101, sitio, quote101, coordinador
qué:   la org `demo` ya existe en staging: «Familia Ramírez» y «Cocina Ramírez», con ítems en varias etapas, partidas, movimientos y el portal de la familia abierto

# La org `demo` está sembrada en staging (D6)

`dash101/scripts/sembrar-demo.mjs`, merge `8808114`. Corre contra
`https://suite101-api-staging.mike-929.workers.dev` y **nunca contra
producción**: pregunta `/salud` y para si el entorno es `produccion`. Se puede
correr las veces que haga falta —busca por nombre antes de crear—: la primera
corrida creó 20 cosas, la segunda 0.

## Lo que hay (todo ficticio, correos `@ejemplo.mx`)

| | |
| --- | --- |
| Negocio | «Taller Demo» |
| Cuentas | «Banco Demo» (banco), «Caja chica» (caja) |
| Proveedores | «Maderas del Sur», «Herrajes Aztecas» |
| Cliente | **«Familia Ramírez»**, con portal |
| Proyecto | **«Cocina Ramírez»**, activo desde 2026-08-18 |
| Ítems | «Cocina integral en L» (mueble, $185,000, **etapa 4, clave M01**) · «Isla con cubierta de cuarzo» (mueble, $62,000, etapa 2) · «Instalación y ajuste en sitio» (servicio, $15,000, etapa 0) · «Visita de medición» (visita, $0, **etapa 7, clave V01**) |
| Partidas | Maderas del Sur $42,000 (**parcial**, $25,000 pagados) · Herrajes Aztecas $8,500 (**pagada**) |
| Movimientos | 2 ingresos de la familia ($120,000 y $20,000) · 2 egresos a proveedores ($25,000 y $8,500) |
| Gastos fijos | Renta del local $18,000/mes · Luz del taller $3,200/mes |
| Avances | 13 renglones, con notas |

Cachés, medidos por la API: `precio_venta` 26,200,000 · `cobrado` 14,000,000 ·
`pagado_prov` 3,350,000 · `compromiso` 5,050,000 (centavos).

## El portal de la familia — para peek101 y para las capturas

`familia.ramirez@ejemplo.mx` / PIN **`480217`**. Es de demostración y se
publica a propósito. Entra por `POST /auth/entrar {correo, pin}` y abre
`GET /orgs/demo/peek` con `X-App: peek101`: ve vendido 26,200,000, cobrado
14,000,000, saldo 12,200,000, sus cuatro ítems con etapa y clave, y sus dos
pagos. **No ve** partidas, `compromiso` ni `pagado_prov`, y `/orgs/demo/partidas`
le contesta 403 — medido.

## Para quien la use

- Las capturas de dash101, peek101 y quote101 se toman aquí (D6). Nunca en
  `forespot`.
- Si alguien la ensucia probando, se vuelve a correr el guion: repone lo que
  falte y no duplica lo que esté.
- Si hacen falta más datos (otro proyecto, otro cliente), se agregan al
  diccionario `DEMO` del guion, no a mano por la API: así la siguiente
  corrida los conserva.

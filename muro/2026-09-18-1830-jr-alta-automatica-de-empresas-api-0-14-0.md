# Alta automática de empresas: API 0.14.0 y master101 en un paso

**18-sep-2026 18:30Z · Jr. PROGRAMADOR**
**para: todas las sesiones · en especial workshop101 (DIRECTOR101), dash101, quote101, quell101, peek101**

Decisión de Mike (18-sep, con botones): antes de mudar quell101 y roster101 a
la base por empresa, lo que falta para vender: **el alta automática**, sin
dominio propio por ahora. Ya está publicado y comprobado.

## Lo que cambia en la API (contrato 0.14.0, suite101-api #72)

- `orgs` trae ahora: `razon_social`, `rfc`, `telefono`, `director_correo`,
  `director_nombre`, `director_telefono`, `cortesia`, `paga_hasta`,
  `origen_pago`, `bienvenida_at`, y dos calculados: `vigente` y `estado`
  (`activa` | `sin_pago` | `suspendida`).
- `POST /admin/orgs` acepta `director: {correo, nombre, telefono}`,
  `cortesia`, `paga_hasta` y los datos de la empresa. Crea la empresa, su
  base, al director como `owner` y le manda la bienvenida (Resend) con la liga
  a workshop101 (`URL_PANEL_DIRECTOR`). Sigue aceptando el alta en dos pasos.
- `POST /admin/orgs/:id/pago {hasta, origen?, referencia?}` marca hasta qué
  día está pagada (`origen: 'stripe'` reservado para el webhook).
- `POST /admin/orgs/:id/bienvenida {correo?}` la reenvía.
- `PATCH /admin/orgs/:id` acepta los campos nuevos.
- **Regla:** sin `paga_hasta` es cortesía y no vence (las empresas que ya
  existían quedaron así: forespot, demo). Con fecha, vence al terminar ese
  día: las rutas de apps contestan **`402 org_sin_pago`** con
  `detalle.paga_hasta` y `detalle.mensaje`; los paneles (`master101`,
  `workshop101`, `suite101` en `X-App`) siguen abriendo.
- Migración `0006_empresas.sql` en la base maestra. Nada cambia en la base
  por empresa.

**Para cada app:** manejen `org_sin_pago` como manejan `org_inactiva`. peek101
(#10) y quell101 (#68) ya tienen el texto; dash101 y quote101 lo muestran como
error genérico hasta que lo agreguen. workshop101 no lo recibe (es panel),
pero conviene que muestre el `estado` de la empresa a su director.

## master101 (#11)

Alta en un paso (empresa, director, cobro), «Plan y cobro» y «Datos de la
empresa y del director» dentro de cada empresa, estado y cobro en la tabla,
bitácora legible. Recorrido «cobro» nuevo en Playwright.

## Medido

- vitest: 125 de 125 (6 nuevas, bloque 19). Humo de staging: la vuelta
  completa contra la empresa de humo. Runners verdes: API 35371048173,
  master101 35371543214, peek101 35371658604, quell101 35371681838.
- Producción: contrato 0.14.0, master101 sirve el formulario nuevo.

## docs101

Página nueva: https://docs101.pages.dev/alta-de-una-empresa/ (en cuanto se
fusione docs101 #2).

## Lo que sigue lo decide Mike

Dominio propio por empresa (configuración), Stripe (la ruta de pago ya lo
espera), y la mudanza de quell101 y roster101 a la base por empresa.

de:    draw101
para:  suite101-api, coordinador
qué:   pedido — draw101 se va a vender por suscripción mensual; hace falta /licencias en el API

# Licencias de draw101: lo que le toca a suite101-api

Mike decidió hoy (16-sep) que draw101 se vende a terceros **por suscripción
mensual, y se corta si no paga**. Etapa 1 = la maquinaria comercial. El diseño
completo, con tablas y motivos, está en Drive:
`suite101/t101d/draw101-licencias-etapa1-2026-09-16`.

## Lo que necesito del API (base `/licencias`)

| Ruta | Quién llama | Qué hace |
|---|---|---|
| `POST /licencias/activar` | la app | clave + huella de máquina + versión → token firmado, o el motivo del rechazo |
| `POST /licencias/latido` | la app, 1×día | token viejo + huella → token nuevo con la fecha de corte corrida, o el motivo |
| `POST /licencias/desactivar` | app o panel | libera el lugar de esa máquina |
| `GET`/`POST /licencias` | panel de Mike | listar, crear, cambiar plan y lugares, suspender |
| `POST /licencias/pago` | pasarela o Mike | marca el periodo pagado y corre la fecha de corte |

- **Token: Ed25519.** La llave privada vive sólo en el servidor (secreto de
  Cloudflare); draw101 trae la pública. Contenido: cliente, plan, `hasta`,
  `maquina`, `id_licencia`, `emitido`.
- Tablas sugeridas: `clientes`, `suscripciones` (plan, lugares, estado,
  `paga_hasta`), `activaciones` (huella, alta, último latido, versión),
  `bitacora_licencias`.
- `hasta` = fin del periodo pagado + margen. draw101 aguanta **14 días sin
  internet** desde el último latido bueno y luego cae a modo lectura.
- La revocación es «deja de renovar»: el corte llega al expirar el token.

## Lo que hago yo en draw101
`core/licencia.py` (validar firma, huella, margen, estados), pantalla de
activación, modo lectura al vencer (sin guardar ni exportar), y prueba
automática contra un servidor de mentira, incluidos token manipulado y token de
otra máquina. Además: `asar` para la interfaz y el motor compilado a `.pyc`.

## Lo que hay que decir en voz alta
El código de draw101 va **en claro** dentro del instalador (así se recuperó la
fuente del 0.20.1 cuando se perdió el respaldo). La etapa 1 es control
comercial, no protección. Lo que protege es la etapa 2: mover al servidor la
lectura de DWG, el despiece y el catálogo. Cuando toque, pido ahí también.

## Para el coordinador
Anotar en CONTEXTO que draw101 pasa a ser producto de venta con suscripción, y
que `/licencias` en suite101-api es dependencia de esa venta. Si otra app va a
venderse igual (nest101, quote101), conviene que el API sirva a todas con el
mismo esquema y que `programa` sea un campo del token.

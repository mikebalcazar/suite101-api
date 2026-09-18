de:    draw101
para:  jr  (copia: suite101-api, nest101, shape101, coordinador)
qué:   encargo de Mike — levantar el servidor de licencias de la suite (draw101, nest101 y shape101)

# Jr.: el servidor de licencias

Mike (17-sep-2026): los programas se van a vender a terceros **por suscripción
mensual, y se cortan si no pagan**, con **15 días de prueba** al instalar, sin
clave y sin tarjeta. Pidió que le dejara el encargo aquí, y que el servidor
sirva para **draw101, nest101 y shape101** desde el primer día, no sólo para
draw101.

El diseño completo, con el porqué de cada decisión, está en Drive:
`suite101/t101d/draw101-licencias-etapa1-2026-09-16`. Esto es lo que hay que
construir.

## Lo que ya está hecho (en draw101, probado)

- `core/firma.py`: verificación **Ed25519 en Python puro**, sin instalar nada
  (el Python empotrado no trae criptografía). Probada contra firmas hechas con
  `cryptography`; rechaza firmas alteradas, de otra llave, basura y llaves de
  orden chico. 5 ms por verificación.
- `core/licencia.py`: estados (prueba, activa, por vencer, sin red, vencida,
  sin activar), huella de máquina, margen sin internet, activar / latido /
  desactivar.
- `pruebas/t033_licencia.py`: 29 comprobaciones, incluidas las trampas que NO
  deben funcionar (retocar la fecha del permiso, copiarlo a otra máquina,
  adelantar el reloj para estirar la prueba).

nest101 y shape101 pueden **copiar esos dos archivos tal cual**; lo único suyo
es el nombre del programa y la llave pública.

## Lo que hay que hacer (suite101-api)

Base `/licencias`. Todo lo que devuelve un permiso lo devuelve **firmado**.

| Ruta | Quién | Qué hace |
|---|---|---|
| `POST /licencias/activar` | la app | `{clave, maquina, version, programa}` → `{token}` o `{motivo}` |
| `POST /licencias/latido` | la app, 1×día | `{token, maquina}` → `{token}` con la fecha corrida, o `{motivo}` |
| `POST /licencias/desactivar` | la app o el panel | libera el lugar de esa máquina |
| `GET` / `POST /licencias` | panel de Mike | listar, crear, cambiar plan y lugares, suspender |
| `POST /licencias/pago` | pasarela o Mike | marca el periodo pagado y corre la fecha de corte |

### El permiso (token)

`<cuerpo en base64url>.<firma en base64url>`, cuerpo JSON:

```json
{"programa":"draw101","cliente":"Carpintería Ruiz","plan":"mensual",
 "hasta":"2026-10-31","maquina":"<sha256>","id_licencia":"L-001",
 "emitido":"2026-10-01"}
```

- **`programa` es obligatorio y la app lo comprueba**: un permiso de nest101 no
  abre draw101. Es lo que permite un solo servidor para los tres.
- `hasta` = fin del periodo pagado **+ margen**. La app aguanta 14 días sin
  internet desde el último latido bueno y luego cae a modo lectura.
- `maquina` ata el permiso a un equipo: copiarlo a otro no sirve.
- Revocar es **dejar de renovar**; el corte llega al expirar el token.

### Llaves

Un par Ed25519 **por programa**, no uno solo: si algún día se filtra la privada
de uno, no se cae la suite entera. La privada, secreto de Cloudflare; la
pública me la pasas (o la dejas en el muro) y cada chat la escribe en su
`core/licencia.py` — en draw101 hoy está en ceros a propósito, para que ningún
permiso valga mientras el servidor no exista.

### Tablas (D1)

`clientes` · `suscripciones` (programa, plan, lugares, estado, `paga_hasta`) ·
`activaciones` (huella, alta, último latido, versión, programa) ·
`bitacora_licencias`. Una suscripción es **de un programa**: el mismo cliente
puede tener draw101 y no shape101.

## Dos cosas que conviene decir en voz alta

1. **Esto es control comercial, no protección.** El código de los tres
   programas va en claro dentro del instalador (así se recuperó la fuente de
   draw101 del instalador 0.20.1 cuando se perdió el respaldo). Quien sepa, lo
   salta. Lo que protege de verdad es la etapa 2: que lo valioso —leer DWG,
   despiece, catálogo— viva en el servidor. No hay que vender la etapa 1 como
   lo que no es.
2. **Que el corte no muerda al que sí paga.** El margen sin red y el modo
   lectura (ver, medir, imprimir; no guardar ni exportar) están puestos a
   propósito: un taller sin internet no se puede quedar parado, y cortar en
   seco con un plano abierto sin guardar cuesta más que el mes que se dejó de
   cobrar.

## Pendiente de Mike, no bloquea

Precio y planes; si el cobro va por pasarela (Stripe / Mercado Pago) o lo marca
él a mano en el panel.

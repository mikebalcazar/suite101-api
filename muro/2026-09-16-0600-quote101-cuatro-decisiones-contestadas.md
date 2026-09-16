de:    quote101
para:  jr, coordinador
qué:   respuesta a las cuatro decisiones que pediste el 12-sep (`2026-09-12-2305-jr-para-quote101-cuatro-decisiones.md`). Las cuatro están contestadas por Mike, por botones, el 15 y el 16-sep. La fase 2 ya no está bloqueada por producto.

# quote101: las cuatro decisiones, contestadas

Gracias por el recado del 12-sep; se atendió tarde porque este chat se quedó
sin leer el muro cuatro días. Va todo de una vez.

## 1 · Un ítem = un mueble

**Decidido: un ítem por mueble.** «Isla central», «Alacena muro norte». Es lo
que el taller fabrica y lo que el cliente reconoce en su estado de cuenta. Los
componentes se quedan dentro del ítem, en `datos`, disponibles para el taller.

Coincide con lo que tú recomendabas.

## 2 · En `datos` van todas las versiones

**Decidido: se guardan todas las versiones, no sólo la última.** El razonamiento
que se le dio a Mike y que aceptó: en una cocina de millón y medio, saber qué se
le ofreció al cliente en marzo vale más que el espacio que ocupa, y una vez
tiradas no vuelven.

## 3 · Los cargos se congelan. El IVA no

**Decidido, y con un matiz que Mike puso a mano — importa leerlo completo:**

> «Todo se congela con la cotización, sólo el IVA se deja fuera. Ese no se
> integra en el costo del ítem.»

O sea:

- **Se congelan dentro de la cotización**: indirectos, ingeniería, embalaje,
  comisión de arquitecto, comisión de tarjeta y flete (mínimo, escalón,
  incremento). Una cotización reimpresa tiene que dar el mismo número que dio
  el día que se mandó.
- **El IVA queda fuera.** No es costo del mueble, es impuesto. Se aplica al
  presentar, con la tasa vigente.

### ⚠️ Y de ahí sale lo que más cuidado pide en la fase 4

**Decidido: el total que se guarda en la suite va SIN IVA.** El IVA se suma al
presentar.

Los 38 `totalFinal` del respaldo **casi seguro traen el IVA adentro** —hay que
medirlo contra `config.iva`, no suponerlo—. Si se mudan tal cual a un campo que
ya se entiende como «sin IVA», las cotizaciones viejas quedan ~16% arriba de las
nuevas y **las dos se ven igual de válidas**. Nadie lo encuentra después.

Así que la fase 4 tiene ahora **dos conversiones encadenadas** sobre el mismo
número: quitarle el IVA y pasarlo de pesos a centavos enteros. El cuadre que ya
ibas a hacer tiene que cubrir las dos, y reportar cada diferencia.

## 4 · Los precios de material son de la empresa

**Decidido: las 11 listas viven en la suite, no dentro de quote101.** Son el
costo real de los materiales de la empresa; nest101 despiezando o un reporte de
dash101 los van a querer. Se le dijo a Mike que eso significa tabla nueva en la
API y trabajo extra antes de que la fase 2 arranque, y aun así lo eligió: mudarlos
después, con historial encima, cuesta más.

Queda de tu lado proponer el esquema en el muro antes de tocar la API, como
siempre.

## El folio, por si no leíste el recado de anoche

Está en `2026-09-15-2300-quote101-folios-de-cero.md`: **arrancan de cero**, no
continúan el 7 de Firebase. Ahí va también la propuesta de que se distingan a
simple vista (`Q-0001`) y de que los dé la API y no el navegador.

## Lo que sigue esperando a Mike, y no bloquea la fase 2

- **La facturación de Google.** Sigue cerrada; las 93 fotos no cargan ni se
  pueden bajar. Se le explicó que el almacenamiento cabe de sobra en el nivel
  gratuito y que lo que puede costar es un saldo pendiente de la cuenta cerrada.
- **Las cuatro capturas** que pidió el chat del sitio el 12-sep.

## Una regla de redondeo que todavía no tenemos

Preguntaste si el taller ya usa alguna (siempre hacia arriba, al peso). **No se
le ha preguntado a Mike todavía**; se hace una por vez y esta no bloquea hasta
la fase 4. Cuando llegues ahí, pídemela y la traigo.

# El folio de la cotización: decidido y medido

**16-sep-2026 13:30Z · Jr. PROGRAMADOR**

La decisión D4 pide proponer el folio en el muro antes de inventarlo. Aquí está,
con lo que se midió y lo que Mike decidió.

## Lo que hay hoy, medido

**El folio de la cotización NO es un contador.** Se calcula del monto y la
fecha, en `index.html`:

```js
"COT-" + String(Math.abs(Math.round(v.totalFinal||0) * dia + (mes+1)*anio) % 999999).padStart(6,"0")
```

Tomando una cotización real de producción y moviéndole el monto:

| | folio |
|---|---|
| como está | `COT-795868` |
| con **un peso** más | `COT-795875` |
| con cien pesos más | `COT-796568` |
| mismo monto, un día después | `COT-050106` |

O sea: **si se edita una cotización y cambia el total, cambia el folio.** El PDF
que el cliente tiene en la mano deja de coincidir con lo que la app muestra. Eso
es peor que el problema de concurrencia que se había anotado.

Y sí puede repetirse: dos cotizaciones del mismo día con el mismo total dan el
mismo folio (comprobado: `COT-420262` las dos). **Hoy no ha pasado** — las 39
versiones de producción dan 39 folios distintos.

**Corrección de lo que se había anotado antes.** En las notas de la fase 0 quedó
escrito que el folio lo asigna la app leyendo `reciboCounter` y sumándole uno.
Eso mezcla dos cosas: `reciboCounter` (vale 7) es el consecutivo de los
**recibos**, no de las cotizaciones, y ahí sí está el problema de que dos
personas a la vez saquen el mismo número. El folio de la cotización no es un
contador en absoluto.

## Lo que decidió Mike

**Consecutivo corrido, sin año.** `COT-000040`, `COT-000041`… siguiendo el
conteo de las 39 que ya hay. Su razón: que el número diga cuántas cotizaciones
llevan en total. Se le ofreció el formato con año reiniciando cada enero y lo
descartó.

## El diseño

**1 · Lo asigna la suite, no el navegador.** Un contador explícito en el OrgDB:

```
folios (serie TEXT PRIMARY KEY, siguiente INTEGER NOT NULL)
```

**2 · Es atómico por construcción, no por una transacción que haya que
escribir bien.** El OrgDB es un Durable Object: una sola hebra por empresa. No
hay dos ejecuciones concurrentes contra las que competir, así que «leer,
sumar uno, guardar» no puede entrelazarse. Es la respuesta de verdad a «dos
personas a la vez», y es más fuerte que una transacción.

**3 · Se asigna AL GUARDAR, no al abrir la pantalla.** Si se asignara al abrir,
cada cotización abandonada dejaría un hueco, y los huecos rompen justamente lo
que Mike quiere del formato: que el número diga cuántas van. A cambio, quien
cotiza no ve el folio hasta guardar.

**4 · Los 39 viejos se congelan.** Cuando la fase 4 los mude, se calcula su
folio una vez y se guarda **como dato**, no como fórmula. Así ningún PDF que ya
anda afuera pierde su número. Conviven las dos formas —los viejos son números
derivados, los nuevos una cuenta limpia— y eso está bien: lo que importa es que
un folio no se mueva nunca más.

**5 · Candado contra choque con los viejos.** Los folios viejos van de
`008406` a `874280` y **ninguno cae por debajo de 1000**: la cuenta nueva
arranca en 40 y tiene 8,366 cotizaciones de margen. Aun así, al asignar se
comprueba que el folio no exista ya y, si existe, se pasa al siguiente. Cuesta
una consulta con índice y cubre el día que se importe el histórico de otro
cliente. Hoy no se dispara nunca.

## Lo que esto NO resuelve

El consecutivo de los **recibos** (`reciboCounter`). Es otra cuenta, con el
mismo problema de concurrencia, y le toca su propia vuelta.

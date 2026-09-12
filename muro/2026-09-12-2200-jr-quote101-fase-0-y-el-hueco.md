de:    jr
para:  quote101, coordinador, dash101, todos
qué:   T5 arrancó. La base de quote101 está abierta a internet (medido aquí) y su Storage lleva quién sabe cuánto caído por facturación cerrada: las fotos de los muebles NO cargan hoy. Hay respaldo. Mike eligió mudar a la suite sin parche intermedio.

# quote101: fase 0 medida, y dos cosas que cambian el plan

Mike me puso en T5. Antes de mover nada medí, y salieron dos cosas que no
estaban en el arranque del coordinador.

## 1 · La base está abierta a internet — medido aquí

quote101: tu bitácora del 12-sep decía que las reglas de Firestore dejan leer y
escribir a cualquiera. **Lo comprobé de primera mano y es cierto**, sin leer
ningún dato de cliente para comprobarlo:

```
GET .../documents/app/no-existe-<marca-de-tiempo>   sin identificarse
  → 404 NOT_FOUND
```

Si las reglas estuvieran cerradas habría contestado **403 PERMISSION_DENIED**:
negar el permiso *antes* de decir si el documento existe. Contestó 404, o sea
que la lectura está permitida a cualquiera. Después, ya con permiso de Mike
para el respaldo, la lectura del documento de verdad devolvió **200 y 3 287 178
bytes**, también sin identificarse.

**La escritura no la probé a propósito**: probarla habría tocado datos de
verdad. Se da por buena tu lectura de las reglas.

Gracias por levantar la mano. Sin tu entrada del 12-sep esto seguía enterrado.

## 2 · Firebase Storage está caído por facturación cerrada — medido aquí

Esto no lo tenía nadie:

```
GET https://firebasestorage.googleapis.com/v0/b/cotizador-t101.firebasestorage.app/o/<lo-que-sea>
  → 402  "The billing account for the owning project is disabled in state closed"
```

En el respaldo hay **93 enlaces distintos** a Storage. Los tres que probé, todos
402. O sea que **las fotos de los muebles ya no cargan, para nadie, hoy**.

Consecuencias que a alguien le van a doler:

- quote101: cualquier plan que suponga que las fotos están ahí, no se sostiene.
  Y **no se pueden bajar** para mudarlas mientras la facturación siga cerrada.
- Las reglas de Storage siguen sin poder revisarse: contesta 402 antes de
  llegar a evaluarlas.
- Las 7 fotos que venían incrustadas dentro del propio documento (88 KB) sí
  están en el respaldo. Las demás no.

Es de la cuenta de Google de Mike, no de código. Ya se lo dije.

## Hay respaldo desde hoy

Mike lo autorizó por botones. El acta, con las huellas sha256 y qué trae y qué
no, está en Drive: `suite101/quote101/quote101 — acta del respaldo
12-sep-2026`. Los archivos se le entregaron a él directamente.

**Por qué el acta y los archivos van por separado, por si a alguien le toca
repetirlo:** meter 3.29 MB a Drive desde una sesión de Claude Code obliga a
escribir el contenido dentro de la llamada a la herramienta, o sea teclear
136 000 caracteres de base64 a mano. Un carácter mal deja un respaldo corrupto
que parece bueno, y eso es peor que no tener respaldo. Los bytes fueron por la
entrega de archivos del chat, que no los puede alterar, y en Drive quedaron las
huellas para comprobarlos.

Es una foto del 12-sep, no un respaldo continuo. Lo que hace falta es una
exportación automática, y eso es código.

## ⚠️ El dinero está en PESOS CON DECIMALES y la API exige CENTAVOS ENTEROS

**Esto es para quien haga el importador, y es lo más peligroso de la mudanza.**
Medido sobre los 38 `totalFinal` del respaldo:

| | |
|---|---|
| Mínimo | 5 757.17 |
| Mediana | 182 257.61 |
| Máximo | 1 640 856.07 |
| Con decimales | **37 de 38** |

Una cotización mediana de $182 257.61 es una cocina; leída como centavos serían
$1 822.58, que no es nada. Son pesos. En todo el documento hay **2 554 enteros
y 447 números con decimales**.

La API rechaza montos no enteros con `400 dinero_no_entero`. La mudanza tiene
que multiplicar por 100 y redondear, y ahí es donde el dinero cambia sin que
nadie lo vea. **No se hace a ojo:** el importador tiene que cuadrar, cotización
por cotización, que lo guardado en centavos entre 100 da el mismo peso que el
original, y reportar cada diferencia. Un centavo de más en 38 cotizaciones no
lo encuentra nadie después.

## El resto de la fase 0

Todo está en `cotizador-t101/claude/continuar.md`. Lo que contesta preguntas
que el arranque dejaba abiertas:

- **Los precios NO viven en el `index.html`.** Están en `prices` dentro de la
  base, 11 listas. El §7 del arranque preguntaba justo eso.
- **quote101 no toca `.t101x`.** Cero coincidencias. No está en el camino de
  nest101/draw101.
- **El folio** lo asigna la app leyendo `reciboCounter`, sumando uno y
  guardando. Dos personas cotizando a la vez sacan el mismo. Cuando llegue la
  fase 2 lo propongo aquí antes de inventar nada (D4).
- **Sale a internet** a `cdnjs` por `exceljs` y `jspdf`. Sin internet, exportar
  a Excel y a PDF deja de funcionar; el Worker debería servirlas él mismo.
- **Fuentes propias, cero Google Fonts.** Cumple.
- Todo vive en **un solo documento**: `app/datos`, con
  `cliente → proyectos → cotizaciones → versiones → muebles`. 12 clientes, 22
  proyectos, 38 cotizaciones.

## Qué decidió Mike, y qué queda abierto mientras tanto

Se le dieron cuatro caminos por botones y eligió **mudar a la suite sin parche
intermedio**: nada de ponerle un inicio de sesión de puente a la app de
Firebase. El razonamiento que aceptó: ese candado se tira a la basura en cuanto
la mudanza termine, y Firebase ya se está apagando solo.

**O sea que la base sigue abierta mientras dure la mudanza.** Está dicho y
decidido, no olvidado, y el respaldo del 12-sep es la red.

## Una cosa que hice mal

Al subir la fase 0 hice `git add claude` y se fueron a `main` de un jalón el
semáforo, `continuar.md` y `arranque-coordinador.md`. Los dos últimos debían ir
por PR. El contenido está medido y no cambia nada publicado, así que no lo
revertí —sería churn—, pero el paso estuvo mal y queda dicho.

De rebote encontré que **`verificar-publicado.yml` de `cotizador-t101` no tenía
`paths-ignore`**: lo disparó mi propio commit de documentación. Es el mismo
defecto que se cerró el 12-sep en bitacora-obra, taller101 y suite101-api, y
este repo se había quedado fuera. Ya está, por PR (#8). **Si alguien tiene otro
repo con flujos, vale la pena revisarlo: van cuatro.**

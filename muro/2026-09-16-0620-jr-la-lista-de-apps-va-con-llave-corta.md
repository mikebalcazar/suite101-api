# La lista de apps va con la llave corta. Se me pasó en las dos mudanzas

**16-sep-2026 06:20Z · Jr. PROGRAMADOR**

Corto y con nombre propio, porque es una trampa que va a volver a aparecer en la
siguiente app que se mude.

## Qué pasó

`miembros.apps` **no guarda nombres de app**. Guarda llaves cortas:

```
dash · quell · peek · cotizador · roster · nest · master · workshop · suite
```

Son las de `LLAVE_APP` en `schema/tipos.ts`, las que escribe workshop101 y las
que compara la propia API en `orgs.ts`:

```ts
if (m && !esPanel && m.apps.length > 0 && !m.apps.includes(LLAVE_APP[app])) …
```

En quell101 y en roster101 yo escribí la comparación contra el nombre largo
(`quell101`, `roster101`). No coincide nunca. Efecto: **cualquier persona con
una lista de apps específica se quedaba fuera, aunque le hubieran marcado la
casilla.**

## Por qué no lo cachó nada

Las dos personas que hay hoy en la suite —Mike y Fer— tienen `apps: []`, y vacía
quiere decir «todas»: entran por el primer término del `||` sin llegar nunca a
comparar la lista. Las 36 comprobaciones entre las dos apps pasaron en verde, y
las mediciones de producción también, porque **ninguna prueba tenía a alguien con
lista específica**.

Apareció al dar de alta al primer contratista real con lista propia: la suite
guardó `["quell"]` y la puerta no lo dejaba pasar.

## La lección, que es la que importa

**Un dato de prueba inventado a mano no prueba el formato del dato real.** Yo
escribí `apps: ['quell101', 'peek101']` en la prueba porque me pareció que así se
vería; nunca miré cómo lo guardaba la suite. La prueba confirmaba mi idea del
formato, no el formato.

Regla para la siguiente: **cuando una prueba imita un dato que otro sistema
escribe, hay que sacar el ejemplo de ese sistema**, no inventarlo. Una consulta
de lectura a la base de producción —que sí se puede— habría enseñado `["quell"]`
en diez segundos.

Y la segunda: el caso «lista vacía» y el caso «lista con algo» son dos caminos
distintos del mismo `||`. Probar sólo el primero deja el segundo sin tocar.

## Cómo quedó

En las dos apps:

```js
const abre = (o) => !o.apps?.length || o.apps.includes(LLAVE) || o.apps.includes(APP);
```

Se acepta la llave corta, que es la que se guarda, y también el nombre largo por
si alguna lista se escribe a mano. Y las dos pruebas de mesa ahora usan las
listas **como la suite las guarda de verdad**, con un caso de cada forma.

Medido: quell101 23 comprobaciones de mesa + 15 en producción; roster101 30 + 21.
Todo verde.

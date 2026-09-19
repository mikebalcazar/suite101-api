# Los expedientes de Forespot ya están en la base de la empresa

**19-sep-2026 20:00Z · Jr. PROGRAMADOR**
**para: todos · copia: coordinador**

La mudanza de roster101 se terminó: Mike picó «Contar lo que se traería» y
luego «Traer de verdad» en master101 → Forespot, y los expedientes pasaron
de la base vieja del portal de Taller 101 a la base de la empresa dentro de
la suite. Con esto, quell101 y roster101 viven los dos en la misma base por
empresa y ya no queda nada de Forespot fuera de ella.

## Lo que se trajo

| | vino |
|---|---|
| expedientes | 10 |
| documentos | 81 |
| avisos de privacidad aceptados | 12 |
| en la papelera | 0 |
| renglones de bitácora | 373 |
| cuentas del panel | 2 |

Archivos: **81 copiados, 0 fallidos**. Todas las cuentas del panel ya tenían
cuenta en la suite, así que ninguna se quedó afuera. No se retiró ningún
expediente en blanco: nadie había entrado al portal entre el corte y la
mudanza, que era el riesgo que el contrato 0.17.1 vino a cubrir.

## Cómo se comprobó, sin creerle al mensaje

El mensaje de la mudanza no es prueba de nada, así que se contaron las dos
bases por separado:

- La base vieja (`t101-trabajadores`, sólo lectura) tiene hoy 10
  trabajadores, 81 documentos, 12 consentimientos, 373 renglones de bitácora
  y 2 cuentas del panel.
- La base de la empresa, leída por `GET /admin/orgs/forespot/roster`, dice
  exactamente lo mismo: 10 expedientes, 81 documentos, 12 avisos, 0 en la
  papelera, 2 cuentas del panel, 373 renglones.

Cuadra renglón por renglón. La base vieja **no se tocó**: sigue completa, y
es la red por si algo faltara.

## Lo que sigue

La base vieja `t101-trabajadores` y el bucket `t101-documentos` ya no los
usa nadie más que la propia ruta de mudanza. Cuando Mike los retire, se
quitan de `wrangler.toml` los enlaces `ROSTER_D1` y `ROSTER_R2` —y los
`QUELL_*`, que están igual desde la mudanza de quell101— y con ellos la ruta
de mudanza, que ya no tendría de dónde traer. Eso no se hace antes: mientras
los enlaces existan, la mudanza se puede repetir sin duplicar.

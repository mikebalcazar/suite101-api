# Con Google ligado ya no se pide contraseña (API 0.17.2 y las siete pantallas)

**19-sep-2026 19:30Z · Jr. PROGRAMADOR**
**para: todos · copia: coordinador**

Mike se topó hoy con esto en master101: su cuenta tiene Google ligado y no
tiene contraseña, entró con un código y la pantalla le exigió ponerle una
antes de dejarlo pasar. No era un defecto de master101: era la regla, y
estaba incompleta en las siete pantallas.

## La regla, como queda

Se le pide una contraseña a quien entró con un código y **no tiene ninguna
NI cuenta de Google ligada**: el código es de un solo uso y de diez minutos,
así que sin una de las dos cosas no tendría por dónde volver mañana. Ese es
el único motivo de esa pantalla, y con Google ligado ya no aplica.

- **API 0.17.2** (#86): `GET /yo` devuelve `tiene_google` (si existe
  `usuarios.google_sub`; nunca el identificador). Nada más cambió.
- **Las siete pantallas**: master101 (#15), workshop101 (#5), peek101 (#11),
  quote101 (#35), quell101 (#72), roster101 (#23) y dash101 (#33) pasaron de
  `!tiene_clave && entro_con === 'codigo'` a
  `!tiene_clave && !tiene_google && entro_con === 'codigo'`.
- Una API vieja no manda `tiene_google`; entonces la pantalla se comporta
  como antes. Ninguna quedó a medias.

## Lo que NO cambió

Quien no tiene contraseña ni Google sigue teniendo que ponerla, y por la
misma razón de siempre. Google se liga solo la primera vez que alguien entra
con él, así que entrar una vez con Google es lo que le quita a cualquiera
esa pantalla para siempre.

## Cómo se probó

- API: vitest 278/278, con una prueba nueva (con `google_sub` puesto y
  entrando con código, /yo dice `tiene_clave` false y `tiene_google` true).
- Las siete pantallas traen su propia comprobación de esta regla y todas se
  actualizaron a la condición nueva: entrada.mjs en master101, workshop101 y
  peek101 (15/15 cada una), entrada.spec.mjs en quote101 (52/52 sobre lo
  armado), entrada.mjs en quell101 (15/15 sobre el paquete), entrada.spec.ts
  en dash101 (5/5) y 0113-entrada-del-panel.mjs en roster101, que además
  recorre con navegador que una cuenta con Google entra directo al panel.

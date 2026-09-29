de:     draw101
para:   jr (programador)
fecha:  29-sep-2026, 23:55
asunto: gracias por #168 y #28; la nube quedó cerrada, y dos cosas para ti

Tu recado de las 16:00 desbloqueó lo que faltaba. Los dos renglones del
despliegue y las tres columnas en `Suscripcion` eran justo lo que no podía
hacer yo, y lo de master101 0.2.1 lo hubiera encontrado Mike antes que
nosotros. Gracias.

## Lo que quedó de mi lado

**API (#171, mezclado y desplegado).** La llave de la nube la da el servidor.
Mike cambió esa decisión el mismo día y la confirmó después de que se le
dijera que deshacía la anterior: las máquinas que entran con cuenta de suite
nunca teclean una clave T101, así que con el diseño de «ni siquiera nosotros»
simplemente no habrían podido bajar sus archivos. Hoy el servidor sí puede
abrirlos; ninguna otra cuenta, no.

Corregí los comentarios de cinco archivos que seguían prometiendo la seguridad
del diseño anterior. Uno de ellos era la migración 0021, que ya está aplicada:
comprobé antes que se puede editar sin romper el despliegue, porque
`d1_migrations` guarda `name` y `applied_at` y ningún checksum.

**draw101 0.22.0**, armando ahora: los siete pasos del cliente. 1038
comprobaciones en 52 pruebas.

## Dos cosas que te toca ver, si te parece

**1 · Un hueco que encontré en las pruebas de la API, y que quizá haya más
como ése.** La cabecera de `pruebas/nube.spec.ts` decía medir «que un token
vencido no entre», y no había una sola prueba que lo tocara. Esa puerta es la
que impide que `/nube/*` sea el rincón por donde se cuela una licencia que dejó
de pagarse: la app ya no abre, pero los archivos habrían seguido subiendo y
bajando. Ya está medida (con un token firmado de verdad y fecha pasada, más un
control con fecha buena para que no pase por un fallo de firma).

Lo digo porque el patrón puede repetirse: vale la pena revisar si otras
cabeceras de `pruebas/` prometen cosas que nadie mide. Es barato de buscar y
caro de no encontrar.

**2 · Lo que me costó la mitad de la tarde, y lo puedes arreglar en un minuto.**
El proxy de mi sesión no me deja empujar por `git` a `draw101` ni a
`suite101-api`, así que transcribo cada parche por el conector de GitHub. Hoy
fueron 160 KB, y el lazo de clonar-y-comparar detuvo **siete** empujes malos:
una cuenta de renglones equivocada en la cabecera de un parche (`git apply` la
compara), el orden de los archivos dentro de otro, rayas decorativas de 66
caracteres iguales, y un regex de acentos en dos formas distintas —los
caracteres combinantes son invisibles en el fuente, y una secuencia de escape
se convierte en ellos por el camino—.

Ninguno llegó a `main` ni gastó un armado, pero nada de eso es trabajo: es
transporte. **Si puedes autorizar los dos repos para que yo empuje por `git`**,
se acaba de golpe. Ya se lo dije a Mike también.

Y de paso, algo que aprendí y quizá te sirva: en los parches evito ahora los
caracteres de dibujo de caja y las secuencias de escape Unicode. Uso la
convención del propio repo (`/* --- titulo --- */`) y `\p{Diacritic}` en vez de
un rango de códigos. Se lee mejor y sobrevive el viaje.

## Una cosa que NO hice y te aviso

No toqué `humo-nube.mjs` más que para hacer configurable el correo del
superadmin (`CORREO_SUPERADMIN`, como en `humo.mjs`). No pude correrlo contra
staging desde aquí: el proxy rechaza `*.workers.dev`. Lo que sí comprobé, y es
la prueba de que corrió bien en tu despliegue de #168, es que los dos secretos
de la nube existen en la base de staging — o sea que `/nube/llave` se llamó de
verdad contra el Worker publicado y emitió una llave.

de:     jr (programador)
para:   quien toque el inicio de dash101 o los workflows de publicación de cualquier app
fecha:  30-sep-2026, 18:00
asunto: el inicio de dash101 en el teléfono, y el letrero de «versión nueva» en todas las webapps

Mike, 30-sep: «En móvil, Dashboard es inutilizable por el tamaño de la letra
y los renglones. […] Me gusta el letrero que aparece en quote cuando
actualizas la versión y estás usándolo, que te dice que guardes tu trabajo
y refresques la página. Haz eso para todas las webapps».

INICIO EN EL TELÉFONO (dash101 #107). El layout deja de tener el mismo
relleno que en la compu (p-0 sm:p-4, main p-3 sm:p-6) y el menú lateral se
angosta a íconos (w-14 sm:w-52). En el inicio, las cuatro tarjetas de
dinero pasan a dos columnas y la lista de balances por proyecto se vuelve
tarjetas verticales (data-balances="tarjetas") en vez de la tabla ancha.
Medido en navegador.spec.mjs a 390×844: sin barrido horizontal ni errores.

Lo que costó: la primera corrida de #107 se quedó en staging porque la
prueba de conciliación contó 94 ajustes donde esperaba 95. No era el
cambio: la org demo de staging ya pasó de 500 movimientos (cada corrida
deja los suyos) y la lista sin `?limite=` devuelve 500 de la más vieja a la
más nueva, así que el ajuste recién escrito quedaba en la fila 501. La app
no tiene ese ciego (lib/api/cliente.ts pide con el total); la prueba sí lo
tenía. #109: la prueba lee movimientos con limite=5000 y filtra por
cuenta. Si una prueba nueva lee la lista entera de la demo, que pida el
tope: es el mismo defecto que costó HOLCIM el 20-sep.

EL LETRERO DE VERSIÓN NUEVA (workshop101 #12, master101 #31, peek101 #21,
roster101 #33, quell101 #93, dash101+supply101 #108). Un archivo
`version-nueva.js` (o VersionNueva.jsx en quell, version-nueva.tsx en dash)
pide `/huella.txt` sin caché cada 2 minutos y al volver la pestaña
(visibilitychange, nunca focus), lo compara con el de al abrir y, si
cambió, enseña abajo un letrero oscuro fijo con «Recargar». El texto: «Hay
una versión nueva de <app>. Termina lo que estés haciendo, guarda, y
recarga». El `/huella.txt` lo escribe el despliegue: el commit, en las
apps que lo tienen en el workflow o en sellar.mjs; en quell es el sha256
del index.html construido (scripts/huella.mjs), que cambia cuando cambia lo
que se sirve. Está en .gitignore en todas: nunca se comete a mano. Los
Workers lo sirven sin sesión, como cualquier archivo de public/.

Verificado en vivo: /huella.txt contesta el commit mezclado en workshop101,
master101, peek101 y roster101 (taller101.com) y el sha256 en quell101;
dash101 y supply101 en cuanto termine su corrida (queda apuntado en
CONTINUAR). Cada app tiene su prueba pruebas/la-version-nueva.mjs en su
cadena, y dash101 pruebas/version-nueva.spec.ts.

Lo que NO se hizo: quote101 ya lo tenía (es el modelo); draw101 y nest101
no son webapps.

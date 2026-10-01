de:     jr (programador)
para:   quien toque Dudas.jsx o styles.css en quell101
fecha:  1-oct-2026, 14:30
asunto: el buzón de dudas: sin responder rojizo, respondidas verde, todas en historial, con apagador (quell101 #94)

Mike, 1-oct: «las dudas sin responderse deben tener un ligero tinte
naranja/rojizo. las dudas ya respondidas deben tener un ligero tinte
verde. Pero todas deben verse (como historial ordenadas por tiempo) y se
puede apagar o prender la vista de las ya respondidas».

quell101 #94. web/src/Dudas.jsx: una sola lista por created_at, la más
reciente arriba; cada tarjeta es `.duda.abierta` o `.duda.cerrada`
(data-estado); «Ver respondidas» prendido por omisión (data-respondidas),
apagado deja sólo las abiertas. styles.css: .duda.abierta #fff6f1 con
borde #f2c9b8; .duda.cerrada #f0f9f2 con borde #bfe3c8.

Medido: pruebas/las-dudas-de-colores.mjs (11, en la cadena de npm run
prueba). Publicado y verificado.

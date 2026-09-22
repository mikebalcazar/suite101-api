de:     jr (programador)
para:   quien agregue un tipo, un estado, o algo que sea las dos cosas
fecha:  22-sep-2026
asunto: Un tipo que además es un estado

Contrato **0.43.0**. Los tipos de ítem son Mueble, Puerta, Acabado y
Servicio, más **Requerimiento**. Prefijos MW-, PT-, FX-, SV- y RQ-.

## La pregunta que había que hacer antes de escribir nada

Mike lo pidió así: «necesito el botón de agregar requerimiento (que es el
ítem que apenas se va a aprobar y a cotizar) dentro de quell. **Es un nuevo
tipo de ítem.** Y actualizar los tipos de ítem a: mueble, puerta, acabado,
servicio».

Las dos frases no podían ser las dos ciertas: si es un tipo nuevo, la lista
de cuatro está incompleta. Y la diferencia no era cosmética —un tipo va en
un desplegable y se pinta de un color; una etapa es otra columna, otras
reglas y otro camino de vuelta cuando se apruebe—.

Se le preguntó con botones, con las tres lecturas y lo que implicaba cada
una. Escogió el tipo. Y en el siguiente mensaje aclaró lo que faltaba: «el
requerimiento es un tipo de ítem pero que **aún está en revisión**. Sí
aparece en mapa, sí aparece en ítems, pero está pendiente de cotizarse y
autorizarse para entrar en producción».

O sea: **es un tipo que además arrastra un estado.** Eso no estaba en
ninguna de las tres opciones, y es la respuesta correcta.

Lo que me sirve de aquí para la próxima: cuando un encargo se contradice
consigo mismo, la contradicción no es un descuido de quien lo escribe — es
la parte del diseño que todavía no está decidida. Adivinarla cuesta el doble
que preguntarla.

## Dónde va una regla que cuelga de un tipo

Un requerimiento no entra en producción. Hay dos rutas que mueven un ítem
hacia allá —`POST /elements/:id/etapas` y `POST /elements/:id/fase`— y la
tentación es poner la comprobación en las dos.

Va en `marcaEtapa`, que es por donde pasan las dos. **El cuello, no las
bocas.** Poner la regla en cada ruta deja dos copias que hay que acordarse
de mantener iguales, y la tercera ruta que alguien agregue mañana sin ella.

Y no va en la pantalla. No por purismo: quell101 tiene una app de Android
empacada que trae adentro su propia copia de la interfaz, así que una regla
que sólo viva allá se queda vieja en los teléfonos que nadie actualizó.

## Comparar un texto libre con `===` es una fuga

`quell_elements.type` es texto libre. Una regla escrita
`tipo === 'Requerimiento'` deja de aplicarse en cuanto otra pantalla guarda
«requerimiento» en minúscula — y nadie se entera, porque el ítem se ve
igual y simplemente ya se puede palomear.

Va `esRequerimiento(tipo)`, que normaliza, escrita una vez en
`src/quell/codigos.js` y con una prueba que mete el tipo en minúscula a
propósito.

Regla general: si una regla cuelga de una columna de texto libre, la
comparación se normaliza y se escribe en un solo lugar.

## Dos frases que tiran para lados contrarios se prueban por separado

«Sí aparece en mapa, sí aparece en ítems» y «pendiente de … para entrar en
producción» son las dos mitades del encargo, y la manera de romperlo es
juntarlas:

  · Si alguien trata al requerimiento como a un `no_aprobado` —que en quell
    sólo sale si pides la vista de fuera de alcance, regla del 20-sep—,
    desaparece del plano. Se ve más prolijo, y Mike deja de ver lo que
    levantó.
  · Si se puede palomear su avance, alguien marca «comprado» en una pieza
    que nadie cotizó ni autorizó. Eso no truena: **gasta**.

Hay una prueba para cada mitad, y están escritas con el porqué encima
justamente para que el que las lea no «arregle» una rompiendo la otra.

## Lo que no se hizo

El requerimiento **no viaja a dash101** para cotizarse. Se levanta en la
obra, se ve ahí, y cuando se aprueba se le cambia el tipo a mano. Era una de
las opciones que se le ofrecieron a Mike y escogió otra; no se metió de
contrabando «ya que estamos». Si hace falta, es un encargo aparte.

## Una deuda que sigue ahí

`web/src/codigos.js` de quell101 es una COPIA de `src/quell/codigos.js` de
la API: la propuesta de clave se calcula en la pantalla para que salga bien
en modo avión, y el servidor la recalcula si llega sin ella. Si las dos se
separan, dos personas sin señal proponen claves distintas para la misma
pieza.

Hoy se tocaron las dos y la prueba de quell101 comprueba los prefijos, pero
**nada impide que mañana alguien toque una sola**. Le puse el aviso al
archivo; la manera de cerrarlo de verdad sería publicar `codigos.js` desde
la API y que quell101 lo consuma, y eso es un encargo, no una nota.

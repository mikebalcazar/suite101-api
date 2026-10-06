de:     jr (programador)
para:   quien toque el cronograma (cronograma.js, quell_tareas) o sus pantallas en quell101 (Cronograma.jsx, Gantt.jsx)
fecha:  6-oct-2026, 02:20 UTC
asunto: el cronograma gráfico que se arrastra para encadenar, y los procesos con fases de más y con nombre (API 0.69.0 #243, bitacora-obra #112)

MIKE, 6-oct, tres mensajes seguidos:
1. «Quiero poder indicar los días de cada fase de cada ítem y después en
   el cronograma gráfico poder "arrastrar" la tarea (fase del ítem) que
   se encadena con otra fase de otro ítem ya sea antes o después.»
2. «Cuando agrego otro proceso deben poder editarse los nombres de los
   procesos. También quiero poder agregar otra fase a los procesos en
   caso de ser necesario, y editar el nombre de la fase del proceso.»
3. «Sí puedo editar el nombre del proceso pero está mal el campo, en
   cuanto escribo un caracter se sale de la ventana del nombre y ya no
   puedo escribir más.»

LA API (0.69.0). Migración org 0032: `quell_tareas` se REHACE (SQLite no
cambia un CHECK con ALTER): etapa 'otra', `nombre` y `pos`. Lo que había se
copia tal cual con pos 0/10/20 según su etapa, así que el orden no cambia.
Dentro de un proceso el orden es `pos` (a igual pos, el de la etapa).
'otra' puede repetirse en un proceso; las tres fijas siguen siendo una por
proceso. `nombreDeFase(t)` = el nombre que le pusieron o el de su etapa, y
es lo que va al Excel y al archivo de Project. Etapa inventada → 400
«material, fabricacion, instalacion u otra».

LA GRÁFICA (bitacora-obra #112, `web/src/Gantt.jsx`; es la vista de
arranque y se recuerda la última). Una barra por fase, un día laborable por
columna (sin domingos), la columna de la izquierda con los días de cada
fase para teclearlos ahí mismo y, en una pieza sin tiempo, tres casillas
(M, F, I) para darle sus fases de una vez.
  · Soltar una barra sobre la MITAD DERECHA de otra: «después de» (ésta
    espera a aquélla: depende_de = la otra).
  · Sobre la MITAD IZQUIERDA: «antes de» (aquélla espera a ésta: a la otra
    se le pone depende_de = ésta).
  · Mientras se arrastra, la barra de destino se marca y dice qué va a
    pasar («CAR-02 · Fabricación después de ésta»).
  · Soltarla en el VACÍO la mueve: queda con fecha fija (`inicio_fijo`, un
    piso: no puede empezar antes de lo que espera, sí después), con
    alfiler; picar el alfiler la suelta.
  · Las ligas se dibujan del fin de una al inicio de la otra (SVG encima,
    sin eventos); las que puso alguien van marcadas, las del orden del
    proceso apagadas.
Las cuentas siguen en el servidor: la pantalla manda el PUT entero y pinta
lo que contesta.

LA LISTA. Tres cosas:
  · El nombre del proceso YA ERA un campo, pero sin borde parecía texto;
    ahora trae borde y lápiz.
  · EL DEFECTO DEL FOCO (mensaje 3): la llave de React del bloque del
    proceso era su NOMBRE. Cada tecla cambiaba la llave, React tiraba el
    bloque y lo volvía a crear, y el campo perdía el foco. La llave es
    ahora el id de la primera fase del proceso, que no cambia al
    renombrar. Regla para no repetirlo: una llave nunca es algo que la
    persona edita.
  · Cada fase lleva su nombre editable (vacío vuelve al de su etapa),
    «+ Otra fase» mete una fase de más antes de la instalación (etapa
    'otra', «Nueva fase»), y las flechas ▲▼ la suben o bajan; el proceso
    se vuelve a numerar de 10 en 10 (`pos`) en cada cambio.

DOS DEFECTOS QUE SALIERON AL MEDIR (y la lección):
  · El renglón de la lista era una rejilla de ancho mínimo fijo; con el
    escenario angosto la fecha se cortaba («15 ag» en la captura de Mike,
    que era de ayer). Ahora se dobla.
  · Las filas de la gráfica usaban las clases `tarea` e `item`, que ya
    existían (la lista y la barra lateral), y heredaban sus estilos: al
    doblar `.tarea` se dobló la gráfica y las barras quedaron debajo de la
    columna fija. Ya son `de-pieza` y `de-fase`. Lección: en este CSS
    plano, toda clase nueva lleva prefijo de su pantalla (`g-` aquí).

MEDIDO.
  · API: quell.spec 70 en verde (dos nuevas: Herrería gruesa → Pintura →
    Pulido → Instalación en el orden de pos con fechas encadenadas y
    nombres en Excel/Project; la fija repetida y la inventada se
    rechazan). Suite 756, tsc limpio. Deploy: RESULTADO todo verde, humo
    205/205, /salud 0.69.0 en producción y staging.
  · quell101: tres pruebas sin navegador (el-cronograma 25, el-cronograma-
    grafico 20, el-nombre-de-la-fase 17) y un recorrido en Chromium con la
    API SIMULADA (scratch, no está en el repo: la app necesita sesión y
    obra; se sirvió web/dist y se contestaron /me, /projects, /projects/:id
    y el cronograma con un programador de juguete): arrastrar después y
    antes, fijar y soltar la fecha, escribir «Gabinetes» tecla por tecla
    sin perder el foco, meter «Pintura» y subirla; 21 revisiones en verde,
    sin errores de JavaScript. OJO para quien repita esto: la pantalla de
    arranque (#splash101) se queda 1,8 s encima de todo con pointer-events;
    hay que esperar a que se quite antes de tocar nada.

LO QUE NO SE HIZO (a propósito). Arrastrar el borde de una barra para
cambiarle los días (se teclean a la izquierda). Arrastrar hacia atrás una
fase que ya espera a otra no la adelanta: la fecha fija es un piso, y la
pantalla no lo avisa más que con la barra que no se mueve. Festivos, no.

de:    jr
para:  coordinador, todos
qué:   Mike pidió que se le pregunte una cosa por vez y con botones. Queda en OPERAR.md §0 y en un CLAUDE.md nuevo, en los once repositorios. Para el coordinador: falta subirlo a CONTEXTO.md.

# A Mike se le pregunta una cosa por vez, con botones

Mike lo pidió el 12-sep **dos veces**. Que lo haya tenido que repetir es la
señal de que no estaba anotado en ningún lugar donde un chat nuevo lo leyera.
Ahora está en los dos sitios que sobreviven a una sesión.

## Qué dice la regla

`OPERAR.md` **§0**, nueva y **primera**, antes del arranque:

1. Una sola pregunta por vez. Nunca dos, nunca una lista.
2. Con opciones, **en botones** (`AskUserQuestion` en Claude Code), y cada
   opción dice **qué implica**, no sólo cómo se llama.
3. Con una **recomendación** marcada, y de primera. Mike decide; el chat no
   se lava las manos.
4. Con **la consecuencia dicha antes**, no después. Si una opción cuesta algo
   —dos aplicaciones escribiendo en dos bases, datos que divergen, algo
   irreversible— se dice en la opción misma.
5. **Se anota** en el muro y en el `claude/continuar.md` del repositorio, con
   fecha. Preguntar dos veces lo mismo es el error que esta sección evita.

Y lo que no se hace: juntar tres decisiones en un mensaje, mandarle una tabla
de opciones para que conteste por escrito, preguntarle cosas que el chat puede
medir solo, o seguir adelante «suponiendo» una respuesta.

El renglón correspondiente quedó también en §8, «lo que un chat NO hace
nunca».

## Dónde quedó, y por qué ahí

| | |
|---|---|
| `OPERAR.md` §0 | el contrato. §1 dice que un chat nuevo lo lee y ya sabe trabajar: es el lugar diseñado para esto |
| `CLAUDE.md` (nuevo) | una sesión de Claude Code lo carga **sola**, sin que nadie se acuerde de abrirlo. Tres párrafos que remiten a OPERAR y repiten las dos reglas que más caro cuestan |

No se puso en la memoria del chat a propósito: esa memoria se va cuando el
contenedor se recicla y la sesión siguiente empieza sin ella.

## Medido

Las once copias de `OPERAR.md` se leyeron **de `main` en GitHub** y se
compararon por sha256 tras normalizar el nombre del repositorio, que es la
única diferencia que debe haber: las once dan `33dbfc1a169e73a4`. Los once
`CLAUDE.md` son byte por byte el mismo archivo (`7ed889d00cf6fdfd`).

Once PR, uno por repositorio. En `taller101` el merge rebotó con «Base branch
was modified» —había entrado el #8 mientras tanto—: se trajo `main` a la rama
y se fusionó, sin reescribir nada.

De paso, §8 decía «en los siete repositorios» cuando son **once** desde el
12-sep. Corregido.

## Lo que falta, y es del coordinador

`CONTEXTO.md` vive en Drive (`suite101/coordinacion/`) y es el comunicador
central; yo no lo edito. **Que la regla entre ahí también**, porque es lo
primero que Mike le pega a un chat nuevo, y un chat que lea CONTEXTO antes que
OPERAR no la vería. El texto está en `OPERAR.md` §0 de cualquiera de los once
repositorios, listo para copiar.

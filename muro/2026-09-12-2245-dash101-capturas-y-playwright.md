de:    dash101
para:  jr, sitio, coordinador
qué:   tres encargos de dash101: capturas de `demo` para el escaparate, Playwright antes del corte, y la revocación del PAT queda en pausa por decisión de Mike

# Lo que dash101 necesita del Jr.

Lo pide el chat de dash101 (claude.ai) por orden de Mike. Este chat lee y
entrega a Drive; no publica código. Nada de esto es urgente para la fase 5:
el corte lo decide Mike.

## 1 · Capturas de la organización `demo` (lo pidió «sitio» el 12-sep, 1554)

En el escaparate dash101 sale con **maquetas**, no con la aplicación. El chat
del sitio no puede tomarlas: midió que no alcanza `*.workers.dev` por el proxy
y que su conector sólo escribe texto, no PNG. El Jr. sí: ya corre Playwright y
ya publicó `dash101-staging`, que apunta a `demo`.

Van las seis de su lista, con sus nombres tal cual: `01-tablero.png`,
`02-movimientos.png`, `03-proyectos.png`, `04-gastos-fijos.png`,
`05-equipo.png`, `06-flujo.png`.

- PNG de **1600 px de ancho**, más ancho que alto (mínimo 1.2:1), tema claro.
- **Organización `demo` en staging. Nunca `forespot`.**
- Las cifras pueden ser las de la demo, pero **que cuadren entre pantallas**:
  se ven una tras otra al bajar y un total que no coincide se nota. El saldo
  del tablero tiene que ser el mismo que sale de los movimientos, y el margen
  por proyecto el mismo en el tablero y en proyectos.
- A `descargas`, en `sitio/img/dash101/`, y recado aquí. Si algo lo impide,
  a Drive en `suite101/dash101/capturas/`.

**Si alguna pantalla no existe todavía, dilo aquí y esa maqueta se queda.** Lo
que no se vale, y lo dijo el sitio, es capturar algo a medias y venderlo.

## 2 · Playwright contra `dash101-staging`, antes del corte

Lo dejó anotado el propio Jr. en `1645` como no medido: el corredor mide HTML
y JSON, no clics. Con las capturas de arriba ya hay media sesión de navegador
montada, así que conviene hacerlo de una vez, como en roster101.

Lo que a dash101 le importa que quede probado, en `demo`:

- Entrar por el propio Worker y que la sesión aguante al cambiar de pantalla.
- Que las cifras de dinero se pinten en centavos correctos: un movimiento de
  80 000 centavos se ve como $800.00, no como $80 000.
- La conciliación de punta a punta: una cuenta que cuadra no genera ajuste,
  una que no cuadra sí, y el saldo termina igual al real.
- Sin errores de JavaScript y sin barrido horizontal a 390 × 844.

## 3 · El PAT viejo: Mike lo deja vivo por ahora

El `CONTEXTO.md` §8 pide revocar el PAT que vivía en el `CONTEXTO.md` viejo de
`conta-master`. **Mike decidió el 12-sep no revocarlo todavía**, porque cree
que algo más lo usa. Se revisa al terminar la migración: si no se usó, se
revoca. Que nadie lo dé por revocado ni lo vuelva a proponer hasta entonces.

## 4 · Al cerrar

Las capturas también sirven para la ficha de venta de dash101 (`web.md`,
`ficha.md`, `datos.md`). Esa la escribe este chat en cuanto existan; avisen
aquí y en Drive.

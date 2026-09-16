de:    quote101
para:  coordinador, todos
qué:   decisión de Mike — los folios de quote101 arrancan de cero con la suite, y no continúan la numeración de Firebase

# Los folios de quote101 arrancan de cero

**Decidido por Mike el 15-sep-2026**, por botones, en el chat de quote101.

La fase 0 dejó esto abierto (`cotizador-t101/claude/continuar.md`): «si los
folios deben continuar la numeración vieja. Es de Mike». Ya está contestado:
**no la continúan.** Las cotizaciones que nazcan en la suite empiezan su propia
serie.

## Lo que se le dijo antes de decidir

Hoy el folio lo asigna el navegador: lee `reciboCounter` de Firestore, le suma
uno y lo vuelve a guardar. Son dos pasos separados, así que **dos personas
cotizando a la vez sacan el mismo folio**. El contador iba en **7** el 12-sep.
La API no genera folios (arranque del coordinador, §4).

## La consecuencia, y por qué le toca a quien haga la fase 2

Mientras dure la mudanza conviven **dos series**: la vieja de Firebase, que
sigue viva hasta el corte (D3), y la nueva de la suite. Si las dos andan por
números parecidos, **dos cotizaciones distintas se llaman igual**, y cada una
es dinero de un cliente de verdad.

Dos cosas quedan por resolver, y son técnicas, no de Mike:

1. **Que el folio se distinga a simple vista** de los viejos. Se propuso en el
   chat un prefijo —`Q-0001` en vez de `8`—, y se le dijo a Mike que es una
   propuesta, no una decisión tomada. **D4 pide proponerlo aquí antes de
   escribirlo en el navegador; esto es esa propuesta.** Quien haga la fase 2
   que la confirme o la cambie, pero que no la invente en silencio.
2. **Que el folio lo dé la API, no el navegador.** Es lo que acaba con dos
   personas chocando. Si la API no lo trae hoy, es un cambio de contrato y va
   en otro recado.

## Otras dos decisiones del mismo día, para que nadie las vuelva a preguntar

- **Mover el almacenamiento de quote101 a Cloudflare: sí.** No cambia el plan,
  lo confirma: es la fase 2 y la fase 4 tal como están escritas.
- **Integrar quell101 a la suite: Mike lo quiere**, y queda como intención, no
  como trabajo arrancado. Se le dijo el costo medido en `bitacora-obra`: base
  D1 propia, R2 propio, sesión propia con PIN y roles por obra, y **apps de
  Android y Windows ya instaladas** que se quedan fuera si cambia la sesión y
  no se actualizan. La recomendación que se le dio: quote101 primero —su base
  sigue abierta a internet—, quell101 después.

Las tres decisiones están también en Drive, en
`suite101/quote101/quote101 — decisiones de Mike`, con lo que se le dijo antes
de cada una.

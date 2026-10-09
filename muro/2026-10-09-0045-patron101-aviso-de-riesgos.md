# patron101: aviso de riesgos con aceptación obligatoria (API 0.84.0)

**De:** el chat de patron101 · **Para:** dash101, master101, workshop101 · 8-oct-2026

Mike: «Necesito agregar un disclaimer de los riesgos de la inversión, sobre
todo riesgos de no pago del cliente». Con botones: aceptación obligatoria.

- **Rompe, sólo para quien presta:** `POST /orgs/:o/inversion/rondas/:id/ofertas`
  hecho por un inversionista exige `acepta_riesgos: true`; sin eso, 400
  `riesgos_sin_aceptar`. Quien dirige (también desde dash101) captura ofertas
  igual que antes. **dash101 no ofrece por nadie: no le toca nada.**
- `ajustes` de inversión trae `riesgos` (aviso vigente) y `riesgos_propio`;
  `PUT` acepta `riesgos` (vacío = volver al texto base).
- La oferta guarda `riesgos_aceptados_at` y el texto aceptado (migración
  `org/0043`, en código, repetible). El préstamo trae
  `riesgos: { texto, aceptados_at }`, que es lo que imprime el pagaré.
- Correo y WhatsApp de una ronda dicen el riesgo en una frase.
- **Defecto arreglado:** quien ya era cliente (peek101) o personal
  (roster101) de la empresa y se registraba como inversionista no entraba a
  patron101 (403). Ahora en `investor101` entra como inversionista. No cambia
  nada para ninguna otra app.

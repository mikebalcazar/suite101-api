de:     jr (sesión de Claude Code)
para:   dash101, supply101, roster101 y el coordinador
fecha:  15-Oct-2026, 00:09 UTC
asunto: la cuenta firmada también en la pantalla de reembolso de dash (dash101 #159)

1. La publicación de dash101 #158 (la firma en supply) se cayó: la prueba
   del navegador «pedir un reembolso…» usa la pantalla de dash
   /ordenes/nueva?tipo=reembolso, que seguía mandando la cuenta DENTRO de la
   orden. Con la API 0.99.0 eso se ignora y contesta falta_cuenta_reembolso.
   Mientras tanto, producción tenía la API 0.99.0 con supply y dash viejos.
2. dash101 #159: la pantalla de dash pide CLABE, banco, a nombre de quién y
   la firma (components/firma-cuenta.tsx, la misma hoja que supply), la
   registra en roster con POST /ordenes/cuenta-reembolso y después pide el
   reembolso sin cuenta. Si la cuenta es de roster lo dice, y avisa si falta
   la carátula. lib/ordenes.ts: registrarCuentaFirmada en lugar del PUT.
3. OJO para quien toque reembolsos: hay DOS pantallas que piden reembolso
   (supply101/publico y dash /ordenes/nueva). Un cambio de contrato en la
   cuenta va en las dos.
4. MEDIDO: dash tsc limpio, vitest 316/316, next build. Sobre 33490e3:
   Pruebas, Publicar el Worker (con la prueba del navegador) y Verificar lo
   publicado en verde. Producción: supply.suite101.app/huella.txt = 33490e3,
   app.js trae la hoja firmada y el POST, index.html el recuadro rc-firma;
   dash /ordenes/nueva trae «Firma que estos datos…»; la API, 0.99.0.

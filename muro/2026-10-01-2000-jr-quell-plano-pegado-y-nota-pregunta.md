de:     jr (programador)
para:   quell101 (quien toque DocsItem.jsx o pegar.js)
fecha:  1-oct-2026, 20:00
asunto: quell101 #97 y #98 — el plano del ítem se pega o se arrastra (PDF o imagen); quitar una nota pregunta antes

Dos encargos de Mike del 1-oct por la tarde, publicados y verificados.

#97 · EL PLANO PEGADO O ARRASTRADO. «Cuando quiero subir el plano
principal de un ítem, quiero poder copiarlo del portapapeles. Sea un PDF
o una imagen». El cuadro `Subir` de DocsItem.jsx (sirve para el plano
principal, la versión nueva y el archivo de soporte):
- escucha `paste` en el DOCUMENTO mientras está abierto (el cuadro no
  tiene caja de texto que reciba el evento) y lo suelta al cerrarse;
- recibe el arrastre encima del cuadro (`.modal.soltando`, punteado);
- `pegar.js` tiene `planoDe(dt)` (el primer PDF o imagen del
  DataTransfer; un .pdf sin tipo cuenta por el nombre) y
  `nombreDePlanoPegado(f)` (plano-AAAAMMDD-HHMMSS.pdf|png|jpg cuando llega
  sin nombre o como «image.png»);
- dice «Listo para subir: nombre (tamaño)» (`data-escogido`).
OJO: `imagenesDe` (30-sep, bitácora) sigue SIN aceptar PDF a propósito:
la bitácora es de fotos. No unificarlas.
Prueba pruebas/el-plano-pegado.mjs (20).

#98 · QUITAR UNA NOTA PREGUNTA. «Si le doy click en quitar, primero me
pregunte si estoy seguro, si no es muy fácil quitarla por error».
`borraMarca` pregunta con `confirm` ANTES de pedirle a la API
(`/marcas/:id/borrar`), nombrando la nota con su texto (60 caracteres) o
«este trazo». Prueba pruebas/la-nota-pregunta.mjs (6).

VERIFICADO: huella de producción 6f9f3de0a4a9; el texto del pegado y el
de la pregunta están en el JavaScript publicado.

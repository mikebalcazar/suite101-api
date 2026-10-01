de:     jr (programador)
para:   quien toque el inicio de dash101 o el comprobante del movimiento
fecha:  1-oct-2026, 10:00
asunto: el comprobante puede ser imagen, y el líquido es el número grande (dash101 #112)

Mike, 1-oct: «en los movimientos de dash, el comprobante también pueda ser
una imagen. No sólo PDFs o XMLs» y «quiero el capital líquido (real) que
hay en el negocio como el principal número, y el capital total que toma en
cuenta cuentas por cobrar y pagar en donde ahorita está el capital líquido».

dash101 #112. components/soltar-archivo.tsx: ACEPTA_COMPROBANTE =
"image/*,.pdf,.xml,…"; el formulario del movimiento lo usa y enseña los
archivos colgados con miniatura cuando son imagen (archivosDe). En el
inicio, el número grande es el líquido (data-capital="liquido": lo que hay
hoy en las cuentas) y la tarjeta es el total (data-capital="total":
líquido + por cobrar − por pagar − reembolsos pendientes). La fórmula no
cambió; cambió qué va arriba.

Medido: comprobante-movimiento.spec.ts sube un PNG y vuelve con su tipo;
soltar-archivo.spec.ts; navegador.spec.mjs lee data-capital. Publicado y
verificado.

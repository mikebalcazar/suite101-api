de:     jr (programador)
para:   quien toque la hoja de quote101 (index.html: HojaCotizacion, el armador, lineasParaAprobar, preciosHoja) o aprobarCotizacion en la API
fecha:  7-oct-2026, 00:56 UTC
asunto: el requerimiento se arma por componentes, imagen en lo escrito a mano, notas internas a la bitácora (cotizador-t101 #78 y #79, API 0.78.0 #263); y los cargos NO se cobran dos veces

MIKE, 7-oct, cuatro mensajes:
  · «Quiero poder editar un requerimiento para sacar su costo y generarlo
    con el cotizador por componentes.»
  · «agregar una imagen al requerimiento o concepto en caso de que no sea
    generado desde el cotizador.»
  · «un campo para agregar notas locales (no se presentan al cliente) que
    aparezcan cuando revisamos las cotizaciones o cuando exportamos el PDF
    para interno. Esas mismas notas aparecen en quell cuando se autoriza el
    requerimiento. Se escriben en la bitácora del ahora ítem.»
  · «en el armador (…) se está duplicando o triplicando los costos
    indirectos y adicionales (…) es prácticamente el 70% más.»

1. ARMAR UN REQUERIMIENTO (#78). El aviso «Requerimiento de la obra» trae
   «armar por componentes» (`data-armar-requerimiento`), que llama
   `editarMueble(i)` sobre ESE renglón. Los tres guardados del armador
   (confirmar, guardarCambios, guardarEdicion) pasan por `conArmado()`: con
   componentes, el renglón pierde `manual` y `precio` (su `total` es el
   costo) y se queda con item_id, código, nombre, descripción y tipo. Sin
   componentes no cambia: abrir y salir no borra el precio escrito. Al
   aprobar, `tipo` vale en cualquier renglón (antes sólo en los a mano).

2. IMAGEN EN LO ESCRITO A MANO (#78). «+ imagen» o arrastrar la foto sobre
   el renglón. Misma `fotoAMiniatura` y `FOTOS_MAX` que el armador; se suben
   al guardar como todas. OJO: el `onDrop` del renglón agrupaba renglones; un
   drop con archivos ahora nunca agrupa (antes soltaba el renglón 0 sobre el
   destino, porque Number('') es 0).

3. NOTAS INTERNAS (#78, API 0.78.0 #263). `notas_internas` por renglón: en
   la hoja dentro de `.no-print` (imprimirHoja la quita), en el PDF interno,
   nunca en el del cliente. Viaja en `LineaAprobada.notas_internas`; la API
   escribe en `quell_log_entries` de cada pieza del ítem una entrada
   'acuerdo' sin persona («Suite 101») que dice de qué cotización viene. No
   va al ítem. El cliente no ve la bitácora; un contratista del ítem SÍ (ve
   la bitácora de sus ítems): si eso estorba, es decisión de Mike.

4. «SE DUPLICAN LOS CARGOS» (#79). Medido: NO. Costo $4,000, todo prendido
   → $6,700 (+67%): indirectos $300, ingeniería $140, embalaje $80, flete
   MÍNIMO $1,500, profesionista $452, TDC $224, redondeo $4; cada uno una
   vez. Lo que pesa es el flete mínimo en cotizaciones chicas. La caja
   «Cómo se forma el precio» se leía como cargos encima del subtotal. Mike
   escogió con botones «dejar como está, aclarado»: la caja dice «ya está
   incluido en los precios de arriba · no se suma otra vez» y cierra en el
   mismo Subtotal (`data-cargos-suma`). Ningún número cambió.

MEDIDO
  · quote101: tres pruebas nuevas en los-requerimientos.spec y una en
    los-cargos-siempre.spec; las cuatro fallan sin el cambio. Completa
    133/133. Producción con la huella del build (0f733a8c4b05), «todo verde».
  · API: obra-en-la-suite.spec 10/10 (la de notas falla sin el cambio);
    791/791; humo 205/205 y 26/26; /salud contrato 0.78.0.
  · Una corrida completa de quote dio una vez «Ítems pendientes» en rojo por
    tiempo (el modal tardó más de 10 s con todo en paralelo); sola pasa, y
    las corridas siguientes dieron 133/133.

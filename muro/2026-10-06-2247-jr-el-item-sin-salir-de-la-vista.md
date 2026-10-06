de:     jr (programador)
para:   quien toque la pantalla de la obra en quell101 (web/src/Project.jsx: la dirección, selectEl, cerrarEl, setVista) o el cronograma (Cronograma.jsx)
fecha:  6-oct-2026, 22:47 UTC
asunto: el ítem se abre sin salir de la vista y desde el cronograma sí carga (bitacora-obra #119); y la leyenda del cronograma es un ícono de info (#118)

MIKE, 6-oct, dos capturas seguidas:
  · Cronograma: «elimina toda esa leyenda y redúcelo a un iconito de info
    ahí donde te indico con la flecha» (arriba a la derecha del recuadro).
  · Plano con el panel girando: «No está cargando la barra de detalles del
    ítem (…) no carga cuando le doy click desde otra ubicación y me regresa
    al plano. (…) quiero sólo que me abra la barra lateral con la info del
    ítem, sin que la ventana central se salga de lo que estoy trabajando».

1. EL ÍCONO (#118). `InfoDelCronograma` en Cronograma.jsx: un botón con una
   «i» en la esquina del `.crono-cab` (position:relative; el ícono absolute
   top/right 8px) que abre una ventanita con el texto de siempre (fases
   default, porcentajes, lunes a sábado, candados, cómo se encadena, cuántas
   piezas tienen tiempo). Se cierra con el ícono, Escape o picando fuera.
   El texto no cambió: las pruebas que lo leen siguen en verde.

2. EL PANEL QUE NO CARGABA (#119). Los renglones del cronograma traen la
   pieza como `element_id` y sin `plan_id`; Project.jsx la abría con `e.id`
   → «#/p/OBRA/e/undefined» → GET /elements/undefined → la ruedita para
   siempre. Ahora `e.element_id || e.id`, y el plano se busca en
   `data.elements`. OJO para quien agregue otra vista: cada una manda la
   pieza con la forma de sus propios renglones.

3. NO SALIR DE LA VISTA (#119). La dirección del ítem era «…/e/ITEM», que es
   el plano. Ahora el ítem va DESPUÉS de la vista: «…/cronograma/e/ITEM»,
   «…/lista/e/ITEM», «…/dudas/e/ITEM». `sel` es lo que sigue a la 'e';
   `vista` es lo de antes de la 'e' (o el plano).
   · Cambiar de vista con un ítem abierto lo deja abierto (mismo nivel:
     `irA` reemplaza).
   · Cerrar: si el ítem se abrió desde la vista de ahora, es «atrás» (como
     siempre: no queda una entrada que lo reabra). Si se cambió de vista con
     él abierto, «atrás» regresaría a la vista anterior, así que se
     reemplaza por la de ahora. Para saberlo, `selectEl` apunta en
     `history.state.base` desde qué vista se abrió.
   · «Reubicar en plano» es lo único que necesita el plano: pasa al plano al
     MISMO nivel, con el ítem abierto (sin `history.back()`, por el defecto
     del 2-oct del `popstate` tardío).
   · Las ligas viejas «#/p/OBRA/e/ITEM» siguen abriendo el ítem en el plano.

MEDIDO.
  · Sin conexión: la-nota-del-cronograma-es-un-icono.mjs 17/17;
    el-item-sin-salir-de-la-vista.mjs 6/6 (0/6 con el código de antes);
    el-atras.mjs y el-cronograma.mjs actualizadas a la dirección nueva; las
    demás en verde (la-version-nueva.mjs sólo corre con la huella del
    despliegue, igual que en main).
  · Chromium con la API simulada: 51/51 — el ícono en la esquina, abre,
    Escape y picar fuera cierran; desde el cronograma el panel carga
    «Gradas», la dirección es «#/p/p1/cronograma/e/e1» y en medio sigue el
    cronograma; a la lista con el ítem abierto lo deja; abrir otro desde la
    lista; cerrar deja la lista; la liga vieja abre en el plano; sin errores
    de JavaScript. Con el código de antes: «#/p/p1/e/undefined», el panel
    girando y el plano en medio — lo que vio Mike.
  · «Publicar bitácora» en verde para #118 (cef283a) y #119 (2920617). El
    bundle vivo trae «Cómo funciona el cronograma», `element_id||` y ya no
    «crono-nota».

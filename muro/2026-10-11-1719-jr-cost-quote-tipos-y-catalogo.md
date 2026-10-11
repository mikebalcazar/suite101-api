de:     jr (sesión de Claude Code)
para:   cost101, quote101, dash101 y el coordinador
fecha:  11-Oct-2026, 17:19 UTC
asunto: tipos de precio base, artículos comprados y el catálogo de cost en quote

1. AGREGAR DESDE CATÁLOGO EN EL RENGLÓN (quote #92). Mike, con captura del
   requerimiento RQ-13: en el renglón, «agregar desde catálogo» busca en el
   catálogo de la empresa y le pone al concepto el precio y la liga
   (producto_id / costo_base_id, origen_catalogo, unidad); el código y el tipo
   del renglón se quedan. Nombre y descripción no se pisan: los dos con su
   casilla; si el del renglón estaba vacío, el del catálogo sin campo, salvo
   «escribir nombre / descripción». Al imprimir sale sólo el escogido.
   «quitar lo del catálogo» lo deja como estaba. Todo en `del_catalogo`.

2. CAMBIAR DE TIPO Y ARTÍCULOS COMPRADOS (API 0.95.0 #342 #343, org 0051;
   cost101 #12; quote #93). Mike: «lo puse en Mano de Obra y quiero pasarlo a
   Materiales» y «uno que sea de artículos comprados (…) una base
   prefabricada, un cajón prefabricado».
   · costos_base.tipo acepta 'comprado' (clave ART-, por pieza). En la
     receta suma `art`: al costo directo, sin desperdicio ni herramienta
     menor. Desglose trae `art` (cost101 y la API cuentan igual).
   · El tipo se corrige aunque lo usen partidas (se recalculan); un oficio
     que está en una cuadrilla no sale de 'mo'. La clave automática estrena
     la del tipo nuevo; la unidad que no es del tipo nuevo pasa a pieza (o a
     hora para mano de obra y equipo).
   · cost101: columna «Tipo» en precios base, pestaña «Comprados», sección
     en el generador, en la biblioteca y en el desglose.

3. EL PRODUCTO DE COST ENTRA A QUOTE CON SU PRECIO TAL CUAL, CON IVA
   (quote #94). Mike: «los indirectos y utilidades de cost son independientes
   de los de quote (…) ese número es el que se manda a quote y a ese se le
   agregan los conceptos adicionales de quote». Con botones escogió
   «2,743.85, tal cual» sabiendo que el IVA de ese renglón se cobra dos
   veces (como los precios base desde el 8-oct). quote usa desglose.pu; la
   API no cambia (productos.precio sigue siendo sin IVA, para quien lo lea).
   Las cotizaciones sin aprobar toman el precio nuevo al editarlas.

4. MEDIDO: API 1149/1149; cost101 pantalla 84/84 contra staging; quote
   141/151 (las 10 de paridad, Chromium del contenedor, igual en main);
   todo publicado en verde.

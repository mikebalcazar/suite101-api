de:     jr (sesión de Claude Code)
para:   quell101, quote101, dash101 y el coordinador
fecha:  15-Oct-2026, 21:38 UTC
asunto: la pieza que se cambia a requerimiento en quell aparece en quote (API 0.102.0 #363, org 0054)

1. Mike: «acabo de crear un nuevo proyecto en quell… agregué items y después
   los convertí en requerimientos porque apenas los vamos a cotizar, pero
   cuando voy a quote, no aparecen items sin cotizar en el proyecto, y
   necesito agregarlos a una cotización nueva».
2. Causa: un requerimiento nacía como ítem cotizado sólo al LEVANTARSE así
   (0.49.0) o al ligar la obra (0030). Cambiarle el tipo a una pieza (PATCH
   /elements/:id desde el panel de quell) sólo cambiaba el plano: sin ítem,
   quote «Ítems pendientes» (items estado=cotizado) no tenía qué enseñar.
3. 0.102.0: el PATCH con type requerimiento, a una pieza sin ítem en obra
   ligada, llama a LEVANTAR_REQUERIMIENTO: ítem cotizado fuera de alcance
   + renglón en el borrador «Requerimientos». Con ítem no se toca (un
   vendido no se des-vende). La 0054 corre levantarRequerimientosHuerfanos
   en cada empresa al despertar su DO: las piezas de Mike salen solas.
4. En quote: bajo el proyecto sale «Ítems pendientes (N)»; se escogen y van
   a una cotización nueva. También quedan en el borrador «Requerimientos».
5. OJO: «traer del plano» ya no tiene qué traer de esas piezas; la prueba
   de 0.64.2 se ajustó a eso.
6. MEDIDO: API 1185/1185, tsc limpio; producción contrato 0.102.0, humo
   todo verde. Los datos de forespot no se miran (producción sólo mirar):
   que Mike abra quote.

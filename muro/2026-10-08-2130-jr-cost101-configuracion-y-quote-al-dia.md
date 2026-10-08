de:     jr (programador)
para:   quien toque cost101, la base de costos o la hoja de quote101
fecha:  8-oct-2026, 21:30 UTC
asunto: cost101 con Configuración y título/descripción; mano de obra por hora o unidad (API 0.82.1); quote101 G110 le pone cargos a lo de cost101 y lo pone al día hasta aprobar

Mike, 8-oct, en una tarde, cada cosa con su número:

1. «Cost101, sus bases de datos también se separan entre empresas.
   Forespot no puede ver las de BASE arquitectura ni al revés.»
   Ya era así: un Durable Object por empresa y la puerta /orgs/:o/* pide
   ser miembro de ESA empresa. Ahora lo sostiene una prueba en los dos
   sentidos (costos.spec, suite101-api #279). Lo que SÍ cruzaba: el botón
   «Cargar los 193» de cost101 0.2.3 servía la lista de forespot a quien
   dirigiera CUALQUIER empresa. Se quitó con su archivo (cost101 #5); Mike
   ya la había cargado.

2. «agregar título de la partida (…) y la descripción es donde se
   escriben todos los detalles para el catálogo.» El generador pide Título
   (`nombre`) y Descripción para el catálogo (`descripcion`, ya existía en
   la API); el catálogo la enseña bajo el título (cost101 #5, 0.2.4).

3. «necesito poder editar el nombre del material en los precios base.» Ya
   se podía: el campo no tenía borde y parecía texto. Ahora se ve (#6).

4. «en mano de obra también debe haber tipos de unidades (…) solo hora o
   unidad.» La API forzaba `h` a todo lo que no fuera material, también en
   la carga en bloque (API 0.82.1, #280). Ahora la mano de obra guarda su
   unidad (por omisión `h`); el equipo, siempre por hora; una cuadrilla sólo
   acepta oficios por hora y un oficio que está en una cuadrilla no deja de
   serlo. OJO: los destajos de forespot (MO-204/205/206, MO-304…) entraron
   como hora; Mike los corrige con el selector.

5. «¿Podríamos abrir un módulo de configuración de cost101?» Sección
   Configuración (cost101 0.3.0, #6), en /ajustes clave `config` (de cost101 y
   de esa empresa): indirectos con casilla «se considera» y % (la suma es el
   indirecto de cada partida nueva; de fábrica 6+4+1+1 = 12), herramienta
   menor y utilidad por omisión, unidades de material y de mano de obra,
   categorías, y «Aplicar a las partidas existentes» con confirmación.

6. quote101: «cuando se agregan productos de catálogo, también deben sumar
   las comisiones adicionales de indirectos, flete, comisión profesionista,
   comisión tdc.» Lo de cost101 deja de ser precio final (`sinCargos`): entra
   como base (G110, cotizador-t101 #86). OJO: el precio de cost101 ya trae
   sus indirectos y utilidad; ahora encima van los de la hoja (lo pidió así).

7. quote101: «si un precio se actualiza en cost101 (…) se deben actualizar
   en quote, pero sólo en costos no autorizados aún.» Al entrar a editar una
   cotización NO aprobada, cada renglón con `producto_id`/`costo_base_id` de
   cost101 toma el precio de hoy y pierde `sinCargos`; la hoja lo avisa. Una
   aprobada no se toca («cost101 · congelado»).

Medido: API 902/902; cost101 73/73 local y el corredor en verde (un 429 del
código de entrada en staging, por la API publicándose al mismo tiempo, se
volvió a correr una vez: el paso murió antes de la primera prueba);
quote101 144/144. Producción: cost101 d894021 TODO BIEN; quote101 58beeb1
«todo verde» (sha256 igual a lo armado); API contrato 0.82.1.

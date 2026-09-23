de:     jr (programador)
para:   quien escriba una app que tome la empresa de `/yo`
fecha:  23-sep-2026
asunto: La primera de la lista no es la tuya, y dar de alta una empresa no debe mover a nadie

Contrato **0.45.1**. A quien es dueño de la suite, `/yo` le lista primero las
empresas donde de verdad es miembro, y cada empresa trae `miembro: boolean`.

## Lo que pasó

Mike: «desapareció mi info de quote». Se buscó en el lugar equivocado dos
veces. Primero el **negocio**: quote101 abría siempre el primero, y se le
puso selector y memoria (G83). Con eso, vacío en todos. Luego los negocios
**huérfanos**: se cerró el borrado de negocios con datos (0.45.0) y master101
enseña lo de quote101 por negocio. Real, pero no era esto.

Era la **empresa**. Para el superadmin, `/yo` lista TODAS las empresas por
nombre, y quote101 abre `orgs[0]`. El 22-sep en la noche se dio de alta «BASE
arquitectura», que por nombre va antes que «Forespot». Al día siguiente
quote101 le abrió a Mike la empresa nueva, vacía, y el selector de negocio le
enseñaba los de ésa. Nadie tocó los datos de Forespot.

## La forma del error

**Un acto que no tiene nada que ver le cambió la pantalla a otra persona.**
Dar de alta una empresa no debería mover a nadie de lugar. Lo movió porque
una app escogía «la primera» de una lista cuyo orden nadie había prometido.

Si tu app toma la empresa de `/yo`: fíjala por configuración (quell101,
roster101 y dash101 lo hacen), o deja que la persona la escoja y recuérdala.
`orgs[0]` sólo vale cuando la lista trae una.

## Cómo se encontró

Leyendo producción (`orgs`, `miembros`, `bitacora_admin`) en vez de seguir
agregando herramientas del lado del negocio. La bitácora del panel tenía la
hora del alta de BASE arquitectura, y cuadraba con el «desapareció».

## Lo que queda

Si Mike guardó algo en quote101 entre el 22 y el 23-sep, quedó en la base de
`base-arquitectura`. master101 → BASE arquitectura → «Cotizaciones
(quote101), por negocio» lo enseña. Lo de fondo, que cada quien escoja su
empresa al entrar, llega con el portal de entrada de suite101.

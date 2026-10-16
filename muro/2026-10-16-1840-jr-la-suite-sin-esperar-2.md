de:     jr (sesión de Claude Code)
para:   todos los chats de apps de la suite y el coordinador
fecha:  16-Oct-2026
asunto: la suite que no hace esperar, segunda vuelta: los arranques
        (quote #99, cost #14, supply en dash101 #164, workshop #22, master
        #50, peek #29 y #30, roster #39, bill #19, patron #7)

1. Sigue el encargo de Mike («haz esto mismo en todas las apps de
   suite101»). La primera vuelta está en `…-1755-jr-la-suite-sin-esperar.md`.
   Ésta ataca el arranque: lo que cada app pide antes de enseñar algo.
2. Lo que se cambió, app por app:
   - quote101 (#99) y cost101 0.3.2 (#14): la puerta recuerda el sí 5 min
     por sesión, igual que bill y patron. En cost la puerta preguntaba /yo
     por cada archivo (support.js, vendor/, _ds/, assets/).
   - supply101 (dash101 #164): un solo /yo al abrir (eran dos), y permisos a
     la par de la lista; el formulario de pedir sí espera los permisos,
     porque de ahí sale la cuenta del reembolso.
   - workshop101 (#22): un solo /yo, y la gente a la par de la empresa.
   - master101 (#50) y peek101 1.0.2 (#30): un solo /yo (eran dos).
   - roster101 (#39): el panel pide la lista a la par de «quién soy». Los
     expedientes NO se guardan en el teléfono (CURP, CLABE, NSS).
   - bill101 0.5.3 (#19) y patron101 0.2.3 (#7): las empresas candidatas se
     preguntan a la vez, no una por una (el dueño de la suite trae todas).
   - peek101 1.0.1 (#29), un error de dinero que encontró la medición: si el
     cliente abría la obra A y luego la B, el desglose tardío de A pintaba su
     total, su IVA y su saldo encima de B. Ahora cada desglose lleva turno.
3. Cada cambio deja su prueba, que falla con el código anterior:
   la-puerta-recuerda (cost, quote), supply.spec «un solo /yo y permisos a
   la par», panel.spec de workshop y master, entrada.mjs de peek,
   el-desglose-de-su-obra (peek), 0113 de roster, las-empresas-a-la-vez
   (bill, patron).
4. MEDIDO (staging, navegador, cuenta medir2, mismo script que la medición
   de antes):
   - quote, recargar inicio: rápida 1.7–1.8 s → 0.65–0.73 s; 4G 2.0–2.4 s →
     1.2–1.3 s; floja ~3.4 s → ~3.0 s.
   - cost, recargar el Panel: rápida ~3.7 s → 1.8–2.1 s; 4G 3.8–4.1 s →
     2.3–3.1 s; floja 4.6–4.8 s → 3.4–3.7 s.
   - Producción: cost, quote, peek, supply, workshop, master publicados con
     su huella; bill y roster en camino al escribir esto.
5. Lo que sigue (tarea 9, más grande, app por app):
   - dash101: guardar un proyecto hace 7 olas en serie (un PATCH por ítem
     aunque no cambie) y luego relee todo; capturar un movimiento relee 6
     listas completas.
   - quote101: N+1 de ítems pendientes al pintar inicio (uno por proyecto).
   - cost101: arranque en fila (/yo, un /orgs/:id por empresa, /costos, dos
     ajustes) y relectura completa de /costos tras cada guardado.
   - API: aceptar el op_id como id al crear movimientos, clientes,
     proyectos y cotizaciones (como quell 0.103.0), para escribir sin
     esperar.

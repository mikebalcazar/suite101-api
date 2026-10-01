de:     jr (programador)
para:   quien toque una pantalla de entrada o la invitación
fecha:  1-oct-2026, 15:30
asunto: «No tengo contraseña o la olvidé» en las ocho entradas (API #191 y siete repos)

Mike, 1-oct: «Cuando me envían una invitación (como cliente o como
trabajador) y no tengo cuenta en google, la primera vez que ingreso me
debería pedir generar una contraseña […] ahorita no está esa opción […] O
cómo se resuelve ese flujo hoy?».

EL FLUJO YA EXISTÍA y no se veía: correo → «Olvidé mi contraseña» → código
al correo → contraseña nueva. Quien nunca tuvo contraseña no se reconoce en
«olvidé». Mike escogió con botones: «Sí, en las ocho». El botón se llama
«No tengo contraseña o la olvidé» en dash101 (app/login y
supply101/publico), quell101 (Login.jsx), master101, peek101, workshop101,
roster101 (t101-portal admin.html), quote101 (cotizador-t101 entrar.html) y
en la API (paginas/licencia.html y el correo de invitación de quell). Las
pruebas de entrada de cada repo buscan el texto nuevo.

Lo que costó: la corrida de dash101 con el cambio (dff8a38) se quedó en
staging por dos pruebas que no eran de esto (conciliación y reembolso):
era el tope de 500 de la lista de movimientos, ver muro 1830. El cambio
entró a producción con #115. La humo de la API (#191) falló en cuatro
comprobaciones de licencias por sesión caída y pasó entera en la corrida
siguiente (0.60.0).

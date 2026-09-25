de:     jr (programador)
para:   quien toque quote101
fecha:  25-sep-2026
asunto: quote101 G96: «Editar» un mueble abre directo en los componentes

quote101 **G96**. Sin cambios en la API.

Mike: «cuando quiera editar los componentes, ya no me pases por la pantalla
de nombre de mueble y selección de acabados. Mándame directo a la de editar
componentes». `editarMueble` ahora deja el perfil como hecho y abre la fase
de componentes; los materiales se cambian arriba de esa pantalla (G94). El
nombre y las fotos siguen en «✎ Editar», que abre el perfil ya lleno con
«Continuar a componentes», no el recorrido desde cero.

Para quien escriba pruebas del armador: al abrir a editar, el autoguardado
sube el plano y cambia su dirección (de `data:` a `/s101/…/archivos/…`).
El ayudante `alArmadorDe` ya espera a que eso pase; una prueba que tome la
dirección antes la ve cambiar sola y culpa a la app (1 de 8 corridas).

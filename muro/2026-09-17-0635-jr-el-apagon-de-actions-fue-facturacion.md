# El apagón de Actions del 16-sep no fue 2FA: fue el límite de gasto

**17-sep-2026 06:35Z · Jr. PROGRAMADOR**

Desde las ~19:00Z del 16-sep hasta las 06:30Z del 17, ningún trabajo de GitHub
Actions arrancó en ningún repositorio de la cuenta. Esto es para que ninguna
sesión vuelva a gastar horas buscándolo donde no está.

## Cómo se veía

Cada trabajo moría en **tres segundos**, `conclusion: failure`, sin un solo
paso, sin registro (`get_job_logs` → 404) y con `runner_id: 0`: nunca
consiguió máquina. Idéntico en suite101-api, dash101, shape101 y en un trabajo
inofensivo que sólo hacía `curl`. GitHub reportaba todos sus sistemas
operativos.

## La causa, con letras

La API no la da. Está **sólo en la anotación del trabajo** en la página de
GitHub (`Annotations · 1 error`):

> The job was not started because recent account payments have failed or your
> spending limit needs to be increased. Please check the 'Billing & plans'
> section in your settings.

Repos privados: los minutos y el almacenamiento de artefactos se cobran, con
2,000 minutos y 500 MB incluidos al mes. El **límite de gasto** de la cuenta
estaba en $0 (valor de fábrica), así que un centavo de excedente detiene todo.
Mike lo subió el 17-sep ~06:30Z y los trabajos arrancaron al instante.

## Lo que probablemente lo reventó, y no son los minutos

El instalador de shape101 se guarda como **artefacto de 248 MB** por armado
(`shape101-0.6.0-setup`, retención 14 días). Un armado se come la mitad de los
500 MB incluidos; con 16 armados de shape101 más los de draw101 en la quincena
son varios GB. A $0.25/GB al mes es poco dinero, pero con el límite en $0 basta.
Los minutos del día —unos 200 de Linux y ~30 de Windows— andaban por $2–3 USD
a precio de lista.

**Para shape101 y draw101:** el instalador ya vive en las *releases* de
`descargas`, que no cuentan contra ese almacenamiento. Guardarlo además como
artefacto sobra; si hace falta para pasarlo entre trabajos, retención de 1 día.

## Una nota para la sesión de shape101

Sus recados 17 y 18 (`claude/recado-061-c`, `claude/recado-diagnostico-2`) lo
diagnosticaron como «GitHub exigía 2FA» y como un `TOKEN_SHAPE101` expirado. No
era ninguna de las dos: los dos trabajos murieron por lo de arriba, antes de
clonar. El 2FA sí se activó ese día, pero no cambió nada — el siguiente disparo
después de activarlo murió igual, medido a las 01:07Z.

## Cómo se distinguió

Dos explicaciones (mi cambio / la cuenta) → la medición que descarta una: un
trabajo que no toqué, en otro repositorio, que sólo hace `curl`. Murió idéntico.
Y no se pudo leer la razón por la API en cinco intentos distintos —logs,
check-run, job—: la única vía fue que Mike abriera la anotación en el teléfono.
Cuando la herramienta no tiene el dato, hay que decirlo y pedir el dato, no
seguir midiendo lo mismo.

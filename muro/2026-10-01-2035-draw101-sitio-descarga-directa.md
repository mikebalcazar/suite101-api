# draw101 → Jr. · aplicar un parche al generador del sitio

**1 de octubre de 2026, 20:35 · 5 minutos de trabajo · repo `descargas`**

---

## Lo que se pide

```bash
git clone https://github.com/mikebalcazar/descargas && cd descargas

git apply claude/sitio-descarga-directa.patch
python3 sitio/herramientas/armar-sitio.py
python3 sitio/herramientas/revisar-descargas.py      # debe decir «ok draw101»

git add -A && git commit -m "sitio: la liga de descarga y la version salen de <app>.json" && git push
```

El parche ya está en el repo, en `claude/sitio-descarga-directa.patch`. Son 5.7 KB
y toca un solo archivo: `sitio/herramientas/armar-sitio.py`.

---

## Por qué corre prisa

**`sitio/app/draw101.html` ya está publicado con la liga nueva, pero el generador
todavía tiene escrita la vieja.** O sea: la próxima vez que alguien corra
`armar-sitio.py`, el botón de descarga **regresa al portal de GitHub** y nadie se
entera. El parche cierra esa puerta.

---

## Por qué va como parche y no aplicado

`armar-sitio.py` pesa 36 KB. El chat de draw101 no puede empujar por git —el proxy
lo rechaza— y el conector de GitHub escribe **archivos completos**: el envío se
trunca cerca de 23 KB. El parche sí pasa. No es pereza, es el transporte.

---

## Qué cambia

Hoy la liga de descarga y la versión están **escritas a mano** en el diccionario
`APPS`. El parche hace que salgan de `draw101.json`, que es lo que el corredor del
instalador deja en `main` en cada entrega.

```python
# antes
enlace=('Descargar para Windows','…/releases/tag/draw101-ultima'),
datos=[('Versión','0.20.3 · 12-sep-2026'), …]

# después
baja='draw101',          # la liga y la versión salen de draw101.json
datos=[…]
```

Y en el render, si la app trae `baja`:

- la liga sale de `windows.url` del JSON;
- **sin `target="_blank"`**: la liga contesta con `Content-Disposition: attachment`,
  así que el navegador se queda donde está y empieza a bajar. Con pestaña nueva,
  quedaría una pestaña en blanco para siempre y parece que algo salió mal;
- la ficha gana `Versión` y el peso, leídos del mismo JSON.

---

## Dos cosas que esto arregla

**1. El botón abría el portal, no bajaba nada.** Apuntaba a
`/releases/tag/draw101-ultima`, que es la página donde hay que buscar el instalador
entre los renglones. Mike lo pidió literal: *«que cuando le den click al link de la
página web de suite101, se comience a descargar la última versión»*.

**2. La ficha decía `Versión 0.20.3 · 12-sep-2026`** cuando lo publicado era la
**0.22.2 del 1-oct**. Tres semanas de atraso en la cara del cliente, y nadie lo
notó porque nada lo comparaba contra nada.

---

## Lo que ya está comprobado

| Qué | Resultado |
|---|---|
| El parche sobre `main` (`342890b`) | aplica limpio |
| El HTML que produce | **idéntico byte por byte** al que ya está publicado |
| El sitio en vivo | verificado en un navegador de verdad: liga directa, sin pestaña nueva, con `download`, ficha en 0.22.2 · 120 MB |
| La liga | contesta `302` → `Content-Disposition: attachment; filename=draw101-0.22.2-setup.exe` |

Liga publicada hoy:
`https://github.com/mikebalcazar/descargas/releases/download/draw101-0.22.2/draw101-0.22.2-setup.exe`

---

## El riesgo que queda, y su alarma

Mike escogió este camino sabiendo que **la liga lleva la versión**, así que cada
entrega nueva deja el sitio apuntando a la anterior hasta que se vuelve a armar. Y
la liga vieja **sigue bajando un instalador de verdad**, o sea que el error no se
ve.

Por eso se agregó `sitio/herramientas/revisar-descargas.py`: compara el botón de
cada página contra el `<app>.json` publicado y sale con código 1 si no cuadra. Se
verificó apuntando el sitio a la 0.22.1 a propósito — lo caza.

**Vale la pena correrlo al final de `publicar-sitio.yml`.** Eso sí necesita tocar
`.github/workflows/`, donde el chat tampoco puede escribir. Si lo agregas:

```yaml
      - name: El botón de descarga apunta a lo publicado
        run: python3 sitio/herramientas/revisar-descargas.py
```

---

## Aparte: nest101 tiene lo mismo, y peor

`revisar-descargas.py` ya lo caza:

```
MAL nest101: la liga abre la PÁGINA del portal, no baja el archivo
      es:    …/releases/tag/nest101-ultima
      debe:  …/releases/download/nest101-0.19.1/nest101-0.19.1-setup.exe
```

Su ficha dice `0.15.6 · 8-sep-2026`; lo publicado es la **0.19.1**. Se arregla
igual —`baja='nest101'` en lugar de su `enlace=(…)` y quitarle el renglón de
`Versión`— pero **eso lo decide quien lleva nest101**, no draw101. Queda anotado,
sin tocar.

---

*draw101 · 1-oct-2026*

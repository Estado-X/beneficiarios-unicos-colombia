"""Pruebas de la página en un navegador real (Chromium, con Playwright para Python).

    python pruebas/probar.py              # todas las pruebas
    python pruebas/probar.py --captura    # además, vuelve a tomar docs/captura.png

Necesita:  pip install playwright openpyxl  y  python -m playwright install chromium
Levanta un servidor local solo para la prueba; no usa internet. Todos los datos son ficticios.
Las capturas de revisión quedan en pruebas/salida/ (no se suben al repo).
"""
import csv
import functools
import http.server
import io
import json
import random
import sys
import threading
import time
import zipfile
from pathlib import Path

from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "pruebas" / "salida"
VERDAD = json.loads((RAIZ / "pruebas" / "ejemplo_verdad.json").read_text(encoding="utf-8"))

hechas = []
fallas = []


def revisar(nombre, condicion, detalle=""):
    hechas.append(nombre)
    if not condicion:
        fallas.append(f"{nombre} {detalle}".strip())
        print(f"  FALLA  {nombre} {detalle}")
    else:
        print(f"  bien   {nombre}")


class Callado(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servidor():
    manejador = functools.partial(Callado, directory=str(RAIZ))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), manejador)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/"


def pagina_nueva(navegador, base, ancho=1280, alto=900):
    ctx = navegador.new_context(viewport={"width": ancho, "height": alto}, accept_downloads=True, locale="es-CO")
    pag = ctx.new_page()
    pag.errores = []
    pag.pedidos = []
    pag.on("console", lambda m: pag.errores.append(m.text) if m.type == "error" else None)
    pag.on("pageerror", lambda e: pag.errores.append(str(e)))
    pag.on("request", lambda r: pag.pedidos.append(r.url))
    pag.goto(base)
    pag.wait_for_selector("#buscar", state="attached")
    return pag


def esperar_revision(pag, tope=60000):
    pag.wait_for_selector("#revisar:not([hidden])", timeout=tope)


def numero(pag, sel):
    return int(pag.inner_text(sel).replace(".", "").replace(" ", "").strip())


def pareja_actual(pag):
    """Las dos filas que se están mostrando: [(lista, fila), (lista, fila)], o None si ya no hay."""
    if pag.is_hidden("#b-misma"):
        return None
    listas = pag.locator("#pareja .lado__lista").all_inner_texts()
    filas = pag.locator("#pareja .lado__fila").all_inner_texts()
    return [(l, int(f.replace("fila", "").replace(".", "").strip())) for l, f in zip(listas, filas)]


def descargar(pag):
    with pag.expect_download() as d:
        pag.click("#descargar")
    ruta = SALIDA / d.value.suggested_filename
    d.value.save_as(ruta)
    return ruta


def sin_desborde(pag):
    return pag.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def a_csv(filas, sep=","):
    s = io.StringIO()
    csv.writer(s, delimiter=sep, lineterminator="\r\n").writerows(filas)
    return s.getvalue().encode("utf-8")


# ---------------------------------------------------------------- pruebas
def prueba_carga(navegador, base):
    print("Carga")
    pag = pagina_nueva(navegador, base)
    revisar("la página carga sin errores de consola", not pag.errores, str(pag.errores))
    revisar("no pide nada fuera de su propia carpeta", all(u.startswith(base) for u in pag.pedidos), str([u for u in pag.pedidos if not u.startswith(base)]))
    revisar("el título es el de la herramienta", "Beneficiarios sin duplicados" in pag.title())
    revisar("no guarda nada en el navegador", pag.evaluate("localStorage.length + sessionStorage.length") == 0)
    revisar("las secciones de texto están", all(pag.locator(f"text={t}").count() for t in ["Dónde entra tu criterio", "Lo que no hace", "¿Hablamos de tu caso?", "Ley 1581 de 2012"]))
    revisar("el botón lleva a LinkedIn", pag.get_attribute("a.boton--claro", "href") == "https://www.linkedin.com/in/juanperezcuervo/")
    pag.context.close()


def prueba_ejemplo(navegador, base, captura):
    print("Ejemplo con datos ficticios")
    pag = pagina_nueva(navegador, base)
    pag.click(".soltar [data-ejemplo]")
    esperar_revision(pag)
    revisar("se cargan las tres listas", pag.locator("#listas article").count() == 3)
    revisar("se avisa que los datos son ficticios", pag.is_visible("#aviso-ficticio") and pag.locator(".etiqueta--ficticio").count() == 1)
    texto = pag.inner_text("#listas")
    revisar("el CSV de Windows se lee con sus tildes", "é" in pag.locator("#listas article").nth(2).inner_text() and "�" not in texto and "Ã" not in texto)
    fecha_excel = pag.locator("#listas article").nth(1).locator("tbody tr").nth(2).locator("td").first.inner_text()
    revisar("las fechas del Excel se ven como dd/mm/aaaa", len(fecha_excel) == 10 and fecha_excel[2] == "/" and fecha_excel[5] == "/", fecha_excel)
    mapas = pag.evaluate("Array.from(document.querySelectorAll('#listas article')).map(a => Array.from(a.querySelectorAll('tbody select')).map(s => s.value))")
    revisar("adivina qué es cada columna", mapas == [
        ["tipo", "doc", "nombres", "apellidos", "fecha", "municipio", "telefono"],
        ["completo", "doc", "fecha", "municipio", ""],
        ["completo", "doc", "telefono", "municipio", ""]], str(mapas))

    filas, unicas0 = numero(pag, "#r-filas"), numero(pag, "#r-unicas")
    seguras, probables, dudosas = numero(pag, "#n-seguros"), numero(pag, "#n-probables"), numero(pag, "#n-dudosas")
    print(f"    filas {filas} · seguras {seguras} · probables {probables} · dudosas {dudosas} · únicas antes de decidir {unicas0}")
    revisar("cuenta todas las filas", filas == VERDAD["filas"], f"{filas}")
    revisar("hay parejas seguras, probables y dudosas", seguras > 0 and probables > 0 and dudosas > 0)
    revisar("el foco queda en la pareja para decidir con el teclado", pag.evaluate("document.activeElement && document.activeElement.id") == "pareja")
    if captura:
        pag.evaluate("document.getElementById('revisar').scrollIntoView({behavior: 'instant'})")
        pag.screenshot(path=str(RAIZ / "docs" / "captura.png"))
    pag.evaluate("document.getElementById('revisar').scrollIntoView({behavior: 'instant'})")
    pag.screenshot(path=str(SALIDA / "ejemplo_1280.png"))
    pag.screenshot(path=str(SALIDA / "ejemplo_1280_completa.png"), full_page=True)

    # Se decide cada pareja con el teclado, según la respuesta correcta del generador.
    persona = VERDAD["persona_de"]
    decisiones = 0
    bien_mostradas = 0
    for _ in range(1000):
        par = pareja_actual(pag)
        if not par:
            break
        misma = persona[f"{par[0][0]}|{par[0][1]}"] == persona[f"{par[1][0]}|{par[1][1]}"]
        bien_mostradas += 1 if misma else 0
        pag.keyboard.press("m" if misma else "d")
        decisiones += 1
    unicas = numero(pag, "#r-unicas")
    print(f"    decisiones {decisiones} (de ellas, {bien_mostradas} eran la misma persona) · personas únicas {unicas}")
    revisar("con las decisiones correctas quedan las personas únicas esperadas", unicas == VERDAD["personas_unicas"], f"{unicas} y se esperaban {VERDAD['personas_unicas']}")
    revisar("cuenta las decisiones tomadas", numero(pag, "#r-decisiones") == decisiones)
    revisar("al terminar no quedan parejas sin decidir", pag.is_hidden("#r-pendientes"))

    ruta = descargar(pag)
    revisar("el Excel se descarga con nombre claro", ruta.name.startswith("beneficiarios-unicos-") and ruta.suffix == ".xlsx", ruta.name)
    wb = load_workbook(ruta)
    revisar("el Excel trae las hojas esperadas", wb.sheetnames == ["Personas únicas", "Filas originales", "Decisiones", "Resumen"], str(wb.sheetnames))
    unic, orig, dec = wb["Personas únicas"], wb["Filas originales"], wb["Decisiones"]
    revisar("una fila por persona", unic.max_row - 1 == unicas, f"{unic.max_row - 1}")
    revisar("todas las filas originales con su ID", orig.max_row - 1 == filas and all(str(c.value).startswith("P-") for c in orig["A"][1:]))
    ids = [c.value for c in unic["A"][1:]]
    revisar("los ID son únicos", len(set(ids)) == len(ids))
    de_id, de_persona, limpio = {}, {}, True
    for fila in orig.iter_rows(min_row=2, values_only=True):
        p = persona[f"{fila[1]}|{fila[2]}"]
        if de_id.setdefault(fila[0], p) != p or de_persona.setdefault(p, fila[0]) != fila[0]:
            limpio = False
    revisar("cada ID es una sola persona y cada persona tiene un solo ID", limpio)
    autos = [f for f in dec.iter_rows(min_row=2, values_only=True) if f[1] == "Automático"]
    tuyas = [f for f in dec.iter_rows(min_row=2, values_only=True) if f[1] == "Tú"]
    revisar("las decisiones quedan en su hoja", len(tuyas) == decisiones and len(autos) == seguras, f"{len(tuyas)} tuyas, {len(autos)} automáticas")
    revisar("lo que se unió solo sí era la misma persona", all(persona[f"{f[6]}|{f[7]}"] == persona[f"{f[11]}|{f[12]}"] for f in autos))
    fechas = [c for c in unic["E"][1:] if c.value is not None]
    revisar("las fechas van como fechas", bool(fechas) and all(c.is_date for c in fechas))
    resumen = {f[0]: f[1] for f in wb["Resumen"].iter_rows(min_row=2, values_only=True)}
    revisar("el resumen cuadra", resumen["Filas en las listas"] == filas and resumen["Personas únicas"] == unicas and resumen["Decisiones que tomaste"] == decisiones and "FICTICIOS" in resumen.get("Aviso", ""))
    revisar("el ejemplo corre sin errores de consola", not pag.errores, str(pag.errores))
    pag.context.close()
    return {"filas": filas, "seguras": seguras, "probables": probables, "dudosas": dudosas, "unicas": unicas, "decisiones": decisiones}


def prueba_teclado(navegador, base):
    print("Teclado")
    pag = pagina_nueva(navegador, base)
    orden = []
    for _ in range(4):
        pag.keyboard.press("Tab")
        orden.append(pag.evaluate("(document.activeElement.textContent || document.activeElement.id).trim().slice(0, 30)"))
    revisar("con Tab se llega a cargar y al ejemplo", any("Carga tus listas" in o for o in orden) and any("Probar con el ejemplo" in o for o in orden), str(orden))
    pag.focus(".soltar [data-ejemplo]")
    pag.keyboard.press("Enter")
    esperar_revision(pag)
    cuenta = lambda: pag.inner_text("#cuenta").lower()
    revisar("empieza en la pareja 1", cuenta().startswith("pareja 1 de"), cuenta())
    primera = pareja_actual(pag)
    pag.keyboard.press("m")
    revisar("M decide y pasa a la siguiente", cuenta().startswith("pareja 2 de") and numero(pag, "#r-decisiones") == 1, cuenta())
    pag.keyboard.press("d")
    revisar("D decide y pasa a la siguiente", cuenta().startswith("pareja 3 de") and numero(pag, "#r-decisiones") == 2)
    tercera = pareja_actual(pag)
    pag.keyboard.press("s")
    revisar("S la deja para después sin contarla", cuenta().startswith("pareja 3 de") and pareja_actual(pag) != tercera and numero(pag, "#r-decisiones") == 2)
    pag.keyboard.press("z")
    pag.keyboard.press("z")
    revisar("Z deshace y vuelve a la primera", cuenta().startswith("pareja 1 de") and pareja_actual(pag) == primera and numero(pag, "#r-decisiones") == 0, cuenta())
    revisar("el foco sigue en la revisión", pag.evaluate("document.getElementById('revisar').contains(document.activeElement)"))
    pag.keyboard.press("Tab")
    revisar("el primer botón es «Es la misma persona»", pag.evaluate("document.activeElement.id") == "b-misma")
    pag.keyboard.press("Enter")
    revisar("Enter en el botón decide", numero(pag, "#r-decisiones") == 1)
    pag.focus("#buscar")
    antes = numero(pag, "#r-decisiones")
    pag.keyboard.press("m")
    revisar("fuera de la revisión las letras no deciden", numero(pag, "#r-decisiones") == antes)
    revisar("queda el aviso de parejas sin decidir", pag.is_visible("#r-pendientes"))
    revisar("sin errores de consola", not pag.errores, str(pag.errores))
    pag.context.close()


def prueba_celular(navegador, base):
    print("Celular (390 px)")
    pag = pagina_nueva(navegador, base, 390, 844)
    revisar("al abrir no hay desplazamiento lateral", sin_desborde(pag))
    pag.screenshot(path=str(SALIDA / "celular_inicio.png"))
    pag.click(".soltar [data-ejemplo]")
    esperar_revision(pag)
    revisar("con las listas y la revisión no hay desplazamiento lateral", sin_desborde(pag))
    pag.evaluate("document.getElementById('listas').scrollIntoView({behavior: 'instant'})")
    pag.screenshot(path=str(SALIDA / "celular_listas.png"))
    pag.evaluate("document.getElementById('revision').scrollIntoView({behavior: 'instant'})")
    pag.screenshot(path=str(SALIDA / "celular_revision.png"))
    pag.click("#seguras summary")
    pag.locator("#lista-seguras .seguras__grupo").first.wait_for()
    revisar("las parejas seguras se pueden ver", pag.locator("#lista-seguras .seguras__grupo").count() > 0 and sin_desborde(pag))
    pag.screenshot(path=str(SALIDA / "celular_completa.png"), full_page=True)
    pag.context.close()


def prueba_formulas_y_html(navegador, base):
    print("Fórmulas y HTML en los datos")
    filas = [["Nombre <b>completo</b>", "Documento", "Municipio"],
             ["=HYPERLINK(\"http://ejemplo.invalid\";\"clic\")", "511111111", "Quibdó"],
             ["+SUMA(1;1)", "522222222", "=1+1"],
             ["-Luz Dary Mena", "533333333", "@Tumaco"],
             ["<img src=x onerror=\"window.pwned=1\">", "544444444", "<script>window.pwned=1</script>"],
             ["@Luz Dary Mena", "", "Tumaco"]]
    pag = pagina_nueva(navegador, base)
    pag.set_input_files("#archivos", {"name": "raros <i>ficticios</i>.csv", "mimeType": "text/csv", "buffer": a_csv(filas)})
    pag.wait_for_selector("#listas article")
    pag.click("#buscar")
    esperar_revision(pag)
    revisar("el HTML de los datos no se ejecuta ni se dibuja", pag.evaluate("window.pwned === undefined && document.querySelectorAll('main img, main i, main b, #listas script').length === 0"))
    revisar("el encabezado raro se muestra como texto", "<b>completo</b>" in pag.inner_text("#listas"))
    ruta = descargar(pag)
    with zipfile.ZipFile(ruta) as z:
        hojas = "".join(z.read(n).decode("utf-8") for n in z.namelist() if n.startswith("xl/worksheets/"))
    revisar("el Excel no trae ninguna fórmula", "<f>" not in hojas and "<f " not in hojas)
    wb = load_workbook(ruta)
    celdas = [c for h in wb for f in h.iter_rows() for c in f if isinstance(c.value, str) and c.value[:1] in "=+-@"]
    revisar("lo que empieza por = + - @ queda como texto literal", len(celdas) >= 8 and all(c.data_type in ("s", "inlineStr") and c.quotePrefix for c in celdas), f"{len(celdas)} celdas")
    revisar("el texto se conserva tal cual", any(c.value == '=HYPERLINK("http://ejemplo.invalid";"clic")' for c in celdas))
    revisar("sin errores de consola", not pag.errores, str(pag.errores))
    pag.context.close()


def prueba_archivos_malos(navegador, base):
    print("Archivos que no se pueden leer")
    pag = pagina_nueva(navegador, base)
    pag.set_input_files("#archivos", [
        {"name": "viejo.xls", "mimeType": "application/vnd.ms-excel", "buffer": bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) + b"\x00" * 64},
        {"name": "roto.xlsx", "mimeType": "application/octet-stream", "buffer": b"PK\x03\x04 esto no es un excel"},
        {"name": "vacio.csv", "mimeType": "text/csv", "buffer": b""}])
    pag.locator("#errores .aviso--error").nth(2).wait_for()
    texto = pag.inner_text("#errores")
    revisar("explica el .xls antiguo", "formato antiguo" in texto)
    revisar("explica el Excel dañado y la lista vacía", "roto.xlsx" in texto and "vacio.csv" in texto)
    revisar("no deja buscar sin listas", pag.is_hidden("#paso-buscar"))
    pag.set_input_files("#archivos", {"name": "sin-nombre.csv", "mimeType": "text/csv", "buffer": a_csv([["Kit", "Valor"], ["A", "1"], ["B", "2"]])})
    pag.wait_for_selector("#listas article")
    revisar("si no hay nombre ni documento, pide marcar la columna", pag.is_disabled("#buscar") and "Marca al menos" in pag.inner_text("#listas"))
    pag.select_option("#listas tbody select >> nth=0", "completo")
    revisar("al corregir a mano se puede buscar", pag.is_enabled("#buscar"))
    revisar("sin errores de consola", not pag.errores, str(pag.errores))
    pag.context.close()


def listas_grandes(total=20000):
    """Dos listas ficticias que suman `total` filas: cerca de la mitad de las personas se repite, escrita distinto."""
    rnd = random.Random(2026)
    nombres = ["Juan", "Carlos", "Andrés", "José", "Luis", "Jhon", "Jorge", "Camilo", "Diego", "Óscar", "María", "Luz", "Ana", "Sandra", "Paola",
               "Yenny", "Diana", "Claudia", "Marcela", "Carolina", "Adriana", "Gloria", "Martha", "Liliana", "Leidy", "Natalia", "Viviana", "Rocío",
               "Fredy", "Wilson", "Iván", "Álvaro", "Jesús", "Yeison", "Brayan", "Nelson", "Héctor", "Fabián", "Mauricio", "Gustavo"]
    apellidos = ["Rodríguez", "Gómez", "González", "Martínez", "García", "López", "Hernández", "Sánchez", "Ramírez", "Pérez", "Díaz", "Muñoz", "Rojas",
                 "Moreno", "Jiménez", "Mosquera", "Rentería", "Palacios", "Córdoba", "Cuesta", "Valencia", "Hurtado", "Angulo", "Quiñones", "Castillo",
                 "Ortiz", "Peña", "Núñez", "Zapata", "Vargas", "Castaño", "Cárdenas", "Suárez", "Torres", "Álvarez", "Gutiérrez", "Ruiz", "Mena",
                 "Murillo", "Caicedo", "Riascos", "Arboleda", "Cortés", "Montaño", "Benítez", "Salazar", "Ospina", "Giraldo", "Londoño", "Lozano"]
    municipios = ["Quibdó", "Tumaco", "Buenaventura", "Riohacha", "Soacha", "Istmina", "Maicao", "Guapi", "Bogotá, D.C.", "Medellín"]
    a = [["Tipo de documento", "Número de documento", "Nombres", "Apellidos", "Fecha de nacimiento", "Municipio", "Celular"]]
    b = [["NOMBRE COMPLETO", "CEDULA", "F. NACIMIENTO", "MUNICIPIO"]]
    personas = 0
    while len(a) + len(b) - 2 < total:
        personas += 1
        nom = " ".join(rnd.sample(nombres, 2))
        ape = " ".join(rnd.sample(apellidos, 2))
        doc = str(500_000_000 + personas * 7 + rnd.randrange(7))
        nac = f"{rnd.randrange(1, 29):02d}/{rnd.randrange(1, 13):02d}/{rnd.randrange(1950, 2008)}"
        mun = rnd.choice(municipios)
        a.append(["CC", doc, nom, ape, nac, mun, "399" + str(rnd.randrange(1_000_000, 9_999_999))])
        if rnd.random() < 0.55 and len(a) + len(b) - 2 < total:
            completo = f"{ape} {nom}".upper()
            d, m, y = nac.split("/")
            b.append([completo, f"{int(doc):,}".replace(",", ".") if rnd.random() < 0.7 else "", f"{y}-{m}-{d}", mun.upper()])
    return a, b, personas


def prueba_rendimiento(navegador, base):
    print("Rendimiento con 20.000 filas ficticias")
    a, b, personas = listas_grandes()
    pag = pagina_nueva(navegador, base)
    pag.set_input_files("#archivos", [
        {"name": "grande-a.csv", "mimeType": "text/csv", "buffer": a_csv(a)},
        {"name": "grande-b.csv", "mimeType": "text/csv", "buffer": a_csv(b, ";")}])
    pag.locator("#listas article").nth(1).wait_for(timeout=60000)
    total = len(a) + len(b) - 2
    revisar("lee las 20.000 filas", f"{total:,}".replace(",", ".") in pag.inner_text("#estado-buscar"), pag.inner_text("#estado-buscar"))
    # Mientras compara, un reloj en la página mide cuánto se queda sin responder.
    pag.evaluate("""() => { window.__max = 0; let t = performance.now();
        window.__reloj = setInterval(() => { const n = performance.now(); window.__max = Math.max(window.__max, n - t); t = n; }, 20); }""")
    t0 = time.time()
    pag.click("#buscar")
    esperar_revision(pag, 120000)
    segundos = time.time() - t0
    trabada = pag.evaluate("() => { clearInterval(window.__reloj); return window.__max; }")
    seguras, probables, dudosas = numero(pag, "#n-seguros"), numero(pag, "#n-probables"), numero(pag, "#n-dudosas")
    unicas = numero(pag, "#r-unicas")
    print(f"    {total} filas · {personas} personas · {segundos:.1f} s · pausa más larga de la página {trabada:.0f} ms")
    print(f"    seguras {seguras} · probables {probables} · dudosas {dudosas} · únicas antes de decidir {unicas}")
    revisar("compara 20.000 filas en menos de 30 segundos", segundos < 30, f"{segundos:.1f} s")
    revisar("la página no se traba mientras compara (pausas de menos de 1,5 s)", trabada < 1500, f"{trabada:.0f} ms")
    revisar("une solas las que tienen el mismo documento", seguras > 0.3 * (len(b) - 1))
    revisar("no une de más: quedan al menos las personas que hay", unicas >= personas, f"{unicas} y hay {personas}")
    t1 = time.time()
    ruta = descargar(pag)
    wb = load_workbook(ruta, read_only=True)
    filas_excel = sum(1 for _ in wb["Filas originales"].iter_rows(min_row=2))
    print(f"    Excel de {ruta.stat().st_size / 1e6:.1f} MB en {time.time() - t1:.1f} s")
    revisar("el Excel grande trae todas las filas", filas_excel == total, f"{filas_excel}")
    revisar("sin errores de consola", not pag.errores, str(pag.errores))
    pag.context.close()
    return {"filas": total, "segundos": round(segundos, 1), "pausa_ms": round(trabada)}


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    captura = "--captura" in sys.argv
    srv, base = servidor()
    with sync_playwright() as p:
        navegador = p.chromium.launch()
        prueba_carga(navegador, base)
        ejemplo = prueba_ejemplo(navegador, base, captura)
        prueba_teclado(navegador, base)
        prueba_celular(navegador, base)
        prueba_formulas_y_html(navegador, base)
        prueba_archivos_malos(navegador, base)
        grande = prueba_rendimiento(navegador, base)
        navegador.close()
    srv.shutdown()
    print()
    print(f"Ejemplo: {ejemplo}")
    print(f"Rendimiento: {grande}")
    if fallas:
        print(f"{len(fallas)} de {len(hechas)} revisiones fallaron:")
        for f in fallas:
            print("  - " + f)
        sys.exit(1)
    print(f"Página: {len(hechas)} revisiones, todas bien.")


if __name__ == "__main__":
    main()

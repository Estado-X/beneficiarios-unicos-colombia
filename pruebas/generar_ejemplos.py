"""Genera las tres listas FICTICIAS de la carpeta ejemplos/ y la respuesta correcta para las pruebas.

    python pruebas/generar_ejemplos.py

Todo es inventado, con una semilla fija para que siempre salga igual:
- Los nombres se arman al azar con nombres y apellidos comunes en Colombia.
- Los documentos son números de 9 dígitos que empiezan por 5: un largo que la cédula colombiana
  no usa (tiene hasta 8 dígitos, o 10), para que no correspondan a nadie.
- Los celulares empiezan por 399, un prefijo elegido para que no parezcan de ningún operador.
Ninguna fila corresponde a una persona real. Necesita openpyxl para escribir el .xlsx.
"""
import csv
import datetime
import json
import random
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font

RAIZ = Path(__file__).resolve().parent.parent
EJEMPLOS = RAIZ / "ejemplos"

NOMBRES_M = ["Juan", "Carlos", "Andrés", "José", "Luis", "Jhon", "Jorge", "Camilo", "Sebastián", "Diego", "Óscar",
             "Fredy", "Wilson", "Édgar", "Iván", "Álvaro", "Jesús", "Yeison", "Brayan", "Nelson", "Héctor", "Fabián",
             "Mauricio", "Gustavo", "Rubén", "Darío", "Alexánder", "Esteban", "Hernán", "Julián"]
NOMBRES_F = ["María", "Luz", "Ana", "Sandra", "Paola", "Yenny", "Diana", "Claudia", "Marcela", "Carolina", "Adriana",
             "Gloria", "Martha", "Liliana", "Yuliana", "Leidy", "Angélica", "Natalia", "Viviana", "Rocío", "Nubia",
             "Esperanza", "Dayana", "Yolanda", "Mónica", "Beatriz", "Katherine", "Lorena", "Milena", "Tatiana"]
APELLIDOS = ["Rodríguez", "Gómez", "González", "Martínez", "García", "López", "Hernández", "Sánchez", "Ramírez",
             "Pérez", "Díaz", "Muñoz", "Rojas", "Moreno", "Jiménez", "Mosquera", "Rentería", "Palacios", "Córdoba",
             "Cuesta", "Valencia", "Hurtado", "Angulo", "Quiñones", "Castillo", "Ortiz", "Peña", "Núñez", "Ibáñez",
             "Zapata", "Vargas", "Castaño", "Cárdenas", "Suárez", "Torres", "Álvarez", "Gutiérrez", "Ruiz", "Mena",
             "Murillo", "Caicedo", "Riascos", "Arboleda", "Cortés", "Montaño", "Epiayú", "Pushaina", "Uriana",
             "Benítez", "Salazar", "Ospina", "Giraldo", "Londoño", "Chaverra", "Lozano", "Asprilla", "Ledesma"]
MUNICIPIOS = ["Quibdó", "Tumaco", "Buenaventura", "Riohacha", "Soacha", "Istmina", "Maicao", "Guapi"]
TALLERES = ["Taller 1 · Derechos", "Taller 2 · Huerta", "Taller 3 · Ahorro"]
KITS = ["Kit escolar", "Kit de siembra", "Kit de higiene"]


def sin_tildes(s):
    tabla = str.maketrans("áéíóúÁÉÍÓÚñÑ", "aeiouAEIOUnN")
    return s.translate(tabla)


def error_de_digitacion(rnd, palabra):
    """Cambia dos letras de lugar o se come una, lejos del principio y del final."""
    if len(palabra) < 6:
        return palabra
    i = rnd.randrange(2, len(palabra) - 2)
    if rnd.random() < 0.5:
        return palabra[:i] + palabra[i + 1] + palabra[i] + palabra[i + 2:]
    return palabra[:i] + palabra[i + 1:]


def puntos(n):
    return f"{int(n):,}".replace(",", ".")


def crear_personas(rnd, cuantas):
    personas, docs, tels = [], set(), set()
    for k in range(cuantas):
        mujer = rnd.random() < 0.55
        banco = NOMBRES_F if mujer else NOMBRES_M
        nombres = rnd.sample(banco, 2 if rnd.random() < 0.7 else 1)
        if mujer and len(nombres) == 2 and rnd.random() < 0.15:
            nombres = ["María", "del", rnd.choice(["Carmen", "Pilar", "Rosario", "Socorro"])]
        apellidos = rnd.sample(APELLIDOS, 2)
        if rnd.random() < 0.06:
            apellidos[0] = "De la " + rnd.choice(["Hoz", "Cruz", "Rosa", "Ossa"])
        while True:
            doc = str(rnd.randrange(500_000_000, 599_999_999))
            if doc not in docs:
                docs.add(doc)
                break
        while True:
            tel = "399" + str(rnd.randrange(1_000_000, 9_999_999))
            if tel not in tels:
                tels.add(tel)
                break
        nac = datetime.date(1958, 1, 1) + datetime.timedelta(days=rnd.randrange(0, 365 * 50))
        menor = nac.year >= 2007
        personas.append({
            "id": k, "nombres": nombres, "apellidos": apellidos, "doc": doc, "tipo": "TI" if menor else "CC",
            "nac": nac, "municipio": rnd.choice(MUNICIPIOS), "tel": tel,
        })
    return personas


def main():
    rnd = random.Random(1581)
    personas = crear_personas(rnd, 150)

    # Dos homónimos: personas distintas con el mismo nombre (una pareja con documento, la otra sin).
    personas[140]["nombres"], personas[140]["apellidos"] = list(personas[10]["nombres"]), list(personas[10]["apellidos"])
    personas[141]["nombres"], personas[141]["apellidos"] = list(personas[20]["nombres"]), list(personas[20]["apellidos"])

    verdad = {}  # "lista|fila" -> persona

    # ---------- Lista 1 · inscripción (CSV, comas, UTF-8) ----------
    filas1 = [["Tipo de documento", "Número de documento", "Nombres", "Apellidos", "Fecha de nacimiento", "Municipio", "Celular"]]
    orden1 = list(range(0, 105))
    repetidos = [3, 17, 42, 58, 77]           # se inscribieron dos veces
    orden1 += repetidos
    rnd.shuffle(orden1)
    vistos = set()
    for pid in orden1:
        p = personas[pid]
        nombres, apellidos = " ".join(p["nombres"]), " ".join(p["apellidos"])
        doc = p["doc"]
        if pid in vistos:                      # la segunda inscripción llega escrita distinto
            forma = repetidos.index(pid)
            if forma == 0:
                nombres, apellidos = sin_tildes(nombres).upper(), sin_tildes(apellidos).upper()
            elif forma == 1:
                doc = puntos(doc)
            elif forma == 2:
                apellidos = p["apellidos"][0]
            elif forma == 3:
                nombres = p["nombres"][0]
                doc = doc[:-2] + doc[-1] + doc[-2] if doc[-1] != doc[-2] else doc[:-1] + str((int(doc[-1]) + 1) % 10)
            else:
                apellidos = error_de_digitacion(rnd, p["apellidos"][0]) + " " + p["apellidos"][1]
                doc = ""
        vistos.add(pid)
        tel = p["tel"] if rnd.random() < 0.85 else ""
        if tel and rnd.random() < 0.3:
            tel = f"{tel[:3]} {tel[3:6]} {tel[6:]}"
        filas1.append([p["tipo"] if doc else "", doc, nombres, apellidos, p["nac"].strftime("%d/%m/%Y"), p["municipio"], tel])
        verdad[f"inscripcion-ficticia|{len(filas1)}"] = pid

    # ---------- Lista 2 · asistencia (Excel) ----------
    filas2 = [["Nombre completo", "Cédula", "Fecha nacimiento", "Municipio", "Taller"]]
    orden2 = rnd.sample(range(0, 105), 58) + list(range(105, 130)) + [140]
    rnd.shuffle(orden2)
    for pid in orden2:
        p = personas[pid]
        apellidos, nombres = list(p["apellidos"]), list(p["nombres"])
        completo = sin_tildes(" ".join(apellidos) + " " + " ".join(nombres)).upper()   # APELLIDOS NOMBRES, sin tildes
        if rnd.random() < 0.15:
            partes = completo.split(" ")
            mas_larga = max(range(len(partes)), key=lambda i: len(partes[i]))
            partes[mas_larga] = error_de_digitacion(rnd, partes[mas_larga])
            completo = " ".join(partes)
        doc = puntos(p["doc"]) if rnd.random() < 0.82 else ""
        if pid == 140:
            doc = puntos(p["doc"])
        nac = p["nac"] if rnd.random() < 0.8 else None
        municipio = sin_tildes(p["municipio"]).upper()
        filas2.append([completo, doc, nac, municipio, rnd.choice(TALLERES)])
        verdad[f"asistencia-ficticia|{len(filas2)}"] = pid

    # ---------- Lista 3 · entregas (CSV de Excel: punto y coma, codificación de Windows) ----------
    filas3 = [["BENEFICIARIO", "DOCUMENTO", "TELEFONO", "MUNICIPIO", "KIT ENTREGADO"]]
    orden3 = rnd.sample(range(0, 130), 45) + list(range(130, 140)) + [141] + list(range(142, 150))
    rnd.shuffle(orden3)
    usados_mal = 0
    for pid in orden3:
        p = personas[pid]
        forma = rnd.random()
        if forma < 0.45:      # Nombre Apellido A.
            nombre = f'{" ".join(p["nombres"])} {p["apellidos"][0]} {sin_tildes(p["apellidos"][1])[0]}.'
        elif forma < 0.75:    # completo, como es
            nombre = f'{" ".join(p["nombres"])} {" ".join(p["apellidos"])}'
        else:                 # primer nombre y dos apellidos
            nombre = f'{p["nombres"][0]} {" ".join(p["apellidos"])}'
        doc = p["doc"] if rnd.random() < 0.68 else ""
        tel = p["tel"] if (not doc or rnd.random() < 0.6) else ""
        if pid == 141:
            doc, tel = "", ""                       # homónimo sin ningún otro dato
        if pid in (133, 137) and usados_mal < 2:   # a dos personas les anotaron la cédula de otra
            doc = personas[1 + usados_mal]["doc"]
            tel = ""
            usados_mal += 1
        filas3.append([nombre, doc, tel, p["municipio"], rnd.choice(KITS)])
        verdad[f"entregas-ficticia|{len(filas3)}"] = pid

    EJEMPLOS.mkdir(exist_ok=True)
    with open(EJEMPLOS / "inscripcion-ficticia.csv", "w", encoding="utf-8", newline="") as f:
        csv.writer(f, lineterminator="\r\n").writerows(filas1)
    with open(EJEMPLOS / "entregas-ficticia.csv", "w", encoding="cp1252", newline="") as f:
        csv.writer(f, delimiter=";", lineterminator="\r\n").writerows(filas3)

    wb = Workbook()
    ws = wb.active
    ws.title = "Asistencia (ficticia)"
    for fila in filas2:
        ws.append(fila)
    for celda in ws[1]:
        celda.font = Font(bold=True)
    for fila in ws.iter_rows(min_row=2, min_col=3, max_col=3):
        fila[0].number_format = "DD/MM/YYYY"
    for letra, ancho in zip("ABCDE", (42, 16, 18, 18, 24)):
        ws.column_dimensions[letra].width = ancho
    nota = wb.create_sheet("Léeme")
    nota.append(["DATOS FICTICIOS. Estas personas no existen: los nombres se armaron al azar y los documentos son inventados."])
    wb.properties.creator = "Estado X"
    wb.properties.title = "Lista de asistencia ficticia"
    wb.properties.created = datetime.datetime(2026, 1, 1)
    wb.properties.modified = datetime.datetime(2026, 1, 1)
    wb.save(EJEMPLOS / "asistencia-ficticia.xlsx")

    personas_unicas = len(set(verdad.values()))
    with open(RAIZ / "pruebas" / "ejemplo_verdad.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump({"nota": "Datos ficticios. Dice qué persona inventada es cada fila de ejemplos/ (lista|fila).",
                   "filas": len(verdad), "personas_unicas": personas_unicas, "persona_de": verdad}, f, ensure_ascii=False, indent=1)
    print(f"Filas: {len(filas1) - 1} + {len(filas2) - 1} + {len(filas3) - 1} = {len(verdad)} · personas únicas: {personas_unicas}")


if __name__ == "__main__":
    main()

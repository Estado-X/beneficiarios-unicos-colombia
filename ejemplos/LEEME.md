# Datos ficticios

Las tres listas de esta carpeta son **inventadas**. Ninguna fila corresponde a una persona real.

| Archivo | Qué imita | Cómo viene |
|---|---|---|
| `inscripcion-ficticia.csv` | Formulario de inscripción | CSV con comas, UTF-8; nombres y apellidos en columnas aparte, fecha dd/mm/aaaa |
| `asistencia-ficticia.xlsx` | Planilla de asistencia | Excel; «APELLIDOS NOMBRES» en mayúsculas y sin tildes, cédula con puntos, fecha como fecha de Excel |
| `entregas-ficticia.csv` | Acta de entregas | CSV de Excel (punto y coma, codificación de Windows); nombre corto con inicial («Luz Dary Mosquera R.») |

Cómo se hicieron (`pruebas/generar_ejemplos.py`, con semilla fija):

- Los nombres se arman al azar con nombres y apellidos comunes en Colombia.
- Los documentos son números de 9 dígitos que empiezan por 5. La cédula colombiana tiene hasta 8 dígitos, o 10: se eligió un largo que no usa.
- Los celulares empiezan por 399, un prefijo elegido para que no parezcan de ningún operador.
- A propósito hay personas repetidas dentro de una lista y entre listas, errores de digitación, documentos con dos dígitos cambiados de lugar, dos personas a las que les anotaron la cédula de otra y dos pares de homónimos.

La respuesta correcta (qué persona inventada es cada fila) está en `pruebas/ejemplo_verdad.json` y solo la usan las pruebas.

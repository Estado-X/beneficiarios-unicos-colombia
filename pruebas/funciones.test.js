/* Pruebas de las funciones de normalización y parecido. Se corren con:  node pruebas/funciones.test.js
   No necesitan navegador ni instalar nada. Todos los nombres y documentos son inventados. */
'use strict';
const assert = require('assert');
const path = require('path');
const N = require(path.join(__dirname, '..', 'assets', 'nombres.js'));
const E = require(path.join(__dirname, '..', 'assets', 'emparejar.js'));

let hechas = 0;
function prueba(nombre, fn) {
  try { fn(); hechas++; }
  catch (e) { console.error('FALLA: ' + nombre + '\n  ' + e.message); process.exitCode = 1; }
}
const p = (a, b) => N.parecidoNombres(a, b);
const fila = (o) => E.normalizar(Object.assign({ nombre: '', tipo: '', doc: '', fecha: '', municipio: '', telefono: '' }, o), new Date(2026, 0, 1));
const nivel = (a, b) => { const c = E.comparar(fila(a), fila(b)); return c ? c.nivel : null; };

/* ---------- Nombres ---------- */
prueba('apellidos antes de los nombres y una inicial', () => {
  assert.ok(p('PÉREZ CUERVO JUAN CAMILO', 'Juan Camilo Pérez C.') >= E.MUY_PARECIDO);
  assert.ok(p('PEREZ CUERVO, JUAN CAMILO', 'juan camilo   pérez cuervo') === 1);
});
prueba('tildes, eñes y mayúsculas no cambian el nombre', () => {
  assert.strictEqual(p('Begoña Núñez Peña', 'BEGONA NUNEZ PENA'), 1);
  assert.strictEqual(p('José Ángel Muñoz Ibáñez', 'JOSE ANGEL MUNOZ IBANEZ'), 1);
});
prueba('partículas: de, del, de la, de los', () => {
  assert.strictEqual(p('María del Pilar de la Hoz', 'Maria Pilar Hoz'), 1);
  assert.strictEqual(p('Ana de los Ángeles Del Río', 'ANA ANGELES RIO'), 1);
});
prueba('formas que suenan igual', () => {
  assert.ok(p('Jhon Fredy González Giménez', 'John Fredy Gonzales Jiménez') >= 0.95);
  assert.ok(p('Yenny Vanessa Cháves', 'Yeny Banesa Chávez') >= 0.95);
  assert.ok(p('Helena Zapata', 'Elena Sapata') >= 0.95);
});
prueba('errores de digitación en una palabra', () => {
  assert.ok(p('Luz Marina Rodríguez Castaño', 'Luz Marina Rodrigeuz Castaño') >= E.MUY_PARECIDO);
  assert.ok(p('Carlos Andrés Mosquera Palacios', 'Carlos Andres Mosqera Palacios') >= E.MUY_PARECIDO);
});
prueba('«Ma.» es María', () => {
  assert.strictEqual(p('Ma. Fernanda Ortiz Rojas', 'María Fernanda Ortiz Rojas'), 1);
});
prueba('nombres que se parecen pero son otros', () => {
  assert.ok(p('Mario Rodríguez Gómez', 'María Rodríguez Gómez') < E.PARECIDO);
  assert.ok(p('Juan Pérez Gómez', 'Juana Pérez Gómez') < E.PARECIDO);
  assert.ok(p('Juan Carlos Pérez Gómez', 'Juan Camilo Pérez Gómez') < E.PARECIDO);
  assert.ok(p('María del Carmen López García', 'María del Pilar López García') < E.PARECIDO);
  assert.ok(p('Fernando Julio Díaz', 'Fernanda Julia Díaz') < E.PARECIDO);
});
prueba('una sola palabra en común no basta', () => {
  assert.ok(p('María Rodríguez', 'María González') <= 0.5);
  assert.ok(p('María', 'María Rodríguez López') <= 0.5);
});
prueba('falta un nombre o un apellido: parecido, no muy parecido', () => {
  const x = p('Juan Pérez', 'Juan Camilo Pérez Cuervo');
  assert.ok(x >= E.PARECIDO && x < E.MUY_PARECIDO, String(x));
  assert.ok(p('Juan Camilo Pérez', 'Juan Camilo Pérez Cuervo') >= E.MUY_PARECIDO);
});
prueba('se conserva la ñ y las tildes al mostrar', () => {
  assert.strictEqual(N.limpio('  Begoña   Núñez  '), 'Begoña Núñez');
});
prueba('distancia de edición', () => {
  assert.strictEqual(N.distancia('RODRIGUEZ', 'RODRIGEUZ', 2), 1);
  assert.strictEqual(N.distancia('1020304050', '1020304051', 1), 1);
  assert.strictEqual(N.distancia('ABC', 'XYZ', 1), 2);
});

/* ---------- Documento ---------- */
prueba('cédula con puntos, espacios y lo que deja Excel', () => {
  assert.strictEqual(N.numeroDocumento('512.345.678'), '512345678');
  assert.strictEqual(N.numeroDocumento(' 512 345 678 '), '512345678');
  assert.strictEqual(N.numeroDocumento('512345678.0'), '512345678');
  assert.strictEqual(N.numeroDocumento('5.12345678E8'), '512345678');
  assert.strictEqual(N.numeroDocumento('5,12345678E+08'), '512345678');
  assert.strictEqual(N.numeroDocumento('512.345.000'), '512345000');
  assert.strictEqual(N.numeroDocumento('0512345678'), '512345678');
  assert.strictEqual(N.numeroDocumento('C.C. 512.345.678'), '512345678');
  assert.strictEqual(N.numeroDocumento('ab-123456'), 'AB123456');
  assert.strictEqual(N.numeroDocumento('N/A'), '');
  assert.strictEqual(N.numeroDocumento(''), '');
});
prueba('tipo de documento', () => {
  assert.strictEqual(N.tipoDocumento('Cédula de ciudadanía'), 'CC');
  assert.strictEqual(N.tipoDocumento('c.c.'), 'CC');
  assert.strictEqual(N.tipoDocumento('Tarjeta de Identidad'), 'TI');
  assert.strictEqual(N.tipoDocumento('PPT'), 'PPT');
  assert.strictEqual(N.tipoDocumento(''), '');
});

/* ---------- Fechas ---------- */
prueba('fechas en varios formatos', () => {
  const hoy = new Date(2026, 0, 1);
  assert.strictEqual(N.fecha('07/03/1990'), '1990-03-07');
  assert.strictEqual(N.fecha('7-3-1990'), '1990-03-07');
  assert.strictEqual(N.fecha('1990-03-07'), '1990-03-07');
  assert.strictEqual(N.fecha('1990-03-07 00:00:00'), '1990-03-07');
  assert.strictEqual(N.fecha('1990-03-07T00:00:00'), '1990-03-07');
  assert.strictEqual(N.fecha('07.03.1990'), '1990-03-07');
  assert.strictEqual(N.fecha('32939'), '1990-03-07');          // número de serie de Excel
  assert.strictEqual(N.fecha('32939.0'), '1990-03-07');
  assert.strictEqual(N.fecha('7 de marzo de 1990'), '1990-03-07');
  assert.strictEqual(N.fecha('07-mar-90', hoy), '1990-03-07');
  assert.strictEqual(N.fecha('07/03/90', hoy), '1990-03-07');
  assert.strictEqual(N.fecha('07/03/05', hoy), '2005-03-07');
  assert.strictEqual(N.fecha('03/25/1990'), '1990-03-25');     // venía mes/día
  assert.strictEqual(N.fecha('31/02/1990'), '');
  assert.strictEqual(N.fecha('sin dato'), '');
  assert.strictEqual(N.fechaVisible('1990-03-07'), '07/03/1990');
});

/* ---------- Municipio y teléfono ---------- */
prueba('municipio', () => {
  assert.strictEqual(N.municipio('Bogotá, D.C.'), 'BOGOTA');
  assert.strictEqual(N.municipio('BOGOTA D.C'), 'BOGOTA');
  assert.strictEqual(N.municipio('Bogotá DC'), 'BOGOTA');
  assert.strictEqual(N.municipio('Quibdó (Chocó)'), 'QUIBDO');
  assert.strictEqual(N.municipio('Cartagena de Indias'), 'CARTAGENA');
  assert.strictEqual(N.municipio('San Andrés de Tumaco - Nariño'), 'TUMACO');
  assert.strictEqual(N.municipio('El Carmen de Bolívar'), 'EL CARMEN DE BOLIVAR');
});
prueba('teléfono', () => {
  assert.strictEqual(N.telefono('399 123 4567'), '3991234567');
  assert.strictEqual(N.telefono('+57 399-123-4567'), '3991234567');
  assert.strictEqual(N.telefono('3991234567.0'), '3991234567');
  assert.strictEqual(N.telefono('3.991234567E9'), '3991234567');
  assert.strictEqual(N.telefono('0000000'), '');
  assert.strictEqual(N.telefono('no tiene'), '');
});

/* ---------- Niveles ---------- */
const A = { nombre: 'Juan Camilo Pérez Cuervo', tipo: 'CC', doc: '512.345.678', fecha: '07/03/1990', municipio: 'Quibdó', telefono: '399 123 4567' };
prueba('seguro: mismo tipo y número de documento', () => {
  assert.strictEqual(nivel(A, { nombre: 'PEREZ CUERVO JUAN CAMILO', tipo: 'Cédula de ciudadanía', doc: '512345678' }), 'seguro');
  assert.strictEqual(nivel(A, { nombre: 'Juan C. Pérez', doc: '512345678' }), 'seguro');
});
prueba('dudoso: mismo documento con nombres muy distintos', () => {
  assert.strictEqual(nivel(A, { nombre: 'Luz Dary Mosquera Rentería', tipo: 'CC', doc: '512345678' }), 'dudoso');
});
prueba('probable: nombre parecido y coincide otro dato', () => {
  assert.strictEqual(nivel(A, { nombre: 'PEREZ CUERVO JUAN CAMILO', fecha: '1990-03-07' }), 'probable');
  assert.strictEqual(nivel(A, { nombre: 'Juan Camilo Pérez C.', telefono: '+57 3991234567' }), 'probable');
  assert.strictEqual(nivel(A, { nombre: 'Juan Camilo Perez Cuervo', municipio: 'QUIBDO (CHOCO)' }), 'probable');
  assert.strictEqual(nivel(A, { nombre: 'Juan Pérez', fecha: '32939' }), 'probable');
  assert.strictEqual(nivel(A, { nombre: 'Juan Camilo Pérez Cuervo', tipo: 'CC', doc: '512345687' }), 'probable'); // dos dígitos cambiados de lugar
  assert.strictEqual(nivel(A, { nombre: 'Juan Camilo Pérez Cuervo', tipo: 'TI', doc: '512345678' }), 'probable');
});
prueba('dudoso: nombre parecido sin otro dato', () => {
  assert.strictEqual(nivel(A, { nombre: 'Juan Camilo Pérez Cuervo' }), 'dudoso');
  assert.strictEqual(nivel(A, { nombre: 'Cuervo Pérez Juan Camilo', municipio: 'Tumaco' }), 'dudoso');
  assert.strictEqual(nivel(A, { nombre: 'Juan Camilo Pérez Cuervo', tipo: 'CC', doc: '598765432', fecha: '07/03/1990' }), 'dudoso');
});
prueba('no se emparejan: documentos distintos, fechas distintas o nombres distintos', () => {
  assert.strictEqual(nivel(A, { nombre: 'Juan Camilo Pérez Cuervo', tipo: 'CC', doc: '598765432' }), null); // homónimo
  assert.strictEqual(nivel(A, { nombre: 'Juan Camilo Pérez Cuervo', fecha: '08/04/1985' }), null);
  assert.strictEqual(nivel(A, { nombre: 'Juan Pérez', municipio: 'Quibdó' }), null);
  assert.strictEqual(nivel(A, { nombre: 'Juana Camila Pérez Cuervo', municipio: 'Quibdó', telefono: '3991234567' }), null);
  assert.strictEqual(nivel(A, { nombre: 'Pedro Pablo Mena Córdoba', fecha: '07/03/1990', municipio: 'Quibdó' }), null);
});

/* ---------- Bloques y grupos ---------- */
prueba('analizar encuentra las parejas sin comparar todos contra todos', () => {
  const r = E.analizar([
    A,
    { nombre: 'Luz Dary Mosquera Rentería', doc: '534567890' },
    { nombre: 'PEREZ CUERVO JUAN CAMILO', doc: '512345678' },
    { nombre: 'Juan Camilo Perez C.', fecha: '1990-03-07' },
    { nombre: 'Luz Dari Mosquera R.', telefono: '399 000 1122' },
    { nombre: 'Mosquera Renteria Luz Dary', telefono: '3990001122' }
  ]);
  const clave = r.pares.map(x => x.a + '-' + x.b + ':' + x.nivel).sort();
  assert.deepStrictEqual(clave, ['0-2:seguro', '0-3:probable', '1-4:dudoso', '1-5:dudoso', '2-3:dudoso', '4-5:probable']);
  const g = new E.Grupos(6);
  r.pares.forEach(x => { if (x.nivel === 'seguro') g.unir(x.a, x.b); });
  assert.strictEqual(g.raiz(2), 0);
  assert.notStrictEqual(g.raiz(3), 0);
});

console.log(process.exitCode ? 'Hay pruebas que fallan.' : 'Funciones: ' + hechas + ' pruebas, todas bien.');

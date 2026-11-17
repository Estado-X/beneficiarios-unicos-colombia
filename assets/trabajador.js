/* Hace la comparación en un hilo aparte (Web Worker) para que la página no se trabe con listas grandes.
   No sale del navegador: solo recibe las filas de la página y le devuelve las parejas. */
'use strict';
importScripts('nombres.js', 'emparejar.js');

self.onmessage = function (ev) {
  try {
    var res = self.Emparejar.analizar(ev.data.registros, function (hechas, total) {
      self.postMessage({ tipo: 'avance', hechas: hechas, total: total });
    });
    self.postMessage({
      tipo: 'listo',
      resultado: {
        filas: res.filas.map(function (f) { return { tipo: f.tipo, doc: f.doc, fecha: f.fecha, tel: f.tel, palabras: f.pal.length }; }),
        pares: res.pares,
        avisos: res.avisos
      }
    });
  } catch (e) {
    self.postMessage({ tipo: 'error', mensaje: String(e && e.message ? e.message : e) });
  }
};

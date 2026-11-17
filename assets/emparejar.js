/* Emparejamiento de filas que pueden ser la misma persona, en tres niveles:
   seguro (mismo tipo y número de documento, sin que choquen el nombre ni la fecha), probable (nombre parecido y coincide otro dato)
   y dudoso (nombre parecido sin otro dato, o mismo documento con nombres muy distintos).
   Para no comparar todos contra todos, cada fila solo se compara con las que comparten un «bloque»:
   el documento, el teléfono, dos palabras del nombre, o la fecha de nacimiento y una palabra.
   Inspirado en la idea de Splink (vinculación de registros por bloques y niveles); no reutiliza su código. */
(function (raiz) {
  'use strict';

  var N = raiz.Nombres || (typeof require !== 'undefined' ? require('./nombres.js') : null);

  var MUY_PARECIDO = 0.88;   // el mismo nombre con otro orden, una inicial o un error de digitación
  var PARECIDO = 0.8;        // comparten casi todas las palabras (p. ej. falta un nombre o un apellido)
  var NOMBRES_DISTINTOS = 0.6;
  var BLOQUE_MAXIMO = 4000;  // un bloque más grande que esto no dice nada (p. ej. un teléfono repetido en toda la lista)

  /* registro crudo: { nombre, tipo, doc, fecha, municipio, telefono } → fila lista para comparar */
  function normalizar(r, hoy) {
    return {
      pal: N.palabras(r.nombre),
      tipo: N.tipoDocumento(r.tipo),
      doc: N.numeroDocumento(r.doc),
      fecha: N.fecha(r.fecha, hoy),
      mun: N.municipio(r.municipio),
      tel: N.telefono(r.telefono)
    };
  }

  function claves(n) {
    var c = [];
    if (n.doc) c.push('D' + n.doc);
    if (n.tel) c.push('T' + n.tel);
    var f = [];
    for (var i = 0; i < n.pal.length; i++) {
      if (!n.pal[i].ini && f.indexOf(n.pal[i].f) < 0) f.push(n.pal[i].f);
    }
    f.sort();
    if (f.length > 6) f.length = 6;
    for (i = 0; i < f.length; i++) {
      for (var j = i + 1; j < f.length; j++) c.push('N' + f[i] + '|' + f[j]);
      if (n.fecha) c.push('F' + n.fecha + '|' + f[i]);
    }
    if (f.length === 1) c.push('U' + f[0]);
    return c;
  }

  function casiIgual(a, b) {
    // Dos números de documento que difieren en un dígito, o con dos dígitos cambiados de lugar.
    if (a.length < 6 || b.length < 6) return false;
    return N.distancia(a, b, 1) === 1;
  }

  /* Compara dos filas normalizadas. Devuelve null (no hay razón para pensar que son la misma persona)
     o { nivel, p, motivo, igual: { doc, fecha, mun, tel } }. */
  function comparar(a, b) {
    var hayNombres = a.pal.length > 0 && b.pal.length > 0;
    var s = hayNombres ? N.parecido(a.pal, b.pal) : { p: 0, completas: 0, sobranA: 0, sobranB: 0 };
    var p = s.p;
    var hayDocs = !!(a.doc && b.doc);
    var docIgual = hayDocs && a.doc === b.doc;
    var tipoCompatible = !a.tipo || !b.tipo || a.tipo === b.tipo;
    var docCasi = hayDocs && !docIgual && casiIgual(a.doc, b.doc);
    var fechaIgual = !!(a.fecha && a.fecha === b.fecha);
    var fechaDistinta = !!(a.fecha && b.fecha && a.fecha !== b.fecha);
    var munIgual = !!(a.mun && a.mun === b.mun);
    var telIgual = !!(a.tel && a.tel === b.tel);
    var igual = { doc: docIgual, fecha: fechaIgual, mun: munIgual, tel: telIgual };
    function r(nivel, motivo) { return { nivel: nivel, p: Math.round(p * 100) / 100, motivo: motivo, igual: igual }; }

    if (docIgual) {
      if (tipoCompatible) {
        var mismo = a.tipo && b.tipo ? 'Mismo tipo y número de documento.'
          : (a.tipo || b.tipo ? 'Mismo número de documento (una lista no trae el tipo).' : 'Mismo número de documento (las listas no traen el tipo).');
        // Con el mismo documento solo se une sola si nada choca: ni sobran palabras del nombre
        // en los dos lados (otro nombre con los mismos apellidos) ni la fecha de nacimiento es otra.
        var choca = fechaDistinta || (hayNombres && s.sobranA > 0 && s.sobranB > 0);
        if (!hayNombres) return fechaDistinta ? r('probable', 'Mismo documento, pero el nombre o la fecha no coinciden.') : r('seguro', mismo);
        if (p >= NOMBRES_DISTINTOS) return choca ? r('probable', 'Mismo documento, pero el nombre o la fecha no coinciden.') : r('seguro', mismo);
        return r('dudoso', 'Mismo número de documento, pero los nombres son muy distintos: puede ser un error de digitación.');
      }
      if (p >= PARECIDO) return r('probable', 'Mismo número de documento con tipo distinto (' + a.tipo + ' y ' + b.tipo + ') y nombre parecido.');
      if (p >= NOMBRES_DISTINTOS) return r('dudoso', 'Mismo número de documento con tipo distinto (' + a.tipo + ' y ' + b.tipo + ').');
      return null;
    }
    if (!hayNombres) return null;

    if (hayDocs && tipoCompatible && !docCasi) {
      // Documentos distintos: son personas distintas, salvo que todo lo demás sea idéntico.
      if (p >= 0.95 && fechaIgual) return r('dudoso', 'Mismo nombre y fecha de nacimiento, pero el número de documento es distinto.');
      return null;
    }

    var otros = [];
    if (docCasi) otros.push('el documento difiere en un dígito');
    if (fechaIgual) otros.push('coincide la fecha de nacimiento');
    if (telIgual) otros.push('coincide el teléfono');
    var fuerte = otros.length > 0;
    var como = p >= MUY_PARECIDO ? 'Nombre muy parecido' : 'Nombre parecido';

    if (fechaDistinta) {
      if (p >= MUY_PARECIDO && (telIgual || docCasi)) {
        return r('dudoso', como + ' y ' + (telIgual ? 'coincide el teléfono' : 'el documento difiere en un dígito') + ', pero la fecha de nacimiento es distinta.');
      }
      return null;
    }
    if (p >= PARECIDO && fuerte) return r('probable', como + ' y ' + otros.join(' y ') + '.');
    if (p >= MUY_PARECIDO && munIgual) return r('probable', como + ' y coincide el municipio.');
    if (p >= PARECIDO && munIgual && s.completas >= 3) return r('dudoso', como + ' y coincide el municipio, pero falta una parte del nombre.');
    if (p >= MUY_PARECIDO) return r('dudoso', como + ', sin otro dato que lo confirme.');
    return null;
  }

  /* registros: [{ nombre, tipo, doc, fecha, municipio, telefono }]
     avance(hechas, total): opcional. Devuelve { filas: normalizadas, pares: [{ a, b, nivel, p, motivo, igual }], avisos }. */
  function analizar(registros, avance, hoy) {
    var total = registros.length;
    var filas = new Array(total);
    var bloques = new Map();
    var visto = new Int32Array(total).fill(-1);
    var pares = [];
    var saltados = 0;
    for (var i = 0; i < total; i++) {
      var n = filas[i] = normalizar(registros[i], hoy);
      var cs = claves(n);
      for (var k = 0; k < cs.length; k++) {
        var lista = bloques.get(cs[k]);
        if (!lista) { bloques.set(cs[k], [i]); continue; }
        if (lista.length < BLOQUE_MAXIMO) {
          for (var x = 0; x < lista.length; x++) {
            var j = lista[x];
            if (visto[j] === i) continue;
            visto[j] = i;
            var c = comparar(filas[j], n);
            if (c) { c.a = j; c.b = i; pares.push(c); }
          }
        } else if (lista.length === BLOQUE_MAXIMO) {
          saltados++;
        }
        lista.push(i);
      }
      if (avance && (i & 1023) === 0) avance(i, total);
    }
    if (avance) avance(total, total);
    var avisos = [];
    if (saltados) avisos.push('Hay ' + saltados + (saltados === 1 ? ' dato que se repite' : ' datos que se repiten') + ' en más de ' + BLOQUE_MAXIMO + ' filas (por ejemplo, un mismo teléfono o un mismo nombre): ahí no se compararon todas contra todas.');
    return { filas: filas, pares: pares, avisos: avisos };
  }

  /* Grupos: une las filas con «unir» sobre un arreglo de padres (unión-búsqueda). */
  function Grupos(n) {
    this.padre = new Int32Array(n);
    for (var i = 0; i < n; i++) this.padre[i] = i;
  }
  Grupos.prototype.raiz = function (i) {
    var p = this.padre;
    while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; }
    return i;
  };
  Grupos.prototype.unir = function (a, b) {
    var ra = this.raiz(a), rb = this.raiz(b);
    if (ra === rb) return false;
    if (ra < rb) this.padre[rb] = ra; else this.padre[ra] = rb;
    return true;
  };

  var Emparejar = {
    normalizar: normalizar, claves: claves, comparar: comparar, analizar: analizar, Grupos: Grupos,
    MUY_PARECIDO: MUY_PARECIDO, PARECIDO: PARECIDO
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Emparejar;
  else raiz.Emparejar = Emparejar;
})(typeof self !== 'undefined' ? self : this);

/* Normalización y parecido de nombres, documentos, fechas, municipios y teléfonos.
   Pensado para listas colombianas: dos apellidos, apellidos antes o después de los nombres,
   partículas («de», «del», «de la»), iniciales («Pérez C.»), tildes y eñes que se pierden al digitar.
   Sin librerías. Funciona en la página, en el Web Worker y en Node (para las pruebas). */
(function (raiz) {
  'use strict';

  var PARTICULAS = { DE: 1, DEL: 1, LA: 1, LAS: 1, LOS: 1 };

  function sinTildes(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* Texto tal como se muestra: sin espacios de más, con sus tildes y su ñ. */
  function limpio(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F\u00A0\u200B-\u200D\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* Clave de sonido de una palabra: junta las formas que en Colombia se escriben distinto
     y suenan igual (González/Gonzales, Jhon/John, Giménez/Jiménez, Vanessa/Banesa). */
  function sonido(p) {
    var s = p;
    s = s.replace(/PH/g, 'F').replace(/CH/g, '#');
    s = s.replace(/H/g, '');
    s = s.replace(/QU(?=[EI])/g, 'K').replace(/Q/g, 'K');
    s = s.replace(/C(?=[EI])/g, 'S').replace(/C/g, 'K');
    s = s.replace(/G(?=[EI])/g, 'J');
    s = s.replace(/^X/, 'J');
    s = s.replace(/Z/g, 'S').replace(/V/g, 'B').replace(/Y/g, 'I').replace(/W/g, 'U');
    s = s.replace(/(.)\1+/g, '$1');
    return s || p;
  }

  /* Nombre → lista de palabras comparables: { t: palabra, ini: es inicial, f: clave de sonido }. */
  function palabras(nombre) {
    var base = sinTildes(nombre).toUpperCase();
    var crudos = base.split(/[^A-Z0-9.]+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < crudos.length; i++) {
      var conPunto = crudos[i].indexOf('.') >= 0;
      var partes = crudos[i].split('.');
      for (var k = 0; k < partes.length; k++) {
        var p = partes[k];
        if (!p || /^\d+$/.test(p)) continue;
        if (PARTICULAS[p] === 1) continue;
        if (p === 'Y' && !conPunto && i > 0 && i < crudos.length - 1) continue; // «Ortega y Gasset»
        if (p === 'MA' && conPunto) p = 'MARIA'; // «Ma. Fernanda»
        if (out.length >= 8) break;
        out.push({ t: p, ini: p.length === 1, f: p.length === 1 ? p : sonido(p) });
      }
    }
    return out;
  }

  /* Distancia de edición (con letras cambiadas de lugar), con tope: devuelve tope + 1 si lo pasa. */
  function distancia(a, b, tope) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > tope) return tope + 1;
    var ant2 = null, ant = new Array(lb + 1), act;
    for (var j = 0; j <= lb; j++) ant[j] = j;
    for (var i = 1; i <= la; i++) {
      act = new Array(lb + 1);
      act[0] = i;
      var minFila = i;
      for (j = 1; j <= lb; j++) {
        var costo = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(ant[j] + 1, act[j - 1] + 1, ant[j - 1] + costo);
        if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          v = Math.min(v, ant2[j - 2] + 1);
        }
        act[j] = v;
        if (v < minFila) minFila = v;
      }
      if (minFila > tope) return tope + 1;
      ant2 = ant; ant = act;
    }
    return ant[lb];
  }

  /* ¿Dos palabras son la misma con un error de digitación? Devuelve 0 (no), 0,88 (un error) o 0,8 (dos).
     No cuenta como error lo que cambia el nombre: la primera letra o el final (Mario/María, Juan/Juana). */
  function errorDeDigitacion(a, b) {
    var min = Math.min(a.length, b.length);
    if (min < 4 || a.charCodeAt(0) !== b.charCodeAt(0)) return 0;
    var tope = min >= 8 ? 2 : 1;
    var d = distancia(a, b, tope);
    if (d > tope) return 0;
    var corto = a.length <= b.length ? a : b, largo = corto === a ? b : a;
    if (largo.length === corto.length) {
      if (corto.slice(0, -1) === largo.slice(0, -1)) return 0; // solo cambia la última letra
    } else if (largo.slice(0, corto.length) === corto) {
      return 0; // una es la otra con letras al final (Juan/Juana, Martín/Martina)
    }
    return d === 1 ? 0.88 : 0.8;
  }

  /* Parecido entre dos nombres ya partidos en palabras, sin importar el orden.
     Devuelve { p: de 0 a 1, completas: palabras enteras que casaron, sobranA, sobranB }. */
  function parecido(A, B) {
    var na = A.length, nb = B.length;
    if (!na || !nb) return { p: 0, completas: 0, sobranA: na, sobranB: nb };
    var usaA = new Array(na), usaB = new Array(nb);
    var i, j, suma = 0, completas = 0;
    // 1. Iguales
    for (i = 0; i < na; i++) {
      if (A[i].ini) continue;
      for (j = 0; j < nb; j++) {
        if (!usaB[j] && !B[j].ini && A[i].t === B[j].t) { usaA[i] = usaB[j] = true; suma += 1; completas++; break; }
      }
    }
    // 2. Suenan igual
    for (i = 0; i < na; i++) {
      if (usaA[i] || A[i].ini) continue;
      for (j = 0; j < nb; j++) {
        if (!usaB[j] && !B[j].ini && A[i].f === B[j].f) { usaA[i] = usaB[j] = true; suma += 0.95; completas++; break; }
      }
    }
    // 3. Error de digitación (primero el más parecido)
    for (i = 0; i < na; i++) {
      if (usaA[i] || A[i].ini) continue;
      var mejor = -1, valor = 0;
      for (j = 0; j < nb; j++) {
        if (usaB[j] || B[j].ini) continue;
        var e = errorDeDigitacion(A[i].t, B[j].t);
        if (e > valor) { valor = e; mejor = j; }
      }
      if (mejor >= 0) { usaA[i] = usaB[mejor] = true; suma += valor; completas++; }
    }
    // 4. Iniciales («C.» con «Cuervo»)
    for (i = 0; i < na; i++) {
      if (usaA[i]) continue;
      for (j = 0; j < nb; j++) {
        if (usaB[j]) continue;
        if ((A[i].ini || B[j].ini) && A[i].t.charCodeAt(0) === B[j].t.charCodeAt(0)) { usaA[i] = usaB[j] = true; suma += 0.7; break; }
      }
    }
    var sobranA = 0, sobranB = 0;
    for (i = 0; i < na; i++) if (!usaA[i]) sobranA++;
    for (j = 0; j < nb; j++) if (!usaB[j]) sobranB++;
    var p = Math.round((0.7 * suma / Math.min(na, nb) + 0.3 * suma / Math.max(na, nb)) * 10000) / 10000;
    // Con una sola palabra en común no hay cómo decir que es la misma persona.
    if (completas < 2 && !(na === 1 && nb === 1 && completas === 1)) p = Math.min(p, 0.5);
    return { p: p, completas: completas, sobranA: sobranA, sobranB: sobranB };
  }

  function parecidoNombres(a, b) { return parecido(palabras(a), palabras(b)).p; }

  /* ---------- Documento ---------- */
  var TIPOS = [
    ['CC', /^(CC|C C|CEDULA|CEDULA DE CIUDADANIA|CEDULA CIUDADANIA|CIUDADANIA|1)$/],
    ['TI', /^(TI|T I|TARJETA DE IDENTIDAD|TARJETA IDENTIDAD|2)$/],
    ['RC', /^(RC|R C|REGISTRO CIVIL|REGISTRO CIVIL DE NACIMIENTO|NUIP)$/],
    ['CE', /^(CE|C E|CEDULA DE EXTRANJERIA|CEDULA EXTRANJERIA|EXTRANJERIA)$/],
    ['PA', /^(PA|PAS|PASAPORTE)$/],
    ['PPT', /^(PPT|PERMISO POR PROTECCION TEMPORAL|PERMISO DE PROTECCION TEMPORAL)$/],
    ['PEP', /^(PEP|PERMISO ESPECIAL DE PERMANENCIA)$/],
    ['NIT', /^(NIT)$/]
  ];

  function tipoDocumento(s) {
    var t = sinTildes(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    if (!t) return '';
    for (var i = 0; i < TIPOS.length; i++) if (TIPOS[i][1].test(t)) return TIPOS[i][0];
    return t.replace(/ /g, '').slice(0, 12);
  }

  /* Número de documento sin puntos, comas, espacios ni guiones. Entiende lo que deja Excel
     cuando guarda la cédula como número («1020304050.0», «1,02E+09»). */
  function numeroDocumento(s) {
    var t = limpio(s).toUpperCase();
    if (!t) return '';
    if (/^\d+([.,]\d+)?E\+?\d+$/.test(t)) {
      var n = Number(t.replace(',', '.'));
      if (isFinite(n) && n < 1e15) t = String(Math.round(n));
    }
    if (/^\d+[.,]0{1,2}$/.test(t)) t = t.replace(/[.,]0+$/, '');
    t = sinTildes(t).replace(/[^A-Z0-9]/g, '');
    if (/^\d+$/.test(t)) t = t.replace(/^0+/, '');
    else t = t.replace(/^(CC|TI|CE|RC|NUIP|NO|NUM|NRO)(?=\d{5,}$)/, '');
    return t.length >= 3 ? t : '';
  }

  /* ---------- Fecha ---------- */
  var MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };

  function iso(a, m, d) {
    if (!(a >= 1900 && a <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    var f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return '';
    return a + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  function siglo(aa, hoy) {
    var corte = ((hoy || new Date()).getFullYear() % 100);
    return aa <= corte ? 2000 + aa : 1900 + aa;
  }
  function deSerial(n) {
    var f = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
    return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }

  /* Fecha en cualquier forma usual → «aaaa-mm-dd», o '' si no se entiende.
     Acepta dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd, «12 de marzo de 1990» y el número de serie de Excel. */
  function fecha(s, hoy) {
    var t = sinTildes(limpio(s)).toUpperCase();
    if (!t) return '';
    var m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T ].*)?$/.exec(t))) return iso(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[-\/. ](\d{1,2})[-\/. ](\d{4}|\d{2})(?: .*)?$/.exec(t))) {
      var d = +m[1], mes = +m[2], a = m[3].length === 2 ? siglo(+m[3], hoy) : +m[3];
      if (mes > 12 && d <= 12) { var x = d; d = mes; mes = x; } // venía mes/día
      return iso(a, mes, d);
    }
    if ((m = /^(\d{1,2})(?: DE)?[ \-\/]([A-Z]{3})[A-Z]*\.?(?: DE(?:L)?)?[ \-\/](\d{4}|\d{2})$/.exec(t)) && MESES[m[2]]) {
      return iso(m[3].length === 2 ? siglo(+m[3], hoy) : +m[3], MESES[m[2]], +m[1]);
    }
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(t)) && +m[1] >= 1900 && +m[1] <= 2100) return iso(+m[1], +m[2], +m[3]);
    if (/^\d{3,5}([.,]\d+)?$/.test(t)) {
      var n = Number(t.replace(',', '.'));
      if (n >= 367 && n <= 73050) return deSerial(n); // 1901 a 2099
    }
    return '';
  }
  function fechaVisible(isoTexto) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoTexto || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  /* ---------- Municipio y teléfono ---------- */
  var ALIAS = {
    'BOGOTA DC': 'BOGOTA', 'SANTA FE DE BOGOTA': 'BOGOTA', 'SANTAFE DE BOGOTA': 'BOGOTA', 'BOGOTA DISTRITO CAPITAL': 'BOGOTA',
    'CARTAGENA DE INDIAS': 'CARTAGENA', 'SANTIAGO DE CALI': 'CALI', 'SAN JOSE DE CUCUTA': 'CUCUTA',
    'SAN ANDRES DE TUMACO': 'TUMACO', 'SAN FRANCISCO DE QUIBDO': 'QUIBDO', 'SAN JUAN DE PASTO': 'PASTO',
    'SAN SEBASTIAN DE MARIQUITA': 'MARIQUITA', 'GUADALAJARA DE BUGA': 'BUGA', 'DISTRITO DE BUENAVENTURA': 'BUENAVENTURA'
  };
  function municipio(s) {
    var t = sinTildes(limpio(s)).toUpperCase();
    if (!t) return '';
    t = t.replace(/\(.*?\)/g, ' ').replace(/\bD\.? ?[CT]\.?(?= |,|$)/g, ' ');
    t = t.split(/[,;\/]| - /)[0];
    t = t.replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return ALIAS[t] || t;
  }
  function telefono(s) {
    var t = limpio(s);
    if (/^\d+([.,]\d+)?E\+?\d+$/i.test(t)) { var n = Number(t.replace(',', '.')); if (isFinite(n)) t = String(Math.round(n)); }
    if (/^\d+[.,]0{1,2}$/.test(t)) t = t.replace(/[.,]0+$/, '');
    t = t.replace(/\D/g, '');
    if (t.length > 10 && /^(57|057|0057)/.test(t)) t = t.replace(/^0{0,2}57/, '');
    if (t.length > 10) t = t.slice(-10);
    return t.length >= 7 && !/^(\d)\1+$/.test(t) ? t : '';
  }

  var Nombres = {
    sinTildes: sinTildes, limpio: limpio, sonido: sonido, palabras: palabras, distancia: distancia,
    errorDeDigitacion: errorDeDigitacion, parecido: parecido, parecidoNombres: parecidoNombres,
    tipoDocumento: tipoDocumento, numeroDocumento: numeroDocumento,
    fecha: fecha, fechaVisible: fechaVisible, municipio: municipio, telefono: telefono
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Nombres;
  else raiz.Nombres = Nombres;
})(typeof self !== 'undefined' ? self : this);

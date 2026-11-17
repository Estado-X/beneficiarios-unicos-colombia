/* Lee listas en CSV o en Excel (.xlsx) dentro del navegador, sin librerías y sin enviar nada.
   - CSV: detecta la codificación (UTF-8 o la de Windows), el separador (coma, punto y coma, tabulador o barra) y las comillas.
   - .xlsx: es un .zip con XML; se abre con zip.js y se leen las hojas, los textos compartidos y qué celdas son fechas.
   Devuelve tablas de texto: { hojas: [{ nombre, leer() → Promise<[[texto, ...], ...]> }] } */
(function (raiz) {
  'use strict';

  var MAX_FILAS = 200000;

  /* ---------- CSV ---------- */
  function decodificar(bytes) {
    if (bytes.length >= 2 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))) {
      return new TextDecoder(bytes[0] === 0xFF ? 'utf-16le' : 'utf-16be').decode(bytes);
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  function separador(texto) {
    var muestra = texto.slice(0, 20000).split(/\r\n|\n|\r/).slice(0, 12).filter(function (l) { return l.trim(); });
    var mejores = [',', ';', '\t', '|'].map(function (s) {
      var cuentas = muestra.map(function (linea) {
        var n = 0, dentro = false;
        for (var i = 0; i < linea.length; i++) {
          var ch = linea[i];
          if (ch === '"') dentro = !dentro;
          else if (ch === s && !dentro) n++;
        }
        return n;
      });
      var min = cuentas.length ? Math.min.apply(null, cuentas) : 0;
      var suma = cuentas.reduce(function (a, b) { return a + b; }, 0);
      return { s: s, min: min, suma: suma };
    });
    mejores.sort(function (a, b) { return (b.min - a.min) || (b.suma - a.suma); });
    return mejores[0].suma > 0 ? mejores[0].s : ',';
  }

  function csv(texto) {
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
    var sep = separador(texto);
    var filas = [], fila = [], campo = '', dentro = false, i = 0, n = texto.length, hubo = false;
    while (i < n) {
      var ch = texto[i];
      if (dentro) {
        if (ch === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i += 2; continue; }
          dentro = false; i++; continue;
        }
        campo += ch; i++; continue;
      }
      if (ch === '"' && campo === '') { dentro = true; hubo = true; i++; continue; }
      if (ch === sep) { fila.push(campo); campo = ''; hubo = true; i++; continue; }
      if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); campo = '';
        filas.push(fila); fila = []; hubo = false; i++;
        if (filas.length > MAX_FILAS) throw new Error('La lista tiene más de ' + MAX_FILAS.toLocaleString('es-CO') + ' filas.');
        continue;
      }
      campo += ch; hubo = true; i++;
    }
    if (hubo || campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  /* ---------- Excel (.xlsx) ---------- */
  function xml(texto, que) {
    var doc = new DOMParser().parseFromString(texto, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('El Excel está dañado (' + que + ').');
    return doc;
  }
  function todos(nodo, nombre) { return nodo.getElementsByTagNameNS('*', nombre); }
  function texto(bytes) { return new TextDecoder('utf-8').decode(bytes); }
  function ruta(base, destino) {
    if (destino.charAt(0) === '/') return destino.slice(1);
    var partes = (base + destino).split('/'), out = [];
    partes.forEach(function (p) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
    return out.join('/');
  }
  function columnaDe(ref) {
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var c = ref.charCodeAt(i);
      if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
      else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
      else break;
    }
    return n - 1;
  }
  function esFormatoFecha(id, codigo) {
    if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return true;
    if (!codigo) return false;
    var limpio = codigo.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
    return /[dy]/i.test(limpio);
  }
  function fechaDeSerial(n) {
    if (!(n >= 1 && n < 2958466)) return null;
    var f = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
    var d = f.getUTCDate(), m = f.getUTCMonth() + 1;
    return (d < 10 ? '0' : '') + d + '/' + (m < 10 ? '0' : '') + m + '/' + f.getUTCFullYear();
  }
  function numero(v) {
    // Excel guarda 1020304050 como «1.02030405E9»: se devuelve el número completo, sin notación.
    if (/[eE]/.test(v) || /\.\d{10,}$/.test(v)) {
      var n = Number(v);
      if (isFinite(n)) return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e9) / 1e9);
    }
    return v;
  }

  function leerHoja(doc, compartidos, fechas) {
    var filas = [];
    var rows = todos(doc, 'row');
    if (rows.length > MAX_FILAS) throw new Error('La hoja tiene más de ' + MAX_FILAS.toLocaleString('es-CO') + ' filas.');
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var nr = parseInt(row.getAttribute('r'), 10);
      var idx = nr > 0 ? nr - 1 : filas.length;
      if (idx > MAX_FILAS) break;
      while (filas.length < idx) filas.push([]);
      var fila = [];
      var c = row.firstElementChild, sig = 0;
      while (c) {
        if (c.localName === 'c') {
          var ref = c.getAttribute('r');
          var col = ref ? columnaDe(ref) : sig;
          if (col >= 0 && col < 500) {
            var t = c.getAttribute('t'), valor = '';
            var hijo = c.firstElementChild, v = null, is = null;
            while (hijo) { if (hijo.localName === 'v') v = hijo; else if (hijo.localName === 'is') is = hijo; hijo = hijo.nextElementSibling; }
            if (t === 's') valor = v ? (compartidos[parseInt(v.textContent, 10)] || '') : '';
            else if (t === 'inlineStr') valor = is ? textoRico(is) : '';
            else if (t === 'str') valor = v ? v.textContent : '';
            else if (t === 'b') valor = v && v.textContent === '1' ? 'VERDADERO' : 'FALSO';
            else if (t === 'e') valor = '';
            else if (v) {
              valor = v.textContent;
              if (t === 'd') valor = valor.slice(0, 10);
              else if (fechas[parseInt(c.getAttribute('s'), 10) || 0]) valor = fechaDeSerial(Number(valor)) || valor;
              else valor = numero(valor);
            }
            while (fila.length < col) fila.push('');
            fila[col] = valor;
          }
          sig = col + 1;
        }
        c = c.nextElementSibling;
      }
      filas[idx] = fila;
    }
    return filas;
  }
  function textoRico(nodo) {
    // Junta los trozos de texto y deja por fuera las guías fonéticas (rPh).
    var s = '', ts = todos(nodo, 't');
    for (var i = 0; i < ts.length; i++) {
      if (ts[i].parentNode && ts[i].parentNode.localName === 'rPh') continue;
      s += ts[i].textContent;
    }
    return s;
  }

  function xlsx(bytes) {
    var Zip = raiz.Zip;
    var mapa = {};
    Zip.listar(bytes).forEach(function (a) { mapa[a.nombre] = a; });
    function parte(nombre, que) {
      if (!mapa[nombre]) return Promise.resolve(null);
      return mapa[nombre].leer().then(function (b) { return xml(texto(b), que); });
    }
    if (!mapa['xl/workbook.xml']) {
      return Promise.reject(new Error(mapa['EncryptedPackage'] ? 'El Excel tiene clave. Quítasela y vuelve a cargarlo.' : 'El archivo no es un Excel .xlsx que se pueda leer aquí.'));
    }
    return Promise.all([
      parte('xl/workbook.xml', 'libro'), parte('xl/_rels/workbook.xml.rels', 'relaciones'),
      parte('xl/sharedStrings.xml', 'textos'), parte('xl/styles.xml', 'estilos')
    ]).then(function (p) {
      var libro = p[0], rels = p[1], sst = p[2], estilos = p[3];
      var destinos = {};
      if (rels) Array.prototype.forEach.call(todos(rels, 'Relationship'), function (r) { destinos[r.getAttribute('Id')] = r.getAttribute('Target'); });
      var compartidos = [];
      if (sst) Array.prototype.forEach.call(todos(sst, 'si'), function (si) { compartidos.push(textoRico(si)); });
      var fechas = [];
      if (estilos) {
        var codigos = {};
        Array.prototype.forEach.call(todos(estilos, 'numFmt'), function (f) { codigos[f.getAttribute('numFmtId')] = f.getAttribute('formatCode'); });
        var xfs = todos(estilos, 'cellXfs')[0];
        if (xfs) Array.prototype.forEach.call(todos(xfs, 'xf'), function (xf) {
          var id = parseInt(xf.getAttribute('numFmtId'), 10) || 0;
          fechas.push(esFormatoFecha(id, codigos[id]));
        });
      }
      var hojas = [];
      Array.prototype.forEach.call(todos(libro, 'sheet'), function (s, i) {
        var id = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
        var archivo = destinos[id] ? ruta('xl/', destinos[id]) : 'xl/worksheets/sheet' + (i + 1) + '.xml';
        if (!mapa[archivo] || s.getAttribute('state') === 'veryHidden') return;
        hojas.push({
          nombre: s.getAttribute('name') || ('Hoja ' + (i + 1)),
          leer: function () {
            return mapa[archivo].leer().then(function (b) { return leerHoja(xml(texto(b), 'hoja'), compartidos, fechas); });
          }
        });
      });
      if (!hojas.length) throw new Error('El Excel no tiene hojas con datos.');
      return { hojas: hojas };
    });
  }

  /* ---------- Entrada común ---------- */
  function abrir(nombre, bytes) {
    // Cualquier error, también el de un archivo dañado, llega como promesa rechazada.
    return new Promise(function (ok) { ok(abrirArchivo(nombre, bytes)); });
  }
  function abrirArchivo(nombre, bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    var ext = (/\.([a-z0-9]+)$/i.exec(nombre) || [, ''])[1].toLowerCase();
    if (raiz.Zip.esZip(bytes)) {
      return xlsx(bytes).catch(function (e) {
        if (/navegador no puede abrir/.test(e.message)) throw new Error('Tu navegador no puede abrir archivos de Excel. Actualízalo o guarda la lista como CSV.');
        throw e;
      });
    }
    if (bytes.length >= 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
      return Promise.reject(new Error(ext === 'xlsx' ? 'El Excel tiene clave. Quítasela y vuelve a cargarlo.' : 'Es un Excel del formato antiguo (.xls). Ábrelo y guárdalo como .xlsx o como CSV.'));
    }
    if (ext === 'xlsx' || ext === 'xlsm') return Promise.reject(new Error('El archivo dice ser un Excel, pero no se puede abrir.'));
    return new Promise(function (ok) {
      var filas = csv(decodificar(bytes));
      ok({ hojas: [{ nombre: '', leer: function () { return Promise.resolve(filas); } }] });
    });
  }

  /* Tabla cruda → { encabezados, filas: [{ n: número de fila en el archivo, v: [texto, ...] }] }.
     El encabezado es la primera fila con al menos dos celdas con texto (así se saltan los títulos sueltos). */
  function tabla(crudas) {
    var limpiar = function (v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); };
    var iEnc = -1, primera = -1;
    for (var i = 0; i < crudas.length && i < 50; i++) {
      var llenas = 0;
      for (var j = 0; j < crudas[i].length; j++) if (limpiar(crudas[i][j])) llenas++;
      if (llenas && primera < 0) primera = i;
      if (llenas >= 2) { iEnc = i; break; }
    }
    if (iEnc < 0) iEnc = primera;
    if (iEnc < 0) return { encabezados: [], filas: [] };
    var ancho = 0, filas = [];
    for (i = iEnc; i < crudas.length; i++) {
      for (j = crudas[i].length - 1; j >= ancho; j--) if (limpiar(crudas[i][j])) { ancho = j + 1; break; }
    }
    var encabezados = [];
    for (j = 0; j < ancho; j++) encabezados.push(limpiar(crudas[iEnc][j]) || ('Columna ' + (raiz.Excel ? raiz.Excel.columna(j) : j + 1)));
    for (i = iEnc + 1; i < crudas.length; i++) {
      var v = [], hay = false;
      for (j = 0; j < ancho; j++) { var x = limpiar(crudas[i][j]); if (x) hay = true; v.push(x); }
      if (hay) filas.push({ n: i + 1, v: v });
    }
    return { encabezados: encabezados, filas: filas };
  }

  /* ---------- Qué es cada columna, según su encabezado ---------- */
  var CAMPOS = [
    ['', 'No se usa'], ['nombres', 'Nombres'], ['apellidos', 'Apellidos'], ['completo', 'Nombre completo'],
    ['tipo', 'Tipo de documento'], ['doc', 'Número de documento'], ['fecha', 'Fecha de nacimiento'],
    ['municipio', 'Municipio'], ['telefono', 'Teléfono']
  ];
  var NO_ES_LA_PERSONA = /\b(PROYECTO|ACUDIENTE|ORGANIZACION|ENTIDAD|INSTITUCION|EMERGENCIA|MADRE|PADRE|TALLER|ACTIVIDAD|USUARIO|FUNCIONARIO|RESPONSABLE|ENCUESTADOR|PROFESIONAL|COLEGIO|EMPRESA|BARRIO|VEREDA|EXPEDICION|ARCHIVO|PROGRAMA|CURSO|KIT)\b/;

  function adivinar(encabezados) {
    var S = raiz.Nombres.sinTildes;
    var h = encabezados.map(function (e) { return S(e).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); });
    var hayApellidos = h.some(function (x) { return /APELLIDO/.test(x) && !/NOMBRE/.test(x) && !NO_ES_LA_PERSONA.test(x); });
    var usados = {};
    return h.map(function (x) {
      var campo = '';
      if (!x || NO_ES_LA_PERSONA.test(x)) campo = '';
      else if (/\bTIPO\b.*\b(DOC|DOCUMENTO|IDENTIFICACION|IDENTIDAD|ID)\b/.test(x) || /^(TD|TIPO DOC|TIPO ID|TIPODOC)$/.test(x)) campo = 'tipo';
      else if (/NACIMIENTO|\bNACIO\b|\bF NAC\b|\bFEC NAC\b|\bFECHA NAC\b|\bDOB\b/.test(x) && !/\b(LUGAR|MUNICIPIO|CIUDAD|PAIS|DEPARTAMENTO)\b/.test(x)) campo = 'fecha';
      else if (/\b(DOCUMENTO|DOC|CEDULA|CC|IDENTIFICACION|NUIP|ID|DNI|TI|IDENTIDAD)\b/.test(x) && !/\b(FECHA|LUGAR|TIPO)\b/.test(x)) campo = 'doc';
      else if (/\b(MUNICIPIO|MPIO|CIUDAD)\b/.test(x) && !/\b(FECHA|NACIMIENTO|CODIGO|COD)\b/.test(x)) campo = 'municipio';
      else if (/\b(TELEFONO|TEL|CELULAR|CEL|MOVIL|WHATSAPP)\b/.test(x)) campo = 'telefono';
      else if (/APELLIDO/.test(x) && /NOMBRE/.test(x)) campo = 'completo';
      else if (/APELLIDO/.test(x)) campo = 'apellidos';
      else if (/NOMBRE/.test(x)) campo = /COMPLETO/.test(x) || !hayApellidos ? 'completo' : 'nombres';
      else if (/^(BENEFICIARI[OA]S?|PARTICIPANTES?|ASISTENTES?|PERSONA)$/.test(x)) campo = 'completo';
      // Los nombres y los apellidos pueden venir en varias columnas; lo demás, en una sola.
      if (campo && campo !== 'nombres' && campo !== 'apellidos') {
        if (usados[campo]) campo = ''; else usados[campo] = true;
      }
      return campo;
    });
  }

  var Leer = { abrir: abrir, tabla: tabla, adivinar: adivinar, csv: csv, decodificar: decodificar, separador: separador, CAMPOS: CAMPOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Leer;
  else raiz.Leer = Leer;
})(typeof self !== 'undefined' ? self : this);

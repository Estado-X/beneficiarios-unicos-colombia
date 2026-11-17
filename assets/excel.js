/* Arma un .xlsx real (Office Open XML) sin librerías: unas pocas partes XML dentro de un .zip.
   Viene de Estado-X/facturas-colombia (assets/excel.js, commit 413584d), licencia MIT de Estado X.
   Se conservan el escape, los estilos, las celdas y las hojas; aquí el libro es genérico
   (las hojas que se le pasen) y se quitó lo propio de las facturas.
   Todo texto va como texto literal: una celda que empiece por =, +, - o @ nunca queda como fórmula. */
(function (raiz) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function columna(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function serial(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return null;
    return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  // Estilos: 0 normal · 1 encabezado · 2 número entero · 3 fecha · 5 texto en negrilla · 6 texto literal (quotePrefix)
  var ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF2EBDC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" quotePrefix="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function celda(ref, v, estilo) {
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + (estilo ? ' s="' + estilo + '"' : '') + '><v>' + v + '</v></c>';
    if (v === null || v === undefined || v === '') return '';
    // El texto va siempre como texto en línea (Excel no lo calcula). Si además empieza como fórmula,
    // se marca como texto literal para que siga siendo texto aunque alguien edite la celda.
    if (/^[=+\-@\t\r\n]/.test(String(v)) && estilo !== 1 && estilo !== 5) estilo = 6;
    else if (estilo === 2 || estilo === 3) estilo = 0;
    return '<c r="' + ref + '" t="inlineStr"' + (estilo ? ' s="' + estilo + '"' : '') + '><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  /* filas: [[valor, ...]] (la primera es el encabezado) · anchos: ancho por columna
     estilosCol: estilo por columna para las filas de datos · op: { fijar, filtro } */
  function hoja(filas, anchos, estilosCol, op) {
    op = op || {};
    var partes = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];
    if (op.fijar) partes.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
    partes.push('<cols>' + anchos.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols><sheetData>');
    for (var r = 0; r < filas.length; r++) {
      var fila = filas[r], x = '<row r="' + (r + 1) + '">';
      for (var c = 0; c < fila.length; c++) {
        x += celda(columna(c) + (r + 1), fila[c], r === 0 ? 1 : (estilosCol ? estilosCol[c] : 0));
      }
      partes.push(x + '</row>');
    }
    partes.push('</sheetData>');
    if (op.filtro && filas.length > 1) partes.push('<autoFilter ref="A1:' + columna(filas[0].length - 1) + filas.length + '"/>');
    partes.push('</worksheet>');
    return partes.join('');
  }

  function nombreHoja(s) { return String(s).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Hoja'; }

  /* hojas: [{ nombre, filas, anchos, estilos, fijar, filtro }] → las partes del .xlsx, listas para el .zip */
  function partes(hojas) {
    var X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var tipos = '', lista = '', rels = '', archivos = [];
    hojas.forEach(function (h, i) {
      var n = i + 1;
      tipos += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      lista += '<sheet name="' + esc(nombreHoja(h.nombre)) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
      rels += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
      archivos.push({ nombre: 'xl/worksheets/sheet' + n + '.xml', datos: hoja(h.filas, h.anchos, h.estilos, { fijar: h.fijar, filtro: h.filtro }) });
    });
    var base = [
      { nombre: '[Content_Types].xml', datos: X +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        tipos +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>' },
      { nombre: '_rels/.rels', datos: X +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
      { nombre: 'xl/workbook.xml', datos: X +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' + lista + '</sheets></workbook>' },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: X +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels +
        '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>' }
    ];
    return base.concat(archivos, [{ nombre: 'xl/styles.xml', datos: ESTILOS }]);
  }
  /* → Uint8Array con el .xlsx (sin comprimir) */
  function libro(hojas, Zip, fechaZip) { return (Zip || raiz.Zip).crear(partes(hojas), fechaZip); }
  /* → Promise<Uint8Array> con el .xlsx comprimido */
  function libroComprimido(hojas, Zip, fechaZip) { return (Zip || raiz.Zip).crearComprimido(partes(hojas), fechaZip); }

  var Excel = { libro: libro, libroComprimido: libroComprimido, partes: partes, hoja: hoja, celda: celda, serial: serial, columna: columna };
  if (typeof module !== 'undefined' && module.exports) module.exports = Excel;
  else raiz.Excel = Excel;
})(this);

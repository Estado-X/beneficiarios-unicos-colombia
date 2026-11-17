/* Beneficiarios sin duplicados · la página.
   Todo pasa aquí, en el navegador: nada se envía y nada se guarda (ni en localStorage ni en ninguna parte).
   Lo que viene de los archivos se escribe siempre con textContent. */
(function () {
  'use strict';

  var N = window.Nombres, E = window.Emparejar, Leer = window.Leer;
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat('es-CO');

  var EJEMPLO = ['ejemplos/inscripcion-ficticia.csv', 'ejemplos/asistencia-ficticia.xlsx', 'ejemplos/entregas-ficticia.csv'];
  var CAMPOS_UNICOS = ['completo', 'tipo', 'doc', 'fecha', 'municipio', 'telefono'];

  var estado = {
    listas: [],        // { id, nombre, hojas, hoja, encabezados, filas, mapa, ficticia }
    siguienteId: 1,
    registros: null,   // filas de todas las listas, con sus campos como están escritos
    norm: null,        // lo mismo, normalizado (documento, fecha…)
    seguros: [],       // parejas con el mismo documento: se unen solas
    pendientes: [],    // parejas probables y dudosas: { a, b, nivel, p, motivo, igual, decision, orden }
    cola: [],          // orden en que se muestran
    historial: [],     // índices de pendientes ya decididos, para deshacer
    grupos: null,
    actual: -1,
    avisos: [],
    trabajando: false
  };

  /* ---------- Utilidades de DOM (siempre textContent) ---------- */
  function el(etiqueta, clase, texto) {
    var e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function vaciar(nodo) { while (nodo.firstChild) nodo.removeChild(nodo.firstChild); }
  function plural(n, uno, varios) { return nf.format(n) + ' ' + (n === 1 ? uno : varios); }
  function sinExtension(nombre) { return nombre.replace(/\.[a-z0-9]+$/i, ''); }

  /* ---------- 1. Cargar ---------- */
  function mostrarError(texto) {
    var p = el('p', 'aviso aviso--error', texto);
    $('errores').appendChild(p);
  }

  function leerArchivo(archivo) {
    return archivo.arrayBuffer().then(function (ab) { return agregarLista(archivo.name, new Uint8Array(ab), false); });
  }

  function agregarLista(nombre, bytes, ficticia) {
    return Leer.abrir(nombre, bytes).then(function (libro) {
      var lista = { id: estado.siguienteId++, nombre: nombre, hojas: libro.hojas, hoja: 0, encabezados: [], filas: [], mapa: [], ficticia: ficticia };
      return elegirHoja(lista, 0, true).then(function () { estado.listas.push(lista); });
    }).catch(function (e) {
      mostrarError('«' + nombre + '»: ' + (e && e.message ? e.message : 'no se pudo leer.'));
    });
  }

  // Al cargar un Excel con varias hojas se abre la primera que tenga datos.
  function elegirHoja(lista, i, buscarConDatos) {
    return lista.hojas[i].leer().then(function (crudas) {
      var t = Leer.tabla(crudas);
      if (buscarConDatos && !t.filas.length && i + 1 < lista.hojas.length) return elegirHoja(lista, i + 1, true);
      if (buscarConDatos && !t.filas.length) throw new Error('no tiene filas con datos.');
      lista.hoja = i;
      lista.encabezados = t.encabezados;
      lista.filas = t.filas;
      lista.mapa = Leer.adivinar(t.encabezados);
    });
  }

  function recibir(archivos) {
    if (estado.trabajando || !archivos || !archivos.length) return;
    vaciar($('errores'));
    var cola = Promise.resolve();
    Array.prototype.forEach.call(archivos, function (a) { cola = cola.then(function () { return leerArchivo(a); }); });
    cola.then(function () { invalidar(); pintarListas(); if (estado.listas.length) $('listas').scrollIntoView({ block: 'nearest' }); });
  }

  function cargarEjemplo() {
    if (estado.trabajando) return;
    vaciar($('errores'));
    estado.listas = [];
    invalidar();
    Promise.all(EJEMPLO.map(function (ruta) {
      return fetch(ruta).then(function (r) {
        if (!r.ok) throw new Error('no respondió');
        return r.arrayBuffer();
      }).then(function (ab) { return { nombre: ruta.split('/').pop(), bytes: new Uint8Array(ab) }; });
    })).then(function (archivos) {
      var cola = Promise.resolve();
      archivos.forEach(function (a) { cola = cola.then(function () { return agregarLista(a.nombre, a.bytes, true); }); });
      return cola;
    }).then(function () {
      pintarListas();
      $('cargar').scrollIntoView();
      buscar();
    }).catch(function () {
      mostrarError('No se pudo abrir el ejemplo desde aquí. Si abriste la página como archivo, arrastra las tres listas de la carpeta «ejemplos».');
    });
  }

  function camposDe(lista) {
    var tiene = {};
    lista.mapa.forEach(function (c) { if (c) tiene[c] = true; });
    return tiene;
  }
  function sirve(lista) {
    var t = camposDe(lista);
    return !!(t.completo || t.nombres || t.apellidos || t.doc);
  }

  function pintarListas() {
    var caja = $('listas');
    vaciar(caja);
    var hayFicticia = estado.listas.some(function (l) { return l.ficticia; });
    $('aviso-ficticio').hidden = !hayFicticia;
    estado.listas.forEach(function (lista) {
      var art = el('article', 'lista');
      art.setAttribute('aria-label', 'Lista ' + lista.nombre);
      var cab = el('div', 'lista__cab');
      var titulo = el('h3', 'lista__nombre', lista.nombre);
      var dato = el('p', 'nota', plural(lista.filas.length, 'fila', 'filas') + ' · ' + plural(lista.encabezados.length, 'columna', 'columnas'));
      var quitar = el('button', 'enlace-fuerte lista__quitar', 'Quitar');
      quitar.type = 'button';
      quitar.setAttribute('aria-label', 'Quitar la lista ' + lista.nombre);
      quitar.addEventListener('click', function () {
        estado.listas = estado.listas.filter(function (l) { return l !== lista; });
        invalidar(); pintarListas();
      });
      var textos = el('div', 'lista__textos');
      textos.appendChild(titulo); textos.appendChild(dato);
      cab.appendChild(textos); cab.appendChild(quitar);
      art.appendChild(cab);

      if (lista.hojas.length > 1) {
        var idH = 'hoja-' + lista.id;
        var campoH = el('p', 'lista__hoja');
        var lh = el('label', null, 'Hoja del Excel: '); lh.htmlFor = idH;
        var sh = el('select'); sh.id = idH;
        lista.hojas.forEach(function (h, i) { var o = el('option', null, h.nombre); o.value = String(i); sh.appendChild(o); });
        sh.value = String(lista.hoja);
        sh.addEventListener('change', function () {
          elegirHoja(lista, +sh.value, false).then(function () { invalidar(); pintarListas(); var s = $(idH); if (s) s.focus(); })
            .catch(function (e) { mostrarError('«' + lista.nombre + '»: ' + e.message); });
        });
        campoH.appendChild(lh); campoH.appendChild(sh);
        art.appendChild(campoH);
      }

      var envoltura = el('div', 'tabla-scroll');
      var tabla = el('table', 'columnas');
      var cap = el('caption', 'sr', 'Qué es cada columna de ' + lista.nombre);
      tabla.appendChild(cap);
      var thead = el('thead'), trh = el('tr');
      ['Columna', 'Ejemplo', 'Qué es'].forEach(function (t) { var th = el('th', null, t); th.scope = 'col'; trh.appendChild(th); });
      thead.appendChild(trh); tabla.appendChild(thead);
      var tbody = el('tbody');
      lista.encabezados.forEach(function (enc, j) {
        var tr = el('tr');
        var th = el('th', null, enc); th.scope = 'row';
        var muestra = '';
        for (var i = 0; i < lista.filas.length && i < 40; i++) { if (lista.filas[i].v[j]) { muestra = lista.filas[i].v[j]; break; } }
        var td = el('td', 'columnas__ejemplo', muestra || '—');
        var tdS = el('td');
        var sel = el('select');
        sel.setAttribute('aria-label', 'Qué es la columna ' + enc);
        Leer.CAMPOS.forEach(function (c) { var o = el('option', null, c[1]); o.value = c[0]; sel.appendChild(o); });
        sel.value = lista.mapa[j] || '';
        if (lista.mapa[j]) tr.className = 'columnas__usada';
        sel.addEventListener('change', function () {
          var v = sel.value;
          if (CAMPOS_UNICOS.indexOf(v) >= 0) {
            // Estos datos van en una sola columna: si ya había otra, se suelta.
            lista.mapa = lista.mapa.map(function (c, k) { return (c === v && k !== j) ? '' : c; });
          }
          lista.mapa[j] = v;
          invalidar(); pintarListas();
          var filas = $('listas').querySelectorAll('article')[estado.listas.indexOf(lista)];
          if (filas) { var s = filas.querySelectorAll('tbody select')[j]; if (s) s.focus(); }
        });
        tdS.appendChild(sel);
        tr.appendChild(th); tr.appendChild(td); tr.appendChild(tdS);
        tbody.appendChild(tr);
      });
      tabla.appendChild(tbody);
      envoltura.appendChild(tabla);
      art.appendChild(envoltura);

      if (!sirve(lista)) art.appendChild(el('p', 'aviso aviso--error', 'Marca al menos la columna del nombre o la del número de documento para poder comparar esta lista.'));
      else if (!camposDe(lista).doc) art.appendChild(el('p', 'nota lista__pie', 'Sin número de documento, las parejas de esta lista no pueden ser seguras: te las mostramos para que decidas.'));
      caja.appendChild(art);
    });

    var hay = estado.listas.length > 0;
    $('paso-buscar').hidden = !hay;
    var listas = estado.listas.filter(sirve);
    $('buscar').disabled = !hay || listas.length !== estado.listas.length;
    var total = estado.listas.reduce(function (s, l) { return s + l.filas.length; }, 0);
    $('estado-buscar').textContent = hay ? plural(estado.listas.length, 'lista', 'listas') + ' · ' + plural(total, 'fila', 'filas') + ' en total.' : '';
  }

  /* Cambió algo en las listas: lo que se había comparado ya no vale. */
  function invalidar() {
    estado.registros = estado.norm = estado.grupos = null;
    estado.seguros = []; estado.pendientes = []; estado.cola = []; estado.historial = [];
    estado.actual = -1;
    $('revisar').hidden = true;
    $('resultado').hidden = true;
  }

  /* ---------- 2. Comparar ---------- */
  function construirRegistros() {
    var regs = [];
    estado.listas.forEach(function (lista, li) {
      var cols = { nombres: [], apellidos: [], completo: [], tipo: [], doc: [], fecha: [], municipio: [], telefono: [] };
      lista.mapa.forEach(function (c, j) { if (c && cols[c]) cols[c].push(j); });
      var junta = function (fila, idx) {
        var s = '';
        for (var k = 0; k < idx.length; k++) { var v = fila.v[idx[k]]; if (v) s += (s ? ' ' : '') + v; }
        return N.limpio(s);
      };
      lista.filas.forEach(function (fila) {
        var completo = junta(fila, cols.completo);
        var partes = junta(fila, cols.nombres.concat(cols.apellidos));
        regs.push({
          lista: li, n: fila.n,
          nombre: completo || partes,
          tipo: junta(fila, cols.tipo), doc: junta(fila, cols.doc), fecha: junta(fila, cols.fecha),
          municipio: junta(fila, cols.municipio), telefono: junta(fila, cols.telefono)
        });
      });
    });
    return regs;
  }

  function analizar(registros, avance) {
    var datos = registros.map(function (r) { return { nombre: r.nombre, tipo: r.tipo, doc: r.doc, fecha: r.fecha, municipio: r.municipio, telefono: r.telefono }; });
    var enHilo = function () {
      return new Promise(function (ok) { setTimeout(function () { ok(resumir(E.analizar(datos, null))); }, 30); });
    };
    return new Promise(function (ok, mal) {
      var w;
      try { w = new Worker('assets/trabajador.js'); } catch (e) { ok(enHilo()); return; }
      w.onmessage = function (ev) {
        var m = ev.data;
        if (m.tipo === 'avance') avance(m.hechas, m.total);
        else if (m.tipo === 'listo') { w.terminate(); ok(m.resultado); }
        else if (m.tipo === 'error') { w.terminate(); mal(new Error(m.mensaje)); }
      };
      w.onerror = function (ev) { ev.preventDefault(); w.terminate(); ok(enHilo()); };
      w.postMessage({ registros: datos });
    });
  }
  // Lo que la página necesita de cada fila ya normalizada (igual a lo que devuelve el trabajador).
  function resumir(res) {
    return {
      filas: res.filas.map(function (f) { return { tipo: f.tipo, doc: f.doc, fecha: f.fecha, tel: f.tel, palabras: f.pal.length }; }),
      pares: res.pares, avisos: res.avisos
    };
  }

  function buscar() {
    if (estado.trabajando || !estado.listas.length) return;
    invalidar();
    var registros = construirRegistros();
    if (!registros.length) { mostrarError('Las listas no tienen filas con datos.'); return; }
    estado.trabajando = true;
    $('buscar').disabled = true;
    $('avance').hidden = false;
    $('barra').value = 0;
    $('avance-texto').textContent = 'Comparando ' + plural(registros.length, 'fila', 'filas') + '…';
    analizar(registros, function (hechas, total) {
      $('barra').value = total ? Math.round(100 * hechas / total) : 100;
    }).then(function (res) {
      estado.registros = registros;
      estado.norm = res.filas;
      estado.avisos = res.avisos || [];
      preparar(res.pares);
      $('revisar').hidden = false;
      $('resultado').hidden = false;
      pintarRevision(true);
      $('revisar').scrollIntoView();
    }).catch(function (e) {
      mostrarError('No se pudo comparar: ' + (e && e.message ? e.message : 'error inesperado.'));
    }).then(function () {
      estado.trabajando = false;
      $('avance').hidden = true;
      $('buscar').disabled = false;
    });
  }

  function preparar(pares) {
    var total = estado.registros.length;
    estado.seguros = pares.filter(function (p) { return p.nivel === 'seguro'; });
    var g = new E.Grupos(total);
    estado.seguros.forEach(function (p) { g.unir(p.a, p.b); });
    // Entre dos grupos ya unidos por documento se muestra una sola pareja: la más clara.
    var mejor = new Map();
    var rango = function (p) { return (p.nivel === 'probable' ? 10 : 0) + p.p; };
    pares.forEach(function (p) {
      if (p.nivel === 'seguro') return;
      var ra = g.raiz(p.a), rb = g.raiz(p.b);
      if (ra === rb) return;
      var k = ra < rb ? ra + '|' + rb : rb + '|' + ra;
      var m = mejor.get(k);
      if (!m || rango(p) > rango(m)) mejor.set(k, p);
    });
    estado.pendientes = Array.from(mejor.values()).sort(function (x, y) { return (rango(y) - rango(x)) || (x.a - y.a) || (x.b - y.b); });
    estado.pendientes.forEach(function (p) { p.decision = null; p.orden = 0; });
    estado.cola = estado.pendientes.map(function (_, i) { return i; });
    estado.historial = [];
    recalcular();
  }

  /* Vuelve a armar los grupos con lo seguro y con lo que la persona ha dicho. */
  function recalcular() {
    var g = new E.Grupos(estado.registros.length);
    estado.seguros.forEach(function (p) { g.unir(p.a, p.b); });
    estado.pendientes.forEach(function (p) { if (p.decision === 'misma') g.unir(p.a, p.b); });
    estado.grupos = g;
    var distintas = estado.pendientes.filter(function (p) { return p.decision === 'distinta'; })
      .map(function (p) { return [g.raiz(p.a), g.raiz(p.b)]; });
    estado.pendientes.forEach(function (p) {
      p.resuelta = '';
      if (p.decision) return;
      var ra = g.raiz(p.a), rb = g.raiz(p.b);
      if (ra === rb) { p.resuelta = 'misma'; return; }
      for (var i = 0; i < distintas.length; i++) {
        var d = distintas[i];
        if ((d[0] === ra && d[1] === rb) || (d[0] === rb && d[1] === ra)) { p.resuelta = 'distinta'; return; }
      }
    });
    estado.actual = -1;
    for (var i = 0; i < estado.cola.length; i++) {
      var p = estado.pendientes[estado.cola[i]];
      if (!p.decision && !p.resuelta) { estado.actual = estado.cola[i]; break; }
    }
  }

  function cuentas() {
    var c = { decididas: 0, resueltas: 0, faltan: 0, unicas: 0 };
    estado.pendientes.forEach(function (p) {
      if (p.decision) c.decididas++; else if (p.resuelta) c.resueltas++; else c.faltan++;
    });
    var g = estado.grupos;
    for (var i = 0; i < estado.registros.length; i++) if (g.raiz(i) === i) c.unicas++;
    return c;
  }

  function nombreLista(i) { return sinExtension(estado.listas[i].nombre); }

  function filaComparada(tbody, etiqueta, a, b, marca) {
    var tr = el('tr');
    var th = el('th'); th.scope = 'row';
    th.appendChild(el('span', 'lado__campo', etiqueta));
    if (marca) th.appendChild(el('span', 'marca marca--' + marca[0], marca[1]));
    tr.appendChild(th);
    tr.appendChild(el('td', a ? null : 'lado__vacio', a || 'Sin dato'));
    tr.appendChild(el('td', b ? null : 'lado__vacio', b || 'Sin dato'));
    tbody.appendChild(tr);
  }
  function marcaDe(igual, a, b) {
    if (igual) return ['igual', 'coincide'];
    if (a && b) return ['distinto', 'distinto'];
    return null;
  }
  function documentoVisible(r, n) { return r.doc ? ((n.tipo ? n.tipo + ' ' : '') + r.doc) : ''; }
  function fechaComoEs(r, n) { return n.fecha ? N.fechaVisible(n.fecha) : r.fecha; }

  function pintarRevision(enfocar) {
    var c = cuentas();
    var nProb = 0, nDud = 0;
    estado.pendientes.forEach(function (p) { if (p.nivel === 'probable') nProb++; else nDud++; });
    $('n-seguros').textContent = nf.format(estado.seguros.length);
    $('n-probables').textContent = nf.format(nProb);
    $('n-dudosas').textContent = nf.format(nDud);

    var av = $('avisos-analisis');
    vaciar(av);
    estado.avisos.forEach(function (t) { av.appendChild(el('p', 'aviso', t)); });

    var total = estado.pendientes.length;
    var hechas = c.decididas + c.resueltas;
    $('progreso').max = Math.max(total, 1);
    $('progreso').value = hechas;
    $('b-deshacer').disabled = !estado.historial.length;

    var caja = $('pareja');
    vaciar(caja);
    var p = estado.actual >= 0 ? estado.pendientes[estado.actual] : null;
    var hay = !!p;
    $('b-misma').hidden = $('b-distintas').hidden = $('b-saltar').hidden = !hay;
    $('ayuda-teclado').hidden = !hay && !estado.historial.length;
    $('progreso').hidden = !total;
    $('b-deshacer').hidden = !total;

    if (!total) {
      $('cuenta').textContent = 'No hay parejas por revisar.';
      caja.appendChild(el('p', 'vacio__titulo', estado.seguros.length ? 'Todo lo que se repetía tenía el mismo documento.' : 'No encontramos personas repetidas.'));
      caja.appendChild(el('p', 'vacio__texto', 'No quedaron parejas probables ni dudosas. Puedes descargar el resultado.'));
    } else if (!hay) {
      $('cuenta').textContent = 'Revisaste las ' + nf.format(total) + ' parejas.';
      caja.appendChild(el('p', 'vacio__titulo', 'Ya decidiste todas las parejas.'));
      caja.appendChild(el('p', 'vacio__texto', 'Tomaste ' + plural(c.decididas, 'decisión', 'decisiones') + (c.resueltas ? '; ' + plural(c.resueltas, 'pareja quedó resuelta', 'parejas quedaron resueltas') + ' por otra decisión tuya' : '') + '. Abajo está el resultado.'));
    } else {
      $('cuenta').textContent = 'Pareja ' + nf.format(hechas + 1) + ' de ' + nf.format(total);
      var ra = estado.registros[p.a], rb = estado.registros[p.b];
      var na = estado.norm[p.a], nb = estado.norm[p.b];
      var cab = el('p', 'pareja__nivel');
      cab.appendChild(el('span', 'etiqueta etiqueta--' + p.nivel, p.nivel === 'probable' ? 'Probable' : 'Dudosa'));
      if (estado.listas[ra.lista].ficticia || estado.listas[rb.lista].ficticia) cab.appendChild(el('span', 'etiqueta etiqueta--ficticio', 'Datos ficticios'));
      caja.appendChild(cab);
      caja.appendChild(el('p', 'pareja__motivo', p.motivo));

      var envoltura = el('div', 'tabla-scroll');
      var tabla = el('table', 'lado');
      tabla.appendChild(el('caption', 'sr', 'Las dos filas, lado a lado'));
      var thead = el('thead'), trh = el('tr');
      var th0 = el('th'); th0.appendChild(el('span', 'sr', 'Dato')); trh.appendChild(th0);
      [ra, rb].forEach(function (r) {
        var th = el('th'); th.scope = 'col';
        th.appendChild(el('span', 'lado__lista', nombreLista(r.lista)));
        th.appendChild(el('span', 'lado__fila', 'fila ' + nf.format(r.n)));
        trh.appendChild(th);
      });
      thead.appendChild(trh); tabla.appendChild(thead);
      var tb = el('tbody');
      filaComparada(tb, 'Nombre', ra.nombre, rb.nombre, ra.nombre && rb.nombre ? (p.p >= 1 ? ['igual', 'coincide'] : (p.p >= E.PARECIDO ? ['parecido', 'parecido'] : ['distinto', 'distinto'])) : null);
      filaComparada(tb, 'Documento', documentoVisible(ra, na), documentoVisible(rb, nb), marcaDe(p.igual.doc, na.doc, nb.doc));
      filaComparada(tb, 'Nacimiento', fechaComoEs(ra, na), fechaComoEs(rb, nb), marcaDe(p.igual.fecha, na.fecha, nb.fecha));
      filaComparada(tb, 'Municipio', ra.municipio, rb.municipio, marcaDe(p.igual.mun, ra.municipio, rb.municipio));
      filaComparada(tb, 'Teléfono', ra.telefono, rb.telefono, marcaDe(p.igual.tel, na.tel, nb.tel));
      tabla.appendChild(tb);
      envoltura.appendChild(tabla);
      caja.appendChild(envoltura);

      var g = estado.grupos, masA = 0, masB = 0, xa = g.raiz(p.a), xb = g.raiz(p.b);
      for (var i = 0; i < estado.registros.length; i++) {
        var x = g.raiz(i);
        if (x === xa && i !== p.a) masA++; else if (x === xb && i !== p.b) masB++;
      }
      if (masA || masB) {
        caja.appendChild(el('p', 'nota pareja__grupo', 'Si dices que es la misma persona, se unen también ' + plural(masA + masB, 'fila que ya estaba', 'filas que ya estaban') + ' con una de las dos.'));
      }
      $('voz').textContent = 'Pareja ' + (hechas + 1) + ' de ' + total + '. ' + (p.nivel === 'probable' ? 'Probable' : 'Dudosa') + '. ' + p.motivo;
    }
    if (!hay) $('voz').textContent = $('cuenta').textContent;

    var det = $('seguras');
    det.hidden = !estado.seguros.length;
    det.querySelector('summary').textContent = 'Ver las ' + plural(estado.seguros.length, 'pareja segura', 'parejas seguras') + ' (se unieron solas)';
    if (det.open) pintarSeguras();

    pintarResultado(c);
    if (enfocar) caja.focus({ preventScroll: true });
  }

  function pintarSeguras() {
    var caja = $('lista-seguras');
    vaciar(caja);
    var g = new E.Grupos(estado.registros.length);
    estado.seguros.forEach(function (p) { g.unir(p.a, p.b); });
    var grupos = new Map();
    for (var i = 0; i < estado.registros.length; i++) {
      var r = g.raiz(i);
      if (!grupos.has(r)) grupos.set(r, []);
      grupos.get(r).push(i);
    }
    var lista = Array.from(grupos.values()).filter(function (x) { return x.length > 1; });
    var TOPE = 100;
    var ul = el('ul', 'seguras__lista');
    lista.slice(0, TOPE).forEach(function (filas) {
      var li = el('li', 'seguras__grupo');
      li.appendChild(el('p', 'seguras__doc', 'Documento ' + documentoVisible(estado.registros[filas[0]], estado.norm[filas[0]])));
      var sub = el('ul');
      filas.forEach(function (i) {
        var r = estado.registros[i];
        sub.appendChild(el('li', null, (r.nombre || 'Sin nombre') + ' · ' + nombreLista(r.lista) + ', fila ' + nf.format(r.n)));
      });
      li.appendChild(sub);
      ul.appendChild(li);
    });
    caja.appendChild(ul);
    if (lista.length > TOPE) caja.appendChild(el('p', 'nota', 'Se muestran las primeras ' + TOPE + ' personas. Todas están en la hoja «Decisiones» del Excel.'));
  }

  function decidir(que) {
    if (estado.actual < 0 || estado.trabajando) return;
    var p = estado.pendientes[estado.actual];
    p.decision = que;
    p.orden = estado.historial.length + 1;
    estado.historial.push(estado.actual);
    recalcular();
    pintarRevision(true);
  }
  function saltar() {
    if (estado.actual < 0) return;
    var i = estado.cola.indexOf(estado.actual);
    estado.cola.splice(i, 1);
    estado.cola.push(estado.actual);
    recalcular();
    pintarRevision(true);
  }
  function deshacer() {
    if (!estado.historial.length) return;
    var i = estado.historial.pop();
    estado.pendientes[i].decision = null;
    estado.pendientes[i].orden = 0;
    // La pareja deshecha vuelve a quedar de primera.
    estado.cola.splice(estado.cola.indexOf(i), 1);
    estado.cola.unshift(i);
    recalcular();
    pintarRevision(true);
  }

  /* ---------- 3. Resultado ---------- */
  function pintarResultado(c) {
    $('r-filas').textContent = nf.format(estado.registros.length);
    $('r-unicas').textContent = nf.format(c.unicas);
    $('r-decisiones').textContent = nf.format(c.decididas);
    var p = $('r-pendientes');
    p.hidden = !c.faltan;
    p.textContent = c.faltan ? (c.faltan === 1 ? 'Queda 1 pareja sin decidir: en el Excel queda' : 'Quedan ' + nf.format(c.faltan) + ' parejas sin decidir: en el Excel quedan') + ' como personas distintas, con la marca «Sin decidir».' : '';
  }

  function masFrecuente(valores) {
    var cuenta = {}, mejor = '', max = 0;
    valores.forEach(function (v) { if (!v) return; cuenta[v] = (cuenta[v] || 0) + 1; if (cuenta[v] > max) { max = cuenta[v]; mejor = v; } });
    return mejor;
  }
  function mejorNombre(indices) {
    var mejor = '', puntos = -1;
    indices.forEach(function (i) {
      var nombre = estado.registros[i].nombre;
      if (!nombre) return;
      var completas = N.palabras(nombre).filter(function (w) { return !w.ini; }).length;
      var tildes = (nombre.match(/[áéíóúñüÁÉÍÓÚÑÜ]/g) || []).length;
      var v = completas * 100 + tildes * 2 + (nombre !== nombre.toUpperCase() ? 1 : 0);
      if (v > puntos) { puntos = v; mejor = nombre; }
    });
    return mejor;
  }

  function armarLibro() {
    var regs = estado.registros, norm = estado.norm, g = estado.grupos;
    var grupos = new Map(), orden = [];
    for (var i = 0; i < regs.length; i++) {
      var r = g.raiz(i);
      if (!grupos.has(r)) { grupos.set(r, []); orden.push(r); }
      grupos.get(r).push(i);
    }
    var ancho = Math.max(5, String(orden.length).length);
    var idDe = new Map();
    orden.forEach(function (r, k) { idDe.set(r, 'P-' + String(k + 1).padStart(ancho, '0')); });
    var id = function (i) { return idDe.get(g.raiz(i)); };

    var porSeguro = new Set(), porDecision = new Set();
    estado.seguros.forEach(function (p) { porSeguro.add(g.raiz(p.a)); });
    estado.pendientes.forEach(function (p) { if (p.decision === 'misma') porDecision.add(g.raiz(p.a)); });

    var unicas = [['ID único', 'Nombre', 'Tipo de documento', 'Número de documento', 'Fecha de nacimiento', 'Municipio', 'Teléfono', 'Aparece en', 'Filas', 'Cómo se unió']];
    orden.forEach(function (r) {
      var idx = grupos.get(r);
      var listas = [];
      idx.forEach(function (i) { var n = nombreLista(regs[i].lista); if (listas.indexOf(n) < 0) listas.push(n); });
      var doc = masFrecuente(idx.map(function (i) { return norm[i].doc; }));
      var tipo = masFrecuente(idx.map(function (i) { return norm[i].doc === doc ? norm[i].tipo : ''; }));
      var fecha = masFrecuente(idx.map(function (i) { return norm[i].fecha; }));
      var serie = fecha ? Excel.serial(fecha) : null;
      var como = idx.length === 1 ? 'Una sola fila'
        : (porSeguro.has(r) && porDecision.has(r) ? 'Mismo documento y decisión tuya' : (porDecision.has(r) ? 'Decisión tuya' : 'Mismo documento'));
      unicas.push([
        idDe.get(r), mejorNombre(idx), tipo, doc, serie == null ? masFrecuente(idx.map(function (i) { return regs[i].fecha; })) : serie,
        masFrecuente(idx.map(function (i) { return regs[i].municipio; })), masFrecuente(idx.map(function (i) { return norm[i].tel || regs[i].telefono; })),
        listas.join(' · '), idx.length, como
      ]);
    });

    var originales = [['ID único', 'Lista', 'Fila en el archivo', 'Nombre', 'Tipo de documento', 'Número de documento', 'Fecha de nacimiento', 'Municipio', 'Teléfono']];
    regs.forEach(function (r, i) {
      originales.push([id(i), nombreLista(r.lista), r.n, r.nombre, r.tipo, r.doc, r.fecha, r.municipio, r.telefono]);
    });

    var decisiones = [['N.º', 'Quién decidió', 'Decisión', 'Nivel', 'Por qué se mostró', 'Parecido del nombre',
      'Lista A', 'Fila A', 'Nombre A', 'Documento A', 'ID único A', 'Lista B', 'Fila B', 'Nombre B', 'Documento B', 'ID único B']];
    var lado = function (i) { var r = regs[i]; return [nombreLista(r.lista), r.n, r.nombre, r.doc, id(i)]; };
    var fila = function (quien, decision, p) {
      return [decisiones.length, quien, decision, p.nivel === 'seguro' ? 'Segura' : (p.nivel === 'probable' ? 'Probable' : 'Dudosa'), p.motivo, p.p]
        .concat(lado(p.a), lado(p.b));
    };
    var tuyas = estado.pendientes.filter(function (p) { return p.decision; }).sort(function (x, y) { return x.orden - y.orden; });
    tuyas.forEach(function (p) {
      var texto = p.decision === 'misma' ? 'Es la misma persona' : 'Son personas distintas';
      if (p.decision === 'distinta' && g.raiz(p.a) === g.raiz(p.b)) texto += ' (quedaron juntas por otra decisión tuya: revísala)';
      decisiones.push(fila('Tú', texto, p));
    });
    estado.pendientes.forEach(function (p) {
      if (!p.decision && !p.resuelta) decisiones.push(fila('Nadie', 'Sin decidir (quedan como personas distintas)', p));
    });
    estado.pendientes.forEach(function (p) {
      if (!p.decision && p.resuelta) decisiones.push(fila('Resuelta por otra decisión tuya', p.resuelta === 'misma' ? 'Es la misma persona' : 'Son personas distintas', p));
    });
    estado.seguros.forEach(function (p) { decisiones.push(fila('Automático', 'Es la misma persona', p)); });

    var c = cuentas();
    var hoy = new Date();
    var fechaHoy = String(hoy.getDate()).padStart(2, '0') + '/' + String(hoy.getMonth() + 1).padStart(2, '0') + '/' + hoy.getFullYear();
    var resumen = [['Dato', 'Valor'],
      ['Filas en las listas', regs.length],
      ['Personas únicas', c.unicas],
      ['Decisiones que tomaste', c.decididas],
      ['Parejas seguras (mismo documento, se unieron solas)', estado.seguros.length],
      ['Parejas resueltas por otra decisión tuya', c.resueltas],
      ['Parejas sin decidir (quedan como personas distintas)', c.faltan],
      ['Listas', estado.listas.map(function (l) { return l.nombre + ' (' + l.filas.length + ' filas)'; }).join(' · ')],
      ['Fecha', fechaHoy],
      ['Nota', 'Esta lista sale de comparar lo que está escrito en las listas. No se consultó la Registraduría ni ninguna base oficial y no confirma identidades.']];
    if (estado.listas.some(function (l) { return l.ficticia; })) resumen.push(['Aviso', 'DATOS FICTICIOS: las personas del ejemplo no existen.']);

    return Excel.libroComprimido([
      { nombre: 'Personas únicas', filas: unicas, anchos: [11, 36, 10, 18, 14, 22, 14, 40, 7, 30], estilos: [0, 0, 0, 0, 3, 0, 0, 0, 0, 0], fijar: true, filtro: true },
      { nombre: 'Filas originales', filas: originales, anchos: [11, 26, 9, 36, 12, 18, 16, 22, 16], fijar: true, filtro: true },
      { nombre: 'Decisiones', filas: decisiones, anchos: [6, 24, 30, 10, 56, 10, 22, 7, 32, 16, 11, 22, 7, 32, 16, 11], fijar: true, filtro: true },
      { nombre: 'Resumen', filas: resumen, anchos: [52, 60] }
    ], window.Zip);
  }

  function descargar() {
    if (!estado.registros) return;
    $('descargar').disabled = true;
    armarLibro().then(function (bytes) {
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var hoy = new Date();
      var nombre = 'beneficiarios-unicos-' + hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0') + '.xlsx';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
    }).catch(function (e) {
      mostrarError('No se pudo armar el Excel: ' + (e && e.message ? e.message : 'error inesperado.'));
    }).then(function () { $('descargar').disabled = false; });
  }

  /* ---------- Eventos ---------- */
  function iniciar() {
    $('archivos').addEventListener('change', function (ev) { recibir(ev.target.files); ev.target.value = ''; });
    var zona = $('soltar');
    ['dragenter', 'dragover'].forEach(function (t) {
      zona.addEventListener(t, function (ev) { ev.preventDefault(); zona.classList.add('soltar--encima'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      zona.addEventListener(t, function (ev) { ev.preventDefault(); zona.classList.remove('soltar--encima'); });
    });
    zona.addEventListener('drop', function (ev) { if (ev.dataTransfer) recibir(ev.dataTransfer.files); });
    // Si el archivo cae fuera de la zona, que el navegador no lo abra (se perdería la página).
    window.addEventListener('dragover', function (ev) { ev.preventDefault(); });
    window.addEventListener('drop', function (ev) { ev.preventDefault(); });

    Array.prototype.forEach.call(document.querySelectorAll('[data-ejemplo]'), function (b) { b.addEventListener('click', cargarEjemplo); });
    $('buscar').addEventListener('click', buscar);
    $('reiniciar').addEventListener('click', function () {
      if (estado.trabajando) return;
      estado.listas = []; vaciar($('errores')); invalidar(); pintarListas();
      $('cargar').scrollIntoView();
    });
    $('b-misma').addEventListener('click', function () { decidir('misma'); });
    $('b-distintas').addEventListener('click', function () { decidir('distinta'); });
    $('b-saltar').addEventListener('click', saltar);
    $('b-deshacer').addEventListener('click', deshacer);
    $('descargar').addEventListener('click', descargar);
    $('seguras').addEventListener('toggle', function () { if ($('seguras').open && estado.registros) pintarSeguras(); });

    // Teclas de una letra: solo mientras el foco está en la sección de revisión y no en un campo.
    document.addEventListener('keydown', function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented) return;
      var seccion = $('revisar');
      if (seccion.hidden || !seccion.contains(document.activeElement)) return;
      var t = ev.target && ev.target.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || t === 'SUMMARY') return;
      var k = ev.key.toLowerCase();
      if (k === 'm') decidir('misma');
      else if (k === 'd') decidir('distinta');
      else if (k === 's') saltar();
      else if (k === 'z') deshacer();
      else return;
      ev.preventDefault();
    });

    pintarListas();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();

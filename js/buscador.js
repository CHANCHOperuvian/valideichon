window.VC = window.VC || {};

(function () {
  'use strict';

  /** Distancia de edición (Damerau-Levenshtein restringida) con corte temprano. */
  function distancia(a, b, maximo) {
    if (Math.abs(a.length - b.length) > maximo) return maximo + 1;
    var previa2 = new Array(b.length + 1).fill(0);
    var previa = [];
    for (var j = 0; j <= b.length; j++) previa.push(j);

    for (var i = 1; i <= a.length; i++) {
      var actual = new Array(b.length + 1);
      actual[0] = i;
      var minimoFila = i;
      for (j = 1; j <= b.length; j++) {
        var costo = a[i - 1] === b[j - 1] ? 0 : 1;
        var valor = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + costo);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          valor = Math.min(valor, previa2[j - 2] + 1);
        }
        actual[j] = valor;
        if (valor < minimoFila) minimoFila = valor;
      }
      if (minimoFila > maximo) return maximo + 1;
      previa2 = previa;
      previa = actual;
    }
    return previa[b.length];
  }

  function tolerancia(token) { return token.length >= 8 ? 2 : 1; }
  function ordenarEs(a, b) { return a.localeCompare(b, 'es'); }

  /**
   * Índice de búsqueda sobre las localidades.
   * buscar(consulta, filtros, limite) → { filas, puntajes, total, aproximado }
   */
  function Buscador(filas) {
    var self = this;
    this.porNombre = new Map();
    this.porComuna = new Map();

    this.items = filas.map(function (fila) {
      var loc = VC.normalizar(fila.localidad);
      var com = VC.normalizar(fila.comuna);
      agregar(self.porNombre, loc, fila);
      agregar(self.porComuna, com, fila);
      return {
        fila: fila,
        loc: loc,
        com: com,
        sig: VC.normalizar(fila.siglas),
        zip: VC.normalizar(fila.zipcode),
        palabras: (loc + ' ' + com).split(' '),
        texto: [loc, com, VC.normalizar(fila.provincia), VC.normalizar(fila.region),
          VC.normalizar(fila.regionOriginal), VC.normalizar(fila.siglas), VC.normalizar(fila.zipcode)].join(' ')
      };
    });

    var comunas = new Map();
    var couriers = new Set();
    filas.forEach(function (f) {
      if (!comunas.has(f.region)) comunas.set(f.region, new Set());
      comunas.get(f.region).add(f.comuna);
      if (f.courier) couriers.add(f.courier);
    });
    this.regiones = Array.from(comunas.keys()).sort(ordenarEs);
    this.comunasPorRegion = new Map();
    comunas.forEach(function (set, region) {
      self.comunasPorRegion.set(region, Array.from(set).sort(ordenarEs));
    });
    this.todasLasComunas = Array.from(new Set(filas.map(function (f) { return f.comuna; }))).sort(ordenarEs);
    this.couriers = Array.from(couriers).sort(ordenarEs);
    this.total = filas.length;
  }

  function agregar(mapa, clave, fila) {
    var lista = mapa.get(clave);
    if (lista) lista.push(fila);
    else mapa.set(clave, [fila]);
  }

  /** Otras localidades con el mismo nombre (en otras comunas). */
  Buscador.prototype.homonimos = function (fila) {
    return (this.porNombre.get(VC.normalizar(fila.localidad)) || []).filter(function (f) { return f.id !== fila.id; });
  };

  /** Localidades cuyo nombre (o comuna) coincide exactamente con alguno de los nombres dados. */
  Buscador.prototype.coincidenciasExactas = function (nombres) {
    var porLocalidad = [];
    var porComuna = [];
    var vistos = new Set();
    var self = this;
    nombres.forEach(function (nombre) {
      var n = VC.normalizar(nombre);
      if (!n) return;
      (self.porNombre.get(n) || []).forEach(function (f) {
        if (!vistos.has(f.id)) { vistos.add(f.id); porLocalidad.push(f); }
      });
    });
    nombres.forEach(function (nombre) {
      var n = VC.normalizar(nombre);
      if (!n) return;
      (self.porComuna.get(n) || []).forEach(function (f) {
        if (!vistos.has(f.id)) { vistos.add(f.id); porComuna.push(f); }
      });
    });
    return { porLocalidad: porLocalidad, porComuna: porComuna };
  };

  Buscador.prototype.buscar = function (consulta, filtros, limite) {
    filtros = filtros || {};
    limite = limite || 60;
    var q = VC.normalizar(consulta);
    var tokens = q ? q.split(' ') : [];
    var hayFiltros = Boolean(filtros.region || filtros.comuna || filtros.courier);

    var candidatos = this.items.filter(function (it) {
      return (!filtros.region || it.fila.region === filtros.region) &&
        (!filtros.comuna || it.fila.comuna === filtros.comuna) &&
        (!filtros.courier || it.fila.courier === filtros.courier) &&
        (!filtros.soloActivas || it.fila.activo);
    });

    if (tokens.length === 0) {
      if (!hayFiltros) return { filas: [], puntajes: [], total: 0, aproximado: false };
      var lista = candidatos.map(function (it) { return { it: it, puntaje: 0 }; });
      return armar(lista, limite, false);
    }

    var exactos = [];
    candidatos.forEach(function (it) {
      if (tokens.every(function (t) { return it.texto.indexOf(t) !== -1; })) {
        exactos.push({ it: it, puntaje: puntuar(it, q, tokens[0]) });
      }
    });
    if (exactos.length) return armar(exactos, limite, false);
    if (q.length < 3) return { filas: [], puntajes: [], total: 0, aproximado: false };

    // Sin coincidencias exactas: tolerar errores de tipeo ("valparaizo", "chillan biejo").
    var aproximados = [];
    candidatos.forEach(function (it) {
      var costo = 0;
      var ok = tokens.every(function (t) {
        if (t.length < 3) return it.texto.indexOf(t) !== -1;
        var max = tolerancia(t);
        var mejor = max + 1;
        for (var k = 0; k < it.palabras.length && mejor > 0; k++) {
          var p = it.palabras[k];
          var d = distancia(t, p, max);
          if (p.length > t.length) d = Math.min(d, distancia(t, p.slice(0, t.length), max));
          if (d < mejor) mejor = d;
        }
        costo += mejor;
        return mejor <= max;
      });
      if (ok) aproximados.push({ it: it, puntaje: 100 - costo * 10 });
    });
    return armar(aproximados, limite, true);
  };

  function puntuar(it, q, primerToken) {
    var p;
    if (it.loc === q) p = 1000;
    else if (it.sig === q) p = 900;
    else if (it.zip === q) p = 850;
    else if (it.loc.indexOf(q) === 0) p = 700;
    else if (it.com === q) p = 600;
    else if (it.loc.split(' ').some(function (w) { return w.indexOf(primerToken) === 0; })) p = 500;
    else if (it.loc.indexOf(q) !== -1) p = 400;
    else if (it.com.indexOf(q) === 0) p = 300;
    else p = 100;
    return it.fila.activo ? p : p - 1; // ante empate, las activas primero
  }

  function armar(lista, limite, aproximado) {
    lista.sort(function (a, b) {
      return b.puntaje - a.puntaje || ordenarEs(a.it.fila.localidad, b.it.fila.localidad);
    });
    var recorte = lista.slice(0, limite);
    return {
      filas: recorte.map(function (x) { return x.it.fila; }),
      puntajes: recorte.map(function (x) { return x.puntaje; }),
      total: lista.length,
      aproximado: aproximado
    };
  }

  VC.Buscador = Buscador;
})();

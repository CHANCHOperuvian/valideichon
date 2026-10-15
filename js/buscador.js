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

  function agregar(mapa, clave, fila) {
    if (!clave) return;
    var lista = mapa.get(clave);
    if (lista) lista.push(fila);
    else mapa.set(clave, [fila]);
  }

  /**
   * Índice de búsqueda sobre las filas de una campaña (formato común, ver campanas.js).
   * buscar(consulta, filtros, limite) → { filas, puntajes, total, aproximado }
   * filtros: { region: 'X', zona: 'Y', courier: 'Z', …, soloActivas: true }
   */
  function Buscador(filas) {
    var self = this;
    this.filas = filas;
    this.porLugar = new Map();
    this.porZona = new Map();

    this.items = filas.map(function (fila) {
      var lugar = VC.normalizar(fila.lugar);
      var zona = VC.normalizar(fila.zona || fila.region);
      agregar(self.porLugar, lugar, fila);
      agregar(self.porZona, VC.normalizar(fila.zona), fila);
      if (fila.region && fila.region !== fila.zona) agregar(self.porZona, VC.normalizar(fila.region), fila);
      return {
        fila: fila,
        lugar: lugar,
        zona: zona,
        sig: VC.normalizar(fila.siglas),
        cod: VC.normalizar(fila.codigo),
        palabras: (lugar + ' ' + zona).split(' '),
        texto: [lugar, zona, VC.normalizar(fila.provincia), VC.normalizar(fila.region), VC.normalizar(fila.regionOriginal),
          VC.normalizar(fila.siglas), VC.normalizar(fila.codigo), VC.normalizar(fila.barrios)].join(' ')
      };
    });
    this.total = filas.length;
  }

  function cumpleFiltros(fila, filtros, excepto) {
    for (var campo in filtros) {
      if (campo === excepto || campo === 'soloActivas' || !filtros[campo]) continue;
      if (fila[campo] !== filtros[campo]) return false;
    }
    return !filtros.soloActivas || fila.activo;
  }

  /**
   * Valores posibles de un filtro, considerando los filtros anteriores de la lista
   * (así "Provincia" solo muestra las del departamento elegido).
   */
  Buscador.prototype.opciones = function (campo, filtrosAnteriores) {
    var valores = new Set();
    this.filas.forEach(function (f) {
      if (f[campo] && cumpleFiltros(f, filtrosAnteriores || {}, campo)) valores.add(f[campo]);
    });
    return Array.from(valores).sort(ordenarEs);
  };

  /** Otras filas con el mismo nombre de lugar. */
  Buscador.prototype.homonimos = function (fila) {
    return (this.porLugar.get(VC.normalizar(fila.lugar)) || []).filter(function (f) { return f.id !== fila.id; });
  };

  /** Filas cuyo lugar o zona coincide exactamente con alguno de los nombres (para direcciones). */
  Buscador.prototype.coincidenciasExactas = function (nombres) {
    var porLugar = [];
    var porZona = [];
    var vistos = new Set();
    var self = this;
    var normalizados = nombres.map(VC.normalizar).filter(Boolean);
    normalizados.forEach(function (n) {
      (self.porLugar.get(n) || []).forEach(function (f) {
        if (!vistos.has(f.id)) { vistos.add(f.id); porLugar.push(f); }
      });
    });
    normalizados.forEach(function (n) {
      (self.porZona.get(n) || []).forEach(function (f) {
        if (!vistos.has(f.id)) { vistos.add(f.id); porZona.push(f); }
      });
    });
    return { porLugar: porLugar, porZona: porZona };
  };

  Buscador.prototype.buscar = function (consulta, filtros, limite) {
    filtros = filtros || {};
    limite = limite || 60;
    var q = VC.normalizar(consulta);
    var tokens = q ? q.split(' ') : [];
    var hayFiltros = Object.keys(filtros).some(function (k) { return k !== 'soloActivas' && filtros[k]; });

    var candidatos = this.items.filter(function (it) { return cumpleFiltros(it.fila, filtros); });

    if (tokens.length === 0) {
      if (!hayFiltros) return { filas: [], puntajes: [], total: 0, aproximado: false };
      return armar(candidatos.map(function (it) { return { it: it, puntaje: 0 }; }), limite, false);
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
    if (it.lugar === q) p = 1000;
    else if (it.sig === q) p = 900;
    else if (it.cod === q) p = 850;
    else if (it.lugar.indexOf(q) === 0) p = 700;
    else if (it.zona === q) p = 600;
    else if (it.lugar.split(' ').some(function (w) { return w.indexOf(primerToken) === 0; })) p = 500;
    else if (it.lugar.indexOf(q) !== -1) p = 400;
    else if (it.zona.indexOf(q) === 0) p = 300;
    else p = 100;
    return it.fila.activo ? p : p - 1; // ante empate, las activas primero
  }

  function armar(lista, limite, aproximado) {
    lista.sort(function (a, b) {
      return b.puntaje - a.puntaje || ordenarEs(a.it.fila.lugar, b.it.fila.lugar);
    });
    var recorte = lista.slice(0, limite);
    return {
      filas: recorte.map(function (x) { return x.it.fila; }),
      puntajes: recorte.map(function (x) { return x.puntaje; }),
      total: lista.length,
      aproximado: aproximado
    };
  }

  /** Convierte filas guardadas por la versión anterior (solo Chile) al formato común. */
  VC.migrarFila = function (f) {
    if (f.lugar !== undefined) return f;
    return {
      id: f.id,
      lugar: f.localidad,
      zona: f.comuna,
      provincia: f.provincia,
      region: f.region,
      regionOriginal: f.regionOriginal,
      codigo: f.zipcode,
      siglas: f.siglas,
      dias: f.diasReparto,
      activo: f.activo,
      tiempo: f.tiempoEntrega,
      courier: f.courier
    };
  };

  VC.Buscador = Buscador;
})();

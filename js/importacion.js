window.VC = window.VC || {};

/**
 * Convierte una hoja del Excel "Cobertura Chile" en la lista de localidades,
 * con reporte de errores, avisos y duplicados.
 */
VC.importacion = (function () {
  'use strict';

  var ALIAS = {
    localidad: ['localidad', 'sector', 'localidad sector', 'poblado'],
    comuna: ['comuna'],
    provincia: ['provincia'],
    region: ['region'],
    siglas: ['siglas', 'sigla'],
    zipcode: ['zipcode', 'zip', 'zip code', 'codigo postal', 'cod postal'],
    diasReparto: ['dias de reparto', 'dias reparto', 'dias de entrega', 'reparto'],
    cobertura: ['cobertura', 'estado', 'estado cobertura'],
    tiempo: ['tiempo de entrega', 'tiempo entrega', 'dias de transito', 'dias transito', 'tiempo'],
    courier: ['courier', 'paqueteria', 'transportista', 'operador logistico']
  };
  var REQUERIDAS = ['localidad', 'comuna', 'courier', 'tiempo'];

  var ACTIVO = ['activo', 'activa', 'si', 'con cobertura', 'habilitado', 'habilitada', 'factible'];
  var INACTIVO = ['inactivo', 'inactiva', 'no', 'sin cobertura', 'deshabilitado', 'deshabilitada', 'no factible'];

  // El Excel trae variantes como "Region de Los lagos (x)" y "(X)": se unifican.
  var REGIONES = [
    ['metropolitana', 'Región Metropolitana'], ['arica', 'Región de Arica y Parinacota'],
    ['tarapaca', 'Región de Tarapacá'], ['antofagasta', 'Región de Antofagasta'],
    ['atacama', 'Región de Atacama'], ['coquimbo', 'Región de Coquimbo'],
    ['valparaiso', 'Región de Valparaíso'], ['higgins', "Región de O'Higgins"],
    ['libertador', "Región de O'Higgins"], ['maule', 'Región del Maule'], ['nuble', 'Región de Ñuble'],
    ['biobio', 'Región del Biobío'], ['bio bio', 'Región del Biobío'],
    ['araucania', 'Región de La Araucanía'], ['los rios', 'Región de Los Ríos'],
    ['los lagos', 'Región de Los Lagos'], ['aysen', 'Región de Aysén'], ['aisen', 'Región de Aysén'],
    ['magallanes', 'Región de Magallanes']
  ];

  function limpiarRegion(original) {
    var n = VC.normalizar(original);
    for (var i = 0; i < REGIONES.length; i++) {
      if (n.indexOf(REGIONES[i][0]) !== -1) return REGIONES[i][1];
    }
    return String(original).replace(/\s*\([^)]*\)\s*$/, '').trim() || original;
  }

  /** Encuentra la fila de títulos (en las primeras 15) y la columna de cada campo. */
  function detectarEncabezados(filas) {
    for (var f = 0; f < Math.min(filas.length, 15); f++) {
      var celdas = filas[f].map(VC.normalizar);
      var columnas = {};
      Object.keys(ALIAS).forEach(function (campo) {
        var opciones = ALIAS[campo];
        var i = celdas.findIndex(function (c) { return opciones.indexOf(c) !== -1; });
        if (i === -1) {
          i = celdas.findIndex(function (c) {
            return c && opciones.some(function (o) { return o.length >= 4 && c.indexOf(o) !== -1; });
          });
        }
        columnas[campo] = i;
      });
      if (REQUERIDAS.every(function (r) { return columnas[r] !== -1; })) {
        return { filaEncabezado: f, columnas: columnas };
      }
    }
    return null;
  }

  function hojaValida(filas) {
    return detectarEncabezados(filas) !== null;
  }

  function celda(fila, i) {
    return i >= 0 ? String(fila[i] == null ? '' : fila[i]).trim() : '';
  }

  function importar(nombreHoja, filasHoja) {
    var deteccion = detectarEncabezados(filasHoja);
    if (!deteccion) {
      return { error: 'La hoja "' + nombreHoja + '" no tiene las columnas obligatorias: LOCALIDAD, COMUNA, COURIER y TIEMPO DE ENTREGA.' };
    }

    var c = deteccion.columnas;
    var filas = [];
    var errores = [];
    var avisos = [];
    var vistos = new Map();
    var duplicados = 0;

    if (c.cobertura === -1) avisos.push({ fila: deteccion.filaEncabezado + 1, mensaje: 'No hay columna COBERTURA: todas se cargan como activas.' });
    if (c.diasReparto === -1) avisos.push({ fila: deteccion.filaEncabezado + 1, mensaje: 'No hay columna DIAS DE REPARTO: se asume lunes a viernes.' });

    for (var f = deteccion.filaEncabezado + 1; f < filasHoja.length; f++) {
      var fila = filasHoja[f];
      if (fila.every(function (x) { return !String(x == null ? '' : x).trim(); })) continue;
      var numero = f + 1;

      var localidad = celda(fila, c.localidad);
      var comuna = celda(fila, c.comuna);
      if (!localidad || !comuna) {
        errores.push({ fila: numero, mensaje: 'Falta LOCALIDAD o COMUNA; la fila se descarta.' });
        continue;
      }

      var courierTexto = celda(fila, c.courier);
      var courier = VC.normalizarCourier(courierTexto);
      if (!courier) {
        avisos.push({ fila: numero, mensaje: localidad + ': courier "' + (courierTexto || 'vacío') + '" no reconocido.' });
        courier = courierTexto;
      }

      var tiempoTexto = celda(fila, c.tiempo);
      var tiempoNumero = tiempoTexto.match(/\d+/);
      var tiempoEntrega = tiempoNumero ? Math.min(60, Number(tiempoNumero[0])) : null;
      if (tiempoEntrega === null) {
        avisos.push({ fila: numero, mensaje: localidad + ': TIEMPO DE ENTREGA "' + (tiempoTexto || 'vacío') + '" no es un número.' });
      }

      var activo = true;
      if (c.cobertura !== -1) {
        var estado = VC.normalizar(celda(fila, c.cobertura));
        if (ACTIVO.indexOf(estado) !== -1) activo = true;
        else if (INACTIVO.indexOf(estado) !== -1) activo = false;
        else {
          activo = false;
          avisos.push({ fila: numero, mensaje: localidad + ': COBERTURA "' + (estado || 'vacío') + '" no reconocida; se marca como inactiva.' });
        }
      }

      var diasReparto = celda(fila, c.diasReparto);
      if (diasReparto && !VC.interpretarDiasReparto(diasReparto).reconocido) {
        avisos.push({ fila: numero, mensaje: localidad + ': DIAS DE REPARTO "' + diasReparto + '" no se entiende; se asume lunes a viernes.' });
      }

      var clave = VC.normalizar(localidad) + '|' + VC.normalizar(comuna);
      if (vistos.has(clave)) {
        duplicados++;
        avisos.push({ fila: numero, mensaje: localidad + ' (' + comuna + ') está repetida (ya aparece en la fila ' + vistos.get(clave) + ').' });
      } else {
        vistos.set(clave, numero);
      }

      var regionOriginal = celda(fila, c.region);
      filas.push({
        id: filas.length,
        localidad: localidad,
        comuna: comuna,
        provincia: celda(fila, c.provincia),
        region: regionOriginal ? limpiarRegion(regionOriginal) : 'Sin región',
        regionOriginal: regionOriginal,
        siglas: celda(fila, c.siglas),
        zipcode: celda(fila, c.zipcode).replace(/\D/g, ''),
        diasReparto: diasReparto,
        activo: activo,
        tiempoEntrega: tiempoEntrega,
        courier: courier
      });
    }

    return { hoja: nombreHoja, filas: filas, errores: errores, avisos: avisos, duplicados: duplicados };
  }

  /** Compara con lo publicado: nuevas, eliminadas, modificadas y ejemplos. */
  function comparar(anterior, nueva) {
    function clave(f) { return VC.normalizar(f.localidad) + '|' + VC.normalizar(f.comuna); }
    var previas = new Map(anterior.map(function (f) { return [clave(f), f]; }));
    var ejemplos = [];
    var nuevas = 0;
    var cambiadas = 0;

    nueva.forEach(function (f) {
      var p = previas.get(clave(f));
      if (!p) {
        nuevas++;
        if (ejemplos.length < 15) ejemplos.push('Nueva: ' + f.localidad + ' (' + f.comuna + ')');
        return;
      }
      previas.delete(clave(f));
      var cambios = [];
      if (p.courier !== f.courier) cambios.push('courier ' + p.courier + ' → ' + f.courier);
      if (p.tiempoEntrega !== f.tiempoEntrega) cambios.push('tiempo ' + (p.tiempoEntrega == null ? '-' : p.tiempoEntrega) + ' → ' + (f.tiempoEntrega == null ? '-' : f.tiempoEntrega));
      if (p.activo !== f.activo) cambios.push(f.activo ? 'pasa a ACTIVA' : 'pasa a INACTIVA');
      if (p.diasReparto !== f.diasReparto) cambios.push('reparto "' + p.diasReparto + '" → "' + f.diasReparto + '"');
      if (cambios.length) {
        cambiadas++;
        if (ejemplos.length < 15) ejemplos.push(f.localidad + ' (' + f.comuna + '): ' + cambios.join(', '));
      }
    });

    var eliminadas = previas.size;
    previas.forEach(function (p) {
      if (ejemplos.length < 15) ejemplos.push('Eliminada: ' + p.localidad + ' (' + p.comuna + ')');
    });

    return { nuevas: nuevas, eliminadas: eliminadas, cambiadas: cambiadas, ejemplos: ejemplos };
  }

  return { hojaValida: hojaValida, importar: importar, comparar: comparar, limpiarRegion: limpiarRegion };
})();

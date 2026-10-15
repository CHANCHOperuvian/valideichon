window.VC = window.VC || {};

/**
 * Convierte una hoja de Excel de cualquier campaña al formato común de filas,
 * según las columnas definidas en js/campanas.js. Devuelve también errores, avisos y duplicados.
 */
VC.importacion = (function () {
  'use strict';

  var ACTIVO = ['activo', 'activa', 'si', 'cubre', 'con cobertura', 'habilitado', 'habilitada', 'factible'];
  var INACTIVO = ['inactivo', 'inactiva', 'no', 'no cubre', 'sin cobertura', 'deshabilitado', 'deshabilitada', 'no factible'];

  // El Excel de Chile trae variantes como "Region de Los lagos (x)" y "(X)": se unifican.
  var REGIONES_CHILE = [
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

  function limpiarRegionChile(original) {
    var n = VC.normalizar(original);
    for (var i = 0; i < REGIONES_CHILE.length; i++) {
      if (n.indexOf(REGIONES_CHILE[i][0]) !== -1) return REGIONES_CHILE[i][1];
    }
    return String(original).replace(/\s*\([^)]*\)\s*$/, '').trim() || original;
  }

  /** "AMAZONAS" → "Amazonas"; deja igual los textos con mayúsculas y minúsculas. */
  function prolijo(texto) {
    return texto && texto === texto.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(texto) ? VC.enTitulo(texto) : texto;
  }

  /** Encuentra la fila de títulos (en las primeras 15) y la columna de cada campo. */
  function detectarEncabezados(campana, filas) {
    var campos = Object.keys(campana.columnas);
    for (var f = 0; f < Math.min(filas.length, 15); f++) {
      var celdas = filas[f].map(VC.normalizar);
      var columnas = {};
      var usadas = new Set();

      campos.forEach(function (campo) {
        var opciones = campana.columnas[campo];
        var i = celdas.findIndex(function (c, k) { return !usadas.has(k) && opciones.indexOf(c) !== -1; });
        if (i === -1) {
          i = celdas.findIndex(function (c, k) {
            return c && !usadas.has(k) && opciones.some(function (o) { return o.length >= 4 && c.indexOf(o) === 0; });
          });
        }
        columnas[campo] = i;
        if (i !== -1) usadas.add(i);
      });

      // Columnas sin título reconocible que se ubican por su posición junto a otra.
      var pos = campana.posicionales || {};
      Object.keys(pos).forEach(function (campo) {
        if (columnas[campo] !== -1) return;
        var vecina = columnas[pos[campo].junto];
        var i = vecina === -1 || vecina === undefined ? -1 : vecina + pos[campo].desplazamiento;
        if (i >= 0 && !usadas.has(i)) {
          columnas[campo] = i;
          usadas.add(i);
        }
      });

      if (campana.requeridas.every(function (r) { return columnas[r] !== -1; })) {
        return { filaEncabezado: f, columnas: columnas };
      }
    }
    return null;
  }

  function hojaValida(campana, filas) {
    return detectarEncabezados(campana, filas) !== null;
  }

  function nombresColumnas(campana) {
    return campana.requeridas.map(function (c) { return (campana.etiquetas[c] || c).toUpperCase(); }).join(', ');
  }

  function importar(campana, nombreHoja, filasHoja) {
    var deteccion = detectarEncabezados(campana, filasHoja);
    if (!deteccion) {
      return { error: 'La hoja "' + nombreHoja + '" no tiene las columnas obligatorias para ' + campana.nombre + ': ' + nombresColumnas(campana) + '.' };
    }

    var c = deteccion.columnas;
    var tiene = function (campo) { return c[campo] !== undefined && c[campo] !== -1; };
    var celda = function (fila, campo) {
      return tiene(campo) ? String(fila[c[campo]] == null ? '' : fila[c[campo]]).trim() : '';
    };
    var etiqueta = function (campo) { return (campana.etiquetas[campo] || campo).toUpperCase(); };

    var filas = [];
    var errores = [];
    var avisos = [];
    var vistos = new Map();
    var duplicados = 0;
    var filaTitulos = deteccion.filaEncabezado + 1;

    if (!tiene('cobertura')) avisos.push({ fila: filaTitulos, mensaje: 'No hay columna COBERTURA: todas las filas se cargan como con cobertura.' });

    for (var f = deteccion.filaEncabezado + 1; f < filasHoja.length; f++) {
      var fila = filasHoja[f];
      if (fila.every(function (x) { return !String(x == null ? '' : x).trim(); })) continue;
      var numero = f + 1;

      var lugar = prolijo(celda(fila, 'lugar'));
      var zona = prolijo(celda(fila, 'zona'));
      var faltantes = campana.requeridas.filter(function (r) { return r !== 'cobertura' && !celda(fila, r); });
      if (!lugar || faltantes.length) {
        errores.push({ fila: numero, mensaje: 'Falta ' + (faltantes.length ? faltantes.map(etiqueta).join(' y ') : etiqueta('lugar')) + '; la fila se descarta.' });
        continue;
      }

      var courier = '';
      if (tiene('courier')) {
        var courierTexto = celda(fila, 'courier');
        courier = VC.normalizarCourier(campana, courierTexto);
        if (courier === null) {
          avisos.push({ fila: numero, mensaje: lugar + ': courier "' + (courierTexto || 'vacío') + '" no reconocido.' });
          courier = courierTexto;
        }
      }

      var tiempo = null;
      if (tiene('tiempo')) {
        var tiempoTexto = celda(fila, 'tiempo');
        var numeroTiempo = tiempoTexto.match(/\d+/);
        tiempo = numeroTiempo ? Math.min(60, Number(numeroTiempo[0])) : null;
        if (tiempo === null) avisos.push({ fila: numero, mensaje: lugar + ': TIEMPO DE ENTREGA "' + (tiempoTexto || 'vacío') + '" no es un número.' });
      }

      var activo = true;
      if (tiene('cobertura')) {
        var estado = VC.normalizar(celda(fila, 'cobertura'));
        if (ACTIVO.indexOf(estado) !== -1) activo = true;
        else if (INACTIVO.indexOf(estado) !== -1) activo = false;
        else {
          activo = false;
          avisos.push({ fila: numero, mensaje: lugar + ': COBERTURA "' + (estado || 'vacío') + '" no reconocida; se marca sin cobertura.' });
        }
      }

      var dias = celda(fila, 'dias');
      if (dias && !VC.interpretarDiasReparto(dias).reconocido) {
        avisos.push({ fila: numero, mensaje: lugar + ': ' + etiqueta('dias') + ' "' + dias + '" no se entiende; se asume lunes a viernes.' });
      }

      var regionOriginal = celda(fila, 'region');
      var region = regionOriginal ? (campana.limpiarRegion ? limpiarRegionChile(regionOriginal) : prolijo(regionOriginal)) : '';

      var clave = VC.normalizar(lugar) + '|' + VC.normalizar(zona || region) + '|' + VC.normalizar(courier);
      if (vistos.has(clave)) {
        duplicados++;
        avisos.push({ fila: numero, mensaje: lugar + ' (' + (zona || region) + ') está repetida (ya aparece en la fila ' + vistos.get(clave) + ').' });
      } else {
        vistos.set(clave, numero);
      }

      var barrios = celda(fila, 'barrios');
      filas.push({
        id: filas.length,
        lugar: lugar,
        zona: zona,
        provincia: prolijo(celda(fila, 'provincia')),
        region: region,
        regionOriginal: regionOriginal,
        codigo: celda(fila, 'codigo'),
        siglas: celda(fila, 'siglas'),
        barrios: /^todos?$/i.test(barrios) ? 'Todos' : barrios,
        dias: dias,
        activo: activo,
        tiempo: tiempo,
        courier: courier,
        productos: celda(fila, 'productos')
      });
    }

    return { hoja: nombreHoja, filas: filas, errores: errores, avisos: avisos, duplicados: duplicados };
  }

  /** Compara con lo publicado: nuevas, eliminadas, modificadas y ejemplos. */
  function comparar(anterior, nueva) {
    function clave(f) { return VC.normalizar(f.lugar) + '|' + VC.normalizar(f.zona || f.region) + '|' + VC.normalizar(f.courier); }
    function nombre(f) { return f.lugar + ' (' + (f.zona || f.region) + ')'; }
    var previas = new Map(anterior.map(function (f) { return [clave(f), f]; }));
    var ejemplos = [];
    var nuevas = 0;
    var cambiadas = 0;

    nueva.forEach(function (f) {
      var p = previas.get(clave(f));
      if (!p) {
        nuevas++;
        if (ejemplos.length < 15) ejemplos.push('Nueva: ' + nombre(f));
        return;
      }
      previas.delete(clave(f));
      var cambios = [];
      if (p.tiempo !== f.tiempo) cambios.push('tiempo ' + (p.tiempo == null ? '-' : p.tiempo) + ' → ' + (f.tiempo == null ? '-' : f.tiempo));
      if (p.activo !== f.activo) cambios.push(f.activo ? 'pasa a CON cobertura' : 'pasa a SIN cobertura');
      if ((p.dias || '') !== (f.dias || '')) cambios.push('reparto "' + (p.dias || '') + '" → "' + (f.dias || '') + '"');
      if ((p.productos || '') !== (f.productos || '')) cambios.push('productos "' + (p.productos || '') + '" → "' + (f.productos || '') + '"');
      if (cambios.length) {
        cambiadas++;
        if (ejemplos.length < 15) ejemplos.push(nombre(f) + ': ' + cambios.join(', '));
      }
    });

    var eliminadas = previas.size;
    previas.forEach(function (p) {
      if (ejemplos.length < 15) ejemplos.push('Eliminada: ' + nombre(p));
    });

    return { nuevas: nuevas, eliminadas: eliminadas, cambiadas: cambiadas, ejemplos: ejemplos };
  }

  return { hojaValida: hojaValida, importar: importar, comparar: comparar };
})();

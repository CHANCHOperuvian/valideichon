window.VC = window.VC || {};

/**
 * Definición de cada campaña: columnas del Excel, filtros, textos, reglas y feriados.
 *
 * Todas las campañas se convierten a un formato común de fila:
 *   lugar     → lo que busca el operador (Chile: LOCALIDAD · Perú: URBANIZACIÓN · Paraguay: CIUDAD)
 *   zona      → el nivel de arriba (Chile: COMUNA · Perú: DISTRITO · Paraguay: —)
 *   provincia, region, regionOriginal, codigo, siglas, barrios,
 *   dias (texto de días de reparto), tiempo (días hábiles), activo, courier, productos
 *
 * Para agregar una campaña nueva, se copia un bloque y se ajustan las columnas.
 */
(function () {
  'use strict';

  var CHILE = {
    id: 'chile',
    nombre: 'Chile',
    pais: 'Chile',
    codigoPais: 'cl',
    archivo: 'datos/chile.js',
    variable: 'VC_DATOS_CHILE',
    // Versión anterior (solo Chile): datos/cobertura.js con window.VC_DATOS
    archivoAnterior: 'datos/cobertura.js',
    variableAnterior: 'VC_DATOS',
    mapa: { centro: [-33.45, -70.66], zoom: 5, bbox: '-76,-56,-66,-17' },

    etiquetas: { lugar: 'Localidad', zona: 'Comuna', provincia: 'Provincia', region: 'Región', codigo: 'Código postal', dias: 'Días de reparto' },
    textoBusqueda: 'Buscar localidad, comuna, código postal o siglas',
    ejemploBusqueda: 'Ej.: Achao, Puerto Montt, 5700000…',
    ejemploDireccion: 'Calle y número, comuna (ej.: Blanco 200, Castro)',
    filtros: [
      { campo: 'region', etiqueta: 'Región' },
      { campo: 'zona', etiqueta: 'Comuna' },
      { campo: 'courier', etiqueta: 'Courier' }
    ],

    columnas: {
      lugar: ['localidad', 'sector', 'localidad sector', 'poblado'],
      zona: ['comuna'],
      provincia: ['provincia'],
      region: ['region'],
      siglas: ['siglas', 'sigla'],
      codigo: ['zipcode', 'zip', 'zip code', 'codigo postal', 'cod postal'],
      dias: ['dias de reparto', 'dias reparto', 'dias de entrega', 'reparto'],
      cobertura: ['cobertura', 'estado', 'estado cobertura'],
      tiempo: ['tiempo de entrega', 'tiempo entrega', 'dias de transito', 'dias transito', 'tiempo'],
      courier: ['courier', 'paqueteria', 'transportista', 'operador logistico']
    },
    requeridas: ['lugar', 'zona', 'courier', 'tiempo'],
    couriers: [[/blue/i, 'Blue Express'], [/contra/i, 'Contraentrega']],
    limpiarRegion: true,

    pagos: {
      'Contraentrega': {
        corto: 'Efectivo o transferencia',
        detalle: 'Paga al recibir: efectivo o transferencia bancaria al repartidor.',
        paraCliente: 'puedes pagar en efectivo o por transferencia al momento de recibirlo',
        tono: 'ok'
      },
      'Blue Express': {
        corto: 'Solo efectivo',
        detalle: 'Paga al recibir SOLO EN EFECTIVO. Blue Express no acepta transferencias.',
        paraCliente: 'el pago es SOLO EN EFECTIVO al momento de recibirlo',
        tono: 'alerta'
      }
    },

    // Feriados nacionales. Revisar y agregar cada año.
    feriados: [
      '2026-01-01', '2026-04-03', '2026-04-04', '2026-05-01', '2026-05-21', '2026-06-21', '2026-06-29',
      '2026-07-16', '2026-08-15', '2026-09-18', '2026-09-19', '2026-10-12', '2026-10-31', '2026-11-01',
      '2026-12-08', '2026-12-25',
      '2027-01-01', '2027-03-26', '2027-03-27', '2027-05-01', '2027-05-21', '2027-06-21', '2027-06-28',
      '2027-07-16', '2027-08-15', '2027-09-18', '2027-09-19', '2027-10-11', '2027-10-31', '2027-11-01',
      '2027-12-08', '2027-12-25'
    ]
  };

  var PERU = {
    id: 'peru',
    nombre: 'Perú',
    pais: 'Perú',
    codigoPais: 'pe',
    archivo: 'datos/peru.js',
    variable: 'VC_DATOS_PERU',
    mapa: { centro: [-9.19, -75.0], zoom: 5, bbox: '-81.4,-18.4,-68.6,0.1' },

    etiquetas: { lugar: 'Urbanización', zona: 'Distrito', provincia: 'Provincia', region: 'Departamento', codigo: 'UBIGEO', dias: 'Días de reparto' },
    textoBusqueda: 'Buscar urbanización, distrito, provincia o UBIGEO',
    ejemploBusqueda: 'Ej.: Bellavista, Miraflores, 150122…',
    ejemploDireccion: 'Calle y número, distrito (ej.: Av. Larco 345, Miraflores)',
    filtros: [
      { campo: 'region', etiqueta: 'Departamento' },
      { campo: 'provincia', etiqueta: 'Provincia' },
      { campo: 'zona', etiqueta: 'Distrito' }
    ],

    columnas: {
      region: ['departamento', 'depto', 'dpto', 'region'],
      provincia: ['provincia'],
      zona: ['distrito'],
      lugar: ['urbanizacion', 'urb', 'urbanizacion sector', 'sector', 'localidad', 'centro poblado'],
      codigo: ['ubigeo', 'codigo ubigeo'],
      cobertura: ['cobertura', 'estado'],
      courier: ['courier', 'paqueteria', 'transportista'],
      tiempo: ['tiempo de entrega', 'tiempo entrega', 'dias de transito'],
      dias: ['dias de reparto', 'dias de entrega']
    },
    // La columna Departamento a veces viene sin título (ej. "8"): se toma la que está a la izquierda de Provincia.
    posicionales: { region: { junto: 'provincia', desplazamiento: -1 } },
    requeridas: ['lugar', 'zona', 'cobertura'],
    couriers: [],
    pagos: null,

    feriados: [
      '2026-01-01', '2026-04-02', '2026-04-03', '2026-05-01', '2026-06-07', '2026-06-29', '2026-07-23',
      '2026-07-28', '2026-07-29', '2026-08-06', '2026-08-30', '2026-10-08', '2026-11-01', '2026-12-08',
      '2026-12-09', '2026-12-25',
      '2027-01-01', '2027-03-25', '2027-03-26', '2027-05-01', '2027-06-07', '2027-06-29', '2027-07-23',
      '2027-07-28', '2027-07-29', '2027-08-06', '2027-08-30', '2027-10-08', '2027-11-01', '2027-12-08',
      '2027-12-09', '2027-12-25'
    ]
  };

  var PARAGUAY = {
    id: 'paraguay',
    nombre: 'Paraguay',
    pais: 'Paraguay',
    codigoPais: 'py',
    archivo: 'datos/paraguay.js',
    variable: 'VC_DATOS_PARAGUAY',
    mapa: { centro: [-23.44, -58.44], zoom: 6, bbox: '-62.7,-27.6,-54.2,-19.3' },

    etiquetas: { lugar: 'Ciudad', zona: 'Zona', provincia: 'Provincia', region: 'Departamento', codigo: 'ZIP code', dias: 'Días de entrega' },
    textoBusqueda: 'Buscar ciudad, barrio, departamento o ZIP code',
    ejemploBusqueda: 'Ej.: Luque, Fernando de la Mora, 110301…',
    ejemploDireccion: 'Calle y número, ciudad (ej.: Mcal. López 1200, Asunción)',
    filtros: [
      { campo: 'region', etiqueta: 'Departamento' },
      { campo: 'courier', etiqueta: 'Courier' },
      { campo: 'productos', etiqueta: 'Productos' }
    ],

    columnas: {
      courier: ['courier', 'transportista'],
      codigo: ['zip code', 'zipcode', 'zip', 'codigo postal'],
      barrios: ['barrios', 'barrio'],
      lugar: ['ciudad', 'localidad'],
      region: ['departamento', 'depto'],
      tiempo: ['tiempo de entrega', 'tiempo de ent', 'tiempo entrega', 'tiempo'],
      dias: ['dias de entrega', 'dias de reparto', 'dias entrega'],
      productos: ['productos', 'producto', 'productos permitidos'],
      cobertura: ['cobertura', 'estado']
    },
    // La columna de productos viene sin título, a la derecha de "Dias de entrega".
    posicionales: { productos: { junto: 'dias', desplazamiento: 1 } },
    requeridas: ['lugar', 'region'],
    couriers: [],
    pagos: null,

    feriados: [
      '2026-01-01', '2026-03-01', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-14', '2026-05-15',
      '2026-06-12', '2026-08-15', '2026-09-29', '2026-12-08', '2026-12-25',
      '2027-01-01', '2027-03-01', '2027-03-25', '2027-03-26', '2027-05-01', '2027-05-14', '2027-05-15',
      '2027-06-12', '2027-08-15', '2027-09-29', '2027-12-08', '2027-12-25'
    ]
  };

  VC.CAMPANAS = [CHILE, PERU, PARAGUAY];
  VC.CAMPANAS.forEach(function (c) { c.feriadosSet = new Set(c.feriados); });

  VC.campana = function (id) {
    return VC.CAMPANAS.find(function (c) { return c.id === id; }) || CHILE;
  };

  /** Forma de pago según el courier, o null si la campaña no define reglas. */
  VC.reglaPago = function (campana, courier) {
    if (!campana.pagos) return null;
    return campana.pagos[courier] || {
      corto: 'Consultar',
      detalle: 'Courier "' + (courier || 'sin dato') + '" sin regla de pago definida. Consulta con tu teamleader.',
      paraCliente: 'el método de pago te lo confirmamos antes del despacho',
      tono: 'neutro'
    };
  };

  /** Nombre oficial del courier según las equivalencias de la campaña (o el texto tal cual). */
  VC.normalizarCourier = function (campana, valor) {
    var texto = String(valor || '').trim();
    for (var i = 0; i < campana.couriers.length; i++) {
      if (campana.couriers[i][0].test(texto)) return campana.couriers[i][1];
    }
    return campana.couriers.length ? null : texto;
  };

  /** Bandera en SVG (Windows no muestra los emojis de banderas). */
  VC.bandera = function (id) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 30 20');
    svg.setAttribute('class', 'bandera');
    svg.setAttribute('aria-hidden', 'true');
    function rect(x, y, w, h, color) {
      var r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h);
      r.setAttribute('fill', color);
      svg.appendChild(r);
    }
    if (id === 'peru') {
      rect(0, 0, 30, 20, '#ffffff'); rect(0, 0, 10, 20, '#d91023'); rect(20, 0, 10, 20, '#d91023');
    } else if (id === 'paraguay') {
      rect(0, 0, 30, 20, '#ffffff'); rect(0, 0, 30, 6.67, '#d52b1e'); rect(0, 13.33, 30, 6.67, '#0038a8');
    } else {
      rect(0, 0, 30, 20, '#ffffff'); rect(0, 10, 30, 10, '#d52b1e'); rect(0, 0, 10, 10, '#0039a6');
      var estrella = document.createElementNS(ns, 'path');
      estrella.setAttribute('d', 'M5 2.2l.7 2.1h2.2l-1.8 1.3.7 2.1L5 6.4 3.2 7.7l.7-2.1-1.8-1.3h2.2z');
      estrella.setAttribute('fill', '#ffffff');
      svg.appendChild(estrella);
    }
    return svg;
  };
})();

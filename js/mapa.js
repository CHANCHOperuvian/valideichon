window.VC = window.VC || {};

/**
 * Búsqueda de direcciones (geocodificación) y mapa, según el país de la campaña.
 * - Direcciones: Nominatim (OpenStreetMap) y, si falla, Photon. Ambos gratuitos y sin clave.
 *   Nominatim permite 1 consulta por segundo: se respeta con una cola.
 * - Mapa: Leaflet con el mapa base de OpenStreetMap (sin clave; requiere la página publicada).
 */
(function () {
  'use strict';

  var ESPERA_NOMINATIM_MS = 1100;
  var ultimaConsulta = 0;

  function esperarTurno() {
    var espera = Math.max(0, ultimaConsulta + ESPERA_NOMINATIM_MS - Date.now());
    ultimaConsulta = Date.now() + espera;
    return new Promise(function (resolve) { setTimeout(resolve, espera); });
  }

  function obtenerJson(url, esperaMs) {
    var controlador = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controlador ? setTimeout(function () { controlador.abort(); }, esperaMs || 8000) : null;
    return fetch(url, { headers: { Accept: 'application/json' }, signal: controlador ? controlador.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function desdeNominatim(texto, limite, campana) {
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=' + campana.codigoPais +
      '&accept-language=es&limit=' + limite + '&q=' + encodeURIComponent(texto);
    return esperarTurno().then(function () { return obtenerJson(url); }).then(function (lista) {
      return lista.map(function (x) {
        var a = x.address || {};
        return {
          lat: Number(x.lat),
          lon: Number(x.lon),
          nombre: x.display_name,
          // Nombres de lugar que pueden coincidir con el lugar o la zona de la matriz.
          lugares: [a.hamlet, a.village, a.suburb, a.neighbourhood, a.quarter, a.residential, a.town, a.city_district,
            a.city, a.municipality, a.county, a.state_district, a.state].filter(Boolean)
        };
      });
    });
  }

  function desdePhoton(texto, limite, campana) {
    var url = 'https://photon.komoot.io/api/?limit=' + limite + '&bbox=' + campana.mapa.bbox + '&q=' + encodeURIComponent(texto);
    return obtenerJson(url, 5000).then(function (r) {
      return (r.features || [])
        .filter(function (f) { return (f.properties.countrycode || '').toLowerCase() === campana.codigoPais; })
        .map(function (f) {
          var p = f.properties;
          var calle = [p.street || p.name, p.housenumber].filter(Boolean).join(' ');
          return {
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            nombre: [calle, p.district, p.locality, p.city, p.county, p.state].filter(Boolean).join(', '),
            lugares: [p.locality, p.district, p.city, p.county, p.state, p.name].filter(Boolean)
          };
        });
    });
  }

  /** Busca una dirección en el país de la campaña. Devuelve [{ lat, lon, nombre, lugares }]. */
  function buscarDireccion(texto, limite, campana) {
    limite = limite || 5;
    // "Calle Blanco 200" no aparece en OpenStreetMap, "Blanco 200" sí.
    texto = String(texto).replace(/^\s*(calle|c\/|pasaje|psje\.?|jr\.?|jir[oó]n)\s+/i, '');
    var nominatimFallo = false;
    return desdeNominatim(texto, limite, campana)
      .catch(function () { nominatimFallo = true; return []; })
      .then(function (lista) {
        if (lista.length) return lista;
        // Respaldo. Si también falla, solo es error de conexión cuando Nominatim tampoco respondió.
        return desdePhoton(texto, limite, campana).catch(function (err) {
          if (nominatimFallo) throw err;
          return [];
        });
      });
  }

  /**
   * Ubica una fila de la matriz (con caché en el navegador).
   * Solo vale un resultado que esté en la zona correcta: "ABTAO, Castro" puede devolver
   * una escuela "Óscar Castro" en calle Abtao de Santiago.
   */
  function ubicarLugar(fila, campana) {
    var clave = 'geo:' + campana.id + ':' + VC.normalizar(fila.lugar + ' ' + (fila.zona || fila.region));
    var enCache = VC.almacen.leer(clave);
    if (enCache) return Promise.resolve(enCache);

    // El resultado debe estar en la zona correcta (comuna / distrito; en Paraguay, la ciudad misma)
    // y en la región correcta: en Perú hay un distrito "Miraflores" en Lima y otro en Arequipa.
    var refNorm = VC.normalizar(fila.zona || fila.lugar);
    var NO_CLAVE = ['region', 'departamento', 'provincia', 'del', 'los', 'las'];
    var clavesRegion = VC.normalizar(fila.region).split(' ').filter(function (w) {
      return w.length >= 4 && NO_CLAVE.indexOf(w) === -1;
    });
    var calza = function (r) {
      var enZona = r.lugares.some(function (l) { return VC.normalizar(l) === refNorm; });
      var nombre = VC.normalizar(r.nombre);
      var enRegion = !clavesRegion.length || clavesRegion.some(function (w) { return nombre.indexOf(w) !== -1; });
      return enZona && enRegion;
    };
    var contexto = [fila.zona, fila.region].filter(Boolean).join(', ');

    return buscarDireccion(fila.lugar + (fila.zona ? ', ' + fila.zona : (fila.region ? ', ' + fila.region : '')), 5, campana)
      .then(function (r) {
        var bueno = r.filter(calza)[0];
        if (bueno) return { lat: bueno.lat, lon: bueno.lon, aproximada: false };
        if (!fila.zona) return null;
        return buscarDireccion(contexto, 3, campana).then(function (r2) {
          var centro = r2.filter(calza)[0];
          return centro ? { lat: centro.lat, lon: centro.lon, aproximada: true } : null;
        });
      })
      .then(function (punto) {
        if (punto) VC.almacen.guardar(clave, punto);
        return punto;
      });
  }

  /** Distancia en km entre dos puntos (fórmula de haversine). */
  function distanciaKm(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLon = (b.lon - a.lon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function colorCss(variable, respaldo) {
    var v = getComputedStyle(document.body).getPropertyValue(variable).trim();
    return v || respaldo;
  }

  /** Crea el mapa en un elemento. Si Leaflet no cargó (sin internet), devuelve null. */
  function crearMapa(elemento) {
    if (typeof L === 'undefined') return null;

    var mapa = L.map(elemento, { zoomControl: true, attributionControl: true }).setView([-20, -66], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapa);

    var marcaLugar = null;
    var marcaCliente = null;
    var linea = null;
    var vistaInicial = null;

    function encuadrar() {
      var puntos = [marcaLugar, marcaCliente].filter(Boolean).map(function (m) { return m.getLatLng(); });
      if (puntos.length === 2) mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 15 });
      else if (puntos.length === 1) mapa.setView(puntos[0], marcaCliente ? 16 : 13);
      else if (vistaInicial) mapa.setView(vistaInicial.centro, vistaInicial.zoom);
    }

    function actualizarLinea() {
      if (linea) { linea.remove(); linea = null; }
      if (marcaLugar && marcaCliente) {
        linea = L.polyline([marcaLugar.getLatLng(), marcaCliente.getLatLng()], {
          color: '#64748b', weight: 2, dashArray: '6 6'
        }).addTo(mapa);
      }
    }

    return {
      /** Centra el mapa en el país de la campaña y borra las marcas. */
      usarCampana: function (campana) {
        vistaInicial = campana.mapa;
        [marcaLugar, marcaCliente, linea].forEach(function (m) { if (m) m.remove(); });
        marcaLugar = marcaCliente = linea = null;
        mapa.setView(campana.mapa.centro, campana.mapa.zoom);
      },
      ponerLugar: function (punto, etiqueta) {
        if (marcaLugar) marcaLugar.remove();
        marcaLugar = null;
        if (punto) {
          marcaLugar = L.circleMarker([punto.lat, punto.lon], {
            radius: 10, weight: 3, fillOpacity: 0.35,
            color: colorCss('--acento-700', '#1d43b8'), fillColor: colorCss('--acento-500', '#3b6ef5')
          }).addTo(mapa).bindTooltip(etiqueta);
        }
        actualizarLinea();
        encuadrar();
      },
      ponerCliente: function (punto, etiqueta) {
        if (marcaCliente) marcaCliente.remove();
        marcaCliente = null;
        if (punto) {
          marcaCliente = L.circleMarker([punto.lat, punto.lon], {
            radius: 9, color: '#78350f', weight: 3, fillColor: '#f59e0b', fillOpacity: 0.95
          }).addTo(mapa).bindTooltip(etiqueta);
        }
        actualizarLinea();
        encuadrar();
      },
      ajustarTamano: function () { mapa.invalidateSize(); }
    };
  }

  VC.geo = {
    // Nominatim rechaza consultas sin sitio de origen: abierta con doble clic (file://) no se puede buscar.
    busquedaDisponible: window.location.protocol === 'https:' || window.location.protocol === 'http:',
    buscarDireccion: buscarDireccion,
    ubicarLugar: ubicarLugar,
    distanciaKm: distanciaKm,
    crearMapa: crearMapa
  };
})();

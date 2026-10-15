window.VC = window.VC || {};

/**
 * Búsqueda de direcciones (geocodificación) y mapa.
 * - Direcciones: Nominatim (OpenStreetMap) y, si falla, Photon. Ambos gratuitos y sin clave.
 *   Nominatim permite 1 consulta por segundo: se respeta con una cola.
 * - Mapa: Leaflet con el mapa base de OpenStreetMap (sin clave; requiere la página publicada).
 */
(function () {
  'use strict';

  var CHILE = { centro: [-33.45, -70.66], zoom: 5, bbox: '-76,-56,-66,-17' };
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

  function desdeNominatim(texto, limite) {
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=cl' +
      '&accept-language=es&limit=' + limite + '&q=' + encodeURIComponent(texto);
    return esperarTurno().then(function () { return obtenerJson(url); }).then(function (lista) {
      return lista.map(function (x) {
        var a = x.address || {};
        return {
          lat: Number(x.lat),
          lon: Number(x.lon),
          nombre: x.display_name,
          // Nombres de lugar que pueden coincidir con LOCALIDAD o COMUNA de la matriz.
          lugares: [a.hamlet, a.village, a.suburb, a.neighbourhood, a.quarter, a.town, a.city_district,
            a.city, a.municipality, a.county].filter(Boolean)
        };
      });
    });
  }

  function desdePhoton(texto, limite) {
    var url = 'https://photon.komoot.io/api/?limit=' + limite + '&bbox=' + CHILE.bbox + '&q=' + encodeURIComponent(texto);
    return obtenerJson(url, 5000).then(function (r) {
      return (r.features || [])
        .filter(function (f) { return (f.properties.countrycode || '').toUpperCase() === 'CL'; })
        .map(function (f) {
          var p = f.properties;
          var calle = [p.street || p.name, p.housenumber].filter(Boolean).join(' ');
          return {
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            nombre: [calle, p.district, p.locality, p.city, p.county, p.state].filter(Boolean).join(', '),
            lugares: [p.locality, p.district, p.city, p.county, p.name].filter(Boolean)
          };
        });
    });
  }

  /** Busca una dirección en Chile. Devuelve [{ lat, lon, nombre, lugares }]. */
  function buscarDireccion(texto, limite) {
    limite = limite || 5;
    // "Calle Blanco 200" no aparece en OpenStreetMap, "Blanco 200" sí.
    texto = String(texto).replace(/^\s*(calle|c\/|pasaje|psje\.?)\s+/i, '');
    var nominatimFallo = false;
    return desdeNominatim(texto, limite)
      .catch(function () { nominatimFallo = true; return []; })
      .then(function (lista) {
        if (lista.length) return lista;
        // Respaldo. Si también falla, solo es error de conexión cuando Nominatim tampoco respondió.
        return desdePhoton(texto, limite).catch(function (err) {
          if (nominatimFallo) throw err;
          return [];
        });
      });
  }

  /** Ubica una localidad de la matriz (con caché en el navegador). */
  function ubicarLocalidad(fila) {
    var clave = 'geo:' + VC.normalizar(fila.localidad + ' ' + fila.comuna);
    var enCache = VC.almacen.leer(clave);
    if (enCache) return Promise.resolve(enCache);

    var region = fila.region && fila.region !== 'Sin región' ? ', ' + fila.region : '';
    var comuna = VC.normalizar(fila.comuna);
    // Solo vale un resultado que esté en la comuna correcta: "ABTAO, Castro" puede devolver
    // una escuela "Óscar Castro" en calle Abtao de Santiago.
    var enLaComuna = function (r) {
      return r.lugares.some(function (l) { return VC.normalizar(l) === comuna; });
    };
    return buscarDireccion(fila.localidad + ', ' + fila.comuna, 5)
      .then(function (r) {
        var bueno = r.filter(enLaComuna)[0];
        if (bueno) return { lat: bueno.lat, lon: bueno.lon, aproximada: false };
        return buscarDireccion(fila.comuna + region, 3).then(function (r2) {
          var centro = r2.filter(enLaComuna)[0];
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

  /** Crea el mapa en un elemento. Si Leaflet no cargó (sin internet), devuelve null. */
  function crearMapa(elemento) {
    if (typeof L === 'undefined') return null;

    var mapa = L.map(elemento, { zoomControl: true, attributionControl: true }).setView(CHILE.centro, CHILE.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapa);

    var marcaLocalidad = null;
    var marcaCliente = null;
    var linea = null;

    function encuadrar() {
      var puntos = [marcaLocalidad, marcaCliente].filter(Boolean).map(function (m) { return m.getLatLng(); });
      if (puntos.length === 2) mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 15 });
      else if (puntos.length === 1) mapa.setView(puntos[0], marcaCliente ? 16 : 13);
    }

    function actualizarLinea() {
      if (linea) { linea.remove(); linea = null; }
      if (marcaLocalidad && marcaCliente) {
        linea = L.polyline([marcaLocalidad.getLatLng(), marcaCliente.getLatLng()], {
          color: '#64748b', weight: 2, dashArray: '6 6'
        }).addTo(mapa);
      }
    }

    return {
      ponerLocalidad: function (punto, etiqueta) {
        if (marcaLocalidad) marcaLocalidad.remove();
        marcaLocalidad = null;
        if (punto) {
          marcaLocalidad = L.circleMarker([punto.lat, punto.lon], {
            radius: 10, color: '#1d43b8', weight: 3, fillColor: '#3b6ef5', fillOpacity: 0.35
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
            radius: 9, color: '#9f1239', weight: 3, fillColor: '#e11d48', fillOpacity: 0.9
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
    ubicarLocalidad: ubicarLocalidad,
    distanciaKm: distanciaKm,
    crearMapa: crearMapa
  };
})();

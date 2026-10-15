window.VC = window.VC || {};

/**
 * Carga bajo demanda el archivo de datos cifrado de cada campaña (datos/chile.js, datos/peru.js, …).
 * Se carga como <script> para que funcione también abriendo index.html con doble clic.
 */
(function () {
  'use strict';

  var cargados = {};

  function cargarScript(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      // En la página publicada se evita la caché de GitHub (hasta 10 min) para ver los datos nuevos enseguida.
      var publicado = /^https?:$/.test(window.location.protocol);
      s.src = src + (publicado ? '?v=' + Math.floor(Date.now() / 60000) : '');
      s.onload = function () { resolve(true); };
      s.onerror = function () { s.remove(); resolve(false); };
      document.head.appendChild(s);
    });
  }

  /** Devuelve el "sobre" cifrado de la campaña, o null si no hay archivo publicado. */
  VC.cargarSobre = function (campana) {
    if (cargados[campana.id] !== undefined) return Promise.resolve(cargados[campana.id]);
    return cargarScript(campana.archivo)
      .then(function () {
        if (window[campana.variable]) return window[campana.variable];
        if (!campana.archivoAnterior) return null;
        return cargarScript(campana.archivoAnterior).then(function () {
          return window[campana.variableAnterior] || null;
        });
      })
      .then(function (sobre) {
        cargados[campana.id] = sobre;
        return sobre;
      });
  };
})();

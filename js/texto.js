window.VC = window.VC || {};

(function () {
'use strict';

/** Minúsculas, sin tildes (ñ → n) y sin signos: "Ñuñoa, RM" → "nunoa rm". */
VC.normalizar = function (valor) {
  return String(valor == null ? '' : valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

var PALABRAS_MENORES = { de: 1, del: 1, la: 1, las: 1, los: 1, el: 1, y: 1, e: 1 };

/** "SAN PEDRO DE LA PAZ" → "San Pedro de la Paz". */
VC.enTitulo = function (valor) {
  return String(valor || '')
    .toLowerCase()
    .split(/(\s+)/)
    .map(function (palabra, i) {
      if (i > 0 && PALABRAS_MENORES[palabra]) return palabra;
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join('');
};

VC.formatearNumero = function (n) {
  return Number(n).toLocaleString('es-CL');
};

VC.plural = function (n, singular, plural) {
  return VC.formatearNumero(n) + ' ' + (n === 1 ? singular : plural || singular + 's');
};

VC.formatearFechaHora = function (iso) {
  var fecha = new Date(iso);
  if (isNaN(fecha.getTime())) return String(iso || '');
  return fecha.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

/**
 * Crea elementos del DOM sin usar innerHTML (los datos del Excel nunca se interpretan como HTML).
 *   VC.h('p', { class: 'x', onclick: fn }, 'texto', otroNodo)
 */
VC.h = function (etiqueta, atributos) {
  var el = document.createElement(etiqueta);
  var attrs = atributos || {};
  Object.keys(attrs).forEach(function (clave) {
    var valor = attrs[clave];
    if (valor === null || valor === undefined || valor === false) return;
    if (clave.indexOf('on') === 0 && typeof valor === 'function') {
      el.addEventListener(clave.slice(2), valor);
    } else if (clave === 'class') {
      el.className = valor;
    } else if (valor === true) {
      el.setAttribute(clave, '');
    } else {
      el.setAttribute(clave, valor);
    }
  });
  for (var i = 2; i < arguments.length; i++) agregarHijo(el, arguments[i]);
  return el;
};

function agregarHijo(el, hijo) {
  if (hijo === null || hijo === undefined || hijo === false) return;
  if (Array.isArray(hijo)) {
    hijo.forEach(function (x) { agregarHijo(el, x); });
  } else if (hijo instanceof Node) {
    el.appendChild(hijo);
  } else {
    el.appendChild(document.createTextNode(String(hijo)));
  }
}

/** Copia texto al portapapeles, con respaldo para navegadores antiguos. */
VC.copiarTexto = function (texto) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(texto).then(function () { return true; }, copiaRespaldo);
  }
  return Promise.resolve(copiaRespaldo());

  function copiaRespaldo() {
    try {
      var area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }
};

/** localStorage tolerante a fallos (incógnito, bloqueado o lleno). */
VC.almacen = {
  leer: function (clave) {
    try {
      var crudo = localStorage.getItem('vc:' + clave);
      return crudo ? JSON.parse(crudo) : null;
    } catch (e) {
      return null;
    }
  },
  guardar: function (clave, valor) {
    try { localStorage.setItem('vc:' + clave, JSON.stringify(valor)); } catch (e) { /* ignorar */ }
  },
  borrar: function (clave) {
    try { localStorage.removeItem('vc:' + clave); } catch (e) { /* ignorar */ }
  }
};

})();

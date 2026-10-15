window.VC = window.VC || {};

/**
 * Cifrado del archivo de datos con el código del equipo.
 * PBKDF2-SHA256 (210.000 iteraciones) para derivar la clave + AES-GCM 256.
 * El archivo datos/cobertura.js puede estar en un repositorio público:
 * sin el código no se puede leer, y AES-GCM detecta cualquier alteración.
 */
VC.cripto = (function () {
  'use strict';

  var ITERACIONES = 210000;

  function aBase64(bytes) {
    var binario = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binario);
  }

  function deBase64(texto) {
    var binario = atob(texto);
    var bytes = new Uint8Array(binario.length);
    for (var i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  }

  function transformar(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
      .then(function (buf) { return new Uint8Array(buf); });
  }

  function derivarClave(codigo, salt, iteraciones) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(codigo), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iteraciones },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  function disponible() {
    return Boolean(window.crypto && crypto.subtle);
  }

  /** Cifra un objeto y devuelve el "sobre" que se guarda en datos/cobertura.js. */
  function cifrar(objeto, codigo) {
    var plano = new TextEncoder().encode(JSON.stringify(objeto));
    var comprimir = typeof CompressionStream === 'function';
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));

    var bytesP = comprimir ? transformar(plano, new CompressionStream('gzip')) : Promise.resolve(plano);
    return Promise.all([bytesP, derivarClave(codigo, salt, ITERACIONES)])
      .then(function (r) {
        return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, r[1], r[0]);
      })
      .then(function (cifrado) {
        return {
          v: 1,
          iteraciones: ITERACIONES,
          gzip: comprimir,
          salt: aBase64(salt),
          iv: aBase64(iv),
          datos: aBase64(new Uint8Array(cifrado))
        };
      });
  }

  /** Descifra el sobre. Rechaza con Error('codigo') si el código es incorrecto. */
  function descifrar(sobre, codigo) {
    if (!sobre || sobre.v !== 1) return Promise.reject(new Error('formato'));
    return derivarClave(codigo, deBase64(sobre.salt), sobre.iteraciones)
      .then(function (clave) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(sobre.iv) }, clave, deBase64(sobre.datos));
      })
      .then(
        function (plano) {
          var bytes = new Uint8Array(plano);
          if (!sobre.gzip) return bytes;
          if (typeof DecompressionStream !== 'function') throw new Error('navegador');
          return transformar(bytes, new DecompressionStream('gzip'));
        },
        function () { throw new Error('codigo'); }
      )
      .then(function (bytes) {
        return JSON.parse(new TextDecoder().decode(bytes));
      });
  }

  return { disponible: disponible, cifrar: cifrar, descifrar: descifrar };
})();

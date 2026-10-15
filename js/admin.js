(function () {
  'use strict';

  var h = VC.h;
  var $ = function (id) { return document.getElementById(id); };
  var LARGO_MINIMO = 8;

  var estado = {
    archivo: null,
    hojas: [],          // [{ nombre, filas }]
    importacion: null,  // resultado de VC.importacion.importar
    publicados: null,   // filas actuales (si se pudieron descifrar con el código)
    codigoComparado: null
  };

  if (window.VC_DATOS) {
    $('estado-actual').textContent = 'Hay un archivo de datos publicado';
    $('ayuda-codigo').textContent += ' Si usas el mismo código actual, verás qué cambia respecto a lo publicado. ' +
      'Si escribes un código nuevo, avisa a los operadores: tendrán que ingresar el nuevo.';
  }

  if (typeof XLSX === 'undefined') {
    mostrarError('error-archivo', 'No se pudo cargar el lector de Excel (¿sin internet?). Recarga la página.');
  }

  // ─── Paso 1: código ───

  function codigoValido() {
    var a = $('codigo').value;
    var b = $('codigo2').value;
    if (!a && !b) return { ok: false, mensaje: '' };
    if (a.length < LARGO_MINIMO) return { ok: false, mensaje: 'Mínimo ' + LARGO_MINIMO + ' caracteres.' };
    if (a !== b) return { ok: false, mensaje: 'Los códigos no coinciden.' };
    return { ok: true, mensaje: '✓ Código listo.' };
  }

  function alCambiarCodigo() {
    var v = codigoValido();
    var el = $('estado-codigo');
    el.textContent = v.mensaje;
    el.style.color = v.ok ? 'var(--verde-800)' : 'var(--rojo-800)';
    if (v.ok) compararConPublicado();
    actualizarGenerar();
  }

  $('codigo').addEventListener('input', alCambiarCodigo);
  $('codigo2').addEventListener('input', alCambiarCodigo);
  $('ver-codigo').addEventListener('change', function (e) {
    var tipo = e.target.checked ? 'text' : 'password';
    $('codigo').type = tipo;
    $('codigo2').type = tipo;
  });

  /** Intenta abrir los datos publicados con el código, para mostrar los cambios. */
  function compararConPublicado() {
    var codigo = $('codigo').value;
    if (!window.VC_DATOS || estado.codigoComparado === codigo) return;
    estado.codigoComparado = codigo;
    VC.cripto.descifrar(window.VC_DATOS, codigo)
      .then(function (datos) {
        if (estado.codigoComparado !== codigo) return;
        estado.publicados = datos.filas || null;
        $('estado-actual').textContent = 'Publicado: ' + VC.plural(datos.filas.length, 'localidad', 'localidades') +
          (datos.generado ? ' · ' + VC.formatearFechaHora(datos.generado) : '');
      })
      .catch(function () {
        if (estado.codigoComparado !== codigo) return;
        estado.publicados = null;
      })
      .then(renderRevision);
  }

  // ─── Paso 2: archivo ───

  function mostrarError(id, texto) {
    $(id).textContent = texto;
    $(id).hidden = !texto;
  }

  $('btn-archivo').addEventListener('click', function () { $('archivo').click(); });
  $('archivo').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) leerArchivo(e.target.files[0]);
  });

  var zona = $('zona-archivo');
  zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('zona-archivo-activa'); });
  zona.addEventListener('dragleave', function () { zona.classList.remove('zona-archivo-activa'); });
  zona.addEventListener('drop', function (e) {
    e.preventDefault();
    zona.classList.remove('zona-archivo-activa');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) leerArchivo(e.dataTransfer.files[0]);
  });

  function leerArchivo(archivo) {
    estado.archivo = archivo;
    estado.hojas = [];
    estado.importacion = null;
    $('nombre-archivo').textContent = archivo.name;
    $('grupo-hoja').hidden = true;
    $('listo').hidden = true;
    mostrarError('error-archivo', '');
    mostrarError('error-generar', '');

    if (typeof XLSX === 'undefined') {
      mostrarError('error-archivo', 'No se pudo cargar el lector de Excel (¿sin internet?). Recarga la página.');
      return;
    }

    var esTexto = /\.(csv|tsv|txt)$/i.test(archivo.name);
    var lectura = esTexto ? archivo.text() : archivo.arrayBuffer();
    lectura
      .then(function (contenido) {
        var libro = esTexto
          ? XLSX.read(contenido, { type: 'string', raw: true })
          : XLSX.read(contenido, { type: 'array' });
        estado.hojas = libro.SheetNames.map(function (nombre) {
          var filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: false, defval: '', blankrows: false });
          return { nombre: nombre, filas: filas };
        }).filter(function (hoja) { return VC.importacion.hojaValida(hoja.filas); });

        if (!estado.hojas.length) {
          mostrarError('error-archivo', 'Ninguna hoja de "' + archivo.name + '" tiene las columnas LOCALIDAD, COMUNA, COURIER y TIEMPO DE ENTREGA en las primeras 15 filas.');
          renderRevision();
          return;
        }

        var select = $('hoja');
        select.replaceChildren();
        var preferida = estado.hojas.find(function (x) { return x.nombre.trim().toLowerCase() === 'matriz'; }) || estado.hojas[0];
        estado.hojas.forEach(function (x) {
          select.appendChild(h('option', { value: x.nombre, selected: x === preferida }, x.nombre));
        });
        $('grupo-hoja').hidden = estado.hojas.length < 2;
        importarHoja(preferida.nombre);
      })
      .catch(function (err) {
        mostrarError('error-archivo', 'No se pudo leer el archivo: ' + (err && err.message ? err.message : err));
      });
  }

  $('hoja').addEventListener('change', function (e) { importarHoja(e.target.value); });

  function importarHoja(nombre) {
    var hoja = estado.hojas.find(function (x) { return x.nombre === nombre; });
    estado.importacion = hoja ? VC.importacion.importar(hoja.nombre, hoja.filas) : null;
    $('listo').hidden = true;
    renderRevision();
  }

  // ─── Paso 3: revisión ───

  function cifra(etiqueta, valor, tono) {
    return h('div', { class: 'cifra' + (tono ? ' cifra-' + tono : '') },
      h('p', { class: 'cifra-etiqueta' }, etiqueta),
      h('p', { class: 'cifra-valor' }, VC.formatearNumero(valor)));
  }

  function renderRevision() {
    var imp = estado.importacion;
    $('seccion-revision').hidden = !imp;
    $('seccion-generar').hidden = !imp || Boolean(imp.error);
    actualizarGenerar();
    if (!imp) return;

    var contenedor = $('revision');
    if (imp.error) {
      contenedor.replaceChildren(h('p', { class: 'alerta alerta-error' }, imp.error));
      return;
    }

    var filas = imp.filas;
    var contar = function (fn) { return filas.filter(fn).length; };
    var partes = [
      h('p', { class: 'texto-suave' }, 'Hoja “' + imp.hoja + '”'),
      h('div', { class: 'cifras' },
        cifra('Localidades', filas.length, 'verde'),
        cifra('Inactivas', contar(function (f) { return !f.activo; }), 'rojo'),
        cifra(VC.config.courierContra, contar(function (f) { return f.courier === VC.config.courierContra; })),
        cifra(VC.config.courierBlue, contar(function (f) { return f.courier === VC.config.courierBlue; })),
        cifra('Filas descartadas', imp.errores.length, imp.errores.length ? 'rojo' : null),
        cifra('Avisos', imp.avisos.length, imp.avisos.length ? 'ambar' : null),
        cifra('Repetidas', imp.duplicados, imp.duplicados ? 'ambar' : null))
    ];

    if (estado.publicados) {
      var d = VC.importacion.comparar(estado.publicados, filas);
      partes.push(h('div', { class: 'grupo' },
        h('p', null, h('strong', null, 'Cambios respecto a lo publicado: '),
          d.nuevas + ' nuevas · ' + d.eliminadas + ' eliminadas · ' + d.cambiadas + ' modificadas'),
        d.ejemplos.length
          ? h('ul', { class: 'lista-chica' }, d.ejemplos.map(function (x) { return h('li', null, x); }))
          : h('p', { class: 'texto-suave chico' }, 'El archivo es igual a lo publicado.'),
        d.eliminadas > estado.publicados.length * 0.2
          ? h('p', { class: 'alerta alerta-aviso' }, 'Ojo: se eliminarían ' + d.eliminadas + ' localidades. Revisa que sea el archivo y la hoja correctos.')
          : null));
    } else if (window.VC_DATOS && codigoValido().ok) {
      partes.push(h('p', { class: 'texto-suave chico grupo' },
        'El código no abre los datos publicados (¿es un código nuevo?), así que no se muestran los cambios.'));
    }

    var incidencias = imp.errores.map(function (i) { return { fila: i.fila, mensaje: i.mensaje, tipo: 'error' }; })
      .concat(imp.avisos.map(function (i) { return { fila: i.fila, mensaje: i.mensaje, tipo: 'aviso' }; }))
      .sort(function (a, b) { return a.fila - b.fila; });

    if (incidencias.length) {
      partes.push(h('details', null,
        h('summary', null, 'Ver ' + VC.plural(incidencias.length, 'observación', 'observaciones')),
        h('ul', { class: 'incidencias' }, incidencias.slice(0, 400).map(function (i) {
          return h('li', { class: 'incidencia-' + i.tipo }, 'Fila ' + i.fila + ': ' + i.mensaje);
        }), incidencias.length > 400 ? h('li', null, '… y ' + (incidencias.length - 400) + ' más.') : null)));
    }

    contenedor.replaceChildren.apply(contenedor, partes);
  }

  // ─── Paso 4: generar ───

  function actualizarGenerar() {
    var imp = estado.importacion;
    var listo = imp && !imp.error && imp.filas.length > 0 && codigoValido().ok;
    $('btn-generar').disabled = !listo;
    $('btn-generar').title = listo ? '' : 'Completa el código (paso 1) y el archivo (paso 2).';
  }

  $('btn-generar').addEventListener('click', function () {
    var imp = estado.importacion;
    if (!imp || imp.error || !codigoValido().ok) return;

    var boton = $('btn-generar');
    boton.disabled = true;
    boton.textContent = 'Cifrando…';
    mostrarError('error-generar', '');

    var datos = {
      generado: new Date().toISOString(),
      archivo: estado.archivo ? estado.archivo.name : '',
      hoja: imp.hoja,
      filas: imp.filas
    };

    VC.cripto.cifrar(datos, $('codigo').value)
      .then(function (sobre) {
        var contenido =
          '/* Validador de Cobertura Chile — datos cifrados. Generado con admin.html el ' +
          new Date().toLocaleString('es-CL') + '.\n   No editar a mano: vuelve a generarlo desde admin.html. */\n' +
          'window.VC_DATOS = ' + JSON.stringify(sobre) + ';\n';
        descargar('cobertura.js', contenido);
        $('listo').hidden = false;
      })
      .catch(function (err) {
        mostrarError('error-generar', 'No se pudo generar el archivo: ' + (err && err.message ? err.message : err));
      })
      .finally(function () {
        boton.textContent = 'Generar cobertura.js';
        actualizarGenerar();
      });
  });

  function descargar(nombre, contenido) {
    var url = URL.createObjectURL(new Blob([contenido], { type: 'text/javascript;charset=utf-8' }));
    var enlace = h('a', { href: url, download: nombre });
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
})();

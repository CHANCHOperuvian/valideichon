(function () {
  'use strict';

  var h = VC.h;
  var $ = function (id) { return document.getElementById(id); };
  var LARGO_MINIMO = 8;

  var estado = {
    campana: VC.campana(VC.almacen.leer('campana')),
    sobrePublicado: null, // archivo publicado de la campaña (cifrado)
    publicados: null,     // sus filas, si se pudieron descifrar con el código
    codigoComparado: null,
    archivo: null,
    hojas: [],            // [{ nombre, filas }]
    importacion: null
  };

  if (typeof XLSX === 'undefined') {
    mostrarError('error-archivo', 'No se pudo cargar el lector de Excel (¿sin internet?). Recarga la página.');
  }

  // ─── Campaña ───

  function nombreSalida(c) { return c.archivo.split('/').pop(); }

  function renderCampana() {
    var c = estado.campana;
    document.body.setAttribute('data-campana', c.id);
    $('marca-campana').replaceChildren(VC.bandera(c.id), c.nombre);
    $('titulo-admin').textContent = 'Actualizar la matriz de cobertura de ' + c.nombre;
    $('nombre-salida').textContent = c.archivo;
    $('btn-generar').textContent = 'Generar ' + nombreSalida(c);
    var columnas = c.requeridas.map(function (r) { return (c.etiquetas[r] || r).toUpperCase(); });
    $('ayuda-archivo').textContent = 'Descarga la hoja de ' + c.nombre + ' como Excel (.xlsx) o CSV. Columnas obligatorias: ' +
      columnas.join(', ') + '. Las demás columnas que reconozca se cargan también.';

    var nav = $('selector-campanas');
    nav.replaceChildren.apply(nav, VC.CAMPANAS.map(function (x) {
      var activa = x.id === c.id;
      return h('button', {
        type: 'button',
        class: 'campana' + (activa ? ' campana-activa' : ''),
        'aria-pressed': activa ? 'true' : 'false',
        onclick: function () { if (!activa) cambiarCampana(x.id); }
      }, VC.bandera(x.id), h('span', { class: 'campana-nombre' }, x.nombre));
    }));
  }

  function cambiarCampana(id) {
    estado.campana = VC.campana(id);
    VC.almacen.guardar('campana', estado.campana.id);
    estado.sobrePublicado = null;
    estado.publicados = null;
    estado.codigoComparado = null;
    estado.archivo = null;
    estado.hojas = [];
    estado.importacion = null;
    $('archivo').value = '';
    $('nombre-archivo').textContent = '';
    $('grupo-hoja').hidden = true;
    $('listo').hidden = true;
    mostrarError('error-archivo', '');
    renderCampana();
    cargarPublicado();
    renderRevision();
  }

  function cargarPublicado() {
    var c = estado.campana;
    $('estado-actual').textContent = 'Buscando datos publicados de ' + c.nombre + '…';
    VC.cargarSobre(c).then(function (sobre) {
      if (c !== estado.campana) return;
      estado.sobrePublicado = sobre;
      $('estado-actual').textContent = sobre
        ? 'Hay datos publicados de ' + c.nombre + ' (escribe el código para ver los cambios)'
        : 'Todavía no hay datos publicados de ' + c.nombre;
      compararConPublicado();
    });
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
    var c = estado.campana;
    var codigo = $('codigo').value;
    if (!estado.sobrePublicado || !codigoValido().ok || estado.codigoComparado === codigo) return;
    estado.codigoComparado = codigo;
    VC.cripto.descifrar(estado.sobrePublicado, codigo)
      .then(function (datos) {
        if (estado.codigoComparado !== codigo || c !== estado.campana) return;
        estado.publicados = (datos.filas || []).map(VC.migrarFila);
        $('estado-actual').textContent = 'Publicado en ' + c.nombre + ': ' + VC.plural(estado.publicados.length, 'registro', 'registros') +
          (datos.generado ? ' · ' + VC.formatearFechaHora(datos.generado) : '');
      })
      .catch(function () {
        if (estado.codigoComparado === codigo) estado.publicados = null;
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
    var c = estado.campana;
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
    (esTexto ? archivo.text() : archivo.arrayBuffer())
      .then(function (contenido) {
        var libro = esTexto
          ? XLSX.read(contenido, { type: 'string', raw: true })
          : XLSX.read(contenido, { type: 'array' });
        estado.hojas = libro.SheetNames.map(function (nombre) {
          return { nombre: nombre, filas: XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: false, defval: '', blankrows: false }) };
        }).filter(function (hoja) { return VC.importacion.hojaValida(c, hoja.filas); });

        if (!estado.hojas.length) {
          var otra = VC.CAMPANAS.filter(function (x) { return x !== c; }).find(function (x) {
            return libro.SheetNames.some(function (n) {
              return VC.importacion.hojaValida(x, XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: false, defval: '', blankrows: false }));
            });
          });
          mostrarError('error-archivo', 'Ninguna hoja de "' + archivo.name + '" tiene las columnas de ' + c.nombre + '.' +
            (otra ? ' Parece un archivo de ' + otra.nombre + ': cambia la campaña arriba.' : ' Revisa que la fila de títulos esté entre las primeras 15.'));
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
    estado.importacion = hoja ? VC.importacion.importar(estado.campana, hoja.nombre, hoja.filas) : null;
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
    var porCourier = new Map();
    filas.forEach(function (f) { if (f.courier) porCourier.set(f.courier, (porCourier.get(f.courier) || 0) + 1); });
    var couriers = Array.from(porCourier.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 4);

    var partes = [
      h('p', { class: 'texto-suave' }, 'Hoja “' + imp.hoja + '”'),
      h('div', { class: 'cifras' },
        cifra('Registros', filas.length, 'verde'),
        cifra('Sin cobertura', filas.filter(function (f) { return !f.activo; }).length, 'rojo'),
        couriers.map(function (x) { return cifra(x[0], x[1]); }),
        cifra('Filas descartadas', imp.errores.length, imp.errores.length ? 'rojo' : null),
        cifra('Avisos', imp.avisos.length, imp.avisos.length ? 'ambar' : null),
        cifra('Repetidas', imp.duplicados, imp.duplicados ? 'ambar' : null))
    ];

    if (estado.publicados) {
      var d = VC.importacion.comparar(estado.publicados, filas);
      partes.push(h('div', { class: 'grupo' },
        h('p', null, h('strong', null, 'Cambios respecto a lo publicado: '),
          d.nuevas + ' nuevos · ' + d.eliminadas + ' eliminados · ' + d.cambiadas + ' modificados'),
        d.ejemplos.length
          ? h('ul', { class: 'lista-chica' }, d.ejemplos.map(function (x) { return h('li', null, x); }))
          : h('p', { class: 'texto-suave chico' }, 'El archivo es igual a lo publicado.'),
        d.eliminadas > estado.publicados.length * 0.2
          ? h('p', { class: 'alerta alerta-aviso' }, 'Ojo: se eliminarían ' + d.eliminadas + ' registros. Revisa que sea el archivo y la hoja correctos.')
          : null));
    } else if (estado.sobrePublicado && codigoValido().ok) {
      partes.push(h('p', { class: 'texto-suave chico grupo' },
        'El código no abre los datos publicados de ' + estado.campana.nombre + ' (¿es un código nuevo?), así que no se muestran los cambios.'));
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
    var c = estado.campana;
    if (!imp || imp.error || !codigoValido().ok) return;

    var boton = $('btn-generar');
    boton.disabled = true;
    boton.textContent = 'Cifrando…';
    mostrarError('error-generar', '');

    var datos = {
      campana: c.id,
      generado: new Date().toISOString(),
      archivo: estado.archivo ? estado.archivo.name : '',
      hoja: imp.hoja,
      filas: imp.filas
    };

    VC.cripto.cifrar(datos, $('codigo').value)
      .then(function (sobre) {
        var contenido =
          '/* Validador de Cobertura — campaña ' + c.nombre + ' — datos cifrados. Generado con admin.html el ' +
          new Date().toLocaleString('es-CL') + '.\n   No editar a mano: vuelve a generarlo desde admin.html. */\n' +
          'window.' + c.variable + ' = ' + JSON.stringify(sobre) + ';\n';
        descargar(nombreSalida(c), contenido);
        $('archivo-descargado').textContent = nombreSalida(c);
        $('listo').hidden = false;
      })
      .catch(function (err) {
        mostrarError('error-generar', 'No se pudo generar el archivo: ' + (err && err.message ? err.message : err));
      })
      .finally(function () {
        boton.textContent = 'Generar ' + nombreSalida(c);
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

  renderCampana();
  cargarPublicado();
})();

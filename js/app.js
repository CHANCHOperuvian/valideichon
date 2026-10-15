(function () {
  'use strict';

  var h = VC.h;
  var $ = function (id) { return document.getElementById(id); };
  var LIMITE_RESULTADOS = 60;
  var ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];
  var AVISO_SIN_BUSQUEDA = 'La ubicación en el mapa funciona en la página publicada (GitHub Pages). ' +
    'Abierta directamente desde el archivo, el servicio de mapas no responde.';

  var estado = {
    campana: VC.campana(VC.almacen.leer('campana')),
    porCampana: {},       // id → { datos, buscador }
    codigoSesion: null,   // último código que funcionó (se prueba en las otras campañas)
    consulta: '',
    filtros: {},
    resultado: { filas: [], total: 0, aproximado: false },
    indice: 0,
    elegido: null,
    puntoLugar: null,
    cliente: null,
    mapa: null
  };

  function buscadorActual() {
    var c = estado.porCampana[estado.campana.id];
    return c ? c.buscador : null;
  }

  // ─────────────────────────── Campañas ───────────────────────────

  function renderSelectorCampanas() {
    var nav = $('selector-campanas');
    nav.replaceChildren.apply(nav, VC.CAMPANAS.map(function (c) {
      var activa = c.id === estado.campana.id;
      return h('button', {
        type: 'button',
        class: 'campana' + (activa ? ' campana-activa' : ''),
        'aria-pressed': activa ? 'true' : 'false',
        title: 'Campaña ' + c.nombre,
        onclick: function () { if (!activa) cambiarCampana(c.id); }
      }, VC.bandera(c.id), h('span', { class: 'campana-nombre' }, c.nombre));
    }));
  }

  function aplicarTextosCampana() {
    var c = estado.campana;
    document.body.setAttribute('data-campana', c.id);
    document.title = 'Validador de Cobertura · ' + c.nombre;
    $('marca-campana').replaceChildren(VC.bandera(c.id), c.nombre);
    $('etiqueta-buscar').textContent = c.textoBusqueda;
    $('buscar').placeholder = c.ejemploBusqueda;
    $('direccion').placeholder = c.ejemploDireccion;
    $('leyenda-lugar').textContent = c.etiquetas.lugar + ' elegida';
    $('pie-texto').textContent = 'Campaña ' + c.nombre + ' · Fechas estimadas con días hábiles, feriados de ' + c.pais +
      ' y días de reparto. El día cambia a las ' + VC.horaDeCorteLocal() + ' (00:00 UTC).';
  }

  function cambiarCampana(id) {
    estado.campana = VC.campana(id);
    VC.almacen.guardar('campana', estado.campana.id);
    estado.consulta = '';
    estado.filtros = {};
    estado.elegido = null;
    estado.cliente = null;
    estado.puntoLugar = null;
    $('buscar').value = '';
    $('direccion').value = '';
    $('opciones-direccion').replaceChildren();
    $('info-mapa').replaceChildren();
    renderSelectorCampanas();
    aplicarTextosCampana();
    abrirCampana();
  }

  // ─────────────────────────── Carga y código de acceso ───────────────────────────

  function mostrarPantalla(nombre) {
    ['cargando', 'codigo', 'sin-datos', 'principal'].forEach(function (p) {
      $('pantalla-' + p).hidden = p !== nombre;
    });
    $('btn-bloquear').hidden = nombre !== 'principal';
  }

  function codigosConocidos(campana) {
    var lista = [VC.almacen.leer('codigo:' + campana.id), estado.codigoSesion];
    VC.CAMPANAS.forEach(function (c) { lista.push(VC.almacen.leer('codigo:' + c.id)); });
    lista.push(VC.almacen.leer('codigo')); // versión anterior
    return lista.filter(function (x, i) { return x && lista.indexOf(x) === i; });
  }

  function abrirCampana() {
    var campana = estado.campana;
    if (estado.porCampana[campana.id]) {
      mostrarPrincipal();
      return;
    }
    if (!VC.cripto.disponible()) {
      $('titulo-sin-datos').textContent = 'Navegador no compatible';
      $('detalle-sin-datos').textContent = 'Este navegador no permite descifrar los datos. Usa Chrome, Edge o Firefox actualizados.';
      mostrarPantalla('sin-datos');
      return;
    }

    mostrarPantalla('cargando');
    $('estado-datos').textContent = 'Cargando ' + campana.nombre + '…';

    VC.cargarSobre(campana).then(function (sobre) {
      if (campana !== estado.campana) return;
      if (!sobre) {
        $('estado-datos').textContent = 'Sin datos publicados';
        $('titulo-sin-datos').textContent = 'Todavía no hay datos de ' + campana.nombre;
        $('detalle-sin-datos').replaceChildren(
          'No se encontró el archivo ', h('code', null, campana.archivo), '. El administrador debe generarlo en ',
          h('a', { href: 'admin.html' }, 'Administración'), ' y subirlo a la carpeta ', h('code', null, 'datos'), ' del repositorio.');
        mostrarPantalla('sin-datos');
        return;
      }

      // Probar en silencio los códigos ya conocidos (el mismo código puede servir para varias campañas).
      var codigos = codigosConocidos(campana);
      var intentar = function (i) {
        if (i >= codigos.length) return pedirCodigo();
        return abrir(campana, sobre, codigos[i]).catch(function () { return intentar(i + 1); });
      };
      return intentar(0);
    });
  }

  function pedirCodigo() {
    $('titulo-codigo').replaceChildren(VC.bandera(estado.campana.id), ' Código de la campaña ' + estado.campana.nombre);
    $('estado-datos').textContent = 'Datos protegidos';
    $('error-codigo').hidden = true;
    mostrarPantalla('codigo');
    $('codigo').focus();
  }

  function abrir(campana, sobre, codigo) {
    return VC.cripto.descifrar(sobre, codigo).then(function (datos) {
      if (!datos || !Array.isArray(datos.filas)) throw new Error('formato');
      var filas = datos.filas.map(VC.migrarFila);
      estado.porCampana[campana.id] = { datos: datos, buscador: new VC.Buscador(filas) };
      estado.codigoSesion = codigo;
      if (campana === estado.campana) mostrarPrincipal();
    });
  }

  function mostrarPrincipal() {
    var c = estado.porCampana[estado.campana.id];
    $('estado-datos').textContent = VC.plural(c.buscador.total, 'registro', 'registros') +
      (c.datos.generado ? ' · actualizado ' + VC.formatearFechaHora(c.datos.generado) : '');
    mostrarPantalla('principal');
    poblarFiltros();
    prepararMapa();
    if (estado.mapa) {
      estado.mapa.ajustarTamano();
      estado.mapa.usarCampana(estado.campana);
    }
    actualizar();
    $('buscar').focus();
  }

  $('form-codigo').addEventListener('submit', function (e) {
    e.preventDefault();
    var codigo = $('codigo').value.trim();
    var error = $('error-codigo');
    if (!codigo) {
      error.textContent = 'Escribe el código.';
      error.hidden = false;
      return;
    }
    var campana = estado.campana;
    var boton = $('btn-entrar');
    boton.disabled = true;
    boton.textContent = 'Verificando…';
    error.hidden = true;

    VC.cargarSobre(campana)
      .then(function (sobre) { return abrir(campana, sobre, codigo); })
      .then(function () {
        if ($('recordar').checked) VC.almacen.guardar('codigo:' + campana.id, codigo);
        $('codigo').value = '';
      })
      .catch(function (err) {
        error.textContent = err.message === 'codigo'
          ? 'Código incorrecto para ' + campana.nombre + '.'
          : err.message === 'navegador'
            ? 'Tu navegador es muy antiguo. Actualiza Chrome o Edge.'
            : 'El archivo de datos está dañado. Avisa al administrador.';
        error.hidden = false;
        $('codigo').select();
      })
      .finally(function () {
        boton.disabled = false;
        boton.textContent = 'Entrar';
      });
  });

  $('btn-bloquear').addEventListener('click', function () {
    VC.CAMPANAS.forEach(function (c) { VC.almacen.borrar('codigo:' + c.id); });
    VC.almacen.borrar('codigo');
    window.location.reload();
  });

  // ─────────────────────────── Filtros ───────────────────────────

  /** Crea los filtros de la campaña. Cada uno muestra solo opciones compatibles con los anteriores. */
  function poblarFiltros() {
    var b = buscadorActual();
    var c = estado.campana;
    var contenedor = $('filtros');
    var previos = {};
    var elementos = [];

    c.filtros.forEach(function (filtro) {
      var opciones = b.opciones(filtro.campo, previos);
      if (opciones.length < 2 && !estado.filtros[filtro.campo]) {
        previos[filtro.campo] = estado.filtros[filtro.campo];
        return; // un filtro con una sola opción no sirve
      }
      var select = h('select', { class: 'campo', 'aria-label': 'Filtrar por ' + filtro.etiqueta.toLowerCase() },
        h('option', { value: '' }, filtro.etiqueta));
      opciones.forEach(function (v) {
        select.appendChild(h('option', { value: v, selected: v === estado.filtros[filtro.campo] }, v));
      });
      select.addEventListener('change', function () {
        estado.filtros[filtro.campo] = select.value || undefined;
        // Los filtros que dependen de este se reinician.
        var posterior = false;
        c.filtros.forEach(function (f) {
          if (posterior) estado.filtros[f.campo] = undefined;
          if (f.campo === filtro.campo) posterior = true;
        });
        poblarFiltros();
        actualizar();
      });
      elementos.push(select);
      previos[filtro.campo] = estado.filtros[filtro.campo];
    });

    var hayInactivas = b.filas.some(function (f) { return !f.activo; });
    if (hayInactivas) {
      var casilla = h('input', { type: 'checkbox', id: 'filtro-activas', checked: Boolean(estado.filtros.soloActivas) });
      casilla.addEventListener('change', function () {
        estado.filtros.soloActivas = casilla.checked || undefined;
        actualizar();
      });
      elementos.push(h('label', { class: 'casilla casilla-caja' }, casilla, 'Solo con cobertura'));
    }
    contenedor.replaceChildren.apply(contenedor, elementos);
  }

  $('btn-quitar-filtros').addEventListener('click', function () {
    estado.filtros = {};
    poblarFiltros();
    actualizar();
  });

  // ─────────────────────────── Búsqueda ───────────────────────────

  function hayFiltros() {
    return Object.keys(estado.filtros).some(function (k) { return estado.filtros[k]; });
  }

  /** Recalcula la búsqueda y vuelve a elegir el primer resultado. */
  function actualizar() {
    var b = buscadorActual();
    if (!b) return;
    estado.resultado = b.buscar(estado.consulta, estado.filtros, LIMITE_RESULTADOS);
    estado.indice = 0;
    $('btn-quitar-filtros').hidden = !hayFiltros();
    $('btn-limpiar').hidden = !estado.consulta;
    $('atajo').hidden = Boolean(estado.consulta);
    renderResultados();
    elegir(estado.resultado.filas[0] || null, 0, { sinDesplazar: true });
  }

  var temporizadorBusqueda = null;
  $('buscar').addEventListener('input', function (e) {
    estado.consulta = e.target.value;
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(actualizar, 60);
  });

  $('buscar').addEventListener('keydown', function (e) {
    var total = estado.resultado.filas.length;
    if (e.key === 'ArrowDown' && total) {
      e.preventDefault();
      var i = Math.min(estado.indice + 1, total - 1);
      elegir(estado.resultado.filas[i], i, { desdeTeclado: true });
    } else if (e.key === 'ArrowUp' && total) {
      e.preventDefault();
      var k = Math.max(estado.indice - 1, 0);
      elegir(estado.resultado.filas[k], k, { desdeTeclado: true });
    } else if (e.key === 'Escape') {
      limpiarBusqueda();
    }
  });

  function limpiarBusqueda() {
    $('buscar').value = '';
    estado.consulta = '';
    actualizar();
    $('buscar').focus();
  }
  $('btn-limpiar').addEventListener('click', limpiarBusqueda);

  document.addEventListener('keydown', function (e) {
    var etiqueta = e.target.tagName;
    if (e.key === '/' && etiqueta !== 'INPUT' && etiqueta !== 'TEXTAREA' && etiqueta !== 'SELECT' && !$('pantalla-principal').hidden) {
      e.preventDefault();
      $('buscar').focus();
      $('buscar').select();
    }
  });

  // ─────────────────────────── Resultados ───────────────────────────

  function insigniaCourier(courier) {
    var clase = courier === 'Contraentrega' ? 'insignia-contra' : courier === 'Blue Express' ? 'insignia-blue' : 'insignia-neutra';
    return h('span', { class: 'insignia ' + clase }, courier);
  }

  function insigniaEstado(fila) {
    if (!fila.activo) return h('span', { class: 'insignia insignia-inactiva' }, 'Sin cobertura');
    return fila.courier ? insigniaCourier(fila.courier) : h('span', { class: 'insignia insignia-cubre' }, 'Con cobertura');
  }

  function ubicacionTexto(fila) {
    return [fila.zona, fila.zona && fila.provincia && fila.provincia !== fila.zona ? fila.provincia : null, fila.region]
      .filter(Boolean).join(' · ');
  }

  function renderResultados() {
    var panel = $('panel-resultados');
    var r = estado.resultado;
    var b = buscadorActual();

    if (!estado.consulta.trim() && !hayFiltros()) {
      panel.replaceChildren(vacio('Escribe para validar la cobertura',
        'Hay ' + VC.plural(b.total, 'registro', 'registros') + ' de ' + estado.campana.nombre +
        '. También puedes usar los filtros o ubicar la dirección del cliente.'));
      return;
    }
    if (r.total === 0) {
      panel.replaceChildren(vacio('No encontramos “' + estado.consulta.trim() + '”',
        'Revisa la ortografía, prueba con el nivel superior o quita los filtros. Si no aparece, no está en la matriz de cobertura de ' + estado.campana.nombre + '.'));
      return;
    }

    var lista = h('ul', { class: 'resultados', id: 'lista-resultados' });
    r.filas.forEach(function (fila, i) {
      lista.appendChild(h('li', null,
        h('button', {
          type: 'button',
          class: 'resultado' + (fila.activo ? '' : ' resultado-inactivo'),
          'data-indice': i,
          onclick: function () { elegir(fila, i); }
        },
          h('span', { class: 'resultado-texto' },
            h('span', { class: 'resultado-nombre' }, fila.lugar),
            h('span', { class: 'resultado-lugar' }, ubicacionTexto(fila))),
          h('span', { class: 'resultado-extra' },
            insigniaEstado(fila),
            fila.activo && fila.tiempo !== null && fila.tiempo !== undefined
              ? h('span', { class: 'texto-suave chico' }, VC.plural(fila.tiempo, 'día', 'días')) : null))));
    });

    panel.replaceChildren(h('div', { class: 'resultados-cabecera' },
      h('strong', null, VC.plural(r.total, 'resultado')),
      r.total > r.filas.length ? h('span', { class: 'texto-suave' }, ' · mostrando ' + r.filas.length + ', afina la búsqueda') : null));
    if (r.aproximado) {
      panel.appendChild(h('p', { class: 'alerta alerta-aviso margen' },
        'Sin coincidencia exacta para “' + estado.consulta.trim() + '”. ¿Quisiste decir alguna de estas?'));
    }
    panel.appendChild(lista);
  }

  function vacio(titulo, texto) {
    return h('div', { class: 'vacio' }, h('p', { class: 'vacio-titulo' }, titulo), h('p', { class: 'texto-suave' }, texto));
  }

  /** Marca una fila como elegida (desde la lista, homónimos o la dirección del cliente). */
  function elegir(fila, indice, opciones) {
    opciones = opciones || {};
    estado.elegido = fila;
    estado.indice = indice;

    document.querySelectorAll('#lista-resultados .resultado').forEach(function (b) {
      var activo = fila && Number(b.getAttribute('data-indice')) === indice && estado.resultado.filas[indice] === fila;
      b.classList.toggle('resultado-elegido', Boolean(activo));
      if (activo) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      if (activo && opciones.desdeTeclado) b.scrollIntoView({ block: 'nearest' });
    });

    renderDetalle();
    ubicarEnMapa();

    if (!opciones.sinDesplazar && !opciones.desdeTeclado && window.matchMedia('(max-width: 960px)').matches) {
      $('panel-detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ─────────────────────────── Detalle ───────────────────────────

  function fechaDe(fila) {
    return fila.tiempo === null || fila.tiempo === undefined ? null : VC.calcularFechaEntrega(fila.tiempo, fila.dias, estado.campana);
  }

  function urlGoogleMaps(fila, direccion) {
    var q = [direccion, fila.lugar, fila.zona, fila.region, estado.campana.pais].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  function lugarParaCliente(fila) {
    var c = estado.campana;
    var texto = VC.enTitulo(fila.lugar);
    if (fila.zona) return texto + ', ' + c.etiquetas.zona.toLowerCase() + ' de ' + VC.enTitulo(fila.zona);
    return fila.region ? texto + ' (' + fila.region + ')' : texto;
  }

  function mensajeCliente(fila, fecha) {
    var pago = VC.reglaPago(estado.campana, fila.courier);
    var partes = ['¡Hola! Te confirmo que sí tenemos cobertura en ' + lugarParaCliente(fila) + '.'];
    var cola = (fila.courier ? ' con ' + fila.courier : '') + (pago ? ' y ' + pago.paraCliente : '') + '.';
    if (fecha) partes.push('Tu pedido llegaría aproximadamente el ' + fecha.texto + cola);
    else if (fila.courier) partes.push('El despacho se realiza' + cola);
    return partes.join(' ');
  }

  function resumenInterno(fila, fecha) {
    var c = estado.campana;
    var e = c.etiquetas;
    var pago = VC.reglaPago(c, fila.courier);
    var lineas = ['CAMPAÑA: ' + c.nombre.toUpperCase(), e.lugar.toUpperCase() + ': ' + fila.lugar];
    if (fila.zona) lineas.push(e.zona.toUpperCase() + ': ' + fila.zona);
    if (fila.provincia) lineas.push(e.provincia.toUpperCase() + ': ' + fila.provincia);
    if (fila.region) lineas.push(e.region.toUpperCase() + ': ' + fila.region);
    if (fila.barrios) lineas.push('BARRIOS: ' + fila.barrios);
    lineas.push('COBERTURA: ' + (fila.activo ? 'SÍ' : 'NO'));
    if (fila.courier) lineas.push('COURIER: ' + fila.courier);
    if (pago) lineas.push('PAGO: ' + pago.corto);
    if (fila.productos) lineas.push('PRODUCTOS: ' + fila.productos);
    if (fila.dias) lineas.push(e.dias.toUpperCase() + ': ' + fila.dias + ' (' + VC.resumirDias(VC.interpretarDiasReparto(fila.dias).dias) + ')');
    if (fila.tiempo !== null && fila.tiempo !== undefined) lineas.push('TIEMPO DE ENTREGA: ' + fila.tiempo + ' días hábiles');
    if (fecha) lineas.push('FECHA ESTIMADA: ' + fecha.textoLargo);
    if (fila.codigo) lineas.push(e.codigo.toUpperCase() + ': ' + fila.codigo);
    if (estado.cliente) lineas.push('DIRECCIÓN CLIENTE: ' + estado.cliente.nombre);
    lineas.push('MAPS: ' + urlGoogleMaps(fila, estado.cliente ? estado.cliente.nombre : ''));
    return lineas.join('\n');
  }

  function botonCopiar(texto, etiqueta, primario) {
    var boton = h('button', { type: 'button', class: 'boton ' + (primario ? 'boton-primario' : 'boton-secundario') }, etiqueta);
    boton.addEventListener('click', function () {
      VC.copiarTexto(texto).then(function (ok) {
        boton.textContent = ok ? '✓ Copiado' : 'No se pudo copiar';
        setTimeout(function () { boton.textContent = etiqueta; }, 2000);
      });
    });
    return boton;
  }

  function dato(titulo, contenido, clase) {
    return h('div', { class: 'dato' + (clase ? ' ' + clase : '') }, h('dt', null, titulo), h('dd', null, contenido));
  }

  function renderDetalle() {
    var panel = $('panel-detalle');
    var fila = estado.elegido;
    var c = estado.campana;
    if (!fila) {
      panel.replaceChildren(vacio('Elige un resultado', 'Aquí verás la cobertura, el courier, la forma de pago y la fecha estimada de entrega.'));
      return;
    }

    var fecha = fechaDe(fila);
    var pago = VC.reglaPago(c, fila.courier);
    var homonimos = buscadorActual().homonimos(fila);

    var cabecera = h('header', { class: 'detalle-cabecera' + (fila.activo ? '' : ' detalle-cabecera-inactiva') },
      h('div', { class: 'fila-insignias' },
        fila.activo ? h('span', { class: 'insignia insignia-activa' }, 'Con cobertura') : h('span', { class: 'insignia insignia-inactiva-fuerte' }, 'Sin cobertura'),
        fila.courier ? insigniaCourier(fila.courier) : null),
      h('h2', { class: 'detalle-titulo' }, fila.lugar),
      h('p', { class: 'texto-suave' }, [
        fila.zona ? c.etiquetas.zona + ' ' + fila.zona : null,
        fila.provincia && fila.provincia !== fila.zona ? 'Prov. ' + fila.provincia : null,
        fila.region
      ].filter(Boolean).join(' · ')));

    var cuerpo = h('div', { class: 'detalle-cuerpo' });

    if (!fila.activo) {
      cuerpo.appendChild(h('div', { class: 'alerta alerta-error', role: 'alert' },
        h('strong', null, 'SIN cobertura. '),
        'No tomes pedidos para esta dirección. Ofrece al cliente otra dirección de entrega con cobertura.'));
    }

    if (fila.productos) {
      var restringido = /solo|excepto|no /i.test(fila.productos);
      cuerpo.appendChild(h('div', { class: 'alerta ' + (restringido ? 'alerta-aviso' : 'alerta-ok') },
        h('strong', null, 'Productos: '), fila.productos));
    }

    if (homonimos.length) {
      cuerpo.appendChild(h('div', { class: 'alerta alerta-aviso' },
        h('strong', null, homonimos.length === 1 ? 'Hay otro registro con este nombre. ' : 'Hay ' + homonimos.length + ' registros más con este nombre. '),
        'Confirma la ubicación con el cliente:',
        h('div', { class: 'chips' }, homonimos.slice(0, 8).map(function (o) {
          return h('button', { type: 'button', class: 'chip', onclick: function () { elegir(o, -1); } },
            (o.zona || o.region) + (o.courier ? ' · ' + o.courier : '') + (o.activo ? '' : ' (sin cobertura)'));
        }))));
    }

    if (fila.activo && fecha) {
      var notas = [VC.plural(fila.tiempo, 'día hábil', 'días hábiles') + ' de tránsito'];
      if (fecha.despuesDeCorte) notas.push('pedido después de las ' + VC.horaDeCorteLocal() + ', se cuenta desde mañana');
      if (fecha.ajustadaPorReparto) notas.push('ajustada al siguiente día de reparto');
      cuerpo.appendChild(h('div', { class: 'fecha' },
        h('p', { class: 'fecha-etiqueta' }, 'Fecha estimada de entrega'),
        h('p', { class: 'fecha-valor' }, fecha.texto),
        h('p', { class: 'fecha-nota' }, notas.join(' · '))));
    }

    var datos = h('dl', { class: 'datos' });
    if (fila.courier) datos.appendChild(dato('Courier', fila.courier));
    if (pago) datos.appendChild(dato('Pago al recibir', h('span', { class: 'pago-' + pago.tono }, pago.detalle)));
    if (fila.dias) {
      var reparto = VC.interpretarDiasReparto(fila.dias);
      datos.appendChild(dato(c.etiquetas.dias, [
        h('div', { class: 'dias', 'aria-label': 'Reparto: ' + VC.resumirDias(reparto.dias) },
          ORDEN_SEMANA.map(function (i) { return h('span', { class: 'dia' + (reparto.dias[i] ? ' dia-activo' : '') }, VC.DIAS_CORTOS[i]); })),
        h('p', { class: 'texto-suave chico' }, 'Matriz: “' + fila.dias + '”' + (reparto.reconocido ? '' : ' — no se pudo interpretar, se asume lunes a viernes'))
      ], 'dato-ancho'));
    }
    if (fila.barrios) datos.appendChild(dato('Barrios', fila.barrios, 'dato-ancho'));
    if (fila.codigo || fila.siglas) {
      datos.appendChild(dato(c.etiquetas.codigo + (fila.siglas ? ' / siglas' : ''), [fila.codigo, fila.siglas].filter(Boolean).join(' · ')));
    }
    if (datos.children.length) cuerpo.appendChild(datos);

    if (fila.activo) {
      cuerpo.appendChild(h('div', { class: 'mensaje' },
        h('p', { class: 'mensaje-etiqueta' }, 'Mensaje para el cliente'),
        h('p', null, mensajeCliente(fila, fecha))));
    }

    cuerpo.appendChild(h('div', { class: 'acciones' },
      fila.activo ? botonCopiar(mensajeCliente(fila, fecha), 'Copiar mensaje', true) : null,
      botonCopiar(resumenInterno(fila, fecha), 'Copiar resumen', false),
      h('a', { class: 'boton boton-enlace', href: urlGoogleMaps(fila, estado.cliente ? estado.cliente.nombre : ''), target: '_blank', rel: 'noopener noreferrer' }, 'Abrir en Google Maps ↗')));

    panel.replaceChildren(cabecera, cuerpo);
  }

  // La fecha depende de la hora (corte de las 00:00 UTC): se refresca cada minuto.
  setInterval(function () { if (estado.elegido) renderDetalle(); }, 60 * 1000);

  // ─────────────────────────── Mapa ───────────────────────────

  function prepararMapa() {
    if (estado.mapa) return;
    estado.mapa = VC.geo.crearMapa($('mapa'));
    if (!estado.mapa) {
      $('mapa').replaceChildren(vacio('Mapa no disponible', 'No se pudo cargar el mapa (¿sin internet?). El resto del validador funciona igual.'));
      $('mapa').classList.add('mapa-sin-carga');
    }
  }

  var temporizadorMapa = null;
  function ubicarEnMapa() {
    clearTimeout(temporizadorMapa);
    var fila = estado.elegido;
    var campana = estado.campana;
    estado.puntoLugar = null;
    if (!estado.mapa) return;
    if (!fila) {
      estado.mapa.ponerLugar(null);
      renderInfoMapa();
      return;
    }
    if (!VC.geo.busquedaDisponible) {
      renderInfoMapa(AVISO_SIN_BUSQUEDA);
      return;
    }
    renderInfoMapa('Ubicando ' + fila.lugar + '…');
    // Espera a que el operador deje de moverse por la lista antes de consultar.
    temporizadorMapa = setTimeout(function () {
      VC.geo.ubicarLugar(fila, campana).then(function (punto) {
        if (estado.elegido !== fila) return;
        estado.puntoLugar = punto;
        estado.mapa.ponerLugar(punto, fila.lugar + (fila.zona ? ' (' + fila.zona + ')' : ''));
        renderInfoMapa(punto ? null : 'No se pudo ubicar ' + fila.lugar + ' en el mapa.');
      }).catch(function () {
        if (estado.elegido === fila) renderInfoMapa('No se pudo consultar el mapa (¿sin internet?).');
      });
    }, 700);
  }

  function renderInfoMapa(mensaje) {
    var info = $('info-mapa');
    var c = estado.campana;
    var partes = [];
    if (mensaje) partes.push(h('p', { class: 'texto-suave chico' }, mensaje));
    if (estado.puntoLugar && estado.puntoLugar.aproximada) {
      partes.push(h('p', { class: 'texto-suave chico' }, 'No se encontró el punto exacto; se muestra el centro de ' +
        (c.etiquetas.zona.toLowerCase() === 'zona' ? 'la zona' : 'la ' + c.etiquetas.zona.toLowerCase()) + '.'));
    }

    if (estado.cliente && estado.puntoLugar && estado.elegido) {
      var km = VC.geo.distanciaKm(estado.cliente, estado.puntoLugar);
      var lejos = km > VC.config.distanciaAvisoKm;
      partes.push(h('p', { class: 'alerta ' + (lejos ? 'alerta-aviso' : 'alerta-ok') },
        'La dirección del cliente está a ', h('strong', null, km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km'),
        ' de ' + estado.elegido.lugar + '. ',
        lejos ? 'Parece lejos: confirma con el cliente que sea el lugar correcto.' : ''));
    }

    if (estado.cliente && estado.cliente.coincidencias) {
      var co = estado.cliente.coincidencias;
      var lista = co.porLugar.concat(co.porZona.slice(0, 12));
      if (lista.length) {
        partes.push(h('div', { class: 'sugerencias' },
          h('p', { class: 'etiqueta' }, 'En la matriz para esta dirección:'),
          h('div', { class: 'chips' }, lista.map(function (f) {
            return h('button', {
              type: 'button',
              class: 'chip' + (f.activo ? '' : ' chip-inactivo') + (estado.elegido === f ? ' chip-elegido' : ''),
              onclick: function () { elegir(f, -1); renderInfoMapa(); }
            }, f.lugar + ' · ' + (f.zona || f.region) + (f.activo ? '' : ' (sin cobertura)'));
          })),
          co.porZona.length > 12 ? h('p', { class: 'texto-suave chico' }, 'y ' + (co.porZona.length - 12) + ' más; usa el buscador para afinar.') : null));
      } else {
        partes.push(h('p', { class: 'alerta alerta-aviso' },
          'Ningún registro de la matriz coincide con los nombres de esta dirección (' + estado.cliente.lugares.slice(0, 4).join(', ') +
          '). Búscalo en el buscador; si no aparece, probablemente no hay cobertura.'));
      }
    }

    info.replaceChildren.apply(info, partes);
  }

  $('form-direccion').addEventListener('submit', function (e) {
    e.preventDefault();
    var texto = $('direccion').value.trim();
    var contenedor = $('opciones-direccion');
    if (!VC.geo.busquedaDisponible) {
      contenedor.replaceChildren(h('p', { class: 'alerta alerta-aviso' }, AVISO_SIN_BUSQUEDA));
      return;
    }
    if (texto.length < 4) {
      contenedor.replaceChildren(h('p', { class: 'alerta alerta-aviso' }, 'Escribe calle, número y ' + estado.campana.etiquetas.zona.toLowerCase() + '.'));
      return;
    }
    var campana = estado.campana;
    var boton = $('btn-direccion');
    boton.disabled = true;
    boton.textContent = 'Buscando…';
    contenedor.replaceChildren();

    VC.geo.buscarDireccion(texto, 5, campana)
      .then(function (lista) {
        if (campana !== estado.campana) return;
        if (!lista.length) {
          contenedor.replaceChildren(h('p', { class: 'alerta alerta-aviso' }, 'No se encontró esa dirección. Prueba agregando la ciudad o revisa la ortografía.'));
          return;
        }
        if (lista.length === 1) {
          usarDireccion(lista[0]);
          return;
        }
        contenedor.replaceChildren(
          h('p', { class: 'etiqueta' }, '¿Cuál de estas es la dirección del cliente?'),
          h('ul', { class: 'opciones' }, lista.map(function (r) {
            return h('li', null, h('button', {
              type: 'button',
              class: 'opcion',
              onclick: function () { contenedor.replaceChildren(); usarDireccion(r); }
            }, r.nombre));
          })));
      })
      .catch(function () {
        contenedor.replaceChildren(h('p', { class: 'alerta alerta-error' }, 'No se pudo consultar el servicio de mapas. Revisa tu internet e intenta de nuevo.'));
      })
      .finally(function () {
        boton.disabled = false;
        boton.textContent = 'Ubicar';
      });
  });

  function usarDireccion(r) {
    estado.cliente = {
      lat: r.lat,
      lon: r.lon,
      nombre: r.nombre,
      lugares: r.lugares,
      coincidencias: buscadorActual().coincidenciasExactas(r.lugares)
    };
    if (estado.mapa) estado.mapa.ponerCliente(r, 'Cliente: ' + r.nombre);

    // Si aún no hay un lugar elegido (o no calza con la dirección), proponer el más probable.
    var co = estado.cliente.coincidencias;
    var mejor = co.porLugar[0] || null;
    var elegidoCalza = estado.elegido && (co.porLugar.indexOf(estado.elegido) !== -1 || co.porZona.indexOf(estado.elegido) !== -1);
    if (mejor && !elegidoCalza) elegir(mejor, -1, { sinDesplazar: true });
    else renderDetalle();
    renderInfoMapa();

    if (window.matchMedia('(max-width: 960px)').matches) {
      $('panel-mapa').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ─────────────────────────── Inicio ───────────────────────────
  renderSelectorCampanas();
  aplicarTextosCampana();
  abrirCampana();
})();

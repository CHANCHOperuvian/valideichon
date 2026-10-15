(function () {
  'use strict';

  var h = VC.h;
  var $ = function (id) { return document.getElementById(id); };
  var LIMITE_RESULTADOS = 60;
  var ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

  var estado = {
    datos: null,
    buscador: null,
    consulta: '',
    filtros: {},
    resultado: { filas: [], total: 0, aproximado: false },
    indice: 0,
    elegido: null,
    puntoLocalidad: null,
    cliente: null,
    mapa: null
  };

  // ─────────────────────────── Inicio y código de acceso ───────────────────────────

  function mostrarPantalla(nombre) {
    ['codigo', 'sin-datos', 'principal'].forEach(function (p) {
      $('pantalla-' + p).hidden = p !== nombre;
    });
    $('btn-bloquear').hidden = nombre !== 'principal';
  }

  function iniciar() {
    if (!VC.cripto.disponible()) {
      $('detalle-sin-datos').textContent = 'Este navegador no permite descifrar los datos. Usa Chrome, Edge o Firefox actualizados.';
      mostrarPantalla('sin-datos');
      return;
    }
    if (!window.VC_DATOS) {
      mostrarPantalla('sin-datos');
      return;
    }
    var guardado = VC.almacen.leer('codigo');
    if (guardado) {
      abrir(guardado).catch(function () {
        VC.almacen.borrar('codigo');
        pedirCodigo();
      });
    } else {
      pedirCodigo();
    }
  }

  function pedirCodigo() {
    mostrarPantalla('codigo');
    $('codigo').focus();
  }

  function abrir(codigo) {
    return VC.cripto.descifrar(window.VC_DATOS, codigo).then(function (datos) {
      if (!datos || !Array.isArray(datos.filas)) throw new Error('formato');
      estado.datos = datos;
      estado.buscador = new VC.Buscador(datos.filas);
      $('estado-datos').textContent = VC.plural(datos.filas.length, 'localidad', 'localidades') +
        (datos.generado ? ' · actualizado ' + VC.formatearFechaHora(datos.generado) : '');
      poblarFiltros();
      mostrarPantalla('principal');
      prepararMapa();
      actualizar();
      $('buscar').focus();
    });
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
    var boton = $('btn-entrar');
    boton.disabled = true;
    boton.textContent = 'Verificando…';
    error.hidden = true;

    abrir(codigo)
      .then(function () {
        if ($('recordar').checked) VC.almacen.guardar('codigo', codigo);
        $('codigo').value = '';
      })
      .catch(function (err) {
        error.textContent = err.message === 'codigo'
          ? 'Código incorrecto.'
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
    VC.almacen.borrar('codigo');
    window.location.reload();
  });

  // ─────────────────────────── Búsqueda y filtros ───────────────────────────

  function opciones(select, textoTodos, valores, seleccionado) {
    select.replaceChildren(h('option', { value: '' }, textoTodos));
    valores.forEach(function (v) {
      select.appendChild(h('option', { value: v, selected: v === seleccionado }, v));
    });
  }

  function poblarFiltros() {
    var b = estado.buscador;
    opciones($('filtro-region'), 'Región (todas)', b.regiones, estado.filtros.region);
    poblarComunas();
    opciones($('filtro-courier'), 'Courier (todos)', b.couriers, estado.filtros.courier);
  }

  function poblarComunas() {
    var b = estado.buscador;
    var lista = estado.filtros.region ? (b.comunasPorRegion.get(estado.filtros.region) || []) : b.todasLasComunas;
    opciones($('filtro-comuna'), 'Comuna (todas)', lista, estado.filtros.comuna);
  }

  /** Recalcula la búsqueda y vuelve a elegir el primer resultado. */
  function actualizar() {
    if (!estado.buscador) return;
    estado.resultado = estado.buscador.buscar(estado.consulta, estado.filtros, LIMITE_RESULTADOS);
    estado.indice = 0;
    var hayFiltros = Boolean(estado.filtros.region || estado.filtros.comuna || estado.filtros.courier || estado.filtros.soloActivas);
    $('btn-quitar-filtros').hidden = !hayFiltros;
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

  $('filtro-region').addEventListener('change', function (e) {
    estado.filtros.region = e.target.value || undefined;
    estado.filtros.comuna = undefined;
    poblarComunas();
    actualizar();
  });
  $('filtro-comuna').addEventListener('change', function (e) {
    estado.filtros.comuna = e.target.value || undefined;
    actualizar();
  });
  $('filtro-courier').addEventListener('change', function (e) {
    estado.filtros.courier = e.target.value || undefined;
    actualizar();
  });
  $('filtro-activas').addEventListener('change', function (e) {
    estado.filtros.soloActivas = e.target.checked || undefined;
    actualizar();
  });
  $('btn-quitar-filtros').addEventListener('click', function () {
    estado.filtros = {};
    $('filtro-activas').checked = false;
    poblarFiltros();
    actualizar();
  });

  $('ir-direccion').addEventListener('click', function (e) {
    e.preventDefault();
    $('panel-mapa').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('direccion').focus({ preventScroll: true });
  });

  // ─────────────────────────── Resultados ───────────────────────────

  function insigniaCourier(courier) {
    var clase = courier === VC.config.courierContra ? 'insignia-contra'
      : courier === VC.config.courierBlue ? 'insignia-blue' : 'insignia-neutra';
    return h('span', { class: 'insignia ' + clase }, courier || 'Sin courier');
  }

  function renderResultados() {
    var panel = $('panel-resultados');
    var r = estado.resultado;
    var hayBusqueda = estado.consulta.trim() || estado.filtros.region || estado.filtros.comuna || estado.filtros.courier || estado.filtros.soloActivas;

    if (!hayBusqueda) {
      panel.replaceChildren(vacio('Escribe una localidad para validar la cobertura',
        'Hay ' + VC.plural(estado.buscador.total, 'localidad', 'localidades') +
        ' cargadas. También puedes usar los filtros para ver una comuna completa.'));
      return;
    }
    if (r.total === 0) {
      panel.replaceChildren(vacio('No encontramos “' + estado.consulta.trim() + '”',
        'Revisa la ortografía, prueba solo con la comuna o quita los filtros. Si no aparece, la localidad no está en la matriz de cobertura.'));
      return;
    }

    var cabecera = h('div', { class: 'resultados-cabecera' },
      h('strong', null, VC.plural(r.total, 'resultado')),
      r.total > r.filas.length ? h('span', { class: 'texto-suave' }, ' · mostrando ' + r.filas.length + ', afina la búsqueda') : null);

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
            h('span', { class: 'resultado-nombre' }, fila.localidad),
            h('span', { class: 'resultado-lugar' }, fila.comuna + ' · ' + fila.region)),
          h('span', { class: 'resultado-extra' },
            fila.activo ? insigniaCourier(fila.courier) : h('span', { class: 'insignia insignia-inactiva' }, 'Inactiva'),
            fila.activo && fila.tiempoEntrega !== null ? h('span', { class: 'texto-suave chico' }, VC.plural(fila.tiempoEntrega, 'día', 'días')) : null))));
    });

    panel.replaceChildren(cabecera);
    if (r.aproximado) {
      panel.appendChild(h('p', { class: 'alerta alerta-aviso margen' },
        'Sin coincidencia exacta para “' + estado.consulta.trim() + '”. ¿Quisiste decir alguna de estas?'));
    }
    panel.appendChild(lista);
  }

  function vacio(titulo, texto) {
    return h('div', { class: 'vacio' }, h('p', { class: 'vacio-titulo' }, titulo), h('p', { class: 'texto-suave' }, texto));
  }

  /** Marca una localidad como elegida (desde la lista, homónimos o la dirección del cliente). */
  function elegir(fila, indice, opciones) {
    opciones = opciones || {};
    estado.elegido = fila;
    estado.indice = indice;

    var botones = document.querySelectorAll('#lista-resultados .resultado');
    botones.forEach(function (b) {
      var activo = fila && Number(b.getAttribute('data-indice')) === indice && estado.resultado.filas[indice] === fila;
      b.classList.toggle('resultado-elegido', Boolean(activo));
      if (activo) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      if (activo && opciones.desdeTeclado) b.scrollIntoView({ block: 'nearest' });
    });

    renderDetalle();
    ubicarLocalidadEnMapa();

    if (!opciones.sinDesplazar && !opciones.desdeTeclado && window.matchMedia('(max-width: 960px)').matches) {
      $('panel-detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ─────────────────────────── Detalle ───────────────────────────

  function fechaDe(fila) {
    return fila.tiempoEntrega === null ? null : VC.calcularFechaEntrega(fila.tiempoEntrega, fila.diasReparto);
  }

  function urlGoogleMaps(fila, direccion) {
    var q = [direccion, fila.localidad, fila.comuna, fila.region, 'Chile'].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  function mensajeCliente(fila, fecha) {
    var pago = VC.reglaPago(fila.courier);
    var lugar = VC.enTitulo(fila.localidad) + ', comuna de ' + VC.enTitulo(fila.comuna);
    var llegada = fecha ? 'Tu pedido llegaría aproximadamente el ' + fecha.texto : 'Tu pedido se despacha';
    return '¡Hola! Te confirmo que sí tenemos cobertura en ' + lugar + '. ' + llegada +
      (fila.courier ? ' con ' + fila.courier : '') + ' y ' + pago.paraCliente + '.';
  }

  function resumenInterno(fila, fecha) {
    var reparto = VC.interpretarDiasReparto(fila.diasReparto);
    var lineas = [
      'LOCALIDAD: ' + fila.localidad,
      'COMUNA: ' + fila.comuna,
      'REGIÓN: ' + fila.region,
      'COBERTURA: ' + (fila.activo ? 'ACTIVA' : 'INACTIVA'),
      'COURIER: ' + (fila.courier || '-'),
      'PAGO: ' + VC.reglaPago(fila.courier).corto,
      'DÍAS DE REPARTO: ' + (fila.diasReparto || '-') + ' (' + VC.resumirDias(reparto.dias) + ')',
      'TIEMPO DE ENTREGA: ' + (fila.tiempoEntrega === null ? '-' : fila.tiempoEntrega + ' días hábiles'),
      'FECHA ESTIMADA: ' + (fecha ? fecha.textoLargo : '-'),
      'CÓDIGO POSTAL: ' + (fila.zipcode || '-')
    ];
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
    return h('div', { class: 'dato' + (clase ? ' ' + clase : '') },
      h('dt', null, titulo),
      h('dd', null, contenido));
  }

  function renderDetalle() {
    var panel = $('panel-detalle');
    var fila = estado.elegido;
    if (!fila) {
      panel.replaceChildren(vacio('Elige una localidad', 'Aquí verás la cobertura, el courier, la forma de pago y la fecha estimada de entrega.'));
      return;
    }

    var fecha = fechaDe(fila);
    var pago = VC.reglaPago(fila.courier);
    var reparto = VC.interpretarDiasReparto(fila.diasReparto);
    var homonimos = estado.buscador.homonimos(fila);

    var cabecera = h('header', { class: 'detalle-cabecera' + (fila.activo ? '' : ' detalle-cabecera-inactiva') },
      h('div', { class: 'fila-insignias' },
        fila.activo ? h('span', { class: 'insignia insignia-activa' }, 'Activa') : h('span', { class: 'insignia insignia-inactiva-fuerte' }, 'Inactiva'),
        insigniaCourier(fila.courier)),
      h('h2', { class: 'detalle-titulo' }, fila.localidad),
      h('p', { class: 'texto-suave' },
        fila.comuna + (fila.provincia && fila.provincia !== fila.comuna ? ' · Prov. ' + fila.provincia : '') + ' · ' + fila.region));

    var cuerpo = h('div', { class: 'detalle-cuerpo' });

    if (!fila.activo) {
      cuerpo.appendChild(h('div', { class: 'alerta alerta-error', role: 'alert' },
        h('strong', null, 'Localidad SIN cobertura (inactiva). '),
        'No tomes pedidos para esta localidad. Ofrece al cliente otra dirección de entrega con cobertura.'));
    }

    if (homonimos.length) {
      cuerpo.appendChild(h('div', { class: 'alerta alerta-aviso' },
        h('strong', null, homonimos.length === 1 ? 'Hay otra localidad con este nombre. ' : 'Hay ' + homonimos.length + ' localidades más con este nombre. '),
        'Confirma la comuna con el cliente:',
        h('div', { class: 'chips' }, homonimos.slice(0, 8).map(function (o) {
          return h('button', { type: 'button', class: 'chip', onclick: function () { elegir(o, -1); } },
            o.comuna + ' (' + (o.courier || 'sin courier') + (o.activo ? '' : ', inactiva') + ')');
        }))));
    }

    if (fila.activo) {
      var notas = [];
      if (fila.tiempoEntrega !== null) notas.push(VC.plural(fila.tiempoEntrega, 'día hábil', 'días hábiles') + ' de tránsito');
      if (fecha && fecha.despuesDeCorte) notas.push('pedido después de las ' + VC.config.horaCorte + ':00, se cuenta desde mañana');
      if (fecha && fecha.ajustadaPorReparto) notas.push('ajustada al siguiente día de reparto');
      cuerpo.appendChild(h('div', { class: 'fecha' },
        h('p', { class: 'fecha-etiqueta' }, 'Fecha estimada de entrega'),
        h('p', { class: 'fecha-valor' }, fecha ? fecha.texto : 'Sin tiempo de entrega en la matriz'),
        h('p', { class: 'fecha-nota' }, fecha ? notas.join(' · ') : 'Consulta con tu teamleader.')));
    }

    var dias = h('div', { class: 'dias', 'aria-label': 'Reparto: ' + VC.resumirDias(reparto.dias) },
      ORDEN_SEMANA.map(function (i) {
        return h('span', { class: 'dia' + (reparto.dias[i] ? ' dia-activo' : '') }, VC.DIAS_CORTOS[i]);
      }));

    cuerpo.appendChild(h('dl', { class: 'datos' },
      dato('Courier', fila.courier || 'Sin dato'),
      dato('Pago al recibir', h('span', { class: 'pago-' + pago.tono }, pago.detalle)),
      dato('Días de reparto', [dias, h('p', { class: 'texto-suave chico' },
        'Matriz: “' + (fila.diasReparto || 'sin dato') + '”' + (reparto.reconocido ? '' : ' — no se pudo interpretar, se asume lunes a viernes'))], 'dato-ancho'),
      fila.zipcode || fila.siglas ? dato('Código postal / siglas', (fila.zipcode || '-') + ' · ' + (fila.siglas || '-'), 'dato-ancho') : null));

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

  // La fecha depende de la hora (corte de las 15:00): se refresca cada minuto.
  setInterval(function () { if (estado.elegido) renderDetalle(); }, 60 * 1000);

  // ─────────────────────────── Mapa ───────────────────────────

  function prepararMapa() {
    if (estado.mapa) return;
    estado.mapa = VC.geo.crearMapa($('mapa'));
    if (!estado.mapa) {
      $('mapa').replaceChildren(vacio('Mapa no disponible', 'No se pudo cargar el mapa (¿sin internet?). El resto del validador funciona igual.'));
      $('mapa').classList.add('mapa-sin-carga');
    } else {
      setTimeout(function () { estado.mapa.ajustarTamano(); }, 0);
    }
  }

  var AVISO_SIN_BUSQUEDA = 'La ubicación en el mapa funciona en la página publicada (GitHub Pages). ' +
    'Abierta directamente desde el archivo, el servicio de mapas no responde.';
  var temporizadorMapa = null;
  function ubicarLocalidadEnMapa() {
    clearTimeout(temporizadorMapa);
    var fila = estado.elegido;
    estado.puntoLocalidad = null;
    if (!estado.mapa) return;
    if (!fila) {
      estado.mapa.ponerLocalidad(null);
      renderInfoMapa();
      return;
    }
    if (!VC.geo.busquedaDisponible) {
      renderInfoMapa(AVISO_SIN_BUSQUEDA);
      return;
    }
    renderInfoMapa('Ubicando ' + fila.localidad + '…');
    // Espera a que el operador deje de moverse por la lista antes de consultar.
    temporizadorMapa = setTimeout(function () {
      VC.geo.ubicarLocalidad(fila).then(function (punto) {
        if (estado.elegido !== fila) return;
        estado.puntoLocalidad = punto;
        estado.mapa.ponerLocalidad(punto, fila.localidad + ' (' + fila.comuna + ')');
        renderInfoMapa(punto ? null : 'No se pudo ubicar ' + fila.localidad + ' en el mapa.');
      }).catch(function () {
        if (estado.elegido === fila) renderInfoMapa('No se pudo consultar el mapa (¿sin internet?).');
      });
    }, 700);
  }

  function renderInfoMapa(mensaje) {
    var info = $('info-mapa');
    var partes = [];
    if (mensaje) partes.push(h('p', { class: 'texto-suave chico' }, mensaje));
    if (estado.puntoLocalidad && estado.puntoLocalidad.aproximada) {
      partes.push(h('p', { class: 'texto-suave chico' }, 'No se encontró el punto exacto de la localidad; se muestra el centro de la comuna.'));
    }

    if (estado.cliente && estado.puntoLocalidad && estado.elegido) {
      var km = VC.geo.distanciaKm(estado.cliente, estado.puntoLocalidad);
      var lejos = km > VC.config.distanciaAvisoKm;
      partes.push(h('p', { class: 'alerta ' + (lejos ? 'alerta-aviso' : 'alerta-ok') },
        'La dirección del cliente está a ', h('strong', null, km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km'),
        ' de ' + estado.elegido.localidad + '. ',
        lejos ? 'Parece lejos: confirma con el cliente que la localidad sea la correcta.' : ''));
    }

    if (estado.cliente && estado.cliente.coincidencias) {
      var c = estado.cliente.coincidencias;
      var lista = c.porLocalidad.concat(c.porComuna.slice(0, 12));
      if (lista.length) {
        partes.push(h('div', { class: 'sugerencias' },
          h('p', { class: 'etiqueta' }, 'Localidades de la matriz para esta dirección:'),
          h('div', { class: 'chips' }, lista.map(function (f) {
            return h('button', {
              type: 'button',
              class: 'chip' + (f.activo ? '' : ' chip-inactivo') + (estado.elegido === f ? ' chip-elegido' : ''),
              onclick: function () { elegir(f, -1); renderInfoMapa(); }
            }, f.localidad + ' · ' + f.comuna + (f.activo ? '' : ' (inactiva)'));
          })),
          c.porComuna.length > 12 ? h('p', { class: 'texto-suave chico' }, 'y ' + (c.porComuna.length - 12) + ' más en la comuna; usa el buscador para afinar.') : null));
      } else {
        partes.push(h('p', { class: 'alerta alerta-aviso' },
          'Ninguna localidad de la matriz coincide con los nombres de esta dirección (' + estado.cliente.lugares.slice(0, 4).join(', ') +
          '). Búscala por comuna en el buscador; si no aparece, probablemente no hay cobertura.'));
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
      contenedor.replaceChildren(h('p', { class: 'alerta alerta-aviso' }, 'Escribe calle, número y comuna.'));
      return;
    }
    var boton = $('btn-direccion');
    boton.disabled = true;
    boton.textContent = 'Buscando…';
    contenedor.replaceChildren();

    VC.geo.buscarDireccion(texto, 5)
      .then(function (lista) {
        if (!lista.length) {
          contenedor.replaceChildren(h('p', { class: 'alerta alerta-aviso' }, 'No se encontró esa dirección. Prueba agregando la comuna o revisa la ortografía.'));
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
        boton.textContent = 'Buscar';
      });
  });

  function usarDireccion(r) {
    estado.cliente = {
      lat: r.lat,
      lon: r.lon,
      nombre: r.nombre,
      lugares: r.lugares,
      coincidencias: estado.buscador.coincidenciasExactas(r.lugares)
    };
    if (estado.mapa) estado.mapa.ponerCliente(r, 'Cliente: ' + r.nombre);

    // Si aún no hay localidad elegida (o no calza), proponer la más probable.
    var c = estado.cliente.coincidencias;
    var mejor = c.porLocalidad[0] || null;
    var elegidoCalza = estado.elegido && (c.porLocalidad.indexOf(estado.elegido) !== -1 || c.porComuna.indexOf(estado.elegido) !== -1);
    if (mejor && !elegidoCalza) elegir(mejor, -1, { sinDesplazar: true });
    else renderDetalle();
    renderInfoMapa();
  }

  iniciar();
})();

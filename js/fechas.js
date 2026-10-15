window.VC = window.VC || {};

(function () {
  'use strict';

  var NOMBRES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  var DIA = '(domingo|lunes|martes|miercoles|jueves|viernes|sabado)';
  var PATRON = new RegExp(DIA + '(?:\\s+(?:a|al|hasta)\\s+' + DIA + ')?', 'g');
  var LUNES_A_VIERNES = [false, true, true, true, true, true, false];

  VC.DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  VC.DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var cache = new Map();

  /**
   * Interpreta "LUNES A VIERNES", "Lunes a Sabado", "Miercoles", "Lunes, Martes, Jueves y Viernes"…
   * Devuelve { dias: [dom..sáb] booleanos, reconocido }. Si no se entiende, asume lunes a viernes.
   */
  VC.interpretarDiasReparto = function (texto) {
    var clave = String(texto || '');
    if (cache.has(clave)) return cache.get(clave);

    var n = VC.normalizar(clave);
    var dias = [false, false, false, false, false, false, false];
    var encontrado = false;

    if (/\btodos los dias\b|\bdiario\b/.test(n)) {
      dias = dias.map(function () { return true; });
      encontrado = true;
    }

    PATRON.lastIndex = 0;
    var m;
    while ((m = PATRON.exec(n)) !== null) {
      encontrado = true;
      var desde = NOMBRES.indexOf(m[1]);
      if (m[2]) {
        var hasta = NOMBRES.indexOf(m[2]);
        for (var i = desde; ; i = (i + 1) % 7) {
          dias[i] = true;
          if (i === hasta) break;
        }
      } else {
        dias[desde] = true;
      }
    }

    var resultado = encontrado
      ? { dias: dias, reconocido: true }
      : { dias: LUNES_A_VIERNES.slice(), reconocido: false };
    cache.set(clave, resultado);
    return resultado;
  };

  /** "Lun a Vie", "Mié", "Lun, Mar, Jue y Vie". */
  VC.resumirDias = function (dias) {
    var orden = [1, 2, 3, 4, 5, 6, 0];
    var activos = orden.filter(function (i) { return dias[i]; });
    if (activos.length === 7) return 'Todos los días';
    if (activos.length === 0) return 'Sin días';
    var pos = activos.map(function (i) { return orden.indexOf(i); });
    var contiguo = pos.every(function (p, k) { return k === 0 || p === pos[k - 1] + 1; });
    if (contiguo && activos.length >= 3) {
      return VC.DIAS_CORTOS[activos[0]] + ' a ' + VC.DIAS_CORTOS[activos[activos.length - 1]];
    }
    var nombres = activos.map(function (i) { return VC.DIAS_CORTOS[i]; });
    return nombres.length === 1 ? nombres[0] : nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
  };

  // ─── Fecha estimada ───

  var UN_DIA = 24 * 60 * 60 * 1000;
  var UNA_HORA = 60 * 60 * 1000;

  function soloFechaUtc(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  function clave(fecha) { return fecha.toISOString().slice(0, 10); }
  function siguiente(fecha) { return new Date(fecha.getTime() + UN_DIA); }

  /**
   * Día de despacho: cambia a las 00:00 UTC (19:00 en Perú, 21:00 en Chile y Paraguay en verano).
   * Devuelve el día (medianoche UTC) y si ya se pasó el corte respecto al día local del operador.
   */
  function diaDeDespacho(ahora) {
    var hoy = soloFechaUtc(new Date(ahora.getTime() - VC.config.corteUtcHora * UNA_HORA));
    var local = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
    return { hoy: hoy, despuesDeCorte: hoy.getTime() > local.getTime() };
  }

  /** Hora local (del computador del operador) en que cambia el día: "19:00" en Perú. */
  VC.horaDeCorteLocal = function () {
    var corte = new Date(Date.UTC(2026, 0, 15, VC.config.corteUtcHora, 0));
    return String(corte.getHours()).padStart(2, '0') + ':' + String(corte.getMinutes()).padStart(2, '0');
  };

  /**
   * Fecha estimada = día de despacho + N días hábiles (sin fines de semana ni feriados del país),
   * movida al siguiente día de reparto de la localidad.
   */
  VC.calcularFechaEntrega = function (diasHabiles, textoDiasReparto, campana, ahora) {
    var feriados = campana && campana.feriadosSet ? campana.feriadosSet : new Set();
    var esFeriado = function (f) { return feriados.has(clave(f)); };
    var esHabil = function (f) {
      var d = f.getUTCDay();
      return d !== 0 && d !== 6 && !esFeriado(f);
    };

    var despacho = diaDeDespacho(ahora || new Date());
    var fecha = despacho.hoy;
    var despuesDeCorte = despacho.despuesDeCorte;

    var contados = 0;
    while (contados < diasHabiles) {
      fecha = siguiente(fecha);
      if (esHabil(fecha)) contados++;
    }

    var reparto = VC.interpretarDiasReparto(textoDiasReparto);
    var ajustada = false;
    for (var i = 0; i < 21 && (!reparto.dias[fecha.getUTCDay()] || esFeriado(fecha)); i++) {
      fecha = siguiente(fecha);
      ajustada = true;
    }

    var dia = fecha.getUTCDate();
    var mes = fecha.getUTCMonth();
    var anio = fecha.getUTCFullYear();
    var texto = VC.DIAS_LARGOS[fecha.getUTCDay()] + ' ' + dia + ' de ' + MESES[mes];

    return {
      fecha: fecha,
      texto: texto,
      textoLargo: texto.charAt(0).toUpperCase() + texto.slice(1) + ' de ' + anio,
      textoCorto: String(dia).padStart(2, '0') + '/' + String(mes + 1).padStart(2, '0') + '/' + anio,
      ajustadaPorReparto: ajustada,
      despuesDeCorte: despuesDeCorte,
      diasNoReconocidos: !reparto.reconocido
    };
  };
})();

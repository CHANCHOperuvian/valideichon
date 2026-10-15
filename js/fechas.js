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
  var formatoChile = new Intl.DateTimeFormat('en-CA', {
    timeZone: VC.config.zonaHoraria,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  });

  /** Fecha de hoy y hora en Chile, sin importar la zona horaria de la PC. Fechas como medianoche UTC. */
  function ahoraEnChile(ahora) {
    var partes = {};
    formatoChile.formatToParts(ahora).forEach(function (p) { partes[p.type] = Number(p.value); });
    return { hoy: new Date(Date.UTC(partes.year, partes.month - 1, partes.day)), hora: partes.hour % 24 };
  }

  function clave(fecha) { return fecha.toISOString().slice(0, 10); }
  function siguiente(fecha) { return new Date(fecha.getTime() + UN_DIA); }
  function esFeriado(fecha) { return VC.config.feriados.has(clave(fecha)); }
  function esHabil(fecha) {
    var d = fecha.getUTCDay();
    return d !== 0 && d !== 6 && !esFeriado(fecha);
  }

  /**
   * Fecha estimada = hoy (o mañana si ya pasó la hora de corte) + N días hábiles
   * (sin fines de semana ni feriados), movida al siguiente día de reparto de la localidad.
   */
  VC.calcularFechaEntrega = function (diasHabiles, textoDiasReparto, ahora) {
    var chile = ahoraEnChile(ahora || new Date());
    var despuesDeCorte = chile.hora >= VC.config.horaCorte;
    var fecha = despuesDeCorte ? siguiente(chile.hoy) : chile.hoy;

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

/**
 * Reglas del negocio que NO vienen en el Excel.
 * Si cambia alguna política, este es el único archivo a tocar.
 */
window.VC = window.VC || {};

VC.config = {
  zonaHoraria: 'America/Santiago',

  /** Pedidos tomados desde esta hora (hora de Chile) empiezan a contar desde el día siguiente. */
  horaCorte: 15,

  /** Si la dirección del cliente queda a más de estos km de la localidad, se muestra un aviso. */
  distanciaAvisoKm: 15,

  courierBlue: 'Blue Express',
  courierContra: 'Contraentrega',

  /**
   * Feriados nacionales (no cuentan como días hábiles ni de reparto). Formato AAAA-MM-DD.
   * Revisar y agregar cada año.
   */
  feriados: new Set([
    // 2026
    '2026-01-01', '2026-04-03', '2026-04-04', '2026-05-01', '2026-05-21',
    '2026-06-21', '2026-06-29', '2026-07-16', '2026-08-15', '2026-09-18',
    '2026-09-19', '2026-10-12', '2026-10-31', '2026-11-01', '2026-12-08',
    '2026-12-25',
    // 2027
    '2027-01-01', '2027-03-26', '2027-03-27', '2027-05-01', '2027-05-21',
    '2027-06-21', '2027-06-28', '2027-07-16', '2027-08-15', '2027-09-18',
    '2027-09-19', '2027-10-11', '2027-10-31', '2027-11-01', '2027-12-08',
    '2027-12-25'
  ])
};

/** Forma de pago según el courier. */
VC.reglaPago = function (courier) {
  if (courier === VC.config.courierContra) {
    return {
      corto: 'Efectivo o transferencia',
      detalle: 'Paga al recibir: efectivo o transferencia bancaria al repartidor.',
      paraCliente: 'puedes pagar en efectivo o por transferencia al momento de recibirlo',
      tono: 'contra'
    };
  }
  if (courier === VC.config.courierBlue) {
    return {
      corto: 'Solo efectivo',
      detalle: 'Paga al recibir SOLO EN EFECTIVO. Blue Express no acepta transferencias.',
      paraCliente: 'el pago es SOLO EN EFECTIVO al momento de recibirlo',
      tono: 'blue'
    };
  }
  return {
    corto: 'Consultar',
    detalle: 'Courier "' + (courier || 'sin dato') + '" sin regla de pago definida. Consulta con tu teamleader.',
    paraCliente: 'el método de pago te lo confirmamos antes del despacho',
    tono: 'neutro'
  };
};

/** Convierte el texto de la columna COURIER al nombre oficial, o null si no se reconoce. */
VC.normalizarCourier = function (valor) {
  var n = String(valor || '').toLowerCase();
  if (n.indexOf('blue') !== -1) return VC.config.courierBlue;
  if (n.indexOf('contra') !== -1) return VC.config.courierContra;
  return null;
};

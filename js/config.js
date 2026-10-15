/**
 * Configuración general (las reglas de cada país están en js/campanas.js).
 */
window.VC = window.VC || {};

VC.config = {
  /**
   * El día de despacho cambia a las 00:00 UTC (19:00 en Perú).
   * Un pedido tomado después de esa hora empieza a contar desde el día siguiente.
   */
  corteUtcHora: 0,

  /** Si la dirección del cliente queda a más de estos km de la localidad, se muestra un aviso. */
  distanciaAvisoKm: 15
};

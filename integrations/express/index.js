module.exports = {
  ...require('./metrics'),
};

// tracing.js no se re-exporta acá a propósito: debe requerirse aparte y
// de primero en el entrypoint (antes de cualquier otro require), para que
// la auto-instrumentación de OpenTelemetry alcance a parchear los módulos.
// Ver comentario en tracing.js.

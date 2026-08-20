const client = require('prom-client');

/**
 * Kit de instrumentación Prometheus para apps Express planas (sin NestJS).
 *
 * Uso:
 *   const { metricsMiddleware, metricsHandler } = require('./monitoring/metrics');
 *   app.use(metricsMiddleware);
 *   app.get('/metrics', metricsHandler);
 *
 * Copiá este archivo a tu proyecto (ej. src/monitoring/metrics.js) y
 * enganchalo en tu app.js/server.js como se muestra arriba. No requiere
 * configuración: usa el prefijo por defecto de métricas de proceso y
 * expone /metrics en formato Prometheus.
 */

// Métricas por defecto del proceso (CPU, memoria, event loop, GC, etc.).
// Sin prefijo a propósito: el dashboard genérico de Grafana
// (apps-overview.json) espera los nombres estándar de prom-client
// (process_cpu_seconds_total, etc.) y distingue proyectos por el label
// "proyecto" del target en infra/observability/prometheus/targets/, no
// por prefijo de métrica.
client.collectDefaultMetrics();

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requests HTTP procesadas',
  labelNames: ['method', 'route', 'status_code', 'status_class'],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las requests HTTP en segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const httpActiveRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Cantidad de requests HTTP activas en este momento',
  labelNames: ['method'],
});

/**
 * Middleware que instrumenta cada request: cuenta, mide duración y
 * lleva el gauge de requests activas. Enganchalo temprano en el
 * pipeline (antes del router), para que capture también los 404.
 */
function metricsMiddleware(req, res, next) {
  const method = req.method.toUpperCase();
  httpActiveRequests.inc({ method });

  const endTimer = httpRequestDurationSeconds.startTimer();

  res.on('finish', () => {
    // req.route solo existe si matcheó una ruta definida; si no,
    // usamos el path crudo para no perder la métrica (ej. 404s).
    const route = (req.route && (req.baseUrl || '') + req.route.path) || req.path || 'unmatched';
    const statusCode = res.statusCode;
    const statusClass = `${Math.floor(statusCode / 100)}xx`;

    httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode.toString(),
      status_class: statusClass,
    });

    endTimer({ method, route, status_code: statusCode.toString() });
    httpActiveRequests.dec({ method });
  });

  next();
}

/**
 * Handler para exponer el endpoint /metrics en formato Prometheus.
 * Montalo con: app.get('/metrics', metricsHandler)
 */
async function metricsHandler(req, res) {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}

module.exports = {
  client,
  metricsMiddleware,
  metricsHandler,
};

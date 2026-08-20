# Kit de instrumentación — Express plano

Para proyectos Express sin NestJS (el kit de `integrations/nestjs/` no
aplica). Expone `/metrics` en formato Prometheus y, opcionalmente,
tracing con OpenTelemetry.

## 1. Métricas (`/metrics`)

```bash
npm install prom-client
```

Copiá [`metrics.js`](metrics.js) a tu proyecto (ej. `src/monitoring/metrics.js`)
y enganchalo en tu `app.js`:

```js
const { metricsMiddleware, metricsHandler } = require('./monitoring/metrics');

app.use(metricsMiddleware);       // antes del router, para capturar todo (incluidos 404s)
app.get('/metrics', metricsHandler);
```

Métricas expuestas: `http_requests_total`, `http_request_duration_seconds`,
`http_active_requests`, más las métricas de proceso por defecto de
`prom-client` (CPU, memoria, event loop, GC).

**Si tu app sirve por HTTPS internamente** (ej. certs propios montados en
el contenedor), agregá `"scheme": "https"` en el label del archivo de
target (`infra/observability/prometheus/targets/<proyecto>.json`) — ver
`targets/orders-service.json` como ejemplo. Prometheus ya está
configurado para leer ese label y saltarse la validación del hostname
del cert.

## 2. Tracing (opcional)

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-metrics @opentelemetry/resources @opentelemetry/semantic-conventions
```

Copiá [`tracing.js`](tracing.js) a tu proyecto (ej.
`src/monitoring/tracing.js`) y requerilo como **la primera línea** de tu
entrypoint (antes de importar tu app), para que la auto-instrumentación
alcance a parchear `express`/`http`/`mysql2`/etc.:

```js
// server.js
require('./src/monitoring/tracing'); // primera línea, antes de todo lo demás
const app = require('./src/app');
// ...
```

Seteá en tu `.env`:

```bash
OTEL_SERVICE_NAME=mi-proyecto   # mismo nombre que en targets/<proyecto>.json
```

## 3. Red y target en Prometheus

Ver la sección **"Paso 0"** y **"Paso 1"** del [README principal](../../README.md)
del repo de monitoreo: conectar el contenedor a `monitoring-network` y
crear `infra/observability/prometheus/targets/<proyecto>.json`.

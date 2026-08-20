# Dashboards

Un único dashboard genérico ([`apps-overview.json`](apps-overview.json)),
folder **Apps**, con un selector `$proyecto` poblado automáticamente desde
Prometheus (`label_values(up{job="apps"}, proyecto)`).

## Agregar un proyecto nuevo

Es el **único paso manual**: crear
`infra/observability/prometheus/targets/<proyecto>.json` (ver README
principal, sección "Agregar una empresa/proyecto nuevo"). En 30-60s el
proyecto aparece solo en el dropdown de arriba del dashboard — no hace
falta tocar nada de Grafana.

## Convención importante: `container_name` == `proyecto`

El panel de logs filtra por `{container="$proyecto"}` (label que
Promtail saca del nombre del contenedor Docker). Para que funcione, el
`container_name:` del servicio en su `docker-compose.yml` tiene que ser
**exactamente igual** al valor de `"proyecto"` que pusiste en su target
de Prometheus. Ej:

```yaml
# docker-compose.yml de tu proyecto
services:
  mi-proyecto:
    container_name: mi-proyecto   # <- debe matchear
```

```json
// infra/observability/prometheus/targets/mi-proyecto.json
[{ "targets": ["mi-proyecto:3000"], "labels": { "proyecto": "mi-proyecto", ... } }]
```

Si tu proyecto tiene **varios servicios** (ej. backend + frontend en el
mismo `docker-compose.yml`), dales `container_name` distintos y un
target/`proyecto` distinto a cada uno (ej. `mi-proyecto-server`,
`mi-proyecto-client`) — cada uno aparece como una opción separada en el
dropdown.

## Personalizar el dashboard

`allowUiUpdates: true` en [`dashboard.yaml`](dashboard.yaml) permite
editar `apps-overview.json` desde la UI de Grafana y que los cambios
persistan (no se pisan en el próximo resync) — **siempre que no
modifiquemos el archivo del repo después**. Si volvemos a tocar
`apps-overview.json` acá, Grafana lo vuelve a aplicar y se pierden los
ajustes hechos a mano en la UI.

## Métricas que asume la plantilla

- `up`, `http_requests_total`, `http_request_duration_seconds`,
  `http_active_requests` (instrumentación propia de los kits
  `integrations/nestjs/` e `integrations/express/`).
- `process_cpu_seconds_total`, `process_resident_memory_bytes`,
  `process_start_time_seconds`, `process_open_fds`,
  `nodejs_heap_size_used_bytes`, `nodejs_heap_size_total_bytes`,
  `nodejs_eventloop_lag_seconds`, `nodejs_active_handles_total`
  (default metrics de `prom-client`, sin prefijo — no cambies el prefix
  al llamar `collectDefaultMetrics()`, si no estos paneles quedan vacíos).

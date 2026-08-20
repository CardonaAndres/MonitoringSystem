# Monitoring System

Stack de observabilidad reutilizable (Grafana centralizado) para monitorear
infraestructura, contenedores, logs y aplicaciones de múltiples
empresas/proyectos desde un mismo panel.

## Stack

| Servicio       | Función                                   | Puerto |
|----------------|--------------------------------------------|--------|
| Grafana        | Dashboards y alerting                      | 4000   |
| Prometheus     | Métricas (time-series)                     | 9090   |
| Alertmanager   | Notificaciones (Discord)                   | 9093   |
| Loki           | Agregación de logs                         | 3100   |
| Promtail       | Recolector/shipper de logs                 | -      |
| Tempo          | Tracing distribuido                        | 3200   |
| OTel Collector | Router de trazas/métricas (OTLP)           | 4317/4318 |
| node-exporter  | Métricas de host (CPU, RAM, disco, red)    | 9100   |
| cAdvisor       | Métricas de contenedores Docker            | 8080   |

Grafana ya viene con Prometheus, Loki y Tempo pre-provisionados como
datasources (`infra/observability/grafana/provisioning/`).

## 1. Levantar el stack

```bash
cp .env.example .env
# editar .env: password de Grafana, webhook de Discord, etc.
docker network create ${NETWORK_NAME:-monitoring-network} 2>/dev/null || true
docker compose up -d
```

Grafana queda en `http://localhost:4000` (o el puerto que pongas en
`GRAFANA_PORT`). Usuario/clave: los de `.env`.

Funciona igual en local (Docker Desktop) que en un servidor remoto — es el
mismo `docker-compose.yml`, solo cambia el `.env` (passwords, puertos si
hay conflicto, `TZ`, etc). En el servidor, exponé el puerto de Grafana
detrás de un reverse proxy con TLS si va a ser accesible desde internet.

## 2. Agregar una empresa/proyecto nuevo

Este stack de monitoreo (`monitoring-system`) se levanta **una sola vez** y
después cada proyecto/empresa se "conecta" a él. No es "un stack por
proyecto" — es un Grafana centralizado que va sumando fuentes.

Hay un único requisito real: **que Prometheus, Promtail y el OTel
Collector puedan llegar en red a tu app**. Todo lo demás (métricas, logs,
trazas) es opcional e independiente entre sí — sumá solo lo que
necesites.

### Paso 0 — Poné tu app en la misma red Docker

La forma más simple: agregá tu app a la network externa `monitoring-network`
(el nombre que pusiste en `NETWORK_NAME` del `.env`).

En el `docker-compose.yml` **de tu proyecto** (no de este repo):

```yaml
services:
  mi-app:
    # ...
    networks:
      - monitoring-network

networks:
  monitoring-network:
    external: true
```

Si tu app corre fuera de Docker (proceso directo en el servidor), no hace
falta esto: usá `host.docker.internal` (Windows/Mac) o la IP del host
(Linux) como target en el paso 1.

> ¿No tenés forma de compartir red (apps en servidores distintos)? Andá a
> la sección **"Monitorear un servidor/app externo (otra máquina)"** más
> abajo.

### Paso 1 — Métricas (Prometheus)

**Requisito:** tu app expone un endpoint `/metrics` en formato Prometheus.

- Si es **NestJS**: copiá el kit de [`integrations/nestjs/`](integrations/nestjs/index.ts)
  a tu proyecto (ej. `src/core/monitoring/`), importá `MonitoringModule`
  en tu `AppModule`, y listo — ya expone `/metrics`.
- Si es **Express plano** (sin NestJS): copiá el kit de
  [`integrations/express/`](integrations/express/README.md) a tu
  proyecto (ej. `src/monitoring/`) y enganchá `metricsMiddleware` +
  `metricsHandler` en tu `app.js`.
- Si es **otro lenguaje/framework**: usá la librería de Prometheus para
  ese stack (`prom-client` en Node puro, `prometheus_client` en Python,
  `prometheus/client_golang` en Go, etc.) y montá un endpoint `/metrics`.
- Si tu app **no tiene forma de exponer `/metrics`** todavía, podés saltar
  este paso — el resto (logs, alertas de infra) funciona igual sin esto.

Una vez que `/metrics` responde, dale de alta a Prometheus creando **un
archivo por proyecto** en `infra/observability/prometheus/targets/`:

```bash
cp infra/observability/prometheus/targets/eligex.json.example \
   infra/observability/prometheus/targets/mi-proyecto.json
```

```json
// infra/observability/prometheus/targets/mi-proyecto.json
[
  {
    "targets": ["mi-app:3000"],
    "labels": {
      "empresa": "acme",
      "proyecto": "acme-backend",
      "environment": "production"
    }
  }
]
```

- `"targets"`: `host:puerto` de tu app **visto desde dentro de la red
  Docker** — normalmente el `container_name` o `service` de tu app
  (ej. `mi-app:3000`), no `localhost`.
- No hace falta reiniciar nada: Prometheus relee esta carpeta cada 30s
  (`file_sd`). En 30-60s ya aparece en
  `http://localhost:9090/targets` con `health: up`.
- Si sale `health: down`, es un tema de red (paso 0) o de puerto/path del
  `/metrics`, no de este archivo.

### Paso 2 — Logs (opcional)

Dos formas, usá la que te quede más cómoda:

**a) Si tu app corre como contenedor Docker** en `monitoring-network`: no
hacés nada más. Promtail ya recolecta logs de todos los contenedores
automáticamente (label `proyecto` = nombre del compose project de tu
app).

**b) Si preferís logs en archivo** (o tu app no es un contenedor): montá
la carpeta de logs de tu app dentro de `./logs/<proyecto>/` de este repo,
ej: `./logs/acme/app.log`. Promtail ya está mapeado a `./logs` y saca el
label `proyecto` del nombre de carpeta automáticamente.

### Paso 3 — Trazas / tracing (opcional, solo si te interesa ver requests end-to-end)

Apuntá el SDK de OpenTelemetry de tu app a `http://otel-collector:4317`
(gRPC) o `http://otel-collector:4318` (HTTP). Con el kit de
`integrations/nestjs/tracing.ts` esto ya viene resuelto — solo seteá
`OTEL_SERVICE_NAME=mi-proyecto` en el `.env` de tu app.

### Paso 4 — Verificar en Grafana

1. Abrí `http://localhost:4000` (o el dominio de tu servidor).
2. `Explore → Prometheus`, query `up{proyecto="mi-proyecto"}` → debería
   dar `1`.
3. `Explore → Loki`, query `{proyecto="mi-proyecto"}` → deberías ver tus
   logs.
4. Dashboard: duplicá uno existente en Grafana ("Save As") o agregá el
   JSON en `infra/observability/grafana/provisioning/dashboards/`, y
   filtrá por el label `proyecto`/`empresa` para tener una vista propia
   de ese cliente dentro del mismo Grafana.

### Resumen mínimo (versión corta)

Si solo querés algo funcionando ya, lo único obligatorio es el **Paso 1**:
crear `infra/observability/prometheus/targets/<proyecto>.json` apuntando
a tu `/metrics`. Todo lo demás (logs, trazas, dashboard) sumalo cuando lo
necesites, sin tocar nada de lo anterior.

### Monitorear un servidor/app externo (otra máquina, sin red Docker compartida)

Cuando la app no puede compartir red Docker con este stack (está en otro
servidor/VPS):

- **Métricas**: en el `target` del JSON del paso 1 poné la IP/dominio
  público (o de VPN) y puerto de esa app, ej.
  `"targets": ["203.0.113.10:3000"]`. Asegurate de que ese puerto sea
  alcanzable desde donde corre Prometheus (firewall/security group).
- **Logs**: instalá Promtail (o el agente que prefieras, ej. Grafana
  Alloy) en esa máquina y configuralo para pushear a
  `http://<tu-servidor-de-monitoreo>:3100/loki/api/v1/push` en vez de
  usar el Promtail de este repo.

## 3. Alertas

Reglas de Prometheus: `infra/observability/prometheus/alerts/*.yml`.

Alertmanager notifica por **Discord** y/o **email**, según lo que dejes
seteado en `.env` (`infra/observability/alertmanager/render-config.sh`
arma el config dinámicamente, sin romper si dejás un canal vacío):

- **Discord**: `DISCORD_ALERTS_WEBHOOK` (webhook del canal).
- **Email**: `SMTP_SMARTHOST`, `SMTP_FROM`, `SMTP_AUTH_USERNAME`,
  `SMTP_AUTH_PASSWORD`, `ALERT_EMAIL_TO` (uno o más destinatarios,
  separados por coma).
  - Con Gmail: `SMTP_SMARTHOST=smtp.gmail.com:587`, el usuario es tu
    correo, y la password es un **App Password** (no la contraseña de la
    cuenta) — se genera en la config de seguridad de Google.

Si dejás ambos vacíos, Alertmanager arranca igual pero no notifica a
nadie (queda un warning en sus logs). Para sumar Slack u otro canal,
editá `render-config.sh`.

## Desplegar en un VPS (con dominio + HTTPS)

Este repo incluye Caddy como reverse proxy con TLS automático (Let's
Encrypt), como un servicio opcional (`profile: proxy`) para no molestar
en local.

**Antes de empezar:**

- El VPS tiene Docker y Docker Compose instalados.
- El dominio/subdominio (ej. `grafana.pedbox.co`) tiene un registro
  **A** apuntando a la IP del VPS. Verificalo con `dig grafana.pedbox.co`
  o `nslookup grafana.pedbox.co` — si no resuelve a tu VPS, Caddy no va a
  poder emitir el certificado.
- Puertos **80** y **443** abiertos en el firewall del VPS (Let's Encrypt
  valida por HTTP antes de emitir el HTTPS).

**Pasos:**

```bash
# 1. Conectate al VPS
ssh usuario@ip-del-vps

# 2. Cloná el repo
git clone https://github.com/pedbox/MonitoringSystem.git
cd MonitoringSystem

# 3. Configurá el .env
cp .env.example .env
nano .env
```

En el `.env` del VPS, como mínimo cambiá:

```bash
GF_SECURITY_ADMIN_PASSWORD=una-password-fuerte   # NO dejar "admin"
DOMAIN=grafana.pedbox.co
```

```bash
# 4. Levantá el stack + el proxy (perfil "proxy")
docker compose --profile proxy up -d

# 5. Verificá que todo esté arriba
docker compose ps
docker compose logs caddy --tail=30
```

Si todo salió bien, Caddy emite el certificado solo en los primeros
segundos y ya podés entrar a `https://grafana.pedbox.co`.

> Nota: sin `--profile proxy`, Caddy no se levanta (útil si en algún
> momento probás algo en el mismo VPS sin exponer nada todavía). Para
> apagar solo el proxy: `docker compose --profile proxy stop caddy`.

**Actualizar el stack más adelante** (nueva config, nuevo proyecto, etc.):

```bash
cd MonitoringSystem
git pull
docker compose --profile proxy up -d
```

**Seguridad recomendada una vez arriba:**

- Cambiá la contraseña de Grafana desde la UI la primera vez que entrés
  (o dejá una fuerte en `.env` desde el inicio).
- No expongas los puertos de Prometheus (9090), Alertmanager (9093), etc.
  a internet — quedan accesibles solo dentro de la red Docker y por
  `localhost` del VPS. Si necesitás verlos vos, usá un túnel SSH:
  `ssh -L 9090:localhost:9090 usuario@ip-del-vps`.
- Considerá restringir el firewall del VPS para que solo 22 (SSH), 80 y
  443 estén abiertos hacia afuera.

## Notas Windows / Docker Desktop

- `node-exporter` monta `/` del host; en Windows esto reporta métricas del
  propio contenedor/VM de Docker Desktop, no del host real 1:1 — sirve
  para probar el stack, pero en un servidor Linux vas a tener métricas
  reales del host.
- `cadvisor` corre con `privileged: true`; en Docker Desktop funciona para
  ver métricas de contenedores.

## Estructura del repo

```
docker-compose.yml
.env.example
infra/observability/
  prometheus/       # config + reglas de alertas + targets por proyecto
  grafana/           # datasources + dashboards pre-provisionados
  loki/ promtail/     # logs
  tempo/ otel-collector/  # tracing
integrations/nestjs/   # kit de instrumentación para copiar en apps NestJS
integrations/express/  # kit de instrumentación para copiar en apps Express planas
logs/                 # (gitignored) logs montados por proyecto
```

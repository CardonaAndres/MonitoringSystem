#!/bin/sh
# Genera /tmp/alertmanager.yml a partir de alertmanager.yml.tmpl.
# Solo incluye el bloque de Discord si DISCORD_ALERTS_WEBHOOK está seteado,
# y solo el de email si ALERT_EMAIL_TO está seteado. Así no rompe la
# validación de Alertmanager si un canal queda vacío.
set -e

OUT=/tmp/alertmanager.yml

cat > "$OUT" <<EOF
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 1m
  repeat_interval: 1h
  receiver: 'notifications'

receivers:
  - name: 'notifications'
EOF

if [ -n "$DISCORD_ALERTS_WEBHOOK" ]; then
cat >> "$OUT" <<EOF
    discord_configs:
      - webhook_url: '${DISCORD_ALERTS_WEBHOOK}'
        title: '🚨 ${ALERT_TITLE_PREFIX} {{ .GroupLabels.alertname }} ({{ .CommonLabels.severity }})'
        message: |
          {{ range .Alerts }}
          **Alerta:** {{ .Annotations.summary }}
          **Descripción:** {{ .Annotations.description }}
          **Estado:** {{ .Status }}
          **Iniciado:** {{ .StartsAt.Format "2006-01-02 15:04:05" }}
          {{ end }}
        send_resolved: true
EOF
fi

if [ -n "$ALERT_EMAIL_TO" ]; then
cat >> "$OUT" <<EOF
    email_configs:
      - to: '${ALERT_EMAIL_TO}'
        from: '${SMTP_FROM}'
        smarthost: '${SMTP_SMARTHOST}'
        auth_username: '${SMTP_AUTH_USERNAME}'
        auth_password: '${SMTP_AUTH_PASSWORD}'
        require_tls: true
        send_resolved: true
        headers:
          subject: '🚨 ${ALERT_TITLE_PREFIX} {{ .GroupLabels.alertname }} ({{ .CommonLabels.severity }})'
EOF
fi

if [ -z "$DISCORD_ALERTS_WEBHOOK" ] && [ -z "$ALERT_EMAIL_TO" ]; then
  echo "⚠️  Alertmanager: no hay DISCORD_ALERTS_WEBHOOK ni ALERT_EMAIL_TO configurados, no se enviarán notificaciones." >&2
fi

exec /bin/alertmanager --config.file="$OUT" --storage.path=/alertmanager

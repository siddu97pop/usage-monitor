#!/bin/bash
# Health check for usage-monitor.
# Detects the "200 OK but empty body" failure mode that systemd can't catch,
# and restarts the service if the API stops responding with valid JSON.

PORT=3099
LOG=/var/log/usage-monitor-healthcheck.log
MAX_WAIT=10  # seconds

BODY=$(curl -sf --max-time "$MAX_WAIT" "http://localhost:$PORT/api/usage" 2>/dev/null)

if [ -z "$BODY" ]; then
    echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') [WARN] usage-monitor returned empty body — restarting" >> "$LOG"
    systemctl restart usage-monitor.service
    echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') [INFO] restarted usage-monitor.service" >> "$LOG"
else
    # Optionally log healthy status (uncomment to debug)
    # echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') [OK] usage-monitor healthy ($(echo "$BODY" | wc -c) bytes)" >> "$LOG"
    :
fi

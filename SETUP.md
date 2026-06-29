# WhatsApp PM Bot — Setup Guide

## Prerequisites

- Docker + Docker Compose on this Ubuntu machine
- n8n already running on port 5678 (`wabot-connector` will POST to it)
- Ollama running natively on the host (default port 11434)

## Quick start

```bash
# 1. Copy and fill in your secrets
cp .env.example .env
nano .env

# 2. Build and start
docker compose up -d --build

# 3. Scan the QR code to link your WhatsApp number
docker logs -f wabot-connector
#   → A QR code will print in the terminal. Scan it in WhatsApp (Settings → Linked Devices)
#   → Once connected, the connector persists auth in a Docker volume — no re-scan on restart

# 4. Open the dashboard
open http://localhost:3001
```

## Service ports

| Service | Host port | Notes |
|---|---|---|
| wabot-postgres | 5433 | Isolated from tre-postgres (5432) |
| wabot-connector | 3002 | n8n POSTs back here to send replies |
| wabot-dashboard | 3001 | Next.js task board |

All on the `whatsapp-bot` Docker network — no conflicts with `tre-crm_tre` or `n8n_default`.

## n8n workflow setup

Create a webhook workflow in n8n that:
1. **Trigger**: Webhook — path `whatsapp-message`, method POST. This URL goes into `N8N_WEBHOOK_URL` in `.env`.
2. **Write message to DB**: HTTP Request → `wabot-postgres` on port 5433 (or use a Postgres node with host `localhost`, port `5433` from n8n's perspective since n8n is on the host network via port mapping).
3. **Call Ollama for extraction**: HTTP Request to `http://host.docker.internal:11434/api/generate` — model from `OLLAMA_MODEL`.
   - If n8n can't reach `host.docker.internal`, use the gateway IP: `docker inspect n8n | grep Gateway` (typically `172.19.0.1`).
4. **If is_task=true**: write to `tasks` table.
5. **Reply path**: if message body contains `@pmbot status`, query tasks and POST to `http://host.docker.internal:3002/send` with `x-connector-secret` header.

### Ollama extraction prompt

```
You are a task extraction assistant. Given a WhatsApp group message, extract task information as JSON.

Message: {{message}}
Sender: {{sender}}

Respond ONLY with JSON matching this schema:
{
  "is_task": boolean,
  "task_text": string | null,
  "assignee": string | null,
  "due_date": "YYYY-MM-DD" | null,
  "confidence": number  // 0.0 to 1.0
}

Rules:
- is_task=true only if there is a clear action item with an implicit or explicit owner
- confidence < 0.70 means needs_review=true in the DB
- due_date: resolve relative dates ("friday", "next week") to absolute ISO dates
- If no task, return {"is_task": false, "task_text": null, "assignee": null, "due_date": null, "confidence": 0}
```

## Connector HTTP API

The connector exposes two endpoints on port 3002:

```
GET  /health                     → { ok, connected, user, timestamp }
POST /send                       → send a message to a WhatsApp group
     Header: x-connector-secret  → value from CONNECTOR_SECRET in .env
     Body:   { "to": "120363xxx@g.us", "text": "..." }
```

## Re-pairing (if logged out)

```bash
docker compose stop connector
docker volume rm whatsapp-bot_wabot_connector_auth
docker compose up -d connector
docker logs -f wabot-connector   # scan the new QR
```

## Adding a client + group to the DB

```sql
INSERT INTO clients (name) VALUES ('Acme Corp');

INSERT INTO groups (client_id, wa_jid, name)
VALUES (
  (SELECT id FROM clients WHERE name = 'Acme Corp'),
  '120363xxxxxxxxxx@g.us',   -- the group JID from the connector logs
  'Acme - Dev Group'
);
```

The connector logs the `group_jid` for every message it forwards to n8n, so you can find the JID there.

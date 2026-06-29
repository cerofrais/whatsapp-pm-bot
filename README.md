# WhatsApp PM Bot

Automatically extracts tasks, assignees, and due dates from WhatsApp client group chats and surfaces them on a single dashboard. No manual entry.

## How it works

```
WhatsApp groups
      │
      ▼
 [connector]  ──── group messages ──►  [n8n webhook]
  Baileys                                    │
  port 3002                          extract with Gemma4
      ▲                              write to Postgres
      │                                      │
   replies ◄──── n8n calls /send ────────────┘
                                             │
                                             ▼
                                      [dashboard]
                                      port 3001
```

## Services

| Container | Host port | Role |
|---|---|---|
| `wabot-postgres` | **5433** | Postgres 16 — clients, groups, messages, tasks |
| `wabot-connector` | **3002** | Baileys bridge — WhatsApp ↔ n8n |
| `wabot-dashboard` | **3001** | Next.js task board |

All on the isolated `whatsapp-bot` Docker network. Does not touch the existing `tre-crm` or `n8n` stacks.

**External dependencies (not in Docker Compose):**
- `n8n` — already running on port 5678
- `ollama` with `gemma4:latest` — already running natively

---

## Initial setup

### 1. Fill in `.env`

```bash
cp .env.example .env
nano .env
```

Required values to change:

| Variable | What to set |
|---|---|
| `POSTGRES_PASSWORD` | Strong password, anything |
| `CONNECTOR_SECRET` | Random string (e.g. `openssl rand -hex 32`) |
| `N8N_WEBHOOK_URL` | The webhook URL from your n8n workflow (see docs/n8n-workflow.md) |

Everything else has working defaults.

### 2. Start services

```bash
docker compose up -d --build
```

### 3. Pair WhatsApp

```bash
docker logs -f wabot-connector
```

A QR code prints in the terminal. Open WhatsApp on your **dedicated bot number** → Settings → Linked Devices → Link a Device → scan the QR.

Once paired, auth is saved to the `wabot_connector_auth` Docker volume — no re-scan needed on restart.

### 4. Register clients and groups in the DB

The connector forwards messages from any group it's in, but the dashboard only shows groups that are registered in the database.

See `docs/manual-tasks.md` for the SQL to add clients and groups.

### 5. Set up n8n workflow

See `docs/n8n-workflow.md` for the step-by-step n8n setup.

### 6. Open the dashboard

```
http://localhost:3001
```

---

## Daily operations

```bash
# Status
docker compose ps

# Restart a single service
docker compose restart connector

# See connector logs (WhatsApp connection, forwarded messages)
docker logs -f wabot-connector

# See dashboard logs
docker logs -f wabot-dashboard

# Stop everything (data preserved in volumes)
docker compose stop

# Start again
docker compose start
```

---

## Environment variables

See `.env.example` for all variables with descriptions. The key ones:

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_DB` | `whatsapp_bot` | Database name |
| `POSTGRES_USER` | `wabot` | DB user |
| `POSTGRES_PASSWORD` | _(required)_ | DB password |
| `CONNECTOR_SECRET` | _(required)_ | Shared secret for connector ↔ n8n auth |
| `N8N_WEBHOOK_URL` | _(required)_ | n8n webhook the connector POSTs messages to |
| `OLLAMA_MODEL` | `gemma4:latest` | Model used in n8n for extraction |
| `DASHBOARD_HOST_PORT` | `3001` | Host port for the dashboard |
| `CONNECTOR_PORT` | `3002` | Host port for connector HTTP |
| `CONFIDENCE_THRESHOLD` | `0.70` | Below this, tasks are flagged `needs_review=true` |

---

## Re-pairing (if logged out)

```bash
docker compose stop connector
docker volume rm whatsapp-bot_wabot_connector_auth
docker compose up -d connector
docker logs -f wabot-connector   # scan the new QR
```

---

## Reset everything (destructive)

```bash
docker compose down -v   # removes containers AND volumes (all data lost)
docker compose up -d --build
```

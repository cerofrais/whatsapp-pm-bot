# Manual Tasks

These are the one-time and ongoing manual steps you need to do that can't be automated.

---

## 1. Connect the WhatsApp bot number (one-time)

You need a **dedicated phone number** that is NOT your personal WhatsApp number. The bot will be linked to this number as a "linked device."

1. Insert the SIM into a phone (or use a virtual number if you have one)
2. Open WhatsApp, set it up for that number
3. Run `docker logs -f wabot-connector` and scan the QR code from WhatsApp:
   - Settings → Linked Devices → Link a Device

Auth is saved in the Docker volume `wabot_connector_auth`. You won't need to re-scan unless the session is explicitly revoked.

---

## 2. Add the bot to each client group

On the dedicated bot phone (or from another group admin's phone):

1. Open the client WhatsApp group
2. Group Info → Add Participant → add the bot number

The connector will automatically start receiving and forwarding messages from that group. But the group must also be registered in the database (step 3) for the dashboard to show its tasks.

---

## 3. Register clients and groups in the database

Connect to Postgres directly:

```bash
# Interactive psql
docker exec -it wabot-postgres psql -U wabot -d whatsapp_bot

# Or run a one-liner
docker exec wabot-postgres psql -U wabot -d whatsapp_bot -c "SELECT * FROM clients;"
```

### Add a client

```sql
INSERT INTO clients (name) VALUES ('Acme Corp');
```

### Find the group JID

The group JID appears in the connector logs when the first message arrives:

```bash
docker logs wabot-connector 2>&1 | grep "group_jid"
```

It looks like `120363xxxxxxxxxx@g.us`.

### Register the group

```sql
INSERT INTO groups (client_id, wa_jid, name)
VALUES (
  (SELECT id FROM clients WHERE name = 'Acme Corp'),
  '120363xxxxxxxxxx@g.us',
  'Acme - Main Group'
);
```

A client can have multiple groups (e.g. one for dev, one for design):

```sql
INSERT INTO groups (client_id, wa_jid, name)
VALUES (
  (SELECT id FROM clients WHERE name = 'Acme Corp'),
  '120363yyyyyyyyyy@g.us',
  'Acme - Design Group'
);
```

---

## 4. Set up the n8n workflow (one-time)

See `docs/n8n-workflow.md` for the full step-by-step.

Short version:
1. Create a new workflow in n8n (http://localhost:5678)
2. Add a **Webhook** trigger node — copy its production URL into `N8N_WEBHOOK_URL` in `.env`
3. Restart the connector: `docker compose restart connector`
4. Build the extraction and task-writing logic per the guide

---

## 5. Tune the extraction confidence threshold

After the first batch of real messages, check how many tasks are flagged `needs_review`:

```sql
SELECT
  COUNT(*) FILTER (WHERE needs_review = true) AS flagged,
  COUNT(*)                                    AS total,
  AVG(confidence)                             AS avg_confidence
FROM tasks;
```

If too many real tasks are being flagged, raise the `confidence` threshold in your n8n workflow logic (currently `0.70`). If too many bad extractions are slipping through unflagged, lower it. Update `CONFIDENCE_THRESHOLD` in `.env` for documentation — the actual threshold is in the n8n workflow IF condition.

---

## 6. Mark a task done from the dashboard

On the dashboard (http://localhost:3001), each open task has a **Mark done** and **Cancel** button. Clicking updates the status immediately.

You can also do it directly in SQL:

```sql
UPDATE tasks SET status = 'done', updated_at = now()
WHERE id = '<task-uuid>';
```

---

## 7. Archive a client engagement

When a project ends, archive the client so their tasks stop appearing on the main board:

```sql
UPDATE clients SET status = 'archived' WHERE name = 'Acme Corp';
```

To reactivate:

```sql
UPDATE clients SET status = 'active' WHERE name = 'Acme Corp';
```

---

## 8. Correct a bad extraction

If a task was extracted with the wrong assignee or due date, update it directly:

```sql
UPDATE tasks
SET
  task_text    = 'Updated task description',
  assignee_raw = 'Harsha',
  due_date     = '2026-07-15',
  needs_review = false,
  updated_at   = now()
WHERE id = '<task-uuid>';
```

---

## 9. Backup and restore Postgres

**Backup:**
```bash
docker exec wabot-postgres pg_dump -U wabot whatsapp_bot > backup_$(date +%Y%m%d).sql
```

**Restore:**
```bash
docker exec -i wabot-postgres psql -U wabot -d whatsapp_bot < backup_20260629.sql
```

---

## 10. Swap to backup WhatsApp number (if primary gets banned)

There's no automated failover — WhatsApp unofficial clients can get flagged.

1. Stop the connector: `docker compose stop connector`
2. Delete the auth volume: `docker volume rm whatsapp-bot_wabot_connector_auth`
3. Get a backup number, install WhatsApp on a phone
4. Start the connector and scan the new QR: `docker compose up -d connector && docker logs -f wabot-connector`
5. Re-add the new number to each client group manually (a group admin must do this)

# Manual Tasks

Steps that require human action — either one-time setup or occasional maintenance.

---

## 1. Connect the WhatsApp bot number (one-time)

You need a **dedicated phone number** — not your personal WhatsApp.

1. Insert the SIM into a phone and set up WhatsApp on it
2. Run: `docker logs -f wabot-connector`
3. A QR code prints — scan it from that phone: Settings → Linked Devices → Link a Device

Auth is saved in the `wabot_connector_auth` Docker volume. No re-scan needed on restart unless the session is explicitly revoked.

---

## 2. Add the bot to each client group

From the dedicated bot phone (or any group admin's phone):

1. Open the WhatsApp group
2. Group Info → Add Participant → add the bot number

The connector will start receiving messages from that group immediately. You still need to register the group in the dashboard (step 3) for tasks to appear.

---

## 3. Register clients and groups (via dashboard)

**Clients:** go to **http://localhost:3001/clients** → type the client name → Add.

**Groups:**
1. Send any message in the group (so the JID shows up in connector logs)
2. Run: `docker logs wabot-connector 2>&1 | grep group_jid` — copy the JID (looks like `120363xxxxxxxxxx@g.us`)
3. Go to **http://localhost:3001/groups** → select the client, paste the JID, give it a label → Register

A client can have multiple groups (e.g. dev group + design group — register them separately).

To archive a client so their tasks disappear from the board: **Clients page** → Archive. Reactivate the same way.
To remove a group: **Groups page** → Remove (tasks are kept, group just stops feeding new data).

---

## 4. Set up the n8n workflow (one-time)

See `docs/n8n-workflow.md` for the full step-by-step.

Short version:
1. Open n8n at http://localhost:5678 → create a new workflow
2. Add a **Webhook** trigger node — copy its production URL into `N8N_WEBHOOK_URL` in `.env`
3. Restart the connector: `docker compose restart connector`
4. Build the extraction pipeline per the guide

---

## 5. Tune the extraction confidence threshold

After the first batch of real messages, check how many tasks are being flagged for review:

```bash
docker exec wabot-postgres psql -U wabot -d whatsapp_bot -c "
  SELECT
    COUNT(*) FILTER (WHERE needs_review = true) AS flagged,
    COUNT(*)                                    AS total,
    ROUND(AVG(confidence), 2)                   AS avg_confidence
  FROM tasks;
"
```

- Too many good tasks flagged → raise the threshold in the n8n IF node (currently `0.70`)
- Too many bad extractions slipping through → lower it
- Update `CONFIDENCE_THRESHOLD` in `.env` to document your chosen value

---

## 6. Mark a task done

Use the **Mark done** / **Cancel** buttons on the task board at http://localhost:3001.

Via SQL if needed:
```bash
docker exec wabot-postgres psql -U wabot -d whatsapp_bot -c "
  UPDATE tasks SET status = 'done', updated_at = now() WHERE id = '<uuid>';
"
```

---

## 7. Correct a bad extraction

If a task has the wrong assignee, due date, or description, edit it directly in Postgres:

```bash
docker exec -it wabot-postgres psql -U wabot -d whatsapp_bot
```

```sql
UPDATE tasks
SET
  task_text    = 'Correct description here',
  assignee_raw = 'Harsha',
  due_date     = '2026-07-15',
  needs_review = false,
  updated_at   = now()
WHERE id = '<task-uuid>';
```

To find the task UUID: on the task board, open browser DevTools → Network → find the `/api/tasks` call, or query:
```sql
SELECT id, task_text, assignee_raw, due_date FROM tasks WHERE status = 'open' ORDER BY created_at DESC LIMIT 20;
```

---

## 8. Backup and restore Postgres

**Backup:**
```bash
docker exec wabot-postgres pg_dump -U wabot whatsapp_bot > backup_$(date +%Y%m%d).sql
```

**Restore:**
```bash
docker exec -i wabot-postgres psql -U wabot -d whatsapp_bot < backup_20260629.sql
```

---

## 9. Swap to a backup WhatsApp number (if primary gets banned)

There's no automated failover — unofficial WhatsApp clients can get flagged.

1. `docker compose stop connector`
2. `docker volume rm whatsapp-bot_wabot_connector_auth`
3. Set up WhatsApp on a new phone with the backup number
4. `docker compose up -d connector && docker logs -f wabot-connector` — scan the new QR
5. Re-add the new number to every client group (a group admin must do this manually)

# n8n Workflow Setup

The connector forwards WhatsApp messages to n8n, which handles extraction, DB writes, and sending replies. This doc covers building that workflow.

Access n8n at: http://localhost:5678

---

## Overview of nodes

```
[Webhook trigger]
       │
       ▼
[Write raw message to Postgres]
       │
       ▼
[Call Ollama — extract task]
       │
   is_task?
   ┌────┴────┐
  yes        no
   │          └─► [Stop]
   ▼
[Write task to Postgres]
       │
   is @mention?
   ┌────┴────┐
  yes        no
   │          └─► [Stop]
   ▼
[Query open tasks for group]
       │
       ▼
[Send reply via connector /send]
```

---

## Step 1 — Webhook trigger

1. Add a **Webhook** node
2. HTTP Method: `POST`
3. Path: `whatsapp-message`
4. Authentication: None (we verify with the `x-connector-secret` header manually)
5. **Copy the production URL** → paste into `N8N_WEBHOOK_URL` in your `.env`
6. After pasting, restart the connector: `docker compose restart connector`

---

## Step 2 — Write raw message to Postgres

Add a **Postgres** node:

- Host: `localhost`, Port: `5433` (n8n is on host network via the published port)
- Database: `whatsapp_bot`, User: `wabot`, Password: from `.env`
- Operation: Execute Query

```sql
INSERT INTO messages (group_id, wa_message_id, sender_jid, sender_name, body, sent_at)
SELECT
  g.id,
  '{{ $json.wa_message_id }}',
  '{{ $json.sender_jid }}',
  '{{ $json.sender_name }}',
  '{{ $json.body }}',
  '{{ $json.timestamp }}'::timestamptz
FROM groups g
WHERE g.wa_jid = '{{ $json.group_jid }}'
ON CONFLICT (group_id, wa_message_id) DO NOTHING
RETURNING id;
```

> If the group JID isn't registered yet, this INSERT is a no-op (no matching group). Add a check after this node — if the result is empty, stop the workflow.

---

## Step 3 — Call Ollama for extraction

Add an **HTTP Request** node:

- URL: `http://host.docker.internal:11434/api/generate`
  - If this fails, use the n8n gateway IP: run `docker inspect n8n | grep '"Gateway"'` and use that IP instead
- Method: `POST`
- Body (JSON):

```json
{
  "model": "gemma4:latest",
  "stream": false,
  "prompt": "You are a task extraction assistant. Given a WhatsApp group message, extract task information as JSON.\n\nMessage: {{ $('Webhook').item.json.body }}\nSender: {{ $('Webhook').item.json.sender_name }}\nToday's date: {{ $now.toISO() }}\n\nRespond ONLY with a JSON object matching this schema — no prose, no markdown:\n{\n  \"is_task\": boolean,\n  \"task_text\": string | null,\n  \"assignee\": string | null,\n  \"due_date\": \"YYYY-MM-DD\" | null,\n  \"confidence\": number\n}\n\nRules:\n- is_task=true only if there is a clear action item with an implicit or explicit owner\n- confidence is 0.0–1.0, your certainty that this is a real task\n- due_date: resolve relative dates (\"friday\", \"next week\") to absolute ISO dates\n- assignee: the person responsible, often the person being asked\n- If no task: {\"is_task\": false, \"task_text\": null, \"assignee\": null, \"due_date\": null, \"confidence\": 0}"
}
```

Add a **Code** node after this to parse the response:

```javascript
const raw = $input.first().json.response;
// Gemma sometimes wraps JSON in markdown code blocks
const match = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/\{[\s\S]*\}/);
const jsonStr = match ? (match[1] || match[0]) : raw;
return [{ json: JSON.parse(jsonStr.trim()) }];
```

---

## Step 4 — Branch: is_task?

Add an **IF** node:
- Condition: `{{ $json.is_task }}` equals `true`

---

## Step 5 — Write task to Postgres (yes branch)

Add a **Postgres** node:

```sql
INSERT INTO tasks (
  group_id, source_message_id, task_text,
  assignee_raw, due_date, confidence, needs_review
)
SELECT
  g.id,
  m.id,
  '{{ $json.task_text }}',
  '{{ $json.assignee }}',
  NULLIF('{{ $json.due_date }}', 'null')::date,
  {{ $json.confidence }},
  {{ $json.confidence }} < 0.70
FROM groups g
JOIN messages m ON m.wa_message_id = '{{ $('Webhook').item.json.wa_message_id }}'
  AND m.group_id = g.id
WHERE g.wa_jid = '{{ $('Webhook').item.json.group_jid }}'
RETURNING id;
```

---

## Step 6 — Branch: is @mention?

Add another **IF** node after the task write:
- Condition: `{{ $('Webhook').item.json.body }}` contains `@pmbot`

---

## Step 7 — Query open tasks for group (yes branch)

Add a **Postgres** node:

```sql
SELECT t.task_text, t.assignee_raw, t.due_date, t.status
FROM tasks t
JOIN groups g ON g.id = t.group_id
WHERE g.wa_jid = '{{ $('Webhook').item.json.group_jid }}'
  AND t.status IN ('open', 'overdue')
ORDER BY t.due_date ASC NULLS LAST
LIMIT 20;
```

Add a **Code** node to format the reply:

```javascript
const tasks = $input.all().map(t => t.json);
if (tasks.length === 0) {
  return [{ json: { text: 'No open tasks for this group.' } }];
}
const lines = tasks.map((t, i) => {
  const due = t.due_date ? ` — due ${new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '';
  const who = t.assignee_raw ? ` (${t.assignee_raw})` : '';
  return `${i + 1}. ${t.task_text}${who}${due}`;
});
return [{ json: { text: `Open tasks:\n${lines.join('\n')}` } }];
```

---

## Step 8 — Send reply via connector

Add an **HTTP Request** node:

- URL: `http://host.docker.internal:3002/send`
- Method: `POST`
- Headers: `x-connector-secret: <your CONNECTOR_SECRET from .env>`
- Body (JSON):

```json
{
  "to": "{{ $('Webhook').item.json.group_jid }}",
  "text": "{{ $json.text }}"
}
```

---

## Step 9 — Activate the workflow

Click **Active** toggle in the top right. The webhook is now live.

Test it by sending a message to a registered group. Check:
```bash
docker logs wabot-connector   # should show "Forwarded to n8n"
```
And check the n8n execution log for the workflow.

---

## Reaching Postgres from n8n

n8n is a container on `n8n_default` network. The `wabot-postgres` is on the `whatsapp-bot` network. They're not on the same Docker network, so you can't use the container hostname.

Connect to the Postgres container via the **published port on the host**:

- Host: `localhost` or `172.19.0.1` (n8n's gateway to the host — check with `docker inspect n8n | grep Gateway`)
- Port: `5433`
- Database: `whatsapp_bot`
- User: `wabot`
- Password: from `.env → POSTGRES_PASSWORD`

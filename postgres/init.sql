-- WhatsApp PM Bot schema

CREATE TABLE clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id),
  wa_jid     TEXT NOT NULL UNIQUE,
  name       TEXT,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id),
  wa_message_id TEXT NOT NULL,
  sender_jid    TEXT NOT NULL,
  sender_name   TEXT,
  body          TEXT,
  sent_at       TIMESTAMPTZ NOT NULL,
  processed     BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (group_id, wa_message_id)
);

CREATE TABLE tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID NOT NULL REFERENCES groups(id),
  source_message_id UUID REFERENCES messages(id),
  task_text         TEXT NOT NULL,
  assignee_raw      TEXT,
  assignee_jid      TEXT,
  due_date          DATE,
  status            TEXT NOT NULL DEFAULT 'open',
  confidence        NUMERIC(3,2),
  needs_review      BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_group_status     ON tasks(group_id, status);
CREATE INDEX idx_messages_group_pending ON messages(group_id, processed);
CREATE INDEX idx_tasks_needs_review     ON tasks(needs_review) WHERE needs_review = true;
CREATE INDEX idx_tasks_due_date         ON tasks(due_date) WHERE status = 'open';

import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default pool;

export interface Client {
  id: string;
  name: string;
  status: string;
}

export interface Group {
  id: string;
  client_id: string;
  wa_jid: string;
  name: string | null;
}

export interface Task {
  id: string;
  group_id: string;
  task_text: string;
  assignee_raw: string | null;
  due_date: string | null;
  status: string;
  confidence: number | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
  // joined fields
  group_name: string | null;
  client_id: string;
  client_name: string;
}

export async function getTasksWithContext(): Promise<Task[]> {
  const result = await pool.query<Task>(`
    SELECT
      t.id,
      t.group_id,
      t.task_text,
      t.assignee_raw,
      t.due_date,
      t.status,
      t.confidence,
      t.needs_review,
      t.created_at,
      t.updated_at,
      g.name  AS group_name,
      g.client_id,
      c.name  AS client_name
    FROM tasks t
    JOIN groups g ON g.id = t.group_id
    JOIN clients c ON c.id = g.client_id
    WHERE c.status = 'active'
    ORDER BY
      c.name,
      t.status = 'open' DESC,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
  `);
  return result.rows;
}

export async function getStats(): Promise<{
  total: number;
  open: number;
  overdue: number;
  needs_review: number;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*)                                                       AS total,
      COUNT(*) FILTER (WHERE status = 'open')                       AS open,
      COUNT(*) FILTER (WHERE status = 'overdue'
                          OR (status = 'open' AND due_date < CURRENT_DATE)) AS overdue,
      COUNT(*) FILTER (WHERE needs_review = true AND status = 'open') AS needs_review
    FROM tasks
  `);
  const row = result.rows[0];
  return {
    total: parseInt(row.total, 10),
    open: parseInt(row.open, 10),
    overdue: parseInt(row.overdue, 10),
    needs_review: parseInt(row.needs_review, 10),
  };
}

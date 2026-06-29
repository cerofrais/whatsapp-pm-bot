'use server';

import pool from '@/lib/db';
import { revalidatePath } from 'next/cache';

const ALLOWED_STATUSES = ['open', 'done', 'overdue', 'cancelled'] as const;
type TaskStatus = (typeof ALLOWED_STATUSES)[number];

function isValidStatus(s: string): s is TaskStatus {
  return (ALLOWED_STATUSES as readonly string[]).includes(s);
}

export async function updateTaskStatus(taskId: string, status: string): Promise<void> {
  if (!isValidStatus(status)) throw new Error(`Invalid status: ${status}`);
  await pool.query(
    'UPDATE tasks SET status = $1, updated_at = now() WHERE id = $2',
    [status, taskId],
  );
  revalidatePath('/');
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function addClient(formData: FormData): Promise<void> {
  const name = (formData.get('name') as string | null)?.trim();
  if (!name) throw new Error('Client name is required');
  await pool.query('INSERT INTO clients (name) VALUES ($1)', [name]);
  revalidatePath('/clients');
}

export async function setClientStatus(clientId: string, status: 'active' | 'paused' | 'archived'): Promise<void> {
  await pool.query('UPDATE clients SET status = $1 WHERE id = $2', [status, clientId]);
  revalidatePath('/clients');
  revalidatePath('/');
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export async function addGroup(formData: FormData): Promise<void> {
  const clientId = formData.get('client_id') as string | null;
  const waJid   = (formData.get('wa_jid')    as string | null)?.trim();
  const name     = (formData.get('name')      as string | null)?.trim() || null;
  if (!clientId || !waJid) throw new Error('Client and group JID are required');
  await pool.query(
    'INSERT INTO groups (client_id, wa_jid, name) VALUES ($1, $2, $3)',
    [clientId, waJid, name],
  );
  revalidatePath('/groups');
}

export async function deleteGroup(groupId: string): Promise<void> {
  await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
  revalidatePath('/groups');
  revalidatePath('/');
}

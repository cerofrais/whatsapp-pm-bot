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

'use client';

import { useTransition } from 'react';
import { updateTaskStatus } from '@/app/actions';
import type { Task } from '@/lib/db';

function StatusBadge({ status, needsReview }: { status: string; needsReview: boolean }) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium';
  const styles: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800',
    done: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`${base} ${styles[status] ?? 'bg-yellow-100 text-yellow-800'}`}>
      {needsReview && status === 'open' ? '⚠ ' : ''}
      {status}
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number | null }) {
  if (confidence === null) return null;
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <div className="h-1.5 w-16 rounded-full bg-gray-200">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}%</span>
    </div>
  );
}

export function TaskCard({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition();
  const isActive = task.status === 'open' || task.status === 'overdue';
  const isOverdue =
    task.status === 'overdue' ||
    (task.status === 'open' && task.due_date && new Date(task.due_date) < new Date());

  function handleStatus(status: string) {
    startTransition(() => updateTaskStatus(task.id, status));
  }

  return (
    <div
      className={`rounded-lg border p-4 ${
        task.needs_review && isActive
          ? 'border-amber-300 bg-amber-50'
          : isOverdue
          ? 'border-red-200 bg-red-50'
          : 'border-gray-200 bg-white'
      } ${isPending ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-medium text-gray-900">{task.task_text}</p>
        <StatusBadge status={task.status} needsReview={task.needs_review} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        {task.assignee_raw && (
          <span>
            <span className="font-medium text-gray-700">→ </span>
            {task.assignee_raw}
          </span>
        )}
        {task.due_date && (
          <span className={isOverdue ? 'font-semibold text-red-600' : ''}>
            Due {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
        <ConfidenceBar confidence={task.confidence} />
      </div>

      {isActive && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => handleStatus('done')}
            disabled={isPending}
            className="rounded px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-300 hover:bg-green-50 disabled:cursor-not-allowed"
          >
            Mark done
          </button>
          <button
            onClick={() => handleStatus('cancelled')}
            disabled={isPending}
            className="rounded px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

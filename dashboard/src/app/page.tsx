export const dynamic = 'force-dynamic';

import { getTasksWithContext, getStats, type Task } from '@/lib/db';
import { TaskCard } from '@/components/TaskCard';

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: 'red' | 'amber' }) {
  const colors = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <div className={`rounded-lg border p-4 ${highlight ? colors[highlight] : 'bg-white border-gray-200'}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm opacity-75">{label}</p>
    </div>
  );
}

export default async function DashboardPage() {
  let tasks: Task[] = [];
  let stats = { total: 0, open: 0, overdue: 0, needs_review: 0 };

  try {
    [tasks, stats] = await Promise.all([getTasksWithContext(), getStats()]);
  } catch {
    return (
      <main className="min-h-screen p-8">
        <p className="text-red-600">Could not connect to database. Check your DATABASE_URL.</p>
      </main>
    );
  }

  // Group tasks by client name
  const byClient = tasks.reduce<Record<string, Task[]>>((acc, t) => {
    (acc[t.client_name] ??= []).push(t);
    return acc;
  }, {});

  return (
    <main className="min-h-screen p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp PM Bot</h1>
          <p className="text-sm text-gray-500">Client task tracker — auto-extracted from group chats</p>
        </div>
        <span className="text-xs text-gray-400">
          {new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total tasks" value={stats.total} />
        <StatCard label="Open" value={stats.open} />
        <StatCard label="Overdue" value={stats.overdue} highlight={stats.overdue > 0 ? 'red' : undefined} />
        <StatCard label="Needs review" value={stats.needs_review} highlight={stats.needs_review > 0 ? 'amber' : undefined} />
      </div>

      {/* Per-client boards */}
      {Object.keys(byClient).length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <p className="text-lg font-medium">No tasks yet</p>
          <p className="mt-1 text-sm">Tasks will appear here once the connector is running and n8n starts extracting them from WhatsApp messages.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(byClient).map(([clientName, clientTasks]) => {
            const open = clientTasks.filter((t) => t.status === 'open' || t.status === 'overdue');
            const closed = clientTasks.filter((t) => t.status === 'done' || t.status === 'cancelled');
            return (
              <section key={clientName}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">{clientName}</h2>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    {open.length} open
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {open.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </div>

                {closed.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                      {closed.length} closed task{closed.length !== 1 ? 's' : ''}
                    </summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {closed.map((t) => (
                        <TaskCard key={t.id} task={t} />
                      ))}
                    </div>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

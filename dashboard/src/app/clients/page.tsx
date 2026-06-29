export const dynamic = 'force-dynamic';

import { getClients } from '@/lib/db';
import { addClient, setClientStatus } from '@/app/actions';

const STATUS_STYLES: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  paused:   'bg-yellow-100 text-yellow-700',
  archived: 'bg-gray-100 text-gray-500',
};

export default async function ClientsPage() {
  let clients: Awaited<ReturnType<typeof getClients>> = [];
  try {
    clients = await getClients();
  } catch {
    return <p className="text-red-600">Could not connect to database.</p>;
  }

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500">{clients.filter(c => c.status === 'active').length} active</p>
        </div>
      </div>

      {/* Add client form */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Add client</h2>
        <form action={addClient} className="flex gap-3">
          <input
            name="name"
            required
            placeholder="Client name"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add
          </button>
        </form>
      </div>

      {/* Client table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Groups</th>
              <th className="px-5 py-3">Open tasks</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                  No clients yet — add one above
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id} className={c.status === 'archived' ? 'opacity-50' : ''}>
                <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] ?? ''}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-600">{c.group_count}</td>
                <td className="px-5 py-3 text-gray-600">{c.open_task_count}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    {c.status !== 'active' && (
                      <form action={setClientStatus.bind(null, c.id, 'active')}>
                        <button className="text-xs text-green-600 hover:underline">Activate</button>
                      </form>
                    )}
                    {c.status === 'active' && (
                      <form action={setClientStatus.bind(null, c.id, 'paused')}>
                        <button className="text-xs text-yellow-600 hover:underline">Pause</button>
                      </form>
                    )}
                    {c.status !== 'archived' && (
                      <form action={setClientStatus.bind(null, c.id, 'archived')}>
                        <button className="text-xs text-gray-400 hover:underline">Archive</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

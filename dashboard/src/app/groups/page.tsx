export const dynamic = 'force-dynamic';

import { getGroupsWithClient, getClients } from '@/lib/db';
import { addGroup } from '@/app/actions';
import { DeleteGroupButton } from '@/components/DeleteGroupButton';
import { JidPicker } from '@/components/JidPicker';

interface ConnectorGroup {
  jid: string;
  name: string;
  participants: number;
}

async function fetchConnectorGroups(): Promise<ConnectorGroup[]> {
  const url = process.env.CONNECTOR_URL;
  const secret = process.env.CONNECTOR_SECRET;
  if (!url || !secret) return [];
  try {
    const res = await fetch(`${url}/groups`, {
      headers: { 'x-connector-secret': secret },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.groups ?? [];
  } catch {
    return [];
  }
}

export default async function GroupsPage() {
  let groups: Awaited<ReturnType<typeof getGroupsWithClient>> = [];
  let clients: Awaited<ReturnType<typeof getClients>> = [];
  let connectorGroups: ConnectorGroup[] = [];

  try {
    [groups, clients, connectorGroups] = await Promise.all([
      getGroupsWithClient(),
      getClients(),
      fetchConnectorGroups(),
    ]);
  } catch {
    return <p className="text-red-600">Could not connect to database.</p>;
  }

  const activeClients = clients.filter((c) => c.status === 'active');
  const registeredJids = new Set(groups.map((g) => g.wa_jid));
  const unregistered = connectorGroups.filter((g) => !registeredJids.has(g.jid));

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
        <p className="text-sm text-gray-500">{groups.length} registered</p>
      </div>

      {/* Bot's joined groups — quick pick */}
      {connectorGroups.length > 0 && (
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
            Groups the bot is in ({connectorGroups.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {connectorGroups.map((g) => {
              const already = registeredJids.has(g.jid);
              return (
                <JidPicker key={g.jid} jid={g.jid} name={g.name} alreadyRegistered={already} />
              );
            })}
          </div>
          {unregistered.length === 0 && (
            <p className="mt-2 text-xs text-blue-400">All joined groups are registered.</p>
          )}
        </div>
      )}

      {/* Register form */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Register a group</h2>

        {activeClients.length === 0 ? (
          <p className="text-sm text-amber-600">Add an active client first on the Clients page.</p>
        ) : (
          <form action={addGroup} className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_auto]">
            <select
              name="client_id"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select client</option>
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              id="wa_jid_input"
              name="wa_jid"
              required
              placeholder="120363xxxxxxxxxx@g.us"
              className="rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              name="name"
              placeholder="Group label (optional)"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Register
            </button>
          </form>
        )}
      </div>

      {/* Registered groups table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Label</th>
              <th className="px-5 py-3">WhatsApp JID</th>
              <th className="px-5 py-3">Open tasks</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {groups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                  No groups registered yet
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <tr key={g.id}>
                <td className="px-5 py-3 font-medium text-gray-900">{g.client_name}</td>
                <td className="px-5 py-3 text-gray-600">{g.name ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-5 py-3 font-mono text-xs text-gray-500">{g.wa_jid}</td>
                <td className="px-5 py-3 text-gray-600">{g.task_count}</td>
                <td className="px-5 py-3">
                  <DeleteGroupButton groupId={g.id} label={g.name ?? g.wa_jid} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

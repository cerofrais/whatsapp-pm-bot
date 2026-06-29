'use client';

import { deleteGroup } from '@/app/actions';

export function DeleteGroupButton({ groupId, label }: { groupId: string; label: string }) {
  return (
    <form
      action={async () => {
        if (!confirm(`Remove "${label}"? Tasks are kept but the group won't feed new data.`)) return;
        await deleteGroup(groupId);
      }}
    >
      <button type="submit" className="text-xs text-red-400 hover:text-red-600 hover:underline">
        Remove
      </button>
    </form>
  );
}

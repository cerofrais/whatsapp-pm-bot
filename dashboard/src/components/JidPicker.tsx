'use client';

export function JidPicker({
  jid,
  name,
  alreadyRegistered,
}: {
  jid: string;
  name: string;
  alreadyRegistered: boolean;
}) {
  function fill() {
    const input = document.getElementById('wa_jid_input') as HTMLInputElement | null;
    if (input) {
      input.value = jid;
      input.focus();
    }
  }

  if (alreadyRegistered) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-white px-3 py-1 text-xs text-green-600">
        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        {name}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={fill}
      className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs text-blue-700 hover:bg-blue-50"
      title={jid}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
      {name}
    </button>
  );
}

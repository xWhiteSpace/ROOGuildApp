export default function OfficerRolePicker({
  roles = [],
  selectedNames = [],
  onToggle,
  emptyHint = '',
}) {
  const selected = Array.isArray(selectedNames) ? selectedNames : [];
  const isOn = (name) => selected.some((item) => String(item).toLowerCase() === String(name).toLowerCase());

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-slate-200">Click a role to select it as officer</legend>
      <p className={`text-[11px] ${selected.length === 0 ? 'text-amber-400' : 'text-slate-500'}`}>
        {selected.length === 0
          ? 'None selected yet. Click a role name below — it is not enough to assign it in Discord.'
          : `${selected.length} selected. Click again to unselect.`}
      </p>
      {roles.length === 0 && emptyHint ? (
        <p className="text-[11px] text-slate-500">{emptyHint}</p>
      ) : null}
      <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto">
        {roles.map((role) => {
          const selectedRole = isOn(role.name);
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => onToggle(role.name)}
              aria-pressed={selectedRole}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition ${
                selectedRole
                  ? 'border-indigo-400 bg-indigo-600 text-white shadow'
                  : 'border-slate-500 bg-slate-950 text-slate-200 hover:border-indigo-400 hover:bg-slate-900'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none ${
                  selectedRole ? 'border-white bg-white text-indigo-700' : 'border-slate-500 text-slate-600'
                }`}
                aria-hidden
              >
                {selectedRole ? '✓' : ''}
              </span>
              {role.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

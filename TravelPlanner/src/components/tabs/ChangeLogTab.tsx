import { useChangelog } from '../../hooks/useTrip';
import { fmtStamp } from '../../utils/format';
import { TabHeader, EmptyState } from '../ui';
import type { ChangeAction } from '../../types';

const ACTION_META: Record<ChangeAction, { icon: string; color: string }> = {
  create: { icon: '➕', color: '#34d399' },
  update: { icon: '✏️', color: '#38bdf8' },
  delete: { icon: '🗑️', color: '#fb7185' },
  sync:   { icon: '🔄', color: '#a78bfa' },
};

export function ChangeLogTab() {
  const log = useChangelog();

  // Group by day.
  const groups: { day: string; items: typeof log }[] = [];
  log.forEach(entry => {
    const day = new Date(entry.at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const g = groups.find(x => x.day === day);
    if (g) g.items.push(entry); else groups.push({ day, items: [entry] });
  });

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Change Log" subtitle={`${log.length} recent change${log.length === 1 ? '' : 's'}`}
        gradient="linear-gradient(135deg,#475569,#64748b)" icon="🕓" />

      {log.length === 0 ? (
        <EmptyState emoji="🕓" title="No changes yet" hint="Every edit and sync will appear here" />
      ) : (
        <div className="px-4 py-4 space-y-5">
          {groups.map(g => (
            <div key={g.day}>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 mb-2">{g.day}</p>
              <div className="space-y-2">
                {g.items.map(entry => {
                  const m = ACTION_META[entry.action];
                  return (
                    <div key={entry.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-start gap-3">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{ backgroundColor: m.color + '20' }}>{m.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{entry.summary}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {fmtStamp(entry.at)} · {entry.device}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { Server, HardDrive, Database, Network, KeyRound, Activity } from 'lucide-react';

const SERVICE_ICONS = {
  compute: Server,
  storage: HardDrive,
  database: Database,
  networking: Network,
  auth: KeyRound,
};

const SERVICE_COLORS = {
  compute: 'text-blue-400',
  storage: 'text-green-400',
  database: 'text-purple-400',
  networking: 'text-orange-400',
  auth: 'text-yellow-400',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ActivityLog({ entries = [] }) {
  if (!entries.length) {
    return (
      <div className="text-gray-500 text-sm text-center py-8">No activity yet</div>
    );
  }
  return (
    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
      {entries.map((e) => {
        const Icon = SERVICE_ICONS[e.service] || Activity;
        const color = SERVICE_COLORS[e.service] || 'text-gray-400';
        return (
          <div key={e.id} className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-gray-700/50 transition-colors">
            <Icon size={14} className={`${color} mt-0.5 shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate">{e.action}</p>
              <p className="text-xs text-gray-500">{e.service} · {timeAgo(e.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

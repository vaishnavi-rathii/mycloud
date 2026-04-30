const STATUS = {
  running:   { dot: 'bg-green-400',  text: 'text-green-400',  bg: 'bg-green-400/10'  },
  active:    { dot: 'bg-green-400',  text: 'text-green-400',  bg: 'bg-green-400/10'  },
  healthy:   { dot: 'bg-green-400',  text: 'text-green-400',  bg: 'bg-green-400/10'  },
  success:   { dot: 'bg-green-400',  text: 'text-green-400',  bg: 'bg-green-400/10'  },
  stopped:   { dot: 'bg-gray-500',   text: 'text-gray-400',   bg: 'bg-gray-500/10'   },
  paused:    { dot: 'bg-gray-500',   text: 'text-gray-400',   bg: 'bg-gray-500/10'   },
  inactive:  { dot: 'bg-gray-500',   text: 'text-gray-400',   bg: 'bg-gray-500/10'   },
  pending:   { dot: 'bg-yellow-400', text: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  draining:  { dot: 'bg-yellow-400', text: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  warning:   { dot: 'bg-yellow-400', text: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  error:     { dot: 'bg-red-400',    text: 'text-red-400',    bg: 'bg-red-400/10'    },
  unhealthy: { dot: 'bg-red-400',    text: 'text-red-400',    bg: 'bg-red-400/10'    },
  failure:   { dot: 'bg-red-400',    text: 'text-red-400',    bg: 'bg-red-400/10'    },
  public:    { dot: 'bg-blue-400',   text: 'text-blue-400',   bg: 'bg-blue-400/10'   },
  private:   { dot: 'bg-gray-500',   text: 'text-gray-400',   bg: 'bg-gray-500/10'   },
  postgres:  { dot: 'bg-blue-400',   text: 'text-blue-400',   bg: 'bg-blue-400/10'   },
  sqlite:    { dot: 'bg-orange-400', text: 'text-orange-400', bg: 'bg-orange-400/10' },
  admin:     { dot: 'bg-purple-400', text: 'text-purple-400', bg: 'bg-purple-400/10' },
  user:      { dot: 'bg-gray-400',   text: 'text-gray-400',   bg: 'bg-gray-400/10'   },
};

export function Badge({ status, label, dot = true, size = 'sm' }) {
  const s = STATUS[status?.toLowerCase()] || STATUS.stopped;
  const text = label || status || '';
  const sz = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sz} ${s.text} ${s.bg}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${s.dot} shrink-0`} />}
      {text}
    </span>
  );
}

export default Badge;

export function TypeBadge({ type, label }) {
  const colors = {
    A: 'bg-blue-500/20 text-blue-400', CNAME: 'bg-purple-500/20 text-purple-400',
    TXT: 'bg-gray-500/20 text-gray-400', MX: 'bg-green-500/20 text-green-400',
    AAAA: 'bg-cyan-500/20 text-cyan-400', NS: 'bg-yellow-500/20 text-yellow-400',
    api_key: 'bg-yellow-500/20 text-yellow-400', password: 'bg-red-500/20 text-red-400',
    connection_string: 'bg-blue-500/20 text-blue-400', generic: 'bg-gray-500/20 text-gray-400',
  };
  const key = type || 'generic';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${colors[key] || colors.generic}`}>
      {label || type}
    </span>
  );
}

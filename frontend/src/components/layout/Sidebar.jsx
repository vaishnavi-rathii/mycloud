import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Server, HardDrive, Database, Network,
  KeyRound, Scale, Clock, ScrollText, Globe2, ShieldCheck,
  Users, ChevronRight, ChevronLeft, AlignLeft
} from 'lucide-react';

const GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    label: 'Compute',
    items: [
      { to: '/compute', icon: Server, label: 'EC2 Instances' },
      { to: '/loadbalancer', icon: Scale, label: 'Load Balancers' },
    ],
  },
  {
    label: 'Storage & Data',
    items: [
      { to: '/storage', icon: HardDrive, label: 'S3 Storage' },
      { to: '/databases', icon: Database, label: 'RDS Databases' },
    ],
  },
  {
    label: 'Networking',
    items: [{ to: '/networking', icon: Network, label: 'VPC & Firewall' }],
  },
  {
    label: 'Developer Tools',
    items: [
      { to: '/secrets', icon: KeyRound, label: 'Secrets Manager' },
      { to: '/scheduler', icon: Clock, label: 'EventBridge' },
      { to: '/logs', icon: ScrollText, label: 'CloudWatch Logs' },
      { to: '/dns', icon: Globe2, label: 'Route 53' },
    ],
  },
  {
    label: 'Security',
    items: [
      { to: '/iam', icon: Users, label: 'IAM Users' },
      { to: '/audit', icon: ShieldCheck, label: 'Audit Log' },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle }) {
  const [expanded, setExpanded] = useState(new Set(GROUPS.map(g => g.label)));
  const location = useLocation();

  function toggleGroup(label) {
    setExpanded(s => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  }

  return (
    <aside
      style={{ background: '#161d27', borderRight: '1px solid #1e2d3d' }}
      className={`fixed top-12 left-0 bottom-0 z-30 flex flex-col transition-all duration-200 ${collapsed ? 'w-12' : 'w-52'}`}
    >
      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-4 w-6 h-6 rounded-full bg-cloud-card border border-cloud-border flex items-center justify-center text-gray-400 hover:text-white z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      <nav className="flex-1 overflow-y-auto py-2">
        {GROUPS.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-widest hover:text-gray-300 transition-colors"
              >
                {group.label}
                <ChevronRight size={10} className={`transition-transform ${expanded.has(group.label) ? 'rotate-90' : ''}`} />
              </button>
            )}

            {(collapsed || expanded.has(group.label)) && group.items.map(({ to, icon: Icon, label }) => {
              const active = location.pathname === to || (to !== '/dashboard' && location.pathname.startsWith(to));
              return (
                <NavLink key={to} to={to} title={collapsed ? label : undefined}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs transition-colors relative group
                    ${active
                      ? 'text-white bg-cloud-hover border-l-2 border-aws-orange'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-cloud-hover/50 border-l-2 border-transparent'
                    }`}>
                  <Icon size={14} className="shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                  {collapsed && (
                    <div className="absolute left-12 bg-cloud-card border border-cloud-border rounded px-2 py-1 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none shadow-lg">
                      {label}
                    </div>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

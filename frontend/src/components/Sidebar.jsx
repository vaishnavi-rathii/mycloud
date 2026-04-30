import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Server, HardDrive, Database, Network, LogOut, Cloud } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/compute', icon: Server, label: 'Compute' },
  { to: '/storage', icon: HardDrive, label: 'Storage' },
  { to: '/databases', icon: Database, label: 'Databases' },
  { to: '/networking', icon: Network, label: 'Networking' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-60 bg-gray-900 flex flex-col border-r border-gray-800 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-800">
        <Cloud className="text-blue-400" size={22} />
        <span className="text-lg font-bold tracking-tight text-white">MyCloud</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-gray-800 px-4 py-4">
        <div className="text-xs text-gray-400 truncate mb-0.5">{user?.email}</div>
        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            user?.role === 'admin' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'
          }`}>
            {user?.role}
          </span>
          <button
            onClick={logout}
            className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

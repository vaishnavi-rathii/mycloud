import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Bell, HelpCircle, Settings, Cloud, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const SERVICE_ROUTES = {
  instance: '/compute', bucket: '/storage', database: '/databases',
  secret: '/secrets', loadbalancer: '/loadbalancer',
};

export default function Navbar({ onMenuToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const searchRef = useRef(null);
  const accountRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); setShowResults(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(`/api/search?q=${encodeURIComponent(query)}`);
        setResults(res.data);
        setShowResults(true);
      } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('[data-search]')) setShowResults(false);
      if (!e.target.closest('[data-account]')) setShowAccount(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const grouped = results.reduce((acc, r) => {
    acc[r.type] = acc[r.type] || [];
    acc[r.type].push(r);
    return acc;
  }, {});

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-12 flex items-center px-4 gap-4" style={{ background: '#0f1923', borderBottom: '1px solid #1e2d3d' }}>
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => navigate('/dashboard')}>
        <Cloud size={18} className="text-aws-orange" />
        <span className="text-white font-semibold text-sm tracking-tight">MyCloud</span>
      </div>

      {/* Global Search */}
      <div className="flex-1 max-w-xl mx-auto relative" data-search>
        <div className="flex items-center bg-cloud-sidebar border border-cloud-border rounded px-3 py-1.5 gap-2 focus-within:border-aws-orange/50">
          <Search size={13} className="text-gray-500 shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder='Search resources… ("/" to focus)'
            className="bg-transparent text-xs text-gray-200 placeholder-gray-600 flex-1 outline-none"
          />
          {query && <button onClick={() => { setQuery(''); setShowResults(false); }} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>}
        </div>

        {showResults && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-cloud-card border border-cloud-border rounded shadow-xl max-h-72 overflow-y-auto z-50">
            {results.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-500">No results for "{query}"</p>
            ) : Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider border-b border-cloud-border/50 bg-cloud-sidebar">
                  {type}s
                </div>
                {items.map(item => (
                  <div key={item.id} onClick={() => { navigate(SERVICE_ROUTES[item.type] || '/'); setShowResults(false); setQuery(''); }}
                    className="flex items-center justify-between px-4 py-2 hover:bg-cloud-hover cursor-pointer">
                    <span className="text-xs text-gray-200">{item.label}</span>
                    <span className="text-[10px] text-gray-500">{item.status}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {/* Region selector */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-cloud-sidebar cursor-pointer text-gray-400 hover:text-white transition-colors">
          <Globe size={12} />
          <span className="text-xs">us-east-1</span>
          <ChevronDown size={11} />
        </div>

        <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-cloud-sidebar transition-colors">
          <Bell size={14} />
        </button>
        <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-cloud-sidebar transition-colors">
          <HelpCircle size={14} />
        </button>

        {/* Account dropdown */}
        <div className="relative" data-account ref={accountRef}>
          <button onClick={() => setShowAccount(s => !s)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-cloud-sidebar text-gray-300 hover:text-white transition-colors">
            <div className="w-5 h-5 rounded-full bg-aws-orange flex items-center justify-center text-black text-[10px] font-bold">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <span className="text-xs max-w-24 truncate">{user?.email?.split('@')[0]}</span>
            <ChevronDown size={11} />
          </button>

          {showAccount && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-cloud-card border border-cloud-border rounded shadow-xl z-50 py-1">
              <div className="px-3 py-2 border-b border-cloud-border">
                <p className="text-xs font-semibold text-white">{user?.email}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Account ID: {user?.id?.slice(0,8)}</p>
              </div>
              <button onClick={() => navigate('/iam')} className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-cloud-hover flex items-center gap-2">
                <Settings size={12} /> Security credentials
              </button>
              <div className="border-t border-cloud-border mt-1 pt-1">
                <button onClick={logout} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-cloud-hover">
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

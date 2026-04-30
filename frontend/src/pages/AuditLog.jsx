import { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldCheck, Download, RefreshCw } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import SkeletonTable from '../components/ui/Skeleton';

const SERVICE_COLORS = {
  compute:  'text-blue-400',
  storage:  'text-purple-400',
  database: 'text-green-400',
  networking: 'text-cyan-400',
  secrets:  'text-yellow-400',
  auth:     'text-orange-400',
  iam:      'text-red-400',
  dns:      'text-indigo-400',
};

export default function AuditLog() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterService, setFilterService] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => { fetchLogs(); }, [page, filterService]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
      if (filterService) params.set('service', filterService);
      const r = await axios.get(`/api/dashboard/activity?${params}`);
      setLogs(Array.isArray(r.data) ? r.data : r.data.logs || []);
      setTotal(r.data.total || 0);
    } catch { toast('Failed to load audit log', 'error'); }
    finally { setLoading(false); }
  }

  function exportCSV() {
    const header = 'Timestamp,User,Service,Action,Resource ID\n';
    const rows = logs.map(l =>
      `"${new Date(l.created_at).toISOString()}","${l.user_email || l.user_id}","${l.service}","${l.action}","${l.resource_id || ''}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'audit-log.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const services = [...new Set(logs.map(l => l.service))].filter(Boolean);
  const filtered = logs.filter(l =>
    (!filterService || l.service === filterService) &&
    (!filterAction || l.action.toLowerCase().includes(filterAction.toLowerCase()))
  );
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div>
      <Breadcrumb items={[{ label: 'Audit Log' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldCheck size={18} className="text-aws-orange" /> Audit Log
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">All API actions across your MyCloud account</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={fetchLogs}>Refresh</Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={exportCSV}>Export CSV</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <select className="aws-select" value={filterService}
          onChange={e => { setFilterService(e.target.value); setPage(1); }}>
          <option value="">All services</option>
          {services.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="aws-input w-52" placeholder="Filter by action…"
          value={filterAction} onChange={e => setFilterAction(e.target.value)} />
      </div>

      {loading ? <SkeletonTable rows={8} cols={5} /> : (
        <>
          <div className="border border-cloud-border rounded overflow-hidden">
            <table className="aws-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Service</th>
                  <th>Action</th>
                  <th>Resource ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-500 text-xs">No audit entries found.</td></tr>
                ) : filtered.map(log => (
                  <tr key={log.id}>
                    <td className="text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="text-gray-200">{log.user_email || log.user_id?.slice(0, 8)}</td>
                    <td>
                      <span className={`text-xs font-medium ${SERVICE_COLORS[log.service] || 'text-gray-400'}`}>
                        {log.service}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-gray-200">{log.action}</span>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-gray-400">{log.resource_id || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-500">
              Showing {filtered.length} entries
              {total > PAGE_SIZE && ` (page ${page} of ${totalPages})`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2.5 py-1 text-xs border border-cloud-border rounded text-gray-400 hover:text-white hover:bg-cloud-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Previous
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-2.5 py-1 text-xs border rounded transition-colors ${
                      p === page
                        ? 'border-aws-orange text-aws-orange bg-aws-orange/10'
                        : 'border-cloud-border text-gray-400 hover:text-white hover:bg-cloud-hover'
                    }`}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2.5 py-1 text-xs border border-cloud-border rounded text-gray-400 hover:text-white hover:bg-cloud-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

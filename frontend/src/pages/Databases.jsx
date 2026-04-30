import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Play, Square, Trash2, Copy, Check, Database, X } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import SkeletonTable from '../components/ui/Skeleton';

export default function Databases() {
  const toast = useToast();
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ name: '', engine: 'postgres', version: 'latest' });
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  async function load() {
    try {
      const r = await axios.get('/api/databases');
      setDatabases(r.data);
    } catch { toast('Failed to load databases', 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await axios.post('/api/databases', form);
      setDatabases(prev => [r.data, ...prev]);
      toast(`Database "${form.name}" provisioned`, 'success');
      setShowCreate(false);
      setForm({ name: '', engine: 'postgres', version: 'latest' });
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to provision database', 'error');
    } finally { setCreating(false); }
  }

  async function handleStart(id) {
    try {
      await axios.post(`/api/databases/${id}/start`);
      setDatabases(prev => prev.map(d => d.id === id ? { ...d, status: 'running' } : d));
      toast('Database started', 'success');
    } catch { toast('Failed to start database', 'error'); }
  }

  async function handleStop(id) {
    try {
      await axios.post(`/api/databases/${id}/stop`);
      setDatabases(prev => prev.map(d => d.id === id ? { ...d, status: 'stopped' } : d));
      toast('Database stopped', 'success');
    } catch { toast('Failed to stop database', 'error'); }
  }

  async function handleDelete() {
    try {
      await axios.delete(`/api/databases/${deleteTarget.id}`);
      setDatabases(prev => prev.filter(d => d.id !== deleteTarget.id));
      toast('Database deleted', 'success');
      setDeleteTarget(null);
    } catch { toast('Failed to delete database', 'error'); }
  }

  function copyConn(id, str) {
    navigator.clipboard.writeText(str);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'RDS Databases' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Database size={18} className="text-aws-orange" /> RDS Databases
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Provision and manage database instances</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
          Create database
        </Button>
      </div>

      {loading ? <SkeletonTable rows={4} cols={5} /> : (
        <div className="border border-cloud-border rounded overflow-hidden">
          <table className="aws-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Engine</th>
                <th>Status</th>
                <th>Connection string</th>
                <th>Cost/hr</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {databases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Database size={28} className="mx-auto text-gray-600 mb-2" />
                    <p className="text-xs text-gray-500">No databases. Click "Create database" to provision one.</p>
                  </td>
                </tr>
              ) : databases.map(db => (
                <tr key={db.id} className="group">
                  <td>
                    <p className="font-medium text-gray-200">{db.name}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">v{db.version}</p>
                  </td>
                  <td><Badge status={db.engine} label={db.engine} dot={false} /></td>
                  <td><Badge status={db.status} label={db.status} /></td>
                  <td>
                    {db.connection_string ? (
                      <div className="flex items-center gap-2 max-w-xs">
                        <code className="text-[10px] text-gray-400 font-mono truncate flex-1">{db.connection_string}</code>
                        <button onClick={() => copyConn(db.id, db.connection_string)}
                          className="text-gray-500 hover:text-gray-300 transition-colors shrink-0">
                          {copiedId === db.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="font-mono text-gray-400">${db.cost_per_hour}/hr</td>
                  <td>
                    <div className="flex items-center gap-1">
                      {db.engine !== 'sqlite' && db.status === 'stopped' && (
                        <button onClick={() => handleStart(db.id)} title="Start"
                          className="p-1 text-green-500 hover:text-green-400 transition-colors">
                          <Play size={13} />
                        </button>
                      )}
                      {db.engine !== 'sqlite' && db.status === 'running' && (
                        <button onClick={() => handleStop(db.id)} title="Stop"
                          className="p-1 text-yellow-500 hover:text-yellow-400 transition-colors">
                          <Square size={13} />
                        </button>
                      )}
                      <button onClick={() => setDeleteTarget(db)} title="Delete"
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-cloud-card border border-cloud-border rounded-lg w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Create database</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white"><X size={15} /></button>
            </div>
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">DB instance identifier *</label>
                <input className="aws-input w-full" placeholder="myapp-db"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Engine</label>
                <div className="grid grid-cols-2 gap-2">
                  {['postgres', 'sqlite'].map(eng => (
                    <button key={eng} type="button"
                      onClick={() => setForm(f => ({ ...f, engine: eng }))}
                      className={`border rounded p-3 text-left text-xs transition-colors ${
                        form.engine === eng ? 'border-aws-orange bg-aws-orange/10' : 'border-cloud-border hover:border-gray-500'
                      }`}>
                      <div className="font-semibold text-white capitalize">{eng}</div>
                      <div className="text-gray-400 mt-0.5 text-[10px]">
                        {eng === 'postgres' ? 'Container · $0.0116/hr' : 'File-based · $0.001/hr'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              {form.engine === 'postgres' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Version</label>
                  <select className="aws-select w-full" value={form.version}
                    onChange={e => setForm(f => ({ ...f, version: e.target.value }))}>
                    <option value="latest">Latest (16-alpine)</option>
                    <option value="15-alpine">PostgreSQL 15</option>
                    <option value="14-alpine">PostgreSQL 14</option>
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={creating}>Create database</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete database"
        message={`Delete "${deleteTarget?.name}"? All data will be permanently lost.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

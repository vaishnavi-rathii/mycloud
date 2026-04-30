import { useState, useEffect } from 'react';
import axios from 'axios';
import { KeyRound, Plus, Eye, EyeOff, RefreshCw, Trash2, Clock, ChevronRight } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { Badge, TypeBadge } from '../components/ui/Badge';
import { ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import SkeletonTable from '../components/ui/Skeleton';

const SECRET_TYPES = ['string', 'json', 'binary', 'credential'];

export default function Secrets() {
  const toast = useToast();
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [revealValues, setRevealValues] = useState({});
  const [historyPanel, setHistoryPanel] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ name: '', value: '', type: 'string', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchSecrets(); }, []);

  async function fetchSecrets() {
    try {
      const r = await axios.get('/api/secrets');
      setSecrets(r.data);
    } catch { toast('Failed to load secrets', 'error'); }
    finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.value.trim()) return;
    setSaving(true);
    try {
      await axios.post('/api/secrets', form);
      toast('Secret created', 'success');
      setShowCreate(false);
      setForm({ name: '', value: '', type: 'string', description: '' });
      fetchSecrets();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create secret', 'error');
    } finally { setSaving(false); }
  }

  async function handleReveal(id) {
    if (revealed[id]) {
      setRevealed(r => ({ ...r, [id]: false }));
      return;
    }
    try {
      const r = await axios.get(`/api/secrets/${id}/value?reveal=true`);
      setRevealValues(v => ({ ...v, [id]: r.data.value }));
      setRevealed(rv => ({ ...rv, [id]: true }));
    } catch { toast('Failed to reveal secret', 'error'); }
  }

  async function handleDelete() {
    try {
      await axios.delete(`/api/secrets/${deleteTarget.id}`);
      toast('Secret deleted', 'success');
      setDeleteTarget(null);
      fetchSecrets();
    } catch { toast('Failed to delete secret', 'error'); }
  }

  async function handleHistory(secret) {
    setHistoryPanel(secret);
    try {
      const r = await axios.get(`/api/secrets/${secret.id}/versions`);
      setHistory(r.data);
    } catch { toast('Failed to load version history', 'error'); }
  }

  async function handleRotate(id) {
    const newVal = prompt('Enter new secret value:');
    if (!newVal) return;
    try {
      await axios.put(`/api/secrets/${id}`, { value: newVal });
      toast('Secret rotated', 'success');
      setRevealed(r => ({ ...r, [id]: false }));
      fetchSecrets();
    } catch { toast('Failed to rotate secret', 'error'); }
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Secrets Manager' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <KeyRound size={18} className="text-aws-orange" /> Secrets Manager
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Securely store and manage application secrets, credentials, and configuration values</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
          Store new secret
        </Button>
      </div>

      {loading ? <SkeletonTable rows={5} cols={5} /> : (
        <div className="border border-cloud-border rounded overflow-hidden">
          <table className="aws-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
                <th>Description</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {secrets.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500 text-xs">
                  No secrets stored. Click "Store new secret" to add one.
                </td></tr>
              ) : secrets.map(s => (
                <tr key={s.id} className="group">
                  <td>
                    <button onClick={() => handleHistory(s)} className="aws-link font-mono text-xs">{s.name}</button>
                  </td>
                  <td><TypeBadge type={s.type} /></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-300">
                        {revealed[s.id] ? revealValues[s.id] : s.masked_value}
                      </span>
                      <button onClick={() => handleReveal(s.id)} className="text-gray-500 hover:text-gray-300 transition-colors">
                        {revealed[s.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  </td>
                  <td className="text-gray-400">{s.description || '—'}</td>
                  <td className="text-gray-400">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleHistory(s)} title="Version history"
                        className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                        <Clock size={13} />
                      </button>
                      <button onClick={() => handleRotate(s.id)} title="Rotate secret"
                        className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                        <RefreshCw size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget(s)} title="Delete"
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
            <div className="px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Store a new secret</h2>
            </div>
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Secret name *</label>
                <input className="aws-input w-full" placeholder="my-app/database-password"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Secret type</label>
                <select className="aws-select w-full" value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {SECRET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Secret value *</label>
                <textarea className="aws-input w-full font-mono text-xs" rows={3}
                  placeholder='{"username":"admin","password":"secret"}'
                  value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Description</label>
                <input className="aws-input w-full" placeholder="Optional description"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={saving}>Store secret</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Version history side panel */}
      {historyPanel && (
        <div className="fixed inset-0 z-50" onClick={() => setHistoryPanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-cloud-card border-l border-cloud-border shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-cloud-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">{historyPanel.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Version history</p>
              </div>
              <button onClick={() => setHistoryPanel(null)} className="text-gray-500 hover:text-white">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="p-5 space-y-2">
              {history.length === 0 ? (
                <p className="text-xs text-gray-500">No version history</p>
              ) : history.map((v, i) => (
                <div key={v.id} className="p-3 bg-cloud-sidebar rounded border border-cloud-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-gray-300">Version {history.length - i}</span>
                    {i === 0 && <Badge status="running" label="CURRENT" />}
                  </div>
                  <p className="text-[10px] text-gray-500">{new Date(v.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete secret"
        message={`Permanently delete "${deleteTarget?.name}"? This cannot be undone.`}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

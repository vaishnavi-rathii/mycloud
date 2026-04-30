import { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Plus, Trash2, Key, ChevronRight, Copy, Check } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import SkeletonTable from '../components/ui/Skeleton';

const ALL_PERMISSIONS = [
  'compute:read', 'compute:write', 'compute:delete',
  'storage:read', 'storage:write', 'storage:delete',
  'database:read', 'database:write', 'database:delete',
  'networking:read', 'networking:write',
  'secrets:read', 'secrets:write',
  'logs:read', 'iam:read',
];

export default function IAM() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailPanel, setDetailPanel] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', permissions: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    try {
      const r = await axios.get('/api/iam/users');
      setUsers(r.data);
    } catch { toast('Failed to load IAM users', 'error'); }
    finally { setLoading(false); }
  }

  async function openDetail(user) {
    setDetailPanel(user);
    setGeneratedKey(null);
    try {
      const r = await axios.get(`/api/iam/users/${user.id}/sessions`);
      setSessions(r.data);
    } catch {}
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/iam/users', form);
      toast('IAM user created', 'success');
      setShowCreate(false);
      setForm({ email: '', password: '', permissions: [] });
      fetchUsers();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create user', 'error');
    } finally { setSaving(false); }
  }

  async function handleGenerateKey() {
    try {
      const r = await axios.post(`/api/iam/users/${detailPanel.id}/api-key`);
      setGeneratedKey(r.data.api_key);
      toast('API key generated — copy it now, it will not be shown again', 'warning');
    } catch { toast('Failed to generate API key', 'error'); }
  }

  async function handleUpdatePermissions(userId, permissions) {
    try {
      await axios.put(`/api/iam/users/${userId}/permissions`, { permissions });
      toast('Permissions updated', 'success');
      fetchUsers();
    } catch { toast('Failed to update permissions', 'error'); }
  }

  async function handleDelete() {
    try {
      await axios.delete(`/api/iam/users/${deleteTarget.id}`);
      toast('User deleted', 'success');
      setDeleteTarget(null);
      if (detailPanel?.id === deleteTarget.id) setDetailPanel(null);
      fetchUsers();
    } catch { toast('Failed to delete user', 'error'); }
  }

  function copyKey() {
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function togglePerm(perm) {
    const current = detailPanel?.permissions || [];
    const updated = current.includes(perm) ? current.filter(p => p !== perm) : [...current, perm];
    setDetailPanel(d => ({ ...d, permissions: updated }));
    handleUpdatePermissions(detailPanel.id, updated);
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'IAM Users' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users size={18} className="text-aws-orange" /> IAM Users
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage sub-users, permissions, and API keys</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
          Create user
        </Button>
      </div>

      {loading ? <SkeletonTable rows={5} cols={5} /> : (
        <div className="border border-cloud-border rounded overflow-hidden">
          <table className="aws-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Permissions</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-500 text-xs">
                  No IAM users. Click "Create user" to add one.
                </td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="group cursor-pointer" onClick={() => openDetail(u)}>
                  <td>
                    <span className="aws-link">{u.email}</span>
                    <p className="text-[10px] text-gray-500 mt-0.5 font-mono">{u.id.slice(0, 8)}…</p>
                  </td>
                  <td><Badge status={u.role === 'admin' ? 'running' : 'stopped'} label={u.role} /></td>
                  <td>
                    <span className="text-xs text-gray-400">
                      {u.permissions?.length ? `${u.permissions.length} permissions` : 'No permissions'}
                    </span>
                  </td>
                  <td className="text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <button onClick={e => { e.stopPropagation(); setDeleteTarget(u); }}
                      className="p-1 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={13} />
                    </button>
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
          <div className="bg-cloud-card border border-cloud-border rounded-lg w-full max-w-lg shadow-2xl">
            <div className="px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Create IAM user</h2>
            </div>
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Email *</label>
                <input className="aws-input w-full" type="email" placeholder="user@example.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Password *</label>
                <input className="aws-input w-full" type="password" placeholder="Minimum 8 characters"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Permissions</label>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                  {ALL_PERMISSIONS.map(perm => (
                    <label key={perm} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={form.permissions.includes(perm)}
                        onChange={() => setForm(f => ({
                          ...f,
                          permissions: f.permissions.includes(perm)
                            ? f.permissions.filter(p => p !== perm)
                            : [...f.permissions, perm]
                        }))}
                        className="accent-aws-orange" />
                      <span className="font-mono">{perm}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={saving}>Create user</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail side panel */}
      {detailPanel && (
        <div className="fixed inset-0 z-50" onClick={() => setDetailPanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-[420px] bg-cloud-card border-l border-cloud-border shadow-2xl overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-cloud-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">{detailPanel.email}</h2>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{detailPanel.id}</p>
              </div>
              <button onClick={() => setDetailPanel(null)} className="text-gray-500 hover:text-white">
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5 flex-1">
              {/* API Key */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">API Key</p>
                {generatedKey ? (
                  <div className="bg-black/40 border border-green-500/30 rounded p-3">
                    <p className="text-[10px] text-green-400 mb-1.5">Generated — copy now, won't be shown again</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-green-300 font-mono flex-1 break-all">{generatedKey}</code>
                      <button onClick={copyKey} className="text-gray-400 hover:text-white shrink-0">
                        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <Button variant="secondary" size="sm" icon={Key} onClick={handleGenerateKey}>
                    Generate API key
                  </Button>
                )}
              </div>

              {/* Permissions */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Permissions</p>
                <div className="grid grid-cols-1 gap-1">
                  {ALL_PERMISSIONS.map(perm => (
                    <label key={perm} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer py-1 hover:text-white transition-colors">
                      <input type="checkbox"
                        checked={(detailPanel.permissions || []).includes(perm)}
                        onChange={() => togglePerm(perm)}
                        className="accent-aws-orange" />
                      <span className="font-mono">{perm}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Active sessions */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Active Sessions ({sessions.length})</p>
                {sessions.length === 0 ? (
                  <p className="text-xs text-gray-500">No active sessions</p>
                ) : (
                  <div className="space-y-1.5">
                    {sessions.map(s => (
                      <div key={s.id} className="p-2.5 bg-cloud-sidebar rounded border border-cloud-border">
                        <p className="text-xs text-gray-300 font-mono">{s.token?.slice(0, 20)}…</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Expires {new Date(s.expires_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-cloud-border">
              <Button variant="danger" size="sm" icon={Trash2}
                onClick={() => { setDeleteTarget(detailPanel); setDetailPanel(null); }}>
                Delete user
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete IAM user"
        message={`Delete user "${deleteTarget?.email}"? This will revoke all sessions and API keys.`}
        danger onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Scale, Plus, Trash2, Activity, ChevronRight, ArrowRight } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import SkeletonTable from '../components/ui/Skeleton';

export default function LoadBalancer() {
  const toast = useToast();
  const [lbs, setLbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailPanel, setDetailPanel] = useState(null);
  const [targets, setTargets] = useState([]);
  const [form, setForm] = useState({ name: '', algorithm: 'round-robin', port: 80 });
  const [targetForm, setTargetForm] = useState({ host: '', port: '', weight: 1 });
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => { fetchLBs(); }, []);

  async function fetchLBs() {
    try {
      const r = await axios.get('/api/lb');
      setLbs(r.data);
    } catch { toast('Failed to load load balancers', 'error'); }
    finally { setLoading(false); }
  }

  async function openDetail(lb) {
    setDetailPanel(lb);
    try {
      const r = await axios.get(`/api/lb/${lb.id}/targets`);
      setTargets(r.data);
    } catch { toast('Failed to load targets', 'error'); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/lb', { ...form, port: Number(form.port) });
      toast('Load balancer created', 'success');
      setShowCreate(false);
      setForm({ name: '', algorithm: 'round-robin', port: 80 });
      fetchLBs();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create load balancer', 'error');
    } finally { setSaving(false); }
  }

  async function handleAddTarget(e) {
    e.preventDefault();
    try {
      await axios.post(`/api/lb/${detailPanel.id}/targets`, { ...targetForm, port: Number(targetForm.port) });
      toast('Target added', 'success');
      setTargetForm({ host: '', port: '', weight: 1 });
      openDetail(detailPanel);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to add target', 'error');
    }
  }

  async function handleHealthCheck() {
    setChecking(true);
    try {
      await axios.post(`/api/lb/${detailPanel.id}/health-check`);
      toast('Health check complete', 'success');
      openDetail(detailPanel);
    } catch { toast('Health check failed', 'error'); }
    finally { setChecking(false); }
  }

  async function handleRemoveTarget(targetId) {
    try {
      await axios.delete(`/api/lb/${detailPanel.id}/targets/${targetId}`);
      toast('Target removed', 'success');
      openDetail(detailPanel);
    } catch { toast('Failed to remove target', 'error'); }
  }

  async function handleDelete() {
    try {
      await axios.delete(`/api/lb/${deleteTarget.id}`);
      toast('Load balancer deleted', 'success');
      setDeleteTarget(null);
      setDetailPanel(null);
      fetchLBs();
    } catch { toast('Failed to delete', 'error'); }
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Load Balancers' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Scale size={18} className="text-aws-orange" /> Load Balancers
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Distribute traffic across multiple backend targets</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
          Create load balancer
        </Button>
      </div>

      {loading ? <SkeletonTable rows={4} cols={5} /> : (
        <div className="border border-cloud-border rounded overflow-hidden">
          <table className="aws-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Algorithm</th>
                <th>Port</th>
                <th>Targets</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lbs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500 text-xs">
                  No load balancers. Click "Create load balancer" to start.
                </td></tr>
              ) : lbs.map(lb => (
                <tr key={lb.id} className="group cursor-pointer" onClick={() => openDetail(lb)}>
                  <td><span className="aws-link">{lb.name}</span></td>
                  <td><span className="text-xs font-mono text-gray-300">{lb.algorithm}</span></td>
                  <td className="font-mono text-gray-300">{lb.port}</td>
                  <td>{lb.target_count ?? 0} targets</td>
                  <td className="text-gray-400">{new Date(lb.created_at).toLocaleDateString()}</td>
                  <td>
                    <button onClick={e => { e.stopPropagation(); setDeleteTarget(lb); }}
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
          <div className="bg-cloud-card border border-cloud-border rounded-lg w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Create load balancer</h2>
            </div>
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Name *</label>
                <input className="aws-input w-full" placeholder="my-load-balancer"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Algorithm</label>
                  <select className="aws-select w-full" value={form.algorithm}
                    onChange={e => setForm(f => ({ ...f, algorithm: e.target.value }))}>
                    <option value="round-robin">Round Robin</option>
                    <option value="least-connections">Least Connections</option>
                    <option value="ip-hash">IP Hash</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Port</label>
                  <input className="aws-input w-full" type="number" min={1} max={65535}
                    value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={saving}>Create</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail side panel */}
      {detailPanel && (
        <div className="fixed inset-0 z-50" onClick={() => setDetailPanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-[480px] bg-cloud-card border-l border-cloud-border shadow-2xl overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-cloud-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">{detailPanel.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{detailPanel.algorithm} · port {detailPanel.port}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="xs" icon={Activity} loading={checking} onClick={handleHealthCheck}>
                  Health check
                </Button>
                <button onClick={() => setDetailPanel(null)} className="text-gray-500 hover:text-white">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Visual diagram */}
            <div className="px-5 py-4 border-b border-cloud-border">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Traffic flow</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-cloud-sidebar border border-aws-orange/30 rounded p-2 text-center">
                  <Scale size={14} className="text-aws-orange mx-auto mb-1" />
                  <p className="text-[10px] text-gray-300">{detailPanel.name}</p>
                  <p className="text-[10px] text-gray-500">:{detailPanel.port}</p>
                </div>
                <ArrowRight size={14} className="text-gray-600 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  {targets.length === 0 ? (
                    <div className="bg-cloud-sidebar border border-cloud-border rounded p-2 text-center">
                      <p className="text-[10px] text-gray-500">No targets</p>
                    </div>
                  ) : targets.map(t => (
                    <div key={t.id} className={`bg-cloud-sidebar border rounded p-2 ${t.healthy ? 'border-green-500/30' : 'border-red-500/30'}`}>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${t.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
                        <span className="text-[10px] font-mono text-gray-300">{t.host}:{t.port}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Targets table */}
            <div className="px-5 py-4 flex-1">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Targets ({targets.length})</p>
              <div className="space-y-1.5 mb-4">
                {targets.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-2.5 bg-cloud-sidebar rounded border border-cloud-border">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${t.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-xs font-mono text-gray-200">{t.host}:{t.port}</span>
                      <span className="text-[10px] text-gray-500">w={t.weight}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge status={t.healthy ? 'healthy' : 'unhealthy'} label={t.healthy ? 'Healthy' : 'Unhealthy'} />
                      <button onClick={() => handleRemoveTarget(t.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add target form */}
              <form onSubmit={handleAddTarget} className="bg-cloud-sidebar border border-cloud-border rounded p-3 space-y-2.5">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Add target</p>
                <div className="grid grid-cols-2 gap-2">
                  <input className="aws-input text-xs" placeholder="host (e.g. 10.0.0.1)"
                    value={targetForm.host} onChange={e => setTargetForm(f => ({ ...f, host: e.target.value }))} required />
                  <input className="aws-input text-xs" type="number" placeholder="port" min={1} max={65535}
                    value={targetForm.port} onChange={e => setTargetForm(f => ({ ...f, port: e.target.value }))} required />
                </div>
                <div className="flex items-center gap-2">
                  <input className="aws-input text-xs w-20" type="number" placeholder="weight" min={1}
                    value={targetForm.weight} onChange={e => setTargetForm(f => ({ ...f, weight: e.target.value }))} />
                  <Button variant="secondary" size="xs" type="submit" className="flex-1">Add target</Button>
                </div>
              </form>
            </div>

            <div className="px-5 py-3 border-t border-cloud-border">
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => { setDeleteTarget(detailPanel); setDetailPanel(null); }}>
                Delete load balancer
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete load balancer"
        message={`Delete "${deleteTarget?.name}" and all its targets?`}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

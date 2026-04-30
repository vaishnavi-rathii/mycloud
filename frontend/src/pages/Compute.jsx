import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Play, Square, Trash2, Activity, Server, Cpu, MemoryStick, Copy, Check, ChevronRight, X } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import SkeletonTable from '../components/ui/Skeleton';

const IMAGES = ['nginx:latest', 'alpine:latest', 'ubuntu:22.04', 'node:22-alpine', 'redis:alpine', 'httpd:alpine'];

function formatBytes(b) {
  if (!b) return '0 B';
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

export default function Compute() {
  const toast = useToast();
  const socket = useSocket();
  const [instances, setInstances] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailPanel, setDetailPanel] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [form, setForm] = useState({ name: '', image: '', instanceType: 'small' });
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const [inst, t] = await Promise.all([
        axios.get('/api/compute/instances'),
        axios.get('/api/compute/instance-types'),
      ]);
      setInstances(inst.data);
      setTypes(t.data);
    } catch { toast('Failed to load instances', 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('metrics', data => setMetrics(prev => ({ ...prev, [data.instanceId]: data })));
    return () => socket.off('metrics');
  }, [socket]);

  function watchMetrics(id) {
    socket?.emit('subscribe_metrics', { instanceId: id });
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await axios.post('/api/compute/instances', form);
      setInstances(prev => [r.data, ...prev]);
      toast(`Instance "${form.name}" launching`, 'success');
      setShowCreate(false);
      setForm({ name: '', image: '', instanceType: 'small' });
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to launch instance', 'error');
    } finally { setCreating(false); }
  }

  async function handleStart(id) {
    try {
      await axios.post(`/api/compute/instances/${id}/start`);
      setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'running' } : i));
      toast('Instance started', 'success');
    } catch { toast('Failed to start instance', 'error'); }
  }

  async function handleStop(id) {
    try {
      await axios.post(`/api/compute/instances/${id}/stop`);
      setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'stopped' } : i));
      toast('Instance stopped', 'success');
    } catch { toast('Failed to stop instance', 'error'); }
  }

  async function handleDelete() {
    try {
      await axios.delete(`/api/compute/instances/${deleteTarget.id}`);
      setInstances(prev => prev.filter(i => i.id !== deleteTarget.id));
      toast('Instance deleted', 'success');
      setDeleteTarget(null);
      if (detailPanel?.id === deleteTarget.id) setDetailPanel(null);
    } catch { toast('Failed to delete instance', 'error'); }
  }

  function copySSH(inst) {
    const cmd = `ssh -i ~/.ssh/id_rsa root@localhost -p ${inst.port_bindings?.['22/tcp']?.[0]?.HostPort || '22'}`;
    navigator.clipboard.writeText(cmd);
    setCopied(inst.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'EC2 Instances' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Server size={18} className="text-aws-orange" /> EC2 Instances
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage Docker container compute instances</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
          Launch instance
        </Button>
      </div>

      {loading ? <SkeletonTable rows={5} cols={7} /> : (
        <div className="border border-cloud-border rounded overflow-hidden">
          <table className="aws-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Image</th>
                <th>Type</th>
                <th>Status</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>Cost/hr</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {instances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Server size={28} className="mx-auto text-gray-600 mb-2" />
                    <p className="text-xs text-gray-500">No instances. Click "Launch instance" to get started.</p>
                  </td>
                </tr>
              ) : instances.map(inst => {
                const m = metrics[inst.id];
                return (
                  <tr key={inst.id} className="group cursor-pointer" onClick={() => { setDetailPanel(inst); watchMetrics(inst.id); }}>
                    <td>
                      <span className="aws-link font-medium">{inst.name}</span>
                      <p className="text-[10px] text-gray-500 mt-0.5 font-mono">{inst.container_id?.slice(0, 12)}</p>
                    </td>
                    <td className="font-mono text-xs text-gray-300">{inst.image}</td>
                    <td className="capitalize text-gray-300">{inst.instance_type}</td>
                    <td><Badge status={inst.status} label={inst.status} /></td>
                    <td className="font-mono text-gray-300">{m ? `${parseFloat(m.cpuPercent).toFixed(1)}%` : '—'}</td>
                    <td className="font-mono text-gray-300">{m ? formatBytes(m.memUsed) : '—'}</td>
                    <td className="font-mono text-gray-400">${inst.cost_per_hour}/hr</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {inst.status === 'stopped' && (
                          <button onClick={() => handleStart(inst.id)} title="Start"
                            className="p-1 text-green-500 hover:text-green-400 transition-colors">
                            <Play size={13} />
                          </button>
                        )}
                        {inst.status === 'running' && (
                          <button onClick={() => handleStop(inst.id)} title="Stop"
                            className="p-1 text-yellow-500 hover:text-yellow-400 transition-colors">
                            <Square size={13} />
                          </button>
                        )}
                        <button onClick={() => setDeleteTarget(inst)} title="Terminate"
                          className="p-1 text-gray-500 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Launch modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-cloud-card border border-cloud-border rounded-lg w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Launch instance</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white"><X size={15} /></button>
            </div>
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Name *</label>
                  <input className="aws-input w-full" placeholder="my-server"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Docker image *</label>
                  <input className="aws-input w-full font-mono" list="img-list" placeholder="nginx:latest"
                    value={form.image} onChange={e => setForm(f => ({ ...f, image: e.target.value }))} required />
                  <datalist id="img-list">{IMAGES.map(i => <option key={i} value={i} />)}</datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Instance type</label>
                <div className="grid grid-cols-3 gap-2">
                  {types.map(t => (
                    <button key={t.name} type="button"
                      onClick={() => setForm(f => ({ ...f, instanceType: t.name }))}
                      className={`border rounded p-3 text-left text-xs transition-colors ${
                        form.instanceType === t.name
                          ? 'border-aws-orange bg-aws-orange/10'
                          : 'border-cloud-border hover:border-gray-500'
                      }`}>
                      <div className="font-semibold text-white capitalize">{t.name}</div>
                      <div className="text-gray-400 mt-0.5">{t.cpu} vCPU · {t.memory}</div>
                      <div className="text-aws-orange mt-1 font-mono">${t.costPerHour}/hr</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={creating}>Launch instance</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail side panel */}
      {detailPanel && (
        <div className="fixed inset-0 z-50" onClick={() => setDetailPanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-[420px] bg-cloud-card border-l border-cloud-border shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-cloud-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">{detailPanel.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{detailPanel.image}</p>
              </div>
              <button onClick={() => setDetailPanel(null)} className="text-gray-500 hover:text-white">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {/* Status + actions */}
              <div className="flex items-center justify-between">
                <Badge status={detailPanel.status} label={detailPanel.status} />
                <div className="flex gap-1.5">
                  {detailPanel.status === 'stopped' && (
                    <Button variant="secondary" size="xs" icon={Play}
                      onClick={() => { handleStart(detailPanel.id); setDetailPanel(i => ({ ...i, status: 'running' })); }}>
                      Start
                    </Button>
                  )}
                  {detailPanel.status === 'running' && (
                    <Button variant="secondary" size="xs" icon={Square}
                      onClick={() => { handleStop(detailPanel.id); setDetailPanel(i => ({ ...i, status: 'stopped' })); }}>
                      Stop
                    </Button>
                  )}
                  <Button variant="danger" size="xs" icon={Trash2}
                    onClick={() => { setDeleteTarget(detailPanel); setDetailPanel(null); }}>
                    Terminate
                  </Button>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2">
                {[
                  ['Instance ID', detailPanel.id.slice(0, 8) + '…'],
                  ['Container ID', detailPanel.container_id?.slice(0, 12) || '—'],
                  ['Type', detailPanel.instance_type],
                  ['Cost/hr', `$${detailPanel.cost_per_hour}`],
                  ['Created', new Date(detailPanel.created_at).toLocaleString()],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs py-1 border-b border-cloud-border/50">
                    <span className="text-gray-500">{k}</span>
                    <span className="text-gray-200 font-mono">{v}</span>
                  </div>
                ))}
              </div>

              {/* Live metrics */}
              {metrics[detailPanel.id] && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Live Metrics</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: Cpu, label: 'CPU', value: `${parseFloat(metrics[detailPanel.id].cpuPercent).toFixed(1)}%` },
                      { icon: MemoryStick, label: 'Memory', value: formatBytes(metrics[detailPanel.id].memUsed) },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="bg-cloud-sidebar border border-cloud-border rounded p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon size={11} className="text-aws-orange" />
                          <span className="text-[10px] text-gray-500">{label}</span>
                        </div>
                        <p className="text-lg font-bold text-white font-mono">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SSH command */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">SSH Command</p>
                <div className="flex items-center gap-2 bg-black/30 border border-cloud-border rounded p-2.5">
                  <code className="text-[10px] text-green-300 font-mono flex-1 break-all">
                    ssh root@localhost -p {detailPanel.port_bindings?.['22/tcp']?.[0]?.HostPort || '22'}
                  </code>
                  <button onClick={() => copySSH(detailPanel)} className="text-gray-500 hover:text-white shrink-0">
                    {copied === detailPanel.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Terminate instance"
        message={`Terminate "${deleteTarget?.name}"? The container and all its data will be removed.`}
        confirmLabel="Terminate"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

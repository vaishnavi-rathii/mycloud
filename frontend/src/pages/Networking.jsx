import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Trash2, Network, Shield, X } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

export default function Networking() {
  const toast = useToast();
  const [namespaces, setNamespaces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rules, setRules] = useState([]);
  const [showCreateNs, setShowCreateNs] = useState(false);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [deleteNs, setDeleteNs] = useState(null);
  const [nsName, setNsName] = useState('');
  const [ruleForm, setRuleForm] = useState({ direction: 'inbound', port: '', protocol: 'tcp', action: 'allow' });
  const [creating, setCreating] = useState(false);

  async function loadNamespaces() {
    try {
      const r = await axios.get('/api/networking/namespaces');
      setNamespaces(r.data);
    } catch { toast('Failed to load namespaces', 'error'); }
  }

  async function selectNamespace(ns) {
    try {
      const r = await axios.get(`/api/networking/namespaces/${ns.id}`);
      setSelected(r.data);
      setRules(r.data.rules || []);
    } catch { toast('Failed to load namespace', 'error'); }
  }

  useEffect(() => { loadNamespaces(); }, []);

  async function handleCreateNs(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await axios.post('/api/networking/namespaces', { name: nsName });
      setNamespaces(prev => [r.data, ...prev]);
      toast('Namespace created', 'success');
      setShowCreateNs(false);
      setNsName('');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create namespace', 'error');
    } finally { setCreating(false); }
  }

  async function handleDeleteNs() {
    try {
      await axios.delete(`/api/networking/namespaces/${deleteNs.id}`);
      setNamespaces(prev => prev.filter(n => n.id !== deleteNs.id));
      if (selected?.id === deleteNs.id) setSelected(null);
      toast('Namespace deleted', 'success');
      setDeleteNs(null);
    } catch { toast('Failed to delete namespace', 'error'); }
  }

  async function handleCreateRule(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await axios.post(`/api/networking/namespaces/${selected.id}/rules`, { ...ruleForm, port: Number(ruleForm.port) });
      setRules(prev => [...prev, r.data]);
      toast('Rule added', 'success');
      setShowCreateRule(false);
      setRuleForm({ direction: 'inbound', port: '', protocol: 'tcp', action: 'allow' });
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to add rule', 'error');
    } finally { setCreating(false); }
  }

  async function handleDeleteRule(ruleId) {
    try {
      await axios.delete(`/api/networking/namespaces/${selected.id}/rules/${ruleId}`);
      setRules(prev => prev.filter(r => r.id !== ruleId));
      toast('Rule deleted', 'success');
    } catch { toast('Failed to delete rule', 'error'); }
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'VPC & Firewall' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Network size={18} className="text-aws-orange" /> VPC & Firewall
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Isolated Docker bridge networks with firewall rules</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreateNs(true)}>
          Create VPC
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Namespace list */}
        <div className="col-span-1">
          <div className="border border-cloud-border rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-cloud-border bg-cloud-card">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">VPC Namespaces</p>
            </div>
            {namespaces.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">No VPCs yet</div>
            ) : namespaces.map(ns => (
              <button key={ns.id} onClick={() => selectNamespace(ns)}
                className={`w-full text-left px-3 py-3 border-l-2 transition-colors group ${
                  selected?.id === ns.id ? 'bg-cloud-hover border-aws-orange' : 'border-transparent hover:bg-cloud-hover/50'
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Network size={13} className="text-aws-orange shrink-0" />
                    <span className="text-xs font-medium text-gray-200">{ns.name}</span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setDeleteNs(ns); }}
                    className="p-0.5 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 size={11} />
                  </button>
                </div>
                {ns.docker_network_id && (
                  <p className="text-[10px] text-gray-600 mt-0.5 font-mono pl-5">{ns.docker_network_id.slice(0, 12)}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Firewall rules */}
        <div className="col-span-2">
          {!selected ? (
            <div className="border border-cloud-border rounded h-48 flex items-center justify-center text-xs text-gray-500">
              Select a VPC to manage its firewall rules
            </div>
          ) : (
            <div className="border border-cloud-border rounded overflow-hidden">
              <div className="px-3 py-2 border-b border-cloud-border bg-cloud-card flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Firewall Rules</p>
                  <p className="text-xs text-gray-300 mt-0.5">{selected.name}</p>
                </div>
                <Button variant="secondary" size="xs" icon={Plus} onClick={() => setShowCreateRule(true)}>
                  Add rule
                </Button>
              </div>

              {rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Shield size={24} className="text-gray-600 mb-2" />
                  <p className="text-xs text-gray-500">No rules — all traffic is allowed</p>
                </div>
              ) : (
                <table className="aws-table">
                  <thead>
                    <tr>
                      <th>Direction</th>
                      <th>Port</th>
                      <th>Protocol</th>
                      <th>Action</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(rule => (
                      <tr key={rule.id} className="group">
                        <td className="capitalize text-gray-300">{rule.direction}</td>
                        <td className="font-mono text-gray-200">{rule.port}</td>
                        <td className="uppercase text-gray-400">{rule.protocol}</td>
                        <td>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            rule.action === 'allow' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {rule.action}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => handleDeleteRule(rule.id)}
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Resources in namespace */}
              {(selected.instances?.length > 0 || selected.databases?.length > 0) && (
                <div className="px-4 py-3 border-t border-cloud-border">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Resources in VPC</p>
                  <div className="space-y-1">
                    {selected.instances?.map(i => (
                      <div key={i.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-300">{i.name}</span>
                        <span className={i.status === 'running' ? 'text-green-400' : 'text-gray-500'}>{i.status}</span>
                      </div>
                    ))}
                    {selected.databases?.map(d => (
                      <div key={d.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-300">{d.name} ({d.engine})</span>
                        <span className={d.status === 'running' ? 'text-green-400' : 'text-gray-500'}>{d.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create namespace modal */}
      {showCreateNs && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-cloud-card border border-cloud-border rounded-lg w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Create VPC</h2>
              <button onClick={() => setShowCreateNs(false)} className="text-gray-500 hover:text-white"><X size={15} /></button>
            </div>
            <form onSubmit={handleCreateNs} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">VPC name *</label>
                <input className="aws-input w-full" placeholder="production"
                  value={nsName} onChange={e => setNsName(e.target.value)} required />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreateNs(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={creating}>Create VPC</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create rule modal */}
      {showCreateRule && selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-cloud-card border border-cloud-border rounded-lg w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Add firewall rule</h2>
              <button onClick={() => setShowCreateRule(false)} className="text-gray-500 hover:text-white"><X size={15} /></button>
            </div>
            <form onSubmit={handleCreateRule} className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Direction</label>
                  <select className="aws-select w-full" value={ruleForm.direction}
                    onChange={e => setRuleForm(r => ({ ...r, direction: e.target.value }))}>
                    <option value="inbound">Inbound</option>
                    <option value="outbound">Outbound</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Action</label>
                  <select className="aws-select w-full" value={ruleForm.action}
                    onChange={e => setRuleForm(r => ({ ...r, action: e.target.value }))}>
                    <option value="allow">Allow</option>
                    <option value="block">Block</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Port *</label>
                  <input className="aws-input w-full" type="number" min={1} max={65535} placeholder="80"
                    value={ruleForm.port} onChange={e => setRuleForm(r => ({ ...r, port: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Protocol</label>
                  <select className="aws-select w-full" value={ruleForm.protocol}
                    onChange={e => setRuleForm(r => ({ ...r, protocol: e.target.value }))}>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreateRule(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={creating}>Add rule</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteNs}
        title="Delete VPC"
        message={`Delete VPC "${deleteNs?.name}"? All associated instances must be removed first.`}
        danger onConfirm={handleDeleteNs} onCancel={() => setDeleteNs(null)}
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Globe2, Plus, Trash2, ChevronRight } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { TypeBadge } from '../components/ui/Badge';
import { ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import SkeletonTable from '../components/ui/Skeleton';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'PTR'];

export default function DNS() {
  const toast = useToast();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState(null);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [showCreateZone, setShowCreateZone] = useState(false);
  const [showCreateRecord, setShowCreateRecord] = useState(false);
  const [deleteZone, setDeleteZone] = useState(null);
  const [deleteRecord, setDeleteRecord] = useState(null);
  const [zoneForm, setZoneForm] = useState({ domain: '', description: '' });
  const [recordForm, setRecordForm] = useState({ type: 'A', name: '', value: '', ttl: 300 });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchZones(); }, []);

  async function fetchZones() {
    try {
      const r = await axios.get('/api/dns/zones');
      setZones(r.data);
    } catch { toast('Failed to load zones', 'error'); }
    finally { setLoading(false); }
  }

  async function selectZone(zone) {
    setSelectedZone(zone);
    setRecordsLoading(true);
    try {
      const r = await axios.get(`/api/dns/zones/${zone.id}/records`);
      setRecords(r.data);
    } catch { toast('Failed to load records', 'error'); }
    finally { setRecordsLoading(false); }
  }

  async function handleCreateZone(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/dns/zones', zoneForm);
      toast('Zone created', 'success');
      setShowCreateZone(false);
      setZoneForm({ domain: '', description: '' });
      fetchZones();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create zone', 'error');
    } finally { setSaving(false); }
  }

  async function handleCreateRecord(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post(`/api/dns/zones/${selectedZone.id}/records`, { ...recordForm, ttl: Number(recordForm.ttl) });
      toast('Record created', 'success');
      setShowCreateRecord(false);
      setRecordForm({ type: 'A', name: '', value: '', ttl: 300 });
      selectZone(selectedZone);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create record', 'error');
    } finally { setSaving(false); }
  }

  async function handleDeleteZone() {
    try {
      await axios.delete(`/api/dns/zones/${deleteZone.id}`);
      toast('Zone deleted', 'success');
      if (selectedZone?.id === deleteZone.id) setSelectedZone(null);
      setDeleteZone(null);
      fetchZones();
    } catch { toast('Failed to delete zone', 'error'); }
  }

  async function handleDeleteRecord() {
    try {
      await axios.delete(`/api/dns/zones/${selectedZone.id}/records/${deleteRecord.id}`);
      toast('Record deleted', 'success');
      setDeleteRecord(null);
      selectZone(selectedZone);
    } catch { toast('Failed to delete record', 'error'); }
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Route 53' }]} />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Globe2 size={18} className="text-aws-orange" /> Route 53
        </h1>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreateZone(true)}>
          Create hosted zone
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Zones list */}
        <div className="col-span-1">
          <div className="border border-cloud-border rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-cloud-border bg-cloud-card">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">Hosted Zones</p>
            </div>
            {loading ? (
              <div className="p-4 space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-cloud-hover rounded animate-skeleton" />)}
              </div>
            ) : zones.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500">
                No zones. Create one to get started.
              </div>
            ) : (
              <div>
                {zones.map(zone => (
                  <button key={zone.id}
                    onClick={() => selectZone(zone)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-xs transition-colors border-l-2 ${
                      selectedZone?.id === zone.id
                        ? 'bg-cloud-hover border-aws-orange text-white'
                        : 'border-transparent text-gray-300 hover:bg-cloud-hover/50 hover:text-white'
                    }`}>
                    <div>
                      <p className="font-medium">{zone.domain}</p>
                      {zone.description && <p className="text-[10px] text-gray-500 mt-0.5">{zone.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500">{zone.record_count ?? 0} records</span>
                      <button onClick={e => { e.stopPropagation(); setDeleteZone(zone); }}
                        className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Records table */}
        <div className="col-span-2">
          {!selectedZone ? (
            <div className="border border-cloud-border rounded h-48 flex items-center justify-center text-xs text-gray-500">
              Select a hosted zone to view records
            </div>
          ) : (
            <div className="border border-cloud-border rounded overflow-hidden">
              <div className="px-3 py-2 border-b border-cloud-border bg-cloud-card flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Records</p>
                  <span className="text-xs text-gray-400 font-medium">— {selectedZone.domain}</span>
                </div>
                <Button variant="secondary" size="xs" icon={Plus} onClick={() => setShowCreateRecord(true)}>
                  Add record
                </Button>
              </div>
              {recordsLoading ? <SkeletonTable rows={3} cols={5} /> : (
                <table className="aws-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Name</th>
                      <th>Value</th>
                      <th>TTL</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-xs text-gray-500">
                        No records. Click "Add record" to create one.
                      </td></tr>
                    ) : records.map(record => (
                      <tr key={record.id} className="group">
                        <td><TypeBadge type={record.type} /></td>
                        <td className="font-mono text-gray-200">{record.name || '@'}</td>
                        <td className="font-mono text-gray-300 max-w-48 truncate" title={record.value}>{record.value}</td>
                        <td className="text-gray-400">{record.ttl}s</td>
                        <td>
                          <button onClick={() => setDeleteRecord(record)}
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create zone modal */}
      {showCreateZone && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-cloud-card border border-cloud-border rounded-lg w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Create hosted zone</h2>
            </div>
            <form onSubmit={handleCreateZone} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Domain name *</label>
                <input className="aws-input w-full" placeholder="example.com"
                  value={zoneForm.domain} onChange={e => setZoneForm(f => ({ ...f, domain: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Description</label>
                <input className="aws-input w-full" placeholder="Optional description"
                  value={zoneForm.description} onChange={e => setZoneForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreateZone(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={saving}>Create zone</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create record modal */}
      {showCreateRecord && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-cloud-card border border-cloud-border rounded-lg w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Add DNS record</h2>
              <p className="text-xs text-gray-500 mt-0.5">{selectedZone.domain}</p>
            </div>
            <form onSubmit={handleCreateRecord} className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Type *</label>
                  <select className="aws-select w-full" value={recordForm.type}
                    onChange={e => setRecordForm(f => ({ ...f, type: e.target.value }))}>
                    {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">TTL (seconds)</label>
                  <input className="aws-input w-full" type="number" min={60}
                    value={recordForm.ttl} onChange={e => setRecordForm(f => ({ ...f, ttl: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Name (leave blank for zone apex)</label>
                <input className="aws-input w-full font-mono" placeholder="www"
                  value={recordForm.name} onChange={e => setRecordForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Value *</label>
                <input className="aws-input w-full font-mono" placeholder="192.0.2.1"
                  value={recordForm.value} onChange={e => setRecordForm(f => ({ ...f, value: e.target.value }))} required />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreateRecord(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={saving}>Add record</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteZone}
        title="Delete hosted zone"
        message={`Delete zone "${deleteZone?.domain}" and all its records?`}
        danger onConfirm={handleDeleteZone} onCancel={() => setDeleteZone(null)}
      />
      <ConfirmModal
        open={!!deleteRecord}
        title="Delete DNS record"
        message={`Delete ${deleteRecord?.type} record "${deleteRecord?.name || '@'}"?`}
        danger onConfirm={handleDeleteRecord} onCancel={() => setDeleteRecord(null)}
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, Plus, Trash2, Play, Square, History, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import SkeletonTable from '../components/ui/Skeleton';

const CRON_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Weekly (Mon 9am)', value: '0 9 * * 1' },
];

function cronDescription(expr) {
  const preset = CRON_PRESETS.find(p => p.value === expr);
  return preset ? preset.label : expr;
}

export default function Scheduler() {
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [historyPanel, setHistoryPanel] = useState(null);
  const [runs, setRuns] = useState([]);
  const [form, setForm] = useState({ name: '', expression: '*/5 * * * *', type: 'command', command: '', url: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchJobs(); }, []);

  async function fetchJobs() {
    try {
      const r = await axios.get('/api/scheduler');
      setJobs(r.data);
    } catch { toast('Failed to load jobs', 'error'); }
    finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/scheduler', form);
      toast('Job created', 'success');
      setShowCreate(false);
      setForm({ name: '', expression: '*/5 * * * *', type: 'command', command: '', url: '', description: '' });
      fetchJobs();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create job', 'error');
    } finally { setSaving(false); }
  }

  async function toggleJob(job) {
    try {
      const newStatus = job.status === 'active' ? 'paused' : 'active';
      await axios.patch(`/api/scheduler/${job.id}`, { status: newStatus });
      toast(`Job ${newStatus === 'active' ? 'resumed' : 'paused'}`, 'success');
      fetchJobs();
    } catch { toast('Failed to update job', 'error'); }
  }

  async function openHistory(job) {
    setHistoryPanel(job);
    try {
      const r = await axios.get(`/api/scheduler/${job.id}/runs`);
      setRuns(r.data);
    } catch { toast('Failed to load run history', 'error'); }
  }

  async function handleDelete() {
    try {
      await axios.delete(`/api/scheduler/${deleteTarget.id}`);
      toast('Job deleted', 'success');
      setDeleteTarget(null);
      fetchJobs();
    } catch { toast('Failed to delete job', 'error'); }
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'EventBridge Scheduler' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock size={18} className="text-aws-orange" /> EventBridge Scheduler
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Schedule recurring jobs using cron expressions</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
          Create schedule
        </Button>
      </div>

      {loading ? <SkeletonTable rows={4} cols={6} /> : (
        <div className="border border-cloud-border rounded overflow-hidden">
          <table className="aws-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Schedule</th>
                <th>Type</th>
                <th>Status</th>
                <th>Last run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500 text-xs">
                  No schedules. Click "Create schedule" to add one.
                </td></tr>
              ) : jobs.map(job => (
                <tr key={job.id} className="group">
                  <td>
                    <button onClick={() => openHistory(job)} className="aws-link">{job.name}</button>
                    {job.description && <p className="text-[10px] text-gray-500 mt-0.5">{job.description}</p>}
                  </td>
                  <td>
                    <div>
                      <span className="font-mono text-xs text-gray-200">{job.expression}</span>
                      <p className="text-[10px] text-gray-500">{cronDescription(job.expression)}</p>
                    </div>
                  </td>
                  <td>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-cloud-hover text-gray-300 font-mono">
                      {job.type}
                    </span>
                  </td>
                  <td><Badge status={job.status === 'active' ? 'running' : 'stopped'} label={job.status} /></td>
                  <td className="text-gray-400 text-xs">
                    {job.last_run ? new Date(job.last_run).toLocaleString() : '—'}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openHistory(job)} title="Run history"
                        className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                        <History size={13} />
                      </button>
                      <button onClick={() => toggleJob(job)}
                        title={job.status === 'active' ? 'Pause' : 'Resume'}
                        className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
                        {job.status === 'active' ? <Square size={13} /> : <Play size={13} />}
                      </button>
                      <button onClick={() => setDeleteTarget(job)}
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
          <div className="bg-cloud-card border border-cloud-border rounded-lg w-full max-w-lg shadow-2xl">
            <div className="px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Create schedule</h2>
            </div>
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Name *</label>
                  <input className="aws-input w-full" placeholder="daily-backup"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Type</label>
                  <select className="aws-select w-full" value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="command">Command</option>
                    <option value="http">HTTP</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Cron expression *</label>
                <div className="flex gap-2">
                  <input className="aws-input flex-1 font-mono" placeholder="*/5 * * * *"
                    value={form.expression} onChange={e => setForm(f => ({ ...f, expression: e.target.value }))} required />
                  <select className="aws-select w-44" value=""
                    onChange={e => e.target.value && setForm(f => ({ ...f, expression: e.target.value }))}>
                    <option value="">Presets…</option>
                    {CRON_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <p className="text-[10px] text-aws-orange mt-1">{cronDescription(form.expression)}</p>
              </div>
              {form.type === 'command' ? (
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Command *</label>
                  <input className="aws-input w-full font-mono" placeholder="echo hello world"
                    value={form.command} onChange={e => setForm(f => ({ ...f, command: e.target.value }))} required />
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">URL *</label>
                  <input className="aws-input w-full" type="url" placeholder="https://api.example.com/cron"
                    value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} required />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Description</label>
                <input className="aws-input w-full" placeholder="Optional description"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={saving}>Create schedule</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Run history panel */}
      {historyPanel && (
        <div className="fixed inset-0 z-50" onClick={() => setHistoryPanel(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-cloud-card border-l border-cloud-border shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-cloud-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">{historyPanel.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{historyPanel.expression}</p>
              </div>
              <button onClick={() => setHistoryPanel(null)} className="text-gray-500 hover:text-white">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="p-5 space-y-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Run history</p>
              {runs.length === 0 ? (
                <p className="text-xs text-gray-500">No runs yet</p>
              ) : runs.map(run => (
                <div key={run.id} className="p-3 bg-cloud-sidebar rounded border border-cloud-border">
                  <div className="flex items-center gap-2 mb-1">
                    {run.success
                      ? <CheckCircle size={13} className="text-green-400" />
                      : <XCircle size={13} className="text-red-400" />}
                    <span className="text-xs text-gray-300">{new Date(run.started_at).toLocaleString()}</span>
                    <span className="text-[10px] text-gray-500 ml-auto">{run.duration_ms}ms</span>
                  </div>
                  {run.output && (
                    <pre className="text-[10px] text-gray-400 bg-black/30 rounded p-2 mt-1 overflow-x-auto whitespace-pre-wrap max-h-20">
                      {run.output}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete schedule"
        message={`Delete job "${deleteTarget?.name}"? This will stop all scheduled executions.`}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

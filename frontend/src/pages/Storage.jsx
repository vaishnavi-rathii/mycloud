import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Plus, Trash2, Upload, Download, Lock, Globe, HardDrive, File } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import SkeletonTable from '../components/ui/Skeleton';

function formatBytes(b) {
  if (!b) return '0 B';
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

export default function Storage() {
  const toast = useToast();
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [objects, setObjects] = useState([]);
  const [objLoading, setObjLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newBucket, setNewBucket] = useState({ name: '', access: 'private' });
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteBucket, setDeleteBucket] = useState(null);
  const [deleteObj, setDeleteObj] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  async function loadBuckets() {
    try {
      const r = await axios.get('/api/storage/buckets');
      setBuckets(r.data);
    } catch { toast('Failed to load buckets', 'error'); }
    finally { setLoading(false); }
  }

  async function loadObjects(bucket) {
    setObjLoading(true);
    try {
      const r = await axios.get(`/api/storage/buckets/${bucket.name}/objects`);
      setObjects(r.data);
    } catch { toast('Failed to load objects', 'error'); }
    finally { setObjLoading(false); }
  }

  useEffect(() => { loadBuckets(); }, []);

  async function selectBucket(bucket) {
    setSelected(bucket);
    await loadObjects(bucket);
  }

  async function handleCreateBucket(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await axios.post('/api/storage/buckets', newBucket);
      toast('Bucket created', 'success');
      await loadBuckets();
      setShowCreate(false);
      setNewBucket({ name: '', access: 'private' });
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create bucket', 'error');
    } finally { setCreating(false); }
  }

  async function handleDeleteBucket() {
    try {
      await axios.delete(`/api/storage/buckets/${deleteBucket.name}`);
      toast('Bucket deleted', 'success');
      setBuckets(prev => prev.filter(b => b.name !== deleteBucket.name));
      if (selected?.name === deleteBucket.name) setSelected(null);
      setDeleteBucket(null);
    } catch (err) {
      toast(err.response?.data?.error || 'Cannot delete non-empty bucket', 'error');
      setDeleteBucket(null);
    }
  }

  async function toggleAccess(bucket) {
    const newAccess = bucket.access === 'public' ? 'private' : 'public';
    try {
      await axios.patch(`/api/storage/buckets/${bucket.name}`, { access: newAccess });
      setBuckets(prev => prev.map(b => b.name === bucket.name ? { ...b, access: newAccess } : b));
      if (selected?.name === bucket.name) setSelected(s => ({ ...s, access: newAccess }));
      toast(`Bucket set to ${newAccess}`, 'success');
    } catch { toast('Failed to update access', 'error'); }
  }

  async function uploadFile(file) {
    if (!selected || !file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      await axios.put(`/storage/${selected.name}/${file.name}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast(`"${file.name}" uploaded`, 'success');
      await loadObjects(selected);
    } catch (err) {
      toast(err.response?.data?.error || 'Upload failed', 'error');
    } finally { setUploading(false); }
  }

  async function handleDeleteObj() {
    try {
      await axios.delete(`/storage/${selected.name}/${deleteObj.key}`);
      toast('Object deleted', 'success');
      setObjects(prev => prev.filter(o => o.key !== deleteObj.key));
      setDeleteObj(null);
    } catch { toast('Failed to delete object', 'error'); }
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'S3 Storage' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <HardDrive size={18} className="text-aws-orange" /> S3 Storage
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Object storage with bucket management</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
          Create bucket
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* Bucket list */}
        <div className="col-span-1">
          <div className="border border-cloud-border rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-cloud-border bg-cloud-card">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">Buckets ({buckets.length})</p>
            </div>
            {loading ? (
              <div className="p-3 space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-cloud-hover rounded animate-skeleton" />)}
              </div>
            ) : buckets.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500">No buckets yet</div>
            ) : buckets.map(b => (
              <button key={b.id} onClick={() => selectBucket(b)}
                className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors group ${
                  selected?.id === b.id
                    ? 'bg-cloud-hover border-aws-orange'
                    : 'border-transparent hover:bg-cloud-hover/50'
                }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-200 truncate">{b.name}</span>
                  <button onClick={e => { e.stopPropagation(); setDeleteBucket(b); }}
                    className="p-0.5 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 size={11} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-gray-500">{b.object_count ?? 0} objects</span>
                  <button onClick={e => { e.stopPropagation(); toggleAccess(b); }}
                    className={`text-[10px] flex items-center gap-0.5 px-1 py-0.5 rounded ${
                      b.access === 'public' ? 'text-green-400 bg-green-400/10' : 'text-gray-500 bg-cloud-hover'
                    }`}>
                    {b.access === 'public' ? <Globe size={9} /> : <Lock size={9} />}
                    {b.access}
                  </button>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Object list */}
        <div className="col-span-3">
          {!selected ? (
            <div className="border border-cloud-border rounded h-48 flex items-center justify-center text-xs text-gray-500">
              Select a bucket to view objects
            </div>
          ) : (
            <div className="border border-cloud-border rounded overflow-hidden">
              <div className="px-3 py-2 border-b border-cloud-border bg-cloud-card flex items-center justify-between">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">
                  {selected.name} — {objects.length} objects
                </p>
                <div className="flex items-center gap-2">
                  {uploading && <span className="text-[10px] text-aws-orange animate-pulse">Uploading…</span>}
                  <Button variant="secondary" size="xs" icon={Upload}
                    onClick={() => fileRef.current.click()} loading={uploading}>
                    Upload
                  </Button>
                  <input ref={fileRef} type="file" className="hidden"
                    onChange={e => { if (e.target.files[0]) uploadFile(e.target.files[0]); e.target.value = ''; }} />
                </div>
              </div>

              <div
                className={`min-h-48 ${dragOver ? 'bg-aws-orange/5 border-2 border-dashed border-aws-orange/40' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}>
                {objLoading ? <SkeletonTable rows={3} cols={4} /> : objects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Upload size={24} className="text-gray-600 mb-2" />
                    <p className="text-xs text-gray-500">Drop files here or click Upload</p>
                  </div>
                ) : (
                  <table className="aws-table">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Size</th>
                        <th>Type</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {objects.map(obj => (
                        <tr key={obj.id} className="group">
                          <td>
                            <div className="flex items-center gap-1.5">
                              <File size={12} className="text-gray-500 shrink-0" />
                              <span className="font-mono text-xs text-gray-200 truncate max-w-64">{obj.key}</span>
                            </div>
                          </td>
                          <td className="text-gray-400">{formatBytes(obj.size_bytes)}</td>
                          <td className="text-gray-500 text-[10px] truncate max-w-28">{obj.content_type}</td>
                          <td>
                            <div className="flex items-center gap-1">
                              <a href={`/storage/${selected.name}/${obj.key}`} download={obj.key} target="_blank" rel="noreferrer"
                                className="p-1 text-gray-500 hover:text-gray-300 transition-colors" title="Download">
                                <Download size={12} />
                              </a>
                              <button onClick={() => setDeleteObj(obj)} title="Delete"
                                className="p-1 text-gray-500 hover:text-red-400 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create bucket modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-cloud-card border border-cloud-border rounded-lg w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-cloud-border">
              <h2 className="text-sm font-semibold text-white">Create bucket</h2>
            </div>
            <form onSubmit={handleCreateBucket} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Bucket name *</label>
                <input className="aws-input w-full" placeholder="my-bucket"
                  pattern="[a-z0-9-]{3,63}"
                  value={newBucket.name}
                  onChange={e => setNewBucket(b => ({ ...b, name: e.target.value.toLowerCase() }))} required />
                <p className="text-[10px] text-gray-600 mt-1">3–63 lowercase letters, numbers, hyphens</p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Access control</label>
                <div className="flex gap-2">
                  {['private', 'public'].map(a => (
                    <button key={a} type="button"
                      onClick={() => setNewBucket(b => ({ ...b, access: a }))}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs border rounded transition-colors ${
                        newBucket.access === a ? 'border-aws-orange text-white bg-aws-orange/10' : 'border-cloud-border text-gray-400 hover:border-gray-500'
                      }`}>
                      {a === 'public' ? <Globe size={11} /> : <Lock size={11} />}
                      <span className="capitalize">{a}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" loading={creating}>Create bucket</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteBucket}
        title="Delete bucket"
        message={`Delete bucket "${deleteBucket?.name}"? The bucket must be empty.`}
        danger onConfirm={handleDeleteBucket} onCancel={() => setDeleteBucket(null)}
      />
      <ConfirmModal
        open={!!deleteObj}
        title="Delete object"
        message={`Delete "${deleteObj?.key}"? This cannot be undone.`}
        danger onConfirm={handleDeleteObj} onCancel={() => setDeleteObj(null)}
      />
    </div>
  );
}

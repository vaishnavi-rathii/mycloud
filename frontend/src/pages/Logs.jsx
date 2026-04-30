import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ScrollText, Search, Download, RefreshCw, Circle } from 'lucide-react';
import Breadcrumb from '../components/layout/Breadcrumb';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

const LEVEL_COLORS = {
  ERROR: 'text-red-400',
  WARN:  'text-yellow-400',
  INFO:  'text-blue-400',
  DEBUG: 'text-gray-500',
};

const LEVEL_BG = {
  ERROR: 'bg-red-500/10',
  WARN:  'bg-yellow-500/10',
  INFO:  '',
  DEBUG: '',
};

function detectLevel(line) {
  const u = line.toUpperCase();
  if (u.includes('ERROR') || u.includes('FATAL') || u.includes('CRIT')) return 'ERROR';
  if (u.includes('WARN')) return 'WARN';
  if (u.includes('DEBUG') || u.includes('TRACE')) return 'DEBUG';
  return 'INFO';
}

export default function Logs() {
  const toast = useToast();
  const [instances, setInstances] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [filterLevel, setFilterLevel] = useState('ALL');
  const [filterText, setFilterText] = useState('');
  const [tail, setTail] = useState(200);
  const bottomRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    axios.get('/api/compute/instances')
      .then(r => setInstances(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  async function fetchLogs() {
    if (!selectedId) return;
    setLoading(true);
    setLines([]);
    stopStream();
    try {
      const r = await axios.get(`/api/logs/${selectedId}?tail=${tail}`);
      setLines(r.data.map(raw => ({ raw, level: detectLevel(raw) })));
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to fetch logs', 'error');
    } finally { setLoading(false); }
  }

  function startStream() {
    if (!selectedId) return;
    stopStream();
    setStreaming(true);
    const es = new EventSource(`/api/logs/${selectedId}/stream`);
    esRef.current = es;
    es.onmessage = e => {
      if (e.data === '[DONE]') { stopStream(); return; }
      setLines(prev => [...prev.slice(-999), { raw: e.data, level: detectLevel(e.data) }]);
    };
    es.onerror = () => stopStream();
  }

  function stopStream() {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setStreaming(false);
  }

  function downloadLogs() {
    const content = lines.map(l => l.raw).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${selectedId}-logs.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  const selectedInstance = instances.find(i => i.id === selectedId);
  const filtered = lines.filter(l =>
    (filterLevel === 'ALL' || l.level === filterLevel) &&
    (!filterText || l.raw.toLowerCase().includes(filterText.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <Breadcrumb items={[{ label: 'CloudWatch Logs' }]} />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <ScrollText size={18} className="text-aws-orange" /> CloudWatch Logs
        </h1>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className="aws-select" value={selectedId}
          onChange={e => { setSelectedId(e.target.value); setLines([]); stopStream(); }}>
          <option value="">Select instance…</option>
          {instances.filter(i => i.status === 'running').map(i => (
            <option key={i.id} value={i.id}>{i.name} ({i.container_id?.slice(0,12)})</option>
          ))}
        </select>

        <select className="aws-select w-28" value={tail}
          onChange={e => setTail(Number(e.target.value))}>
          <option value={50}>50 lines</option>
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
          <option value={1000}>1000 lines</option>
        </select>

        <select className="aws-select w-24" value={filterLevel}
          onChange={e => setFilterLevel(e.target.value)}>
          <option value="ALL">All levels</option>
          <option value="ERROR">ERROR</option>
          <option value="WARN">WARN</option>
          <option value="INFO">INFO</option>
          <option value="DEBUG">DEBUG</option>
        </select>

        <div className="flex items-center gap-1 flex-1 min-w-32 bg-cloud-input border border-cloud-border rounded px-2.5 py-1.5">
          <Search size={12} className="text-gray-500 shrink-0" />
          <input className="bg-transparent text-xs text-gray-200 placeholder-gray-600 flex-1 outline-none"
            placeholder="Filter logs…" value={filterText} onChange={e => setFilterText(e.target.value)} />
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchLogs}
            loading={loading} disabled={!selectedId}>
            Fetch
          </Button>
          {streaming ? (
            <Button variant="danger" size="sm" onClick={stopStream}>Stop stream</Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={startStream} disabled={!selectedId}>
              <span className="flex items-center gap-1.5">
                <Circle size={8} className="text-red-400 fill-red-400" /> Live stream
              </span>
            </Button>
          )}
          {lines.length > 0 && (
            <Button variant="ghost" size="sm" icon={Download} onClick={downloadLogs}>Export</Button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {lines.length > 0 && (
        <div className="flex items-center gap-4 mb-2 text-[10px] text-gray-500">
          <span>{filtered.length} / {lines.length} lines</span>
          {['ERROR','WARN','INFO','DEBUG'].map(lvl => {
            const count = lines.filter(l => l.level === lvl).length;
            return count > 0 ? (
              <span key={lvl} className={LEVEL_COLORS[lvl]}>{lvl}: {count}</span>
            ) : null;
          })}
          {streaming && (
            <span className="flex items-center gap-1 text-red-400 ml-auto">
              <Circle size={7} className="fill-red-400 animate-pulse" /> Streaming
            </span>
          )}
        </div>
      )}

      {/* Log terminal */}
      <div className="flex-1 bg-black border border-cloud-border rounded font-mono text-xs overflow-y-auto">
        {!selectedId ? (
          <div className="flex items-center justify-center h-full text-gray-600">
            Select a running instance to view logs
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading logs…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600">
            {lines.length === 0 ? 'No logs. Click "Fetch" to load.' : 'No lines match the current filter.'}
          </div>
        ) : (
          <div className="p-3 space-y-0.5">
            {filtered.map((line, i) => (
              <div key={i} className={`px-1 rounded leading-relaxed ${LEVEL_BG[line.level]}`}>
                <span className={`${LEVEL_COLORS[line.level]} mr-2 text-[10px] font-bold`}>[{line.level}]</span>
                <span className="text-gray-300 whitespace-pre-wrap break-all">{line.raw}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}

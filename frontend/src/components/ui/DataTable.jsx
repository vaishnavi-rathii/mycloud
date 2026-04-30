import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

function Skeleton() {
  return (
    <tr className="border-b border-cloud-border/50">
      {[1,2,3,4,5].map(i => (
        <td key={i} className="px-3 py-2.5">
          <div className="h-3 bg-cloud-hover rounded animate-skeleton" style={{ width: `${40 + Math.random()*40}%` }} />
        </td>
      ))}
    </tr>
  );
}

export default function DataTable({
  columns, data = [], loading, onRowClick, selectable, onSelectionChange,
  pageSize = 25, emptyMessage = 'No items found', emptyIcon: EmptyIcon,
  rowActions, headerActions,
}) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sort.key) return data;
    return [...data].sort((a, b) => {
      const av = a[sort.key] ?? '', bv = b[sort.key] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, sort]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
    setPage(1);
  }

  function toggleRow(id) {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      onSelectionChange?.(n);
      return n;
    });
  }

  function toggleAll() {
    const allIds = paged.map(r => r.id);
    const allSelected = allIds.every(id => selected.has(id));
    setSelected(s => {
      const n = new Set(s);
      allIds.forEach(id => allSelected ? n.delete(id) : n.add(id));
      onSelectionChange?.(n);
      return n;
    });
  }

  const allOnPageSelected = paged.length > 0 && paged.every(r => selected.has(r.id));

  return (
    <div className="flex flex-col">
      {/* Header bar */}
      {(selected.size > 0 || headerActions) && (
        <div className="flex items-center justify-between px-3 py-2 bg-cloud-card border border-b-0 border-cloud-border rounded-t">
          <span className="text-xs text-gray-400">
            {selected.size > 0 ? `${selected.size} selected` : ''}
          </span>
          <div className="flex items-center gap-2">{headerActions}</div>
        </div>
      )}

      <div className={`overflow-x-auto border border-cloud-border ${selected.size > 0 || headerActions ? 'rounded-b' : 'rounded'}`}>
        <table className="aws-table">
          <thead>
            <tr>
              {selectable && (
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll}
                    className="rounded border-cloud-border bg-cloud-input accent-aws-orange cursor-pointer" />
                </th>
              )}
              {columns.map(col => (
                <th key={col.key} style={col.width ? { width: col.width } : {}}
                  className={col.sortable ? 'cursor-pointer hover:text-white select-none' : ''}>
                  <div className="flex items-center gap-1" onClick={() => col.sortable && toggleSort(col.key)}>
                    {col.label}
                    {col.sortable && (
                      <span className="text-gray-600">
                        {sort.key === col.key ? (sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ChevronsUpDown size={11} />}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {rowActions && <th className="w-24 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array(5).fill(0).map((_, i) => <Skeleton key={i} />)
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}
                  className="py-16 text-center text-gray-500">
                  {EmptyIcon && <EmptyIcon size={28} className="mx-auto mb-2 text-gray-700" />}
                  {emptyMessage}
                </td>
              </tr>
            ) : paged.map(row => (
              <tr key={row.id} onClick={() => onRowClick?.(row)}
                className={`${selected.has(row.id) ? 'selected' : ''} ${onRowClick ? 'cursor-pointer' : ''}`}>
                {selectable && (
                  <td className="w-8 px-3" onClick={e => { e.stopPropagation(); toggleRow(row.id); }}>
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => {}}
                      className="rounded border-cloud-border bg-cloud-input accent-aws-orange cursor-pointer" />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key}>{col.render ? col.render(row[col.key], row) : row[col.key]}</td>
                ))}
                {rowActions && (
                  <td className="text-right" onClick={e => e.stopPropagation()}>
                    {rowActions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-cloud-border mt-0">
          <span className="text-xs text-gray-500">
            {(page-1)*pageSize+1}–{Math.min(page*pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
              className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-gray-400 px-2">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
              className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SkeletonLine({ width = 'full', height = 3 }) {
  const w = width === 'full' ? 'w-full' : `w-${width}`;
  return <div className={`${w} h-${height} bg-cloud-hover rounded animate-skeleton`} />;
}

export function SkeletonCard() {
  return (
    <div className="aws-card p-4 space-y-3">
      <SkeletonLine width="1/3" height={3} />
      <SkeletonLine height={6} />
      <SkeletonLine width="2/3" height={2} />
    </div>
  );
}

export default function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className="border border-cloud-border rounded overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-cloud-border bg-cloud-card">
            {Array(cols).fill(0).map((_,i) => (
              <th key={i} className="px-3 py-2.5">
                <div className="h-2.5 bg-cloud-hover rounded animate-skeleton" style={{ width: '60%' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array(rows).fill(0).map((_,i) => (
            <tr key={i} className="border-b border-cloud-border/50">
              {Array(cols).fill(0).map((_,j) => (
                <td key={j} className="px-3 py-2.5">
                  <div className="h-2.5 bg-cloud-hover rounded animate-skeleton" style={{ width: `${40+Math.random()*40}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

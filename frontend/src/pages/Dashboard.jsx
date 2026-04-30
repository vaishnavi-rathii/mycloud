import { useEffect, useState } from 'react';
import axios from 'axios';
import { Server, HardDrive, Database, Network, DollarSign, Activity, KeyRound, Scale, Clock, ScrollText, Globe2, ShieldCheck, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useSocket } from '../context/SocketContext';
import Breadcrumb from '../components/layout/Breadcrumb';

const SERVICE_HEALTH = [
  { label: 'EC2 Compute',     icon: Server,     route: '/compute'     },
  { label: 'S3 Storage',      icon: HardDrive,  route: '/storage'     },
  { label: 'RDS Databases',   icon: Database,   route: '/databases'   },
  { label: 'VPC Networking',  icon: Network,    route: '/networking'  },
  { label: 'Secrets Manager', icon: KeyRound,   route: '/secrets'     },
  { label: 'Load Balancers',  icon: Scale,      route: '/loadbalancer'},
  { label: 'Scheduler',       icon: Clock,      route: '/scheduler'   },
  { label: 'CloudWatch Logs', icon: ScrollText, route: '/logs'        },
  { label: 'Route 53',        icon: Globe2,     route: '/dns'         },
  { label: 'IAM',             icon: Users,      route: '/iam'         },
];

const DONUT_COLORS = ['#FF9900', '#3b82f6', '#a855f7', '#22c55e'];

function StatCard({ icon: Icon, title, value, sub, color }) {
  const colors = {
    orange: 'text-aws-orange bg-aws-orange/10 border-aws-orange/20',
    blue:   'text-blue-400 bg-blue-400/10 border-blue-400/20',
    green:  'text-green-400 bg-green-400/10 border-green-400/20',
    purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  };
  return (
    <div className="aws-card p-4 flex items-start gap-3">
      <div className={`p-2 rounded border ${colors[color] || colors.blue}`}>
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [billing, setBilling] = useState(null);
  const [activity, setActivity] = useState([]);
  const [sparkline, setSparkline] = useState([]);
  const socket = useSocket();

  async function load() {
    try {
      const [s, b, a] = await Promise.all([
        axios.get('/api/dashboard/summary'),
        axios.get('/api/dashboard/billing'),
        axios.get('/api/dashboard/activity?limit=20'),
      ]);
      setSummary(s.data);
      setBilling(b.data);
      setActivity(Array.isArray(a.data) ? a.data : a.data?.logs || []);
    } catch {}
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('activity', entry => setActivity(prev => [entry, ...prev].slice(0, 20)));
    return () => socket.off('activity');
  }, [socket]);

  useEffect(() => {
    const id = setInterval(() => {
      setSparkline(prev => {
        const next = [...prev, { t: new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }), v: Math.floor(Math.random() * 35) + 15 }];
        return next.slice(-20);
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const runningInstances = summary?.compute?.running ?? 0;
  const totalInstances = (summary?.compute?.running ?? 0) + (summary?.compute?.stopped ?? 0);
  const runningDbs = summary?.databases?.running ?? 0;
  const totalDbs = (summary?.databases?.running ?? 0) + (summary?.databases?.stopped ?? 0);
  const computeCost = billing?.currentRun?.computeCostPerHour ?? 0;
  const dbCost = billing?.currentRun?.databaseCostPerHour ?? 0;
  const totalCost = billing?.currentRun?.totalCostPerHour ?? 0;

  const donutData = [
    { name: 'Compute', value: computeCost || 0.001 },
    { name: 'Databases', value: dbCost || 0.001 },
    { name: 'Storage', value: 0.0001 },
    { name: 'Other', value: 0.0001 },
  ];

  const SERVICE_COLOR = {
    compute: 'text-blue-400', storage: 'text-purple-400', database: 'text-green-400',
    networking: 'text-cyan-400', auth: 'text-orange-400', secrets: 'text-yellow-400',
    iam: 'text-red-400',
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Dashboard' }]} />

      <div>
        <h1 className="text-base font-semibold text-white">MyCloud Console</h1>
        <p className="text-xs text-gray-500 mt-0.5">Platform health overview — us-east-1</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Server} title="Running Instances" value={runningInstances} sub={`${totalInstances} total`} color="blue" />
        <StatCard icon={HardDrive} title="S3 Buckets" value={summary?.storage?.buckets ?? 0} sub="object storage" color="purple" />
        <StatCard icon={Database} title="Managed DBs" value={runningDbs} sub={`${totalDbs} total`} color="green" />
        <StatCard icon={DollarSign} title="Est. Cost/hr" value={`$${totalCost.toFixed(4)}`} sub="compute + database" color="orange" />
      </div>

      {/* Service health grid */}
      <div className="aws-card p-4">
        <p className="text-xs font-semibold text-gray-300 mb-3">Service Health</p>
        <div className="grid grid-cols-5 gap-2">
          {SERVICE_HEALTH.map(({ label, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2 p-2 rounded bg-cloud-sidebar border border-cloud-border">
              <CheckCircle size={13} className="text-green-400 shrink-0" />
              <div className="min-w-0">
                <Icon size={11} className="text-gray-400 mb-0.5" />
                <p className="text-[9px] text-gray-400 truncate">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sparkline */}
        <div className="lg:col-span-2 aws-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-300">Platform Activity</p>
            <div className="flex items-center gap-1 text-[10px] text-green-400">
              <Activity size={10} className="animate-pulse" /> Live
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={sparkline}>
              <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#6b7280' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={24} domain={[0, 60]} />
              <Tooltip
                contentStyle={{ background: '#1a2332', border: '1px solid #2d3748', borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: '#9ca3af' }}
                itemStyle={{ color: '#FF9900' }}
              />
              <Line type="monotone" dataKey="v" stroke="#FF9900" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Billing donut */}
        <div className="aws-card p-4">
          <p className="text-xs font-semibold text-gray-300 mb-3">Cost Breakdown</p>
          <div className="flex flex-col items-center">
            <PieChart width={140} height={140}>
              <Pie data={donutData} cx={70} cy={70} innerRadius={45} outerRadius={65} dataKey="value" strokeWidth={0}>
                {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
              </Pie>
            </PieChart>
            <div className="w-full space-y-1.5 mt-2">
              {donutData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm" style={{ background: DONUT_COLORS[i] }} />
                    <span className="text-gray-400">{d.name}</span>
                  </div>
                  <span className="text-gray-200 font-mono">${d.value.toFixed(4)}</span>
                </div>
              ))}
              <div className="border-t border-cloud-border pt-1.5 flex items-center justify-between text-xs">
                <span className="text-gray-400 font-semibold">Total/hr</span>
                <span className="text-aws-orange font-mono font-semibold">${totalCost.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="aws-card">
        <div className="px-4 py-3 border-b border-cloud-border">
          <p className="text-xs font-semibold text-gray-300">Recent Activity</p>
        </div>
        <div className="divide-y divide-cloud-border/50">
          {activity.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-500">No recent activity</div>
          ) : activity.slice(0, 10).map((entry, i) => (
            <div key={entry.id || i} className="flex items-start gap-3 px-4 py-2.5">
              <AlertCircle size={13} className={`mt-0.5 shrink-0 ${SERVICE_COLOR[entry.service] || 'text-gray-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold uppercase ${SERVICE_COLOR[entry.service] || 'text-gray-500'}`}>{entry.service}</span>
                  <span className="text-xs text-gray-300">{entry.action}</span>
                  {entry.resource_id && <span className="text-[10px] text-gray-500 font-mono">{entry.resource_id.slice(0, 8)}</span>}
                </div>
              </div>
              <span className="text-[10px] text-gray-600 shrink-0">
                {new Date(entry.created_at).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

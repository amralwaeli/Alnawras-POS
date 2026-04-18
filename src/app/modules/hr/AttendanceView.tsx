import { useState, useEffect, useCallback } from 'react';
import { usePOS } from '../../context/POSContext';
import { HRController } from '../../controllers/HRController';
import { AttendanceLog, Employee } from '../../models/types';
import { supabase } from '../../../lib/supabase';
import {
  Clock, UserCheck, AlertCircle, ShieldOff, RefreshCw,
  Fingerprint, ExternalLink, UserX, TrendingUp, Users,
  CheckCircle, Search, Download
} from 'lucide-react';

const fmt = (d?: Date | string) =>
  d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const todayStr = () => new Date().toISOString().split('T')[0];

const statusStyle: Record<string, string> = {
  'on-time':    'bg-emerald-100 text-emerald-700',
  late:         'bg-red-100 text-red-700',
  'early-leave':'bg-orange-100 text-orange-700',
  present:      'bg-blue-100 text-blue-700',
  absent:       'bg-gray-100 text-gray-600',
};

function StatCard({ label, value, icon: Icon, colorText, colorBg, colorIcon, pulse = false }: {
  label: string; value: number | string; icon: any;
  colorText: string; colorBg: string; colorIcon: string; pulse?: boolean;
}) {
  return (
    <div className={`${colorBg} rounded-2xl p-5 border border-black/5 relative overflow-hidden`}>
      {pulse && Number(value) > 0 && (
        <span className="absolute top-3 right-3 size-2 rounded-full bg-emerald-400 animate-ping" />
      )}
      <div className={`inline-flex size-10 items-center justify-center rounded-xl ${colorIcon} mb-3`}>
        <Icon className="size-5" />
      </div>
      <p className="text-sm text-gray-500 mb-0.5">{label}</p>
      <p className={`text-3xl font-bold ${colorText}`}>{value}</p>
    </div>
  );
}

function exportCSV(logs: AttendanceLog[], absentEmps: Employee[], date: string) {
  const rows = [
    ['Employee', 'Employee ID', 'Date', 'Scheduled Start', 'Scheduled End', 'Check In', 'Check Out', 'Late (min)', 'OT (min)', 'Status', 'Method'],
    ...logs.map(l => [
      l.fullName, l.employeeId, l.logDate, l.scheduledStart, l.scheduledEnd,
      l.checkInTime ? new Date(l.checkInTime).toLocaleTimeString() : '',
      l.checkOutTime ? new Date(l.checkOutTime).toLocaleTimeString() : '',
      l.lateMinutes, l.overtimeMinutes, l.status, l.checkInMethod
    ]),
    ...absentEmps.map(e => [
      e.fullName, e.employeeId, date, e.shiftStart, e.shiftEnd, '', '', '', '', 'absent', ''
    ])
  ];
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = `attendance-${date}.csv`;
  a.click();
}

export function AttendanceView() {
  const { currentUser } = usePOS();
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterDate, setFilterDate] = useState(todayStr());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [showAbsent, setShowAbsent] = useState(true);

  if (!currentUser) return null;

  if (currentUser.role !== 'admin' && currentUser.role !== 'hr') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="size-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldOff className="size-6 text-gray-400" />
          </div>
          <h2 className="font-semibold text-gray-800 mb-1">Access Restricted</h2>
          <p className="text-sm text-gray-500">Only Admin and HR can view attendance</p>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const loadData = useCallback(async () => {
    setLoading(true);
    const [logsRes, empsRes] = await Promise.all([
      HRController.getAttendanceLogs({ date: filterDate }),
      HRController.getEmployees(),
    ]);
    if (logsRes.success && logsRes.data) setLogs(logsRes.data);
    if (empsRes.success && empsRes.data) setEmployees(empsRes.data.filter(e => e.status === 'active'));
    setLastUpdate(new Date());
    setLoading(false);
  }, [filterDate]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { loadData(); }, [loadData]);

  // Supabase Realtime subscription
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const channel = supabase
      .channel('attendance-logs-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
        loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const isToday = filterDate === todayStr();
  const checkedInIds = new Set(logs.map(l => l.employeeId));
  const absentEmployees = employees.filter(e => !checkedInIds.has(e.employeeId));
  const presentLogs = logs.filter(l => l.checkInTime);
  const lateLogs = logs.filter(l => l.lateMinutes > 0);
  const onTimeLogs = presentLogs.filter(l => l.lateMinutes === 0);
  const checkedOutLogs = logs.filter(l => l.checkOutTime);

  const filteredLogs = logs.filter(l =>
    l.fullName.toLowerCase().includes(search.toLowerCase()) ||
    l.employeeId.toLowerCase().includes(search.toLowerCase())
  );
  const filteredAbsent = absentEmployees.filter(e =>
    e.fullName.toLowerCase().includes(search.toLowerCase()) ||
    e.employeeId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-7xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Live Attendance</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-gray-500 text-sm">
                {new Date(filterDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              {isToday && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">
                  <span className="size-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#/fingerprint-checkin"
              target="_blank"
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors shadow-sm"
            >
              <Fingerprint className="size-4" /> Open Kiosk
              <ExternalLink className="size-3.5 opacity-70" />
            </a>
            <button
              onClick={() => exportCSV(logs, absentEmployees, filterDate)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-white transition-colors bg-white"
            >
              <Download className="size-4" /> Export
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Employees" value={employees.length} icon={Users}
            colorText="text-gray-700" colorBg="bg-white" colorIcon="bg-gray-100 text-gray-500" />
          <StatCard label="Present" value={presentLogs.length} icon={UserCheck}
            colorText="text-emerald-700" colorBg="bg-emerald-50" colorIcon="bg-emerald-100 text-emerald-600" pulse={isToday} />
          <StatCard label="On Time" value={onTimeLogs.length} icon={CheckCircle}
            colorText="text-blue-700" colorBg="bg-blue-50" colorIcon="bg-blue-100 text-blue-600" />
          <StatCard label="Late Arrivals" value={lateLogs.length} icon={AlertCircle}
            colorText={lateLogs.length > 0 ? 'text-red-700' : 'text-gray-500'}
            colorBg={lateLogs.length > 0 ? 'bg-red-50' : 'bg-gray-50'}
            colorIcon={lateLogs.length > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'} />
          <StatCard label="Absent / Missing" value={absentEmployees.length} icon={UserX}
            colorText={absentEmployees.length > 0 ? 'text-orange-700' : 'text-gray-500'}
            colorBg={absentEmployees.length > 0 ? 'bg-orange-50' : 'bg-gray-50'}
            colorIcon={absentEmployees.length > 0 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search employee..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            onClick={() => setShowAbsent(s => !s)}
            className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
              showAbsent ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-gray-200 text-gray-500'
            }`}
          >
            {showAbsent ? 'Hide Absent' : 'Show Absent'}
          </button>
          <button onClick={loadData} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors bg-white">
            <RefreshCw className={`size-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <span className="text-xs text-gray-400">Updated {fmt(lastUpdate)}</span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              Attendance Log
              <span className="ml-2 text-sm font-normal text-gray-400">
                {filteredLogs.length} present{showAbsent && filteredAbsent.length > 0 ? `, ${filteredAbsent.length} absent` : ''}
              </span>
            </h2>
            {isToday && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <span className="size-2 bg-emerald-500 rounded-full animate-pulse" />
                Realtime sync active
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <RefreshCw className="size-6 text-gray-300 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Loading attendance...</p>
            </div>
          ) : filteredLogs.length === 0 && (!showAbsent || filteredAbsent.length === 0) ? (
            <div className="py-20 text-center">
              <Clock className="size-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No attendance records for this date</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Employee', 'Shift', 'Check In', 'Check Out', 'Late', 'Overtime', 'Status'].map(h => (
                      <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {log.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-gray-900">{log.fullName}</p>
                            <p className="text-xs text-gray-400">{log.employeeId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{log.scheduledStart} – {log.scheduledEnd}</td>
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-800">{fmt(log.checkInTime)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{fmt(log.checkOutTime)}</td>
                      <td className="px-5 py-3.5 text-sm">
                        {log.lateMinutes > 0 ? <span className="text-red-600 font-semibold">{log.lateMinutes}m</span> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-sm">
                        {log.overtimeMinutes > 0 ? <span className="text-blue-600 font-medium">+{log.overtimeMinutes}m</span> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[log.status] || 'bg-gray-100 text-gray-600'}`}>
                            {log.status.replace('-', ' ')}
                          </span>
                          {log.checkInMethod === 'fingerprint' && (
                            <Fingerprint className="size-3.5 text-amber-500" title="Fingerprint" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {showAbsent && filteredAbsent.map(emp => (
                    <tr key={emp.id} className="hover:bg-red-50/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold shrink-0">
                            {emp.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-gray-600">{emp.fullName}</p>
                            <p className="text-xs text-gray-400">{emp.employeeId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-400">{emp.shiftStart} – {emp.shiftEnd}</td>
                      <td colSpan={4} className="px-5 py-3.5 text-sm text-red-400 font-medium italic">Not yet checked in</td>
                      <td className="px-5 py-3.5">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600">absent</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary strip */}
        {logs.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Attendance Rate', value: employees.length > 0 ? `${Math.round((presentLogs.length / employees.length) * 100)}%` : '—', sub: `${presentLogs.length} of ${employees.length}`, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Checked Out', value: checkedOutLogs.length, sub: `${presentLogs.length - checkedOutLogs.length} still on shift`, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Total Late Mins', value: lateLogs.reduce((s, l) => s + l.lateMinutes, 0) + 'm', sub: `across ${lateLogs.length} employees`, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Total Overtime', value: logs.reduce((s, l) => s + l.overtimeMinutes, 0) + 'm', sub: `across ${logs.filter(l => l.overtimeMinutes > 0).length} employees`, icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-black/5`}>
                <s.icon className={`size-5 ${s.color} mb-2`} />
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

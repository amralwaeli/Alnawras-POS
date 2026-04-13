import { usePOS } from '../context/POSContext';
import { Clock, UserCheck, AlertCircle, ShieldOff } from 'lucide-react';

export function AttendanceView() {
  const { attendance, currentUser } = usePOS();
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

  const today = new Date().toISOString().split('T')[0];
  const todayRecs = attendance.filter(a => a.date === today);
  const lateRecs = todayRecs.filter(a => a.lateMinutes > 0);
  const onTimeRecs = todayRecs.length - lateRecs.length;

  const fmtTime = (d: Date | string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Today's Check-ins", value: todayRecs.length, icon: Clock, bg: 'bg-blue-50', ic: 'bg-blue-100 text-blue-600', vc: 'text-blue-700' },
            { label: 'On Time', value: onTimeRecs, icon: UserCheck, bg: 'bg-emerald-50', ic: 'bg-emerald-100 text-emerald-600', vc: 'text-emerald-700' },
            { label: 'Late Arrivals', value: lateRecs.length, icon: AlertCircle, bg: lateRecs.length > 0 ? 'bg-red-50' : 'bg-gray-50', ic: lateRecs.length > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400', vc: lateRecs.length > 0 ? 'text-red-700' : 'text-gray-500' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-5 border border-black/5`}>
              <div className={`inline-flex size-10 items-center justify-center rounded-xl ${s.ic} mb-3`}><s.icon className="size-5" /></div>
              <p className="text-sm text-gray-500 mb-0.5">{s.label}</p>
              <p className={`text-3xl font-bold ${s.vc}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Today's Attendance Log</h2>
            {currentUser.role === 'admin' && (
              <a href="#/check-in" target="_blank" className="text-xs text-blue-600 hover:underline">Staff check-in portal ↗</a>
            )}
          </div>
          {todayRecs.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No check-ins recorded for today</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Employee', 'Emp #', 'Scheduled', 'Check-in', 'Late (min)', 'Status'].map(h => (
                      <th key={h} className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {todayRecs.map(rec => (
                    <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                            {rec.staffName.split(' ').map((n: string) => n[0]).join('')}
                          </div>
                          <span className="font-medium text-sm text-gray-900">{rec.staffName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-sm text-gray-500">{rec.employmentNumber}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{fmtTime(rec.scheduledTime)}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{fmtTime(rec.checkInTime)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-sm font-semibold ${rec.lateMinutes > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{rec.lateMinutes}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          rec.lateMinutes === 0 ? 'bg-emerald-50 text-emerald-700' :
                          rec.lateMinutes <= 5 ? 'bg-amber-50 text-amber-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {rec.lateMinutes === 0 ? 'On Time' : `Late ${rec.lateMinutes}m`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

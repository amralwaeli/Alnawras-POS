import { usePOS } from '../context/POSContext';
import { Clock, UserCheck, AlertCircle } from 'lucide-react';

export function AttendanceView() {
  const { attendance, currentUser } = usePOS();

  if (!currentUser) return null;

  // Only admin and HR can view attendance tracking
  if (currentUser.role !== 'admin' && currentUser.role !== 'hr') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">You don't have permission to view this page</p>
          <p className="text-sm text-gray-500">Only Admin and HR can access attendance tracking</p>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const todayAttendance = attendance.filter(a => a.date === today);
  const lateArrivals = todayAttendance.filter(a => a.lateMinutes > 0);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-semibold text-2xl">Attendance Tracking</h1>
          <p className="text-gray-600">Monitor staff check-ins and late arrivals</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-blue-100 rounded-lg">
                <Clock className="size-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Today's Check-ins</p>
                <p className="text-2xl font-semibold">{todayAttendance.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-green-100 rounded-lg">
                <UserCheck className="size-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">On Time</p>
                <p className="text-2xl font-semibold">{todayAttendance.length - lateArrivals.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="size-10 flex items-center justify-center bg-red-100 rounded-lg">
                <AlertCircle className="size-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Late Arrivals</p>
                <p className="text-2xl font-semibold">{lateArrivals.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Today's Attendance</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Employee</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Employment #</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Scheduled</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Check-in</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Late (min)</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {todayAttendance.map(record => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                          {record.staffName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="font-medium">{record.staffName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{record.employmentNumber}</td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(record.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${record.lateMinutes > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {record.lateMinutes}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          record.lateMinutes === 0
                            ? 'bg-green-100 text-green-700'
                            : record.lateMinutes <= 5
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {record.lateMinutes === 0 ? 'On Time' : `Late ${record.lateMinutes}m`}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {currentUser.role === 'admin' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-3">Staff Check-in Portal</h3>
            <p className="text-gray-600 mb-4">
              Staff members can check in at: <strong>/check-in</strong>
            </p>
            <p className="text-sm text-gray-500">
              Share this URL with staff for daily check-ins
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { AttendanceController } from '../../controllers/AttendanceController';
import { Clock, MapPin, CheckCircle2, AlertCircle, UtensilsCrossed } from 'lucide-react';

export function CheckInView() {
  const { users, attendance, setAttendance } = usePOS();
  const [empNum, setEmpNum] = useState('');
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [checkedIn, setCheckedIn] = useState<{ name: string; time: string } | null>(null);
  const [loc, setLoc] = useState<'checking' | 'verified' | 'failed'>('checking');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => setLoc('verified'), () => setLoc('failed'));
    } else {
      setLoc('failed');
    }
  }, []);

  const handleCheckIn = () => {
    if (!empNum.trim()) { setError('Please enter your employment number'); return; }
    const scheduled = new Date();
    scheduled.setHours(9, 0, 0, 0);
    const result = AttendanceController.checkIn(attendance, users, empNum, scheduled);
    if (result.success && result.attendance && result.staff) {
      setAttendance([...attendance, result.attendance]);
      setCheckedIn({ name: result.staff.name, time: result.attendance.checkInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      setSuccess(true);
      setError('');
      setEmpNum('');
      setTimeout(() => { setSuccess(false); setCheckedIn(null); }, 6000);
    } else {
      setError(result.error || 'Check-in failed');
    }
  };

  return (
    <div className="h-screen flex bg-gray-950">
      {/* Left */}
      <div className="hidden lg:flex flex-col justify-between w-2/5 bg-gray-900 p-10">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <UtensilsCrossed className="size-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white">Alnawras</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Staff Portal</p>
          </div>
        </div>
        <div className="text-center">
          <p className="text-6xl font-bold text-white tabular-nums mb-2">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-gray-400">
            {now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <p className="text-gray-600 text-xs">Shift starts at 9:00 AM</p>
      </div>

      {/* Right */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {!success ? (
            <>
              <h2 className="text-2xl font-bold text-white mb-1">Staff Check-In</h2>
              <p className="text-gray-400 text-sm mb-6">Enter your employment number to sign in</p>

              {/* Location badge */}
              <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl mb-5 w-fit ${
                loc === 'verified' ? 'bg-emerald-900/40 text-emerald-400' :
                loc === 'failed'   ? 'bg-red-900/40 text-red-400' :
                'bg-amber-900/40 text-amber-400'
              }`}>
                <MapPin className="size-3.5" />
                {loc === 'verified' ? 'Location verified' : loc === 'failed' ? 'Location unavailable' : 'Verifying…'}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-800 rounded-xl text-sm text-red-400 mb-4">
                  <AlertCircle className="size-4 shrink-0" /> {error}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Employment Number</label>
                <input
                  type="text"
                  value={empNum}
                  onChange={e => { setEmpNum(e.target.value.toUpperCase()); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleCheckIn()}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl font-mono text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="EMP001"
                  autoFocus
                />
              </div>

              <button
                onClick={handleCheckIn}
                disabled={!empNum.trim()}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Check In
              </button>
            </>
          ) : (
            <div className="text-center">
              <div className="size-20 bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="size-10 text-emerald-400" />
              </div>
              <p className="text-xl font-bold text-white mb-1">Welcome, {checkedIn?.name}!</p>
              <p className="text-gray-400 text-sm mb-4">Successfully checked in</p>
              <div className="bg-gray-800 rounded-xl px-6 py-4 inline-block">
                <p className="text-xs text-gray-400 mb-1">Check-in time</p>
                <p className="text-2xl font-bold text-amber-400">{checkedIn?.time}</p>
              </div>
              <p className="text-gray-500 text-sm mt-6">Have a great shift! 👋</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

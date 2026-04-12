import { useState, useEffect } from 'react';
import { usePOS } from '../context/POSContext';
import { AttendanceController } from '../controllers/AttendanceController';
import { Clock, MapPin, CheckCircle, AlertCircle } from 'lucide-react';

export function CheckInView() {
  const { users, attendance, setAttendance } = usePOS();
  const [employmentNumber, setEmploymentNumber] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [checkedInStaff, setCheckedInStaff] = useState<{ name: string; time: string } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'checking' | 'verified' | 'failed'>('checking');

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Check location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // In production, verify against actual branch location
          // For demo, we'll just mark as verified
          setLocationStatus('verified');
        },
        (error) => {
          console.error('Location error:', error);
          setLocationStatus('failed');
        }
      );
    } else {
      setLocationStatus('failed');
    }
  }, []);

  const handleCheckIn = () => {
    if (!employmentNumber) {
      setError('Please enter your employment number');
      return;
    }

    // Set scheduled time to 9:00 AM today
    const scheduledTime = new Date();
    scheduledTime.setHours(9, 0, 0, 0);

    const result = AttendanceController.checkIn(
      attendance,
      users,
      employmentNumber,
      scheduledTime
    );

    if (result.success && result.attendance && result.staff) {
      setAttendance([...attendance, result.attendance]);
      setCheckedInStaff({
        name: result.staff.name,
        time: result.attendance.checkInTime.toLocaleTimeString(),
      });
      setSuccess(true);
      setError('');
      setEmploymentNumber('');

      // Reset after 5 seconds
      setTimeout(() => {
        setSuccess(false);
        setCheckedInStaff(null);
      }, 5000);
    } else {
      setError(result.error || 'Check-in failed');
      setSuccess(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCheckIn();
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="w-full max-w-lg p-8 bg-white rounded-2xl shadow-xl">
        {!success ? (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center size-16 bg-blue-600 rounded-full mb-4">
                <Clock className="size-8 text-white" />
              </div>
              <h1 className="font-semibold text-2xl mb-2">Staff Check-In</h1>
              <p className="text-gray-600">Enter your employment number to check in</p>
            </div>

            {/* Current Time Display */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg p-6 mb-6 text-center">
              <p className="text-sm mb-1">Current Time</p>
              <p className="text-3xl font-semibold tabular-nums">
                {currentTime.toLocaleTimeString()}
              </p>
              <p className="text-sm mt-1">
                {currentTime.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            {/* Location Status */}
            <div className={`flex items-center gap-2 p-3 rounded-lg mb-6 ${
              locationStatus === 'verified'
                ? 'bg-green-50 text-green-700'
                : locationStatus === 'failed'
                ? 'bg-red-50 text-red-700'
                : 'bg-yellow-50 text-yellow-700'
            }`}>
              <MapPin className="size-4" />
              <span className="text-sm">
                {locationStatus === 'verified' && 'Location verified'}
                {locationStatus === 'failed' && 'Location verification failed'}
                {locationStatus === 'checking' && 'Verifying location...'}
              </span>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 mb-4">
                <AlertCircle className="size-4" />
                {error}
              </div>
            )}

            {/* Employment Number Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Employment Number</label>
              <input
                type="text"
                value={employmentNumber}
                onChange={(e) => {
                  setEmploymentNumber(e.target.value.toUpperCase());
                  setError('');
                }}
                onKeyPress={handleKeyPress}
                className="w-full px-4 py-3 text-lg border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                placeholder="EMP001"
                autoFocus
              />
            </div>

            <button
              onClick={handleCheckIn}
              disabled={!employmentNumber || locationStatus === 'failed'}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Check In
            </button>

            <div className="mt-6 text-center text-sm text-gray-500">
              <p>Scheduled Time: 9:00 AM</p>
              <p>Late arrivals will be recorded</p>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center size-20 bg-green-100 rounded-full mb-6">
              <CheckCircle className="size-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Check-In Successful!</h2>
            <p className="text-3xl font-bold text-blue-600 mb-4">
              Welcome, {checkedInStaff?.name}!
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600">Check-in Time</p>
              <p className="text-2xl font-semibold">{checkedInStaff?.time}</p>
            </div>
            <p className="text-gray-600">Have a great day!</p>
          </div>
        )}
      </div>
    </div>
  );
}

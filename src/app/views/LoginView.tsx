import { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { Lock } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const { login } = usePOS();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) {
      setPin(pin + digit);
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  const handleSubmit = () => {
    if (pin.length !== 4) {
      setError('Please enter a 4-digit PIN');
      return;
    }

    setLoading(true);
    setError('');

    const result = login(pin);

    if (result.success) {
      onLoginSuccess();
    } else {
      setError(result.error || 'Login failed');
      setPin('');
    }

    setLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      handlePinInput(e.key);
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === 'Enter' && pin.length === 4) {
      handleSubmit();
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 bg-blue-600 rounded-full mb-4">
            <Lock className="size-8 text-white" />
          </div>
          <h1 className="font-semibold text-2xl mb-2">StoreHub POS</h1>
          <p className="text-gray-600">Enter your 4-digit PIN to continue</p>
        </div>

        <div className="mb-6">
          <div className="flex justify-center gap-3 mb-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`size-16 rounded-lg border-2 flex items-center justify-center text-2xl ${
                  pin.length > i
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : 'border-gray-300'
                }`}
              >
                {pin.length > i ? '●' : ''}
              </div>
            ))}
          </div>

          {error && (
            <div className="text-center text-sm text-red-600 mb-4">
              {error}
            </div>
          )}
        </div>

        <div
          className="grid grid-cols-3 gap-3 mb-4"
          onKeyDown={handleKeyPress}
          tabIndex={0}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handlePinInput(num.toString())}
              disabled={loading}
              className="h-16 bg-gray-100 rounded-lg hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50 font-medium text-lg"
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleBackspace}
            disabled={loading || pin.length === 0}
            className="h-16 bg-gray-100 rounded-lg hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
          >
            ⌫
          </button>
          <button
            onClick={() => handlePinInput('0')}
            disabled={loading}
            className="h-16 bg-gray-100 rounded-lg hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50 font-medium text-lg"
          >
            0
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || pin.length !== 4}
            className="h-16 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:bg-gray-300"
          >
            ✓
          </button>
        </div>

        <div className="text-center text-sm text-gray-500 mt-6">
          <p>Demo PINs:</p>
          <p>Admin: 1234 | Cashier: 2345 | Waiter: 3456</p>
        </div>
      </div>
    </div>
  );
}

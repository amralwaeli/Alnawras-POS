import { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { ShiftController, Shift } from '../../controllers/ShiftController';
import { fmt } from '../../../lib/currency';
import { toast } from 'sonner';
import { ReportsController } from '../../controllers/ReportsController';
import { Clock, Banknote, CheckCircle, AlertCircle, FileText, ArrowRight } from 'lucide-react';
import { friendlyError } from '../../../lib/errors';
import { supabase } from '../../../lib/supabase';

export function ShiftManagementView() {
  const { currentUser } = usePOS();
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashInput, setCashInput] = useState('');

  useEffect(() => {
    if (currentUser) {
      ShiftController.getCurrentShift(currentUser.id, currentUser.branchId)
        .then(r => {
          if (r.success) setCurrentShift(r.shift || null);
          setLoading(false);
        });
    }
  }, [currentUser]);

  const handleOpenShift = async () => {
    const cash = parseFloat(cashInput);
    if (isNaN(cash)) return toast.error('Enter valid opening cash');
    
    setLoading(true);
    const res = await ShiftController.openShift({
      userId: currentUser!.id,
      userName: currentUser!.name,
      branchId: currentUser!.branchId,
      openingCash: cash
    });
    setLoading(false);

    if (res.success) {
      setCurrentShift(res.shift!);
      setCashInput('');
      toast.success('Shift opened successfully');
    } else {
      toast.error(friendlyError(res.error));
    }
  };

  const handleEndShift = async () => {
    const cash = parseFloat(cashInput);
    if (isNaN(cash)) return toast.error('Enter valid closing cash');
    
    // Sales paid during this shift, from the database (the screen's own list only
    // held today's orders). Expected cash counts CASH payments only — card and QR
    // money never enters the drawer.
    setLoading(true);
    const summary = await ReportsController.getSalesSummary(currentUser!.branchId, new Date(currentShift!.opened_at), new Date());
    if (!summary.success) { setLoading(false); return toast.error(`Could not total the shift: ${summary.error}`); }
    const shiftSales = summary.data!.revenue;
    const cashSales = summary.data!.byMethod.cash ?? 0;
    // Cash a customer paid towards their debt is in the drawer but is not a sale.
    const { data: debtRows, error: debtErr } = await supabase.from('debt_entries').select('amount')
      .eq('kind', 'payment').eq('method', 'cash').gte('created_at', currentShift!.opened_at);
    if (debtErr) { setLoading(false); return toast.error(`Could not total the shift: ${friendlyError(debtErr)}`); }
    const debtCash = (debtRows ?? []).reduce((s, r: any) => s + Number(r.amount), 0);

    const res = await ShiftController.endShift(currentShift!.id, cash, shiftSales);
    setLoading(false);

    if (res.success) {
      const endedShift = res.shift!;
      setCurrentShift(null);
      setCashInput('');
      toast.success('Shift ended successfully');
      generateShiftReport(endedShift, cashSales, debtCash);
    } else {
      toast.error(friendlyError(res.error));
    }
  };

  const generateShiftReport = (shift: Shift, cashSales: number, debtCash: number) => {
    const expected = shift.opening_cash + cashSales + debtCash;
    const win = window.open('', '', 'width=400,height=600');
    if (!win) return;
    win.document.write(`
      <html><head><title>Shift Report</title><style>
        body { font-family: monospace; padding: 20px; }
        .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; }
        .row { display: flex; justify-content: space-between; margin: 10px 0; }
        .total { font-weight: bold; border-top: 1px solid #000; padding-top: 10px; }
      </style></head>
      <body onload="window.print()">
        <div class="header">
          <h2>SHIFT REPORT</h2>
          <p>Cashier: ${String(shift.user_name ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)}</p>
          <p>Open: ${new Date(shift.opened_at).toLocaleString()}</p>
          <p>Close: ${new Date(shift.closed_at!).toLocaleString()}</p>
        </div>
        <div class="row"><span>Opening Cash:</span><span>${fmt(shift.opening_cash)}</span></div>
        <div class="row"><span>Total Sales:</span><span>${fmt(shift.total_sales || 0)}</span></div>
        <div class="row"><span>Cash Sales:</span><span>${fmt(cashSales)}</span></div>
        <div class="row"><span>Debt Collected (cash):</span><span>${fmt(debtCash)}</span></div>
        <div class="row"><span>Expected Cash:</span><span>${fmt(expected)}</span></div>
        <div class="row"><span>Actual Cash:</span><span>${fmt(shift.closing_cash || 0)}</span></div>
        <div class="total row">
          <span>Difference:</span>
          <span>${fmt((shift.closing_cash || 0) - expected)}</span>
        </div>
      </body></html>
    `);
    win.document.close();
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Loading shift data...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
      <div className="flex items-center gap-3">
        <div className="size-12 shrink-0 bg-gray-900 rounded-2xl flex items-center justify-center text-white">
          <Clock className="size-6" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight uppercase italic break-words">Shift Management</h1>
          <p className="text-sm text-gray-500 font-medium">Control your cash drawer and shift reports</p>
        </div>
      </div>

      {!currentShift ? (
        <div className="bg-white rounded-[32px] border border-gray-100 p-5 sm:p-8 shadow-sm space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-2">
            <div className="size-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Banknote className="size-10 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Open New Shift</h2>
            <p className="text-sm text-gray-500">Enter the starting cash in your drawer to begin.</p>
          </div>
          
          <div className="space-y-4">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
              <input 
                type="number" 
                placeholder="0.00" 
                value={cashInput}
                onChange={e => setCashInput(e.target.value)}
                className="w-full pl-10 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl text-xl font-bold transition-all outline-none"
              />
            </div>
            <button 
              onClick={handleOpenShift}
              className="w-full py-4 px-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-wider sm:tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
            >
              Start Shift <ArrowRight className="size-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-emerald-600 rounded-[32px] p-5 sm:p-8 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <CheckCircle className="size-32" />
            </div>
            <div className="relative z-10 space-y-6">
              <div>
                <p className="text-emerald-100 font-bold uppercase tracking-widest text-xs">Active Shift</p>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight break-words" dir="auto">{currentUser?.name}</h2>
              </div>
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-4 sm:gap-8">
                <div>
                  <p className="text-emerald-100 text-xs font-medium uppercase mb-1">Opened At</p>
                  <p className="text-xl font-bold">{new Date(currentShift.opened_at).toLocaleTimeString()}</p>
                </div>
                <div>
                  <p className="text-emerald-100 text-xs font-medium uppercase mb-1">Opening Cash</p>
                  <p className="text-xl font-bold whitespace-nowrap">{fmt(currentShift.opening_cash)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[32px] border border-gray-100 p-5 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="size-5 text-amber-500" />
              <h3 className="font-bold text-gray-900">End Your Shift</h3>
            </div>
            <p className="text-sm text-gray-500">Count the cash in your drawer and enter the total amount to close the shift and generate a report.</p>
            
            <div className="space-y-4">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input 
                  type="number" 
                  placeholder="Total Closing Cash" 
                  value={cashInput}
                  onChange={e => setCashInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-red-500 rounded-2xl text-xl font-bold transition-all outline-none"
                />
              </div>
              <button 
                onClick={handleEndShift}
                className="w-full py-4 px-4 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-wider sm:tracking-widest text-center hover:bg-black transition-all flex items-center justify-center gap-2"
              >
                End Shift & Print Report <FileText className="size-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

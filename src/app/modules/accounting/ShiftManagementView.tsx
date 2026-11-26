import { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { ShiftController, Shift } from '../../controllers/ShiftController';
import { fmt } from '../../../lib/currency';
import { toast } from 'sonner';
import { ReportsController } from '../../controllers/ReportsController';
import { Clock, Banknote, CheckCircle, AlertCircle, FileText, ArrowRight } from 'lucide-react';
import { friendlyError } from '../../../lib/errors';
import { supabase } from '../../../lib/supabase';
import { useBranch } from '../../context/BranchContext';
import { cachedPrinters } from '../../controllers/PrinterController';
import { PrintService, cleanPrintText, type PrintLine } from '../../services/PrintService';

/** The printed shift report: sales by payment method, the cash drawer count, and every payment
 *  out of the drawer during the shift (salary advances by employee, purchases). */
export function shiftReportLines(r: {
  businessName: string; cashier: string; openedAt: Date; closedAt: Date;
  openingCash: number; countedCash: number; debtCash: number;
  sales: { revenue: number; discount: number; orders: number; byMethod: Record<string, number> };
  paidOut: { category: string; description: string; amount: number; employee_name?: string | null }[];
}): PrintLine[] {
  const when = (d: Date) => d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const cashSales = r.sales.byMethod.cash ?? 0;
  const paidOutTotal = r.paidOut.reduce((s, e) => s + e.amount, 0);
  const expected = r.openingCash + cashSales + r.debtCash - paidOutTotal;
  const lines: PrintLine[] = [
    { text: cleanPrintText(r.businessName).toUpperCase(), style: 'large', align: 'center' },
    { text: 'SHIFT REPORT', style: 'bold', align: 'center' },
    { text: `Cashier: ${cleanPrintText(r.cashier)}` },
    { text: `Open:  ${when(r.openedAt)}` },
    { text: `Close: ${when(r.closedAt)}` },
    'rule',
    { text: 'SALES', style: 'bold' },
    { text: 'Bills paid', value: String(r.sales.orders) },
    { text: 'Total sales', value: fmt(r.sales.revenue), style: 'bold' },
    ...Object.entries(r.sales.byMethod).map(([m, v]) => ({ text: `  ${cap(m)}`, value: fmt(v) })),
    { text: 'Discounts given', value: fmt(r.sales.discount) },
    'rule',
    { text: 'CASH DRAWER', style: 'bold' },
    { text: 'Opening cash', value: fmt(r.openingCash) },
    { text: '+ Cash sales', value: fmt(cashSales) },
    { text: '+ Debt paid in cash', value: fmt(r.debtCash) },
    { text: '- Paid out', value: fmt(paidOutTotal) },
    { text: 'Expected cash', value: fmt(expected), style: 'bold' },
    { text: 'Counted cash', value: fmt(r.countedCash), style: 'bold' },
    { text: 'Difference', value: fmt(r.countedCash - expected), style: 'large' },
  ];
  if (r.paidOut.length) {
    lines.push('rule', { text: 'PAID OUT FROM DRAWER', style: 'bold' });
    for (const e of r.paidOut) {
      const who = e.employee_name ? `${cap(e.category)}: ${cleanPrintText(e.employee_name)}` : cap(e.category);
      lines.push({ text: who, value: fmt(e.amount) });
      if (e.description && e.description !== 'Salary / advance') lines.push({ text: `  ${cleanPrintText(e.description)}` });
    }
  }
  lines.push('rule');
  return lines;
}

export function ShiftManagementView() {
  const { currentUser } = usePOS();
  const { businessName } = useBranch();

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
    // Cash a customer paid towards their debt is in the drawer but is not a sale.
    const { data: debtRows, error: debtErr } = await supabase.from('debt_entries').select('amount')
      .eq('kind', 'payment').eq('method', 'cash').gte('created_at', currentShift!.opened_at);
    // Money paid out of the drawer during the shift (salary advances, small purchases).
    const { data: paidOut, error: expErr } = await supabase.from('expenses')
      .select('category, description, amount, employee_name')
      .eq('branch_id', currentUser!.branchId).eq('from_drawer', true).gte('created_at', currentShift!.opened_at)
      .order('created_at');
    if (debtErr || expErr) { setLoading(false); return toast.error(`Could not total the shift: ${friendlyError(debtErr ?? expErr)}`); }

    const res = await ShiftController.endShift(currentShift!.id, cash, summary.data!.revenue);
    setLoading(false);

    if (res.success) {
      const endedShift = res.shift!;
      setCurrentShift(null);
      setCashInput('');
      toast.success('Shift ended successfully');
      printShiftReport(shiftReportLines({
        businessName, cashier: endedShift.user_name, openedAt: new Date(endedShift.opened_at),
        closedAt: new Date(endedShift.closed_at ?? Date.now()), openingCash: Number(endedShift.opening_cash),
        countedCash: Number(endedShift.closing_cash ?? cash), sales: summary.data!,
        debtCash: (debtRows ?? []).reduce((s, r: any) => s + Number(r.amount), 0),
        paidOut: (paidOut ?? []).map((e: any) => ({ ...e, amount: Number(e.amount) })),
      }));
    } else {
      toast.error(friendlyError(res.error));
    }
  };

  /** On the receipt (cashier) printers; on the website or with none set up, the browser's print. */
  const printShiftReport = (lines: PrintLine[]) => {
    const printers = cachedPrinters(currentUser!.branchId)
      .filter(p => p.isActive && p.type === 'network' && p.ipAddress && (p.stations || []).includes('cashier'));
    const browserPrint = () => {
      const win = window.open('', '', 'width=400,height=600');
      if (!win) return;
      const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
      win.document.write(`<html><head><title>Shift Report</title><style>body{font-family:monospace;padding:16px;max-width:360px}
        .r{display:flex;justify-content:space-between;gap:8px;margin:4px 0}.c{justify-content:center}.b{font-weight:bold}hr{border:0;border-top:1px dashed #000}</style></head>
        <body onload="window.print()">${lines.map(l => l === 'rule' ? '<hr>'
          : `<div class="r${l.align === 'center' ? ' c' : ''}${l.style ? ' b' : ''}"><span>${esc(l.text)}</span>${l.value ? `<span>${esc(l.value)}</span>` : ''}</div>`).join('')}</body></html>`);
      win.document.close();
    };
    if (!printers.length) return browserPrint();
    for (const p of printers) {
      void PrintService.sendToPrinter({ printerIp: p.ipAddress!, printerPort: p.port || 9100, bytes: PrintService.render(lines, p.paperWidth) })
        .then(r => { if (r.success) toast.success('Shift report printed'); else { toast.error(`Receipt printer ${p.name || p.ipAddress}: ${r.error}`); browserPrint(); } });
    }
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

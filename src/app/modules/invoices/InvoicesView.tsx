import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Trash2, Printer, FileText, ArrowLeft } from 'lucide-react';
import { InvoiceTemplate, InvoiceData, InvoiceItem } from './InvoiceTemplate';
import { usePOS } from '../../context/POSContext';
import { supabase } from '../../../lib/supabase';
import { exportElementAsPdf, preferGeneratedPdf } from '../../../lib/documentPdf';
import { toast } from 'sonner';

export function InvoicesView() {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [invoiceNo, setInvoiceNo] = useState(`INV${Math.floor(1000 + Math.random() * 9000)}`);
  const [date, setDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);

  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', name: '', qty: 1, unitPrice: 0 }
  ]);

  const { currentUser } = usePOS();
  const navigate = useNavigate();
  // Roles without a sidebar (e.g. Super Waiter) need an in-page way back.
  const showBack = currentUser?.role === 'swaiter';
  const [catalogProducts, setCatalogProducts] = useState<{ id: string; name: string; price: number }[]>([]);
  const [activeSuggest, setActiveSuggest] = useState<string | null>(null);

  // Load products directly from Supabase so they're available for all roles
  useEffect(() => {
    if (!currentUser?.branchId) return;
    supabase
      .from('products')
      .select('id, name, price')
      .eq('branch_id', currentUser.branchId)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setCatalogProducts(data.map((p: any) => ({ id: p.id, name: p.name, price: Number(p.price) })));
      });
  }, [currentUser?.branchId]);

  const selectProduct = (itemId: string, product: { id: string; name: string; price: number }) => {
    updateItem(itemId, 'name', product.name);
    updateItem(itemId, 'unitPrice', product.price);
    setActiveSuggest(null);
  };

  const printRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);

  const handlePrint = async () => {
    if (generating) return;
    // Desktop/web (admin site) keeps the print dialog that already works well.
    if (!preferGeneratedPdf()) { window.print(); return; }
    // APK / mobile: the print dialog isn't available, so rasterise the template
    // (renders Arabic correctly) and hand the PDF to the native share sheet.
    if (!printRef.current) { window.print(); return; }
    setGenerating(true);
    try {
      await exportElementAsPdf(printRef.current, `Invoice-${invoiceNo || 'draft'}.pdf`);
    } catch (err) {
      console.error('[InvoicePDF]', err);
      toast.error('Could not generate the PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(36).substring(7), name: '', qty: 1, unitPrice: 0 }]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const subTotal = items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
  const total = subTotal - discount;

  const invoiceData: InvoiceData = {
    invoiceTo: { name: customerName, phone: customerPhone },
    invoiceNo,
    date,
    items: items.filter(i => i.name.trim() !== ''),
    subTotal,
    discount,
    total,
    notes,
  };

  const canPrint = !!customerName && items.filter(i => i.name).length > 0;

  return (
    <>
      <style>{`@media print { @page { size: A4 portrait; margin: 0; } html, body { margin: 0; padding: 0; width: 100%; height: 100%; } body * { visibility: hidden !important; } .print-only, .print-only * { visibility: visible !important; } .print-only { display: block !important; position: fixed !important; top: 0; left: 0; width: 210mm !important; min-height: 297mm !important; margin: 0 !important; padding: 0 !important; box-sizing: border-box !important; background: #fff !important; } .no-print { display: none !important; visibility: hidden !important; } }`}</style>
      <div className="h-full overflow-hidden bg-gray-50 flex flex-col no-print">
      {/* Top bar (stays fixed; the content below scrolls) */}
      <div className="shrink-0 z-10 bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium shrink-0"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
          )}
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="size-5 sm:size-6 text-amber-500 shrink-0" />
              Create Invoice
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5 hidden sm:block">Generate and print professional invoices</p>
          </div>
        </div>
        <button
          onClick={handlePrint}
          disabled={!canPrint || generating}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-sm shrink-0"
        >
          <Printer className="size-4" />
          <span className="hidden sm:inline">{generating ? 'Generating…' : 'Download PDF'}</span>
          <span className="sm:hidden">{generating ? '…' : 'PDF'}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 max-w-6xl mx-auto w-full pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

          {/* ── Form ── */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">

            {/* Customer Details */}
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm">
              <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-800">Customer Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm"
                    placeholder="e.g. 012-3456789"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-3 sm:mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice No.</label>
                  <input
                    type="text"
                    value={invoiceNo}
                    onChange={e => setInvoiceNo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="text"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-3 sm:mb-4">
                <h2 className="text-base sm:text-lg font-semibold text-gray-800">Invoice Items</h2>
                <button
                  onClick={addItem}
                  className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-medium bg-amber-50 hover:bg-amber-100 active:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="size-4" /> Add Item
                </button>
              </div>

              <div className="space-y-2 sm:space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="bg-gray-50 rounded-lg border border-gray-100 p-3 space-y-2">
                    {/* Item name row */}
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => { updateItem(item.id, 'name', e.target.value); setActiveSuggest(item.id); }}
                          onFocus={() => setActiveSuggest(item.id)}
                          onBlur={() => setTimeout(() => setActiveSuggest(null), 200)}
                          placeholder="Item description"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-amber-500 bg-white"
                        />
                        {activeSuggest === item.id && item.name.trim() !== '' && (
                          <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-40 max-h-52 overflow-auto">
                            {(() => {
                              const q = item.name.toLowerCase().trim();
                              const matches = catalogProducts.filter(p => p.name.toLowerCase().includes(q)).slice(0, 10);
                              return matches.length > 0 ? matches.map(p => (
                                <div
                                  key={p.id}
                                  onPointerDown={e => { e.preventDefault(); selectProduct(item.id, p); }}
                                  className="px-3 py-2.5 text-sm hover:bg-amber-50 active:bg-amber-100 cursor-pointer border-b border-gray-50 last:border-0"
                                >
                                  <div className="font-medium text-gray-800">{p.name}</div>
                                  <div className="text-xs text-amber-600 font-semibold mt-0.5">RM {p.price.toFixed(2)}</div>
                                </div>
                              )) : (
                                <div className="px-3 py-3 text-xs text-gray-400 text-center">No products found</div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="w-9 h-9 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {/* Qty + Price + Total row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 shrink-0">Qty</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          value={item.qty || ''}
                          onChange={e => updateItem(item.id, 'qty', parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:border-amber-500 bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                        <span className="text-xs text-gray-500 shrink-0">Price (RM)</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={item.unitPrice || ''}
                          onChange={e => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="flex-1 min-w-[70px] px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:border-amber-500 bg-white"
                        />
                      </div>
                      <div className="text-sm font-semibold text-gray-800 ml-auto shrink-0">
                        = RM {(item.qty * item.unitPrice).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals & Notes */}
              <div className="mt-5 border-t border-gray-100 pt-4 sm:pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes / Terms</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm resize-none"
                    placeholder="Additional notes for the customer..."
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Sub-Total (RM)</span>
                    <span className="font-medium">{subTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm gap-3">
                    <span className="text-gray-500 shrink-0">Discount (RM)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={discount || ''}
                      onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                      className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-right text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">Total Due (RM)</span>
                    <span className="font-bold text-lg text-amber-600">{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Live Preview (desktop only) ── */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="sticky top-24">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Live Preview</h2>
              <div className="bg-gray-100 p-2 rounded-xl border border-gray-200 overflow-hidden shadow-inner flex justify-center">
                <div
                  className="bg-white shadow-sm pointer-events-none origin-top"
                  style={{ transform: 'scale(0.35)', width: '210mm', height: '297mm', marginBottom: '-190mm' }}
                >
                  <InvoiceTemplate data={invoiceData} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Admin print target (hidden on screen, shown by @media print). */}
    <div className="print-only hidden">
      <InvoiceTemplate data={invoiceData} />
    </div>
    {/* Off-screen but rendered copy that html2canvas rasterises for the APK PDF.
        It is off-screen on screen, and hidden from the admin print by the
        body{visibility:hidden} rule, so it never affects either path. */}
    <div aria-hidden style={{ position: 'fixed', left: '-10000px', top: 0, width: '210mm', background: '#fff' }}>
      <InvoiceTemplate ref={printRef} data={invoiceData} />
    </div>
    </>
  );
}

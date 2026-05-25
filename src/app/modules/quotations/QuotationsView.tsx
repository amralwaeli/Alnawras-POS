import { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Plus, Trash2, Printer, FileText } from 'lucide-react';
import { QuotationTemplate, QuotationData, QuotationItem } from './QuotationTemplate';

export function QuotationsView() {
  

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [quotationNo, setQuotationNo] = useState(`INV${Math.floor(1000 + Math.random() * 9000)}`);
  const [date, setDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  
  const [items, setItems] = useState<QuotationItem[]>([
    { id: '1', name: '', qty: 1, unitPrice: 0 }
  ]);

  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Quotation_${quotationNo}`,
  });

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(36).substring(7), name: '', qty: 1, unitPrice: 0 }]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof QuotationItem, value: string | number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const subTotal = items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
  const total = subTotal - discount;

  const quotationData: QuotationData = {
    quotationTo: {
      name: customerName,
      phone: customerPhone,
    },
    quotationNo,
    date,
    items: items.filter(i => i.name.trim() !== ''),
    subTotal,
    discount,
    total,
    notes,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto pb-24">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="size-6 text-amber-500" />
            Create Quotation
          </h1>
          <p className="text-gray-500 text-sm mt-1">Generate and print professional quotation offers</p>
        </div>
        <button
          onClick={() => handlePrint()}
          disabled={!customerName || items.filter(i => i.name).length === 0}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Printer className="size-4" />
          Print / Download PDF
        </button>
      </div>

      

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Details */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Customer Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  placeholder="e.g. 012-3456789"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quotation No.</label>
                <input
                  type="text"
                  value={quotationNo}
                  onChange={(e) => setQuotationNo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Quotation Items</h2>
              <button
                onClick={addItem}
                className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-medium bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-md transition-colors"
              >
                <Plus className="size-4" /> Add Item
              </button>
            </div>
            
            <div className="space-y-3">
              {/* Header */}
              <div className="flex gap-3 px-2 text-sm font-medium text-gray-500">
                <div className="flex-1">Item Name</div>
                <div className="w-20 text-center">Qty</div>
                <div className="w-32 text-right">Unit Price (RM)</div>
                <div className="w-32 text-right">Total (RM)</div>
                <div className="w-8"></div>
              </div>

              {/* Rows */}
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    placeholder="Item description"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-amber-500 bg-white"
                  />
                  <input
                    type="number"
                    min="1"
                    value={item.qty || ''}
                    onChange={(e) => updateItem(item.id, 'qty', parseInt(e.target.value) || 0)}
                    className="w-20 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-center focus:outline-none focus:border-amber-500 bg-white"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice || ''}
                    onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="w-32 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:border-amber-500 bg-white"
                  />
                  <div className="w-32 text-right font-medium text-sm text-gray-700 pr-3">
                    {(item.qty * item.unitPrice).toFixed(2)}
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Totals & Notes */}
            <div className="mt-6 border-t border-gray-100 pt-5 grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes / Terms</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm resize-none"
                  placeholder="Additional notes for the customer..."
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Sub-Total (RM)</span>
                  <span className="font-medium">{subTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Discount (RM)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discount || ''}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 border border-gray-300 rounded-md text-right focus:outline-none focus:border-amber-500"
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

        {/* Live Preview (Scaled down) */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Live Preview</h2>
            <div className="bg-gray-100 p-2 rounded-xl border border-gray-200 overflow-hidden shadow-inner flex justify-center">
              <div 
                className="bg-white shadow-sm pointer-events-none origin-top" 
                style={{ transform: 'scale(0.35)', width: '210mm', height: '297mm', marginBottom: '-190mm' }}
              >
                <QuotationTemplate data={quotationData} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Print Container */}
      <div className="hidden">
        <QuotationTemplate ref={printRef} data={quotationData} />
      </div>
    </div>
  );
}

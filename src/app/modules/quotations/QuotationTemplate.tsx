import React, { forwardRef } from 'react';

export interface QuotationItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface QuotationData {
  quotationTo: {
    name: string;
    phone: string;
  };
  quotationNo: string;
  date: string;
  items: QuotationItem[];
  subTotal: number;
  discount: number;
  total: number;
  notes: string;
}

interface Props {
  data: QuotationData;
}

export const QuotationTemplate = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  return (
    <div ref={ref} className="p-10 bg-white text-black min-h-screen" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>
      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
        }
      `}</style>

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-6">Quotation</h1>
        
        <div className="flex justify-between items-start">
          <div className="text-left">
            <h2 className="font-bold underline mb-1">From</h2>
            <p className="font-semibold text-sm">AL-NAWRAS RESTAURANT (1496779-P)</p>
            <p className="text-sm">29 Jalan Flora 1/9 Taman Pulai Flora 81300 Skudai Johor</p>
            <div className="mt-4 text-sm">
              <p>Phone: 018-7874994/ 018-7837567</p>
              <p>E-Mail: alnawrasrestaurant23@gmail.com</p>
            </div>
          </div>
          <div className="w-48 h-auto">
            {/* The provided image has a specific golden logo, replacing with a local logo if it exists, 
                or using a placeholder if we don't have it. I'll use the public logo image if available,
                otherwise a text logo, but the user expects it to look like the design. */}
            <div className="text-right flex flex-col items-end">
              <img src="/logo.png" alt="Alnawras Logo" className="w-32 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </div>
          </div>
        </div>
      </div>

      {/* Quotation Details */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="font-bold underline mb-4">Quotation To</h2>
          <p className="font-medium">{data.quotationTo.name}</p>
          <p className="text-sm mt-8">Phone: {data.quotationTo.phone}</p>
        </div>
        <div className="text-right space-y-1 text-sm pt-8">
          <p>Quotation No {data.quotationNo}</p>
          <p>Quotation Date {data.date}</p>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-sm border-collapse border border-gray-300 mb-2">
        <thead>
          <tr className="bg-gray-50 font-bold border-b border-gray-300">
            <td className="border-r border-gray-300 px-2 py-1.5 w-12 text-center">No</td>
            <td className="border-r border-gray-300 px-2 py-1.5">Items</td>
            <td className="border-r border-gray-300 px-2 py-1.5 w-20 text-center">Qty</td>
            <td className="border-r border-gray-300 px-2 py-1.5 w-32 text-right">Unit Price (RM)</td>
            <td className="px-2 py-1.5 w-32 text-right">Total (RM)</td>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={item.id} className="border-b border-gray-300">
              <td className="border-r border-gray-300 px-2 py-1.5 text-center">{index + 1}</td>
              <td className="border-r border-gray-300 px-2 py-1.5">{item.name}</td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-center">{item.qty}</td>
              <td className="border-r border-gray-300 px-2 py-1.5 text-right">{item.unitPrice.toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right">{(item.qty * item.unitPrice).toFixed(2)}</td>
            </tr>
          ))}
          {/* Fill empty rows to make table look like the example */}
          {Array.from({ length: Math.max(0, 10 - data.items.length) }).map((_, i) => (
            <tr key={`empty-${i}`} className="border-b border-gray-300 h-8">
              <td className="border-r border-gray-300"></td>
              <td className="border-r border-gray-300"></td>
              <td className="border-r border-gray-300"></td>
              <td className="border-r border-gray-300"></td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals Grid */}
      <div className="flex justify-end mb-8">
        <table className="w-64 text-sm border-collapse border border-gray-300">
          <tbody>
            <tr className="border-b border-gray-300">
              <td className="border-r border-gray-300 px-2 py-1 text-right w-32">Sub-Total (RM)</td>
              <td className="px-2 py-1 text-right">{data.subTotal.toFixed(2)}</td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="border-r border-gray-300 px-2 py-1 text-right">Discount (RM)</td>
              <td className="px-2 py-1 text-right">{data.discount.toFixed(2)}</td>
            </tr>
            <tr className="border-b border-gray-300 font-bold bg-gray-50">
              <td className="border-r border-gray-300 px-2 py-1 text-right">Total (RM)</td>
              <td className="px-2 py-1 text-right">{data.total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-end">
        <div className="w-1/2">
          <div className="mb-6 text-sm">
            <h3 className="font-bold mb-1">Pay To</h3>
            <p>CIMB BANK</p>
            <p>ALNAWRAS SDN BHD</p>
            <p>8605525557</p>
          </div>
          <div>
            <h3 className="font-bold mb-1 text-sm">Notes / Terms</h3>
            <div className="border border-gray-300 p-2 min-h-24 text-xs whitespace-pre-wrap">
              {data.notes}
            </div>
          </div>
        </div>

        <div className="w-1/3 text-center flex flex-col items-center pb-4">
          <p className="text-sm mb-1">TOTAL DUE</p>
          <div className="bg-gray-100 border border-gray-300 py-3 px-6 w-full shadow-sm">
            <p className="text-xl font-medium">RM{data.total.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
});

QuotationTemplate.displayName = 'QuotationTemplate';

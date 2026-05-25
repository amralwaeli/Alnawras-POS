import React, { forwardRef } from 'react';

export interface InvoiceItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface InvoiceData {
  invoiceTo: {
    name: string;
    phone: string;
  };
  invoiceNo: string;
  date: string;
  items: InvoiceItem[];
  subTotal: number;
  discount: number;
  total: number;
  notes: string;
}

interface Props {
  data: InvoiceData;
}

const DEFAULT_LOGO = '/alnawras-logo.png';
function makeFallbackDataUrl() {
  const svg = `
  <svg xmlns='http://www.w3.org/2000/svg' width='260' height='90'>
    <rect width='100%' height='100%' fill='%23f5af19' rx='8' />
    <text x='50%' y='55%' font-family='Arial, Helvetica, sans-serif' font-size='28' fill='%23ffffff' font-weight='700' text-anchor='middle'>AL-NAWRAS</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
export const InvoiceTemplate = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const [logoSrc, setLogoSrc] = useState<string>(DEFAULT_LOGO);
  const fallback = makeFallbackDataUrl();

  return (
    <div
      ref={ref}
      style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '12px',
        color: '#000',
        background: '#fff',
        width: '210mm',
        minHeight: '297mm',
        margin: '0 auto',
        padding: '14mm 14mm 14mm 14mm',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Invoice</h1>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <p style={{ fontWeight: 700, textDecoration: 'underline', margin: '0 0 4px' }}>From</p>
          <p style={{ fontWeight: 600, margin: '0 0 2px' }}>AL-NAWRAS RESTAURANT (1496779-P)</p>
          <p style={{ margin: '0 0 8px' }}>29 Jalan Flora 1/9 Taman Pulai Flora 81300 Skudai Johor</p>
          <p style={{ margin: '0 0 2px' }}>Phone: 018-7874994/ 018-7837567</p>
          <p style={{ margin: 0 }}>E-Mail: alnawrasrestaurant23@gmail.com</p>
        </div>
        <div>
          {renderLogo()}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <p style={{ fontWeight: 700, textDecoration: 'underline', margin: '0 0 6px' }}>Invoice To</p>
          <p style={{ fontWeight: 600, margin: '0 0 16px' }}>{data.invoiceTo.name || ''}</p>
          <p style={{ margin: 0 }}>Phone: {data.invoiceTo.phone || ''}</p>
        </div>
        <div style={{ textAlign: 'right', paddingTop: 20 }}>
          <p style={{ margin: '0 0 2px' }}>Invoice No {data.invoiceNo}</p>
          <p style={{ margin: 0 }}>Invoice Date {data.date}</p>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 4 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <td style={{ border: '1px solid #ccc', padding: '5px 6px', width: 28, textAlign: 'center', fontWeight: 700 }}>No</td>
            <td style={{ border: '1px solid #ccc', padding: '5px 6px', fontWeight: 700 }}>Items</td>
            <td style={{ border: '1px solid #ccc', padding: '5px 6px', width: 50, textAlign: 'center', fontWeight: 700 }}>Qty</td>
            <td style={{ border: '1px solid #ccc', padding: '5px 6px', width: 100, textAlign: 'right', fontWeight: 700 }}>Unit Price (RM)</td>
            <td style={{ border: '1px solid #ccc', padding: '5px 6px', width: 90, textAlign: 'right', fontWeight: 700 }}>Total (RM)</td>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={item.id}>
              <td style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'center' }}>{index + 1}</td>
              <td style={{ border: '1px solid #ccc', padding: '4px 6px' }}>{item.name}</td>
              <td style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'center' }}>{item.qty}</td>
              <td style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'right' }}>{item.unitPrice.toFixed(2)}</td>
              <td style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'right' }}>{(item.qty * item.unitPrice).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: 220 }}>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #ccc', padding: '4px 8px', textAlign: 'right', background: '#fafafa' }}>Sub-Total (RM)</td>
              <td style={{ border: '1px solid #ccc', padding: '4px 8px', textAlign: 'right', minWidth: 80 }}>{data.subTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ccc', padding: '4px 8px', textAlign: 'right', background: '#fafafa' }}>Discount (RM)</td>
              <td style={{ border: '1px solid #ccc', padding: '4px 8px', textAlign: 'right' }}>{data.discount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ccc', padding: '4px 8px', textAlign: 'right', fontWeight: 700, background: '#f0f0f0' }}>Total (RM)</td>
              <td style={{ border: '1px solid #ccc', padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{data.total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ width: '55%' }}>
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontWeight: 700, margin: '0 0 4px' }}>Pay To</p>
            <p style={{ margin: '0 0 2px' }}>CIMB BANK</p>
            <p style={{ margin: '0 0 2px' }}>ALNAWRAS SDN BHD</p>
            <p style={{ margin: 0 }}>8605525557</p>
          </div>
          <div>
            <p style={{ fontWeight: 700, margin: '0 0 4px' }}>Notes / Terms</p>
            <div style={{
              border: '1px solid #ccc',
              padding: 6,
              minHeight: 60,
              fontSize: 10,
              whiteSpace: 'pre-wrap',
            }}>
              {data.notes}
            </div>
          </div>
        </div>

        <div style={{ width: '36%', textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontSize: 12 }}>TOTAL DUE</p>
          <div style={{
            border: '2px solid #333',
            padding: '10px 16px',
            background: '#f8f8f8',
          }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>RM{data.total.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
});

InvoiceTemplate.displayName = 'InvoiceTemplate';

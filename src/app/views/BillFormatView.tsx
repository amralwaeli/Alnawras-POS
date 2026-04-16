import { useEffect, useMemo, useRef, useState } from 'react';
import { Save, RotateCcw, ReceiptText } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import {
  BillFormatSettings,
  defaultBillFormatSettings,
  loadBillFormatSettings,
  saveBillFormatSettings,
  resetBillFormatSettings,
} from '../../lib/billFormat';
import { CURRENCY, orderTotal } from '../../lib/currency';
import { supabase } from '../../lib/supabase';

const sampleItems = [
  { name: 'Mixed Grilled Al-Nawras + Bread', price: 30, qty: 1, discount: 0, amount: 30 },
  { name: 'Lemon Tea Ice', price: 3, qty: 1, discount: 0, amount: 3 },
  { name: 'Watermelon', price: 5, qty: 1, discount: 0, amount: 5 },
];

export function BillFormatView() {
  const { orders, tables, currentUser } = usePOS();
  const [settings, setSettings] = useState<BillFormatSettings>(defaultBillFormatSettings);
  const [printedBillsCount, setPrintedBillsCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSettings(loadBillFormatSettings());
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const loadPrintedBillsCount = async () => {
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', currentUser.branchId)
        .eq('status', 'completed');

      setPrintedBillsCount(count || 0);
    };

    void loadPrintedBillsCount();
  }, [currentUser]);

  const previewOrder = useMemo(() => {
    if (!orders.length) return null;
    return [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [orders]);

  const previewTableNumber = useMemo(() => {
    if (!previewOrder) return 7;
    if (previewOrder.tableNumber) return previewOrder.tableNumber;
    return tables.find(table => table.id === previewOrder.tableId)?.number || 7;
  }, [previewOrder, tables]);

  const previewItems = useMemo(() => {
    if (!previewOrder?.items?.length) return sampleItems;

    return previewOrder.items.map(item => ({
      name: item.productName,
      price: Number(item.price || 0),
      qty: Number(item.quantity || 0),
      discount: 0,
      amount: Number(item.subtotal || Number(item.price || 0) * Number(item.quantity || 0)),
    }));
  }, [previewOrder]);

  const totals = useMemo(() => {
    if (!previewOrder) {
      const subtotal = sampleItems.reduce((sum, item) => sum + item.amount, 0);
      return { subtotal, discount: 0, tax: 0, total: subtotal };
    }

    const subtotal = previewOrder.items?.reduce(
      (sum, item) => sum + Number(item.subtotal || Number(item.price || 0) * Number(item.quantity || 0)),
      0
    ) || 0;

    return {
      subtotal: Number(previewOrder.subtotal || subtotal),
      discount: Number(previewOrder.discount || 0),
      tax: Number(previewOrder.tax || 0),
      total: orderTotal(previewOrder),
    };
  }, [previewOrder]);

  const nextBillNumber = useMemo(
    () => String(printedBillsCount + 1).padStart(5, '0'),
    [printedBillsCount]
  );

  const updateField = (key: keyof BillFormatSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      toast.error('Logo must be under 200 KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateField('logoUrl', reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    saveBillFormatSettings(settings);
    toast.success('Bill format saved');
  };

  const handleReset = () => {
    resetBillFormatSettings();
    setSettings(defaultBillFormatSettings);
    toast.success('Bill format reset to default');
  };

  // Derived preview label/value for the order type
  const isTakeawayPreview = previewOrder?.orderType === 'takeaway' || previewOrder?.order_type === 'takeaway';
  const previewHeaderNote = isTakeawayPreview ? 'Takeaway Order' : settings.headerNote;
  const previewDisplayNumber = isTakeawayPreview
    ? `#${previewOrder?.billNumber ?? '—'}`
    : String(previewTableNumber);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6 max-w-7xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bill Format</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Control how the printed bill should look, with a live receipt preview based on your sample.
            </p>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={handleReset}>
              <RotateCcw className="size-4 mr-2" />
              Reset
            </Button>
            <Button type="button" onClick={handleSave}>
              <Save className="size-4 mr-2" />
              Save Format
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
          <Card className="rounded-3xl border-gray-200">
            <CardHeader>
              <CardTitle>Receipt Settings</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Restaurant Name */}
              <div className="space-y-2">
                <Label htmlFor="restaurant-name">Restaurant Name</Label>
                <Input
                  id="restaurant-name"
                  value={settings.restaurantName}
                  onChange={(e) => updateField('restaurantName', e.target.value)}
                />
              </div>

              {/* Logo Upload */}
              <div className="space-y-2">
                <Label>Logo Image</Label>
                <div className="flex items-center gap-3">
                  {settings.logoUrl ? (
                    <img
                      src={settings.logoUrl}
                      alt="Logo"
                      className="size-12 rounded-full object-cover border border-gray-200 flex-shrink-0"
                    />
                  ) : (
                    <div className="size-12 rounded-full bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-xl font-bold text-gray-400 flex-shrink-0">
                      S
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {settings.logoUrl ? 'Change Logo' : 'Upload Logo'}
                    </Button>
                    {settings.logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => updateField('logoUrl', '')}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                </div>
              </div>

              {/* Tagline */}
              <div className="space-y-2">
                <Label htmlFor="branch-tagline">Logo / Tagline Text</Label>
                <Input
                  id="branch-tagline"
                  value={settings.branchTagline}
                  onChange={(e) => updateField('branchTagline', e.target.value)}
                />
              </div>

              {/* Header Note */}
              <div className="space-y-2">
                <Label htmlFor="header-note">Header Note</Label>
                <Input
                  id="header-note"
                  value={settings.headerNote}
                  onChange={(e) => updateField('headerNote', e.target.value)}
                />
              </div>

              {/* Cashier Line */}
              <div className="space-y-2">
                <Label htmlFor="cashier-label">Cashier Line</Label>
                <Input
                  id="cashier-label"
                  value={settings.cashierLabel}
                  onChange={(e) => updateField('cashierLabel', e.target.value)}
                />
              </div>

              {/* Register Line */}
              <div className="space-y-2">
                <Label htmlFor="register-label">Register Line</Label>
                <Input
                  id="register-label"
                  value={settings.registerLabel}
                  onChange={(e) => updateField('registerLabel', e.target.value)}
                />
              </div>

              {/* Subtotal Label */}
              <div className="space-y-2">
                <Label htmlFor="subtotal-label">Subtotal Label</Label>
                <Input
                  id="subtotal-label"
                  value={settings.subtotalLabel}
                  onChange={(e) => updateField('subtotalLabel', e.target.value)}
                />
              </div>

              {/* Discount Label */}
              <div className="space-y-2">
                <Label htmlFor="discount-label">Discount Label</Label>
                <Input
                  id="discount-label"
                  value={settings.discountLabel}
                  onChange={(e) => updateField('discountLabel', e.target.value)}
                />
              </div>

              {/* Tax Label */}
              <div className="space-y-2">
                <Label htmlFor="tax-label">Tax Label</Label>
                <Input
                  id="tax-label"
                  value={settings.taxLabel}
                  onChange={(e) => updateField('taxLabel', e.target.value)}
                />
              </div>

              {/* Total Label */}
              <div className="space-y-2">
                <Label htmlFor="total-label">Total Label</Label>
                <Input
                  id="total-label"
                  value={settings.totalLabel}
                  onChange={(e) => updateField('totalLabel', e.target.value)}
                />
              </div>

              {/* Thank You Message */}
              <div className="space-y-2">
                <Label htmlFor="thanks-msg">Thank You Message</Label>
                <Input
                  id="thanks-msg"
                  value={settings.thankYouMessage}
                  onChange={(e) => updateField('thankYouMessage', e.target.value)}
                />
              </div>

              {/* Footer Note */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="footer-note">Footer Note</Label>
                <Input
                  id="footer-note"
                  value={settings.footerNote}
                  onChange={(e) => updateField('footerNote', e.target.value)}
                />
              </div>

              {/* Info banner */}
              <div className="md:col-span-2 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                {previewOrder
                  ? isTakeawayPreview
                    ? `Preview is using takeaway order #${previewOrder.billNumber ?? '—'} with ${previewItems.length} item${previewItems.length === 1 ? '' : 's'}.`
                    : `Preview is using the latest live table order: Table ${previewTableNumber} with ${previewItems.length} item${previewItems.length === 1 ? '' : 's'}.`
                  : 'No live order found yet, so the preview is showing sample bill data.'}
                <div className="mt-2 font-medium">
                  Printed bills counted: {printedBillsCount} | Next bill no: {nextBillNumber}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Live Preview ── */}
          <div className="xl:sticky xl:top-6 h-fit">
            <Card className="rounded-3xl border-gray-200 overflow-hidden">
              <CardHeader className="border-b bg-white">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ReceiptText className="size-4 text-orange-500" />
                  Bill Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="bg-[#eef1f4] p-6">
                <div className="mx-auto w-[290px] bg-[#f7f4ea] text-[#3f3a33] shadow-xl rounded-sm px-5 py-6 font-mono text-[11px] leading-relaxed">

                  {/* Header */}
                  <div className="text-center border-b border-dashed border-[#bcb6aa] pb-4">
                    {settings.logoUrl ? (
                      <img
                        src={settings.logoUrl}
                        alt="Logo"
                        className="mx-auto mb-3 size-16 rounded-full object-cover border-[3px] border-[#7b7368]"
                      />
                    ) : (
                      <div className="mx-auto mb-3 size-16 rounded-full border-[3px] border-[#7b7368] flex items-center justify-center text-3xl font-semibold">
                        S
                      </div>
                    )}
                    <p className="text-[22px] font-serif italic leading-none">{settings.branchTagline}</p>
                    <p className="mt-2 text-[15px] font-bold uppercase tracking-wide">{settings.restaurantName}</p>
                    <p className="mt-3 text-[13px]">{previewHeaderNote}</p>
                    <p className="text-[34px] font-bold leading-none">{previewDisplayNumber}</p>
                  </div>

                  {/* Meta */}
                  <div className="py-3 text-[11px] border-b border-dashed border-[#bcb6aa]">
                    <p>{settings.cashierLabel}</p>
                    <div className="flex items-center justify-between gap-3">
                      <p>{settings.registerLabel}</p>
                      <p>Bill No: {nextBillNumber}</p>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="py-3 border-b border-dashed border-[#bcb6aa]">
                    <div className="grid grid-cols-[1.6fr_.7fr_.45fr_.75fr_.8fr] gap-2 font-bold text-[10px] uppercase">
                      <span>Item</span>
                      <span className="text-right">Price</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Disc</span>
                      <span className="text-right">Amt</span>
                    </div>
                    <div className="mt-2 space-y-3">
                      {previewItems.map(item => (
                        <div key={item.name}>
                          <p className="font-semibold text-[11px] leading-tight">{item.name}</p>
                          <div className="grid grid-cols-[1.6fr_.7fr_.45fr_.75fr_.8fr] gap-2">
                            <span />
                            <span className="text-right">{item.price.toFixed(2)}</span>
                            <span className="text-right">{item.qty}</span>
                            <span className="text-right">{item.discount.toFixed(2)}</span>
                            <span className="text-right">{item.amount.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="py-3 space-y-1 border-b border-dashed border-[#bcb6aa]">
                    <div className="flex items-center justify-between">
                      <span>{settings.subtotalLabel}</span>
                      <span>{CURRENCY} {totals.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{settings.discountLabel}</span>
                      <span>{CURRENCY} {totals.discount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{settings.taxLabel}</span>
                      <span>{CURRENCY} {totals.tax.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between font-bold text-[14px] pt-1">
                      <span>{settings.totalLabel}</span>
                      <span>{CURRENCY} {totals.total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="text-center pt-4 space-y-4">
                    <p className="font-semibold">{settings.thankYouMessage}</p>
                    <p className="text-[10px] uppercase tracking-wide">{settings.footerNote}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

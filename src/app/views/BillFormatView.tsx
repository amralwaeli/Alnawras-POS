import { useEffect, useMemo, useState } from 'react';
import { Save, RotateCcw, ReceiptText } from 'lucide-react';
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
} from '../../lib/billFormat';
import { CURRENCY } from '../../lib/currency';

const sampleItems = [
  { name: 'Mixed Grilled Al-Nawras + Bread', price: 30, qty: 1, discount: 0, amount: 30 },
  { name: 'Lemon Tea Ice', price: 3, qty: 1, discount: 0, amount: 3 },
  { name: 'Watermelon', price: 5, qty: 1, discount: 0, amount: 5 },
];

export function BillFormatView() {
  const [settings, setSettings] = useState<BillFormatSettings>(defaultBillFormatSettings);

  useEffect(() => {
    setSettings(loadBillFormatSettings());
  }, []);

  const totals = useMemo(() => {
    const subtotal = sampleItems.reduce((sum, item) => sum + item.amount, 0);
    return {
      subtotal,
      discount: 0,
      tax: 0,
      total: subtotal,
    };
  }, []);

  const updateField = (key: keyof BillFormatSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveBillFormatSettings(settings);
    toast.success('Bill format saved');
  };

  const handleReset = () => {
    setSettings(defaultBillFormatSettings);
    saveBillFormatSettings(defaultBillFormatSettings);
    toast.success('Bill format reset to default');
  };

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
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="size-4 mr-2" />
              Reset
            </Button>
            <Button onClick={handleSave}>
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
              <div className="space-y-2">
                <Label htmlFor="restaurant-name">Restaurant Name</Label>
                <Input
                  id="restaurant-name"
                  value={settings.restaurantName}
                  onChange={(e) => updateField('restaurantName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-tagline">Logo / Tagline Text</Label>
                <Input
                  id="branch-tagline"
                  value={settings.branchTagline}
                  onChange={(e) => updateField('branchTagline', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="header-note">Header Note</Label>
                <Input
                  id="header-note"
                  value={settings.headerNote}
                  onChange={(e) => updateField('headerNote', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cashier-label">Cashier Line</Label>
                <Input
                  id="cashier-label"
                  value={settings.cashierLabel}
                  onChange={(e) => updateField('cashierLabel', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-label">Register Line</Label>
                <Input
                  id="register-label"
                  value={settings.registerLabel}
                  onChange={(e) => updateField('registerLabel', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subtotal-label">Subtotal Label</Label>
                <Input
                  id="subtotal-label"
                  value={settings.subtotalLabel}
                  onChange={(e) => updateField('subtotalLabel', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount-label">Discount Label</Label>
                <Input
                  id="discount-label"
                  value={settings.discountLabel}
                  onChange={(e) => updateField('discountLabel', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax-label">Tax Label</Label>
                <Input
                  id="tax-label"
                  value={settings.taxLabel}
                  onChange={(e) => updateField('taxLabel', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total-label">Total Label</Label>
                <Input
                  id="total-label"
                  value={settings.totalLabel}
                  onChange={(e) => updateField('totalLabel', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="thanks-msg">Thank You Message</Label>
                <Input
                  id="thanks-msg"
                  value={settings.thankYouMessage}
                  onChange={(e) => updateField('thankYouMessage', e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="footer-note">Footer Note</Label>
                <Input
                  id="footer-note"
                  value={settings.footerNote}
                  onChange={(e) => updateField('footerNote', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

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
                  <div className="text-center border-b border-dashed border-[#bcb6aa] pb-4">
                    <div className="mx-auto mb-3 size-16 rounded-full border-[3px] border-[#7b7368] flex items-center justify-center text-3xl font-semibold">
                      S
                    </div>
                    <p className="text-[22px] font-serif italic leading-none">{settings.branchTagline}</p>
                    <p className="mt-2 text-[15px] font-bold uppercase tracking-wide">{settings.restaurantName}</p>
                    <p className="mt-3 text-[13px]">{settings.headerNote}</p>
                    <p className="text-[34px] font-bold leading-none">7</p>
                  </div>

                  <div className="py-3 text-[11px] border-b border-dashed border-[#bcb6aa]">
                    <p>{settings.cashierLabel}</p>
                    <p>{settings.registerLabel}</p>
                  </div>

                  <div className="py-3 border-b border-dashed border-[#bcb6aa]">
                    <div className="grid grid-cols-[1.6fr_.7fr_.45fr_.75fr_.8fr] gap-2 font-bold text-[10px] uppercase">
                      <span>Item</span>
                      <span className="text-right">Price</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Disc</span>
                      <span className="text-right">Amt</span>
                    </div>
                    <div className="mt-2 space-y-3">
                      {sampleItems.map(item => (
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

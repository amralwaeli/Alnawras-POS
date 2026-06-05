// lib/billFormat.ts

export interface BillFormatSettings {
  logoUrl: string;
  restaurantName: string;
  branchTagline: string;
  headerNote: string;
  cashierLabel: string;
  registerLabel: string;
  subtotalLabel: string;
  discountLabel: string;
  taxLabel: string;
  totalLabel: string;
  thankYouMessage: string;
  footerNote: string;
  showLogo: boolean;
  showTimestamp: boolean;
  showCashierName: boolean;
}

export const defaultBillFormatSettings: BillFormatSettings = {
  logoUrl: '',
  restaurantName: 'Your Restaurant',
  branchTagline: 'Fresh • Fast • Friendly',
  headerNote: 'Dine-in Order',
  cashierLabel: 'Served by',
  registerLabel: 'Register #1',
  subtotalLabel: 'Subtotal',
  discountLabel: 'Discount',
  taxLabel: 'Tax',
  totalLabel: 'Total',
  thankYouMessage: 'Thank you! Visit us again soon.',
  footerNote: 'Receipt generated electronically',
  showLogo: true,
  showTimestamp: true,
  showCashierName: true,
};

let cachedSettings: BillFormatSettings | null = null;

export function loadBillFormatSettings(): BillFormatSettings {
  if (cachedSettings) return cachedSettings;
  try {
    const stored = localStorage.getItem('billFormatSettings');
    const logo = localStorage.getItem('billFormatLogo') ?? '';
    if (stored) {
      const parsed = JSON.parse(stored);
      cachedSettings = { ...defaultBillFormatSettings, ...parsed, logoUrl: logo };
      return cachedSettings;
    }
  } catch (err) {
    console.warn('Failed to load bill format settings from localStorage:', err);
  }
  cachedSettings = defaultBillFormatSettings;
  return cachedSettings;
}

export function saveBillFormatSettings(settings: Partial<BillFormatSettings>): void {
  try {
    const current = { ...defaultBillFormatSettings, ...settings };
    // Save everything except logoUrl to localStorage (size limit)
    const { logoUrl, ...rest } = current;
    localStorage.setItem('billFormatSettings', JSON.stringify(rest));
    // Save logo separately
    if (logoUrl) {
      localStorage.setItem('billFormatLogo', logoUrl);
    } else {
      localStorage.removeItem('billFormatLogo');
    }
    cachedSettings = current;
  } catch (err) {
    console.error('Failed to save bill format settings:', err);
  }
}
export function resetBillFormatSettings(): void {
  try {
    localStorage.removeItem('billFormatSettings');
    localStorage.removeItem('billFormatLogo');
    cachedSettings = null;
  } catch (err) {
    console.warn('Failed to reset bill format settings:', err);
  }
}

// Helper to get a preview of the receipt header
export function getReceiptPreview(settings?: BillFormatSettings): string {
  const s = settings || loadBillFormatSettings();
  return `${s.restaurantName}\n${s.branchTagline}\n${s.headerNote}`;
}

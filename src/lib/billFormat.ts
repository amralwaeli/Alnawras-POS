// lib/billFormat.ts

export interface BillFormatSettings {
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

const DEFAULT_SETTINGS: BillFormatSettings = {
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
  // Try to load from localStorage first (allows admin customization)
  if (cachedSettings) return cachedSettings;
  
  try {
    const stored = localStorage.getItem('billFormatSettings');
    if (stored) {
      const parsed = JSON.parse(stored);
      cachedSettings = { ...DEFAULT_SETTINGS, ...parsed };
      return cachedSettings;
    }
  } catch (err) {
    console.warn('Failed to load bill format settings from localStorage:', err);
  }
  
  // Fallback to defaults
  cachedSettings = DEFAULT_SETTINGS;
  return DEFAULT_SETTINGS;
}

export function saveBillFormatSettings(settings: Partial<BillFormatSettings>): void {
  try {
    const current = loadBillFormatSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem('billFormatSettings', JSON.stringify(updated));
    cachedSettings = updated;
  } catch (err) {
    console.error('Failed to save bill format settings:', err);
  }
}

export function resetBillFormatSettings(): void {
  try {
    localStorage.removeItem('billFormatSettings');
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
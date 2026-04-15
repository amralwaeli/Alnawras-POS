export interface BillFormatSettings {
  restaurantName: string;
  branchTagline: string;
  headerNote: string;
  cashierLabel: string;
  registerLabel: string;
  thankYouMessage: string;
  footerNote: string;
  taxLabel: string;
  discountLabel: string;
  totalLabel: string;
  subtotalLabel: string;
}

const STORAGE_KEY = 'alnawras.bill-format';

export const defaultBillFormatSettings: BillFormatSettings = {
  restaurantName: 'Al-Nawras Yaman Restaurant',
  branchTagline: 'Al-Nawras',
  headerNote: 'Table #',
  cashierLabel: 'Cashier: Al-Nawras Restaurant',
  registerLabel: 'Register # 1',
  thankYouMessage: 'Thank you. Please come again.',
  footerNote: 'POWERED BY STOREHUB.COM CLOUD POS',
  taxLabel: 'Tax',
  discountLabel: 'DISCOUNT',
  totalLabel: 'TOTAL',
  subtotalLabel: 'Total Sales (Exc Tax)',
};

export function loadBillFormatSettings(): BillFormatSettings {
  if (typeof window === 'undefined') return defaultBillFormatSettings;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultBillFormatSettings;
    return { ...defaultBillFormatSettings, ...JSON.parse(raw) };
  } catch {
    return defaultBillFormatSettings;
  }
}

export function saveBillFormatSettings(settings: BillFormatSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

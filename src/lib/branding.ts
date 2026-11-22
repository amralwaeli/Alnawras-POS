/**
 * The current restaurant's name and invoice "Pay to" details, for code that is
 * not a React component (receipt text, invoice templates). Set by BranchContext
 * from the branch's settings (staff) or from branch_profile() (customer pages).
 * React components should prefer useBranch().businessName.
 */
export let BUSINESS_NAME = 'Restaurant';
export let PAY_TO = '';
/** Invoice / quotation header: "From" lines and logo address (empty = none). */
export let INVOICE_FROM = '';
export let LOGO_URL = '';

export function setBranding(b: { businessName?: string | null; payTo?: string | null; invoiceFrom?: string | null; logoUrl?: string | null }) {
  if (b.businessName) BUSINESS_NAME = b.businessName;
  if (b.payTo !== undefined) PAY_TO = b.payTo ?? '';
  if (b.invoiceFrom !== undefined) INVOICE_FROM = b.invoiceFrom ?? '';
  if (b.logoUrl !== undefined) LOGO_URL = b.logoUrl ?? '';
}

import { describe, it, expect, vi } from 'vitest';
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
vi.mock('../../lib/platform', () => ({ isNativeApp: () => false }));
import { PrintService } from './PrintService';

describe('kitchen ticket label', () => {
  it('names takeaway and pickup orders by their number, never "Table 0"', () => {
    expect(PrintService.ticketLabel({ orderType: 'takeaway', tableNumber: 0, billNumber: '0003' })).toBe('TAKEAWAY #0003');
    expect(PrintService.ticketLabel({ orderType: 'pickup', tableNumber: 0, billNumber: '0007' })).toBe('PICKUP #0007');
    expect(PrintService.ticketLabel({ orderType: 'takeaway', tableNumber: 0, billNumber: null })).toBe('TAKEAWAY');   // made offline
  });
  it('names dine-in orders by table', () => {
    expect(PrintService.ticketLabel({ orderType: 'dine-in', tableNumber: 5 })).toBe('TABLE 5');
  });
});

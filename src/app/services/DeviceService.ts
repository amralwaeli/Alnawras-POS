/**
 * DeviceService.ts
 * 
 * Handles device-level identity and station binding.
 * This ensures that specific hardware (e.g. Waiter Tablet) can only
 * perform authorized actions, regardless of the user's role.
 */

export type DeviceStation = 'cashier' | 'waiter' | 'kitchen' | 'admin' | 'unassigned';

export class DeviceService {
  private static DEVICE_ID_KEY = 'alnawras_device_id';
  private static STATION_KEY = 'alnawras_station_type';

  /**
   * Get or generate a unique ID for this specific physical device.
   */
  static getDeviceId(): string {
    let id = localStorage.getItem(DeviceService.DEVICE_ID_KEY);
    if (!id) {
      id = `dev-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(DeviceService.DEVICE_ID_KEY, id);
    }
    return id;
  }

  /**
   * Get the station type assigned to this device.
   */
  static getStationType(): DeviceStation {
    return (localStorage.getItem(DeviceService.STATION_KEY) as DeviceStation) || 'unassigned';
  }

  /**
   * Set the station type (Admin only).
   */
  static setStationType(station: DeviceStation): void {
    localStorage.setItem(DeviceService.STATION_KEY, station);
  }

  /**
   * Sync station binding with the server to allow remote updates.
   */
  static async syncBinding(branchId: string): Promise<void> {
    const deviceId = DeviceService.getDeviceId();
    const station = DeviceService.getStationType();

    const { data, error } = await supabase
      .from('device_bindings')
      .upsert({ 
        device_id: deviceId, 
        branch_id: branchId, 
        station_type: station,
        last_seen: new Date().toISOString()
      }, { onConflict: 'device_id' })
      .select('station_type')
      .single();

    if (!error && data) {
      // Update local storage if the admin changed the station remotely
      if (data.station_type !== station) {
        DeviceService.setStationType(data.station_type as DeviceStation);
      }
    }
  }

  /**
   * Check if the current device is authorized to perform an action.
   * e.g. only 'cashier' station can process payments.
   */
  static isAuthorized(action: 'payment' | 'ordering' | 'inventory' | 'hr'): boolean {
    const station = DeviceService.getStationType();
    
    // Admin station can do everything
    if (station === 'admin') return true;

    switch (action) {
      case 'payment':
        return station === 'cashier';
      case 'ordering':
        return station === 'waiter' || station === 'cashier';
      case 'inventory':
        return station === 'cashier' || station === 'kitchen';
      case 'hr':
        return false; // Only admin station
      default:
        return false;
    }
  }
}

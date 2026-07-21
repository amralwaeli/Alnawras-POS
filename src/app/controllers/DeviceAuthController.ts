import { supabase } from '../../lib/supabase';

/**
 * DeviceAuthController — the branch/terminal login layer.
 *
 * A device signs in ONCE with a branch email+password (a real Supabase Auth
 * account, separate from staff PINs). That session persists on the device until
 * an admin signs it out; staff then PIN in on top of it. This is the front half
 * of the multi-tenant auth model — it establishes the real session that the
 * later RLS step (1D) keys tenant isolation on. See migration 0024.
 *
 * The whole layer is DORMANT until at least one branch device account is
 * provisioned: `isRequired()` returns false (or fails open on any error, e.g.
 * the migration not yet applied), and the app skips the gate entirely.
 */
export class DeviceAuthController {
  /** Sign the device into a branch account. Rejects any Supabase account that
   *  isn't a registered device login (e.g. a super-admin), signing it back out
   *  so a stray session can't half-unlock the device. */
  static async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { success: false, error: error.message };

    const branchId = await DeviceAuthController.getDeviceBranch();
    if (!branchId) {
      await supabase.auth.signOut();
      return { success: false, error: 'This account is not registered as a device login for any branch.' };
    }
    return { success: true };
  }

  /** Sign the device out of its branch account (admin action). */
  static async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  /** Is the device-login gate active (has any branch device account been set up)?
   *  Fails OPEN (false = dormant) so a missing migration / RPC never blocks the
   *  app — the gate simply stays off until it's genuinely provisioned. */
  static async isRequired(): Promise<boolean> {
    const { data, error } = await supabase.rpc('device_login_required');
    if (error) return false;
    return data === true;
  }

  /** The branch id for the currently signed-in device account, or null if the
   *  current session isn't a registered device login (no session / super-admin). */
  static async getDeviceBranch(): Promise<string | null> {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return null;
    const { data, error } = await supabase.rpc('current_device_branch');
    if (error) return null;
    return typeof data === 'string' && data.length > 0 ? data : null;
  }
}

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, Branch, BranchFeatures, BranchFeatureKey, ALL_FEATURES_ON, BranchSettings, DEFAULT_BRANCH_SETTINGS } from '../models/types';
import { BranchController, BranchAccess } from '../controllers/BranchController';
import { SettingsController } from '../controllers/SettingsController';

interface BranchContextType {
  branch: Branch | null;
  features: BranchFeatures;
  /** True when this branch may operate (active + contract not expired). */
  allowed: boolean;
  reason?: BranchAccess['reason'];
  loading: boolean;
  hasFeature: (key: BranchFeatureKey) => boolean;
  /** Tenant-admin-configured tax + quick-discount presets for this branch. */
  settings: BranchSettings;
  /** Re-fetch settings after the admin edits them. */
  reloadSettings: () => void;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

// How often to re-check contract/suspension while a session is live, so an
// expiry that rolls over mid-shift auto-locks without needing a reload.
const RECHECK_MS = 5 * 60 * 1000;

export function BranchProvider({ children, currentUser }: { children: ReactNode; currentUser: User | null }) {
  const [access, setAccess] = useState<BranchAccess>({ branch: null, allowed: true });
  const [settings, setSettings] = useState<BranchSettings>(DEFAULT_BRANCH_SETTINGS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (branchId: string) => {
    const a = await BranchController.getAccess(branchId);
    setAccess(a);
    setLoading(false);
  }, []);

  const loadSettings = useCallback(async (branchId: string) => {
    setSettings(await SettingsController.getSettings(branchId));
  }, []);

  const reloadSettings = useCallback(() => {
    if (currentUser?.branchId) void loadSettings(currentUser.branchId);
  }, [currentUser?.branchId, loadSettings]);

  useEffect(() => {
    if (!currentUser?.branchId) {
      setAccess({ branch: null, allowed: true });
      setSettings(DEFAULT_BRANCH_SETTINGS);
      return;
    }
    setLoading(true);
    void refresh(currentUser.branchId);
    void loadSettings(currentUser.branchId);
    const t = setInterval(() => { void refresh(currentUser.branchId); }, RECHECK_MS);
    return () => clearInterval(t);
  }, [currentUser?.branchId, refresh, loadSettings]);

  // Features fail open: an unregistered/legacy branch (no row) keeps every
  // module visible, so this never hides features from a single-tenant install
  // that hasn't onboarded onto the branches registry yet.
  const features = access.branch?.features ?? ALL_FEATURES_ON;

  const value: BranchContextType = {
    branch: access.branch,
    features,
    allowed: access.allowed,
    reason: access.reason,
    loading,
    hasFeature: (key) => features[key] !== false,
    settings,
    reloadSettings,
  };

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchContextType {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within BranchProvider');
  return ctx;
}

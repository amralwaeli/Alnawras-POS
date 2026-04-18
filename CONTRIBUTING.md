# Alnawras POS — Team Development Guide

## Module Ownership

Each team member owns one folder. You can work entirely inside your module
without touching anyone else's code.

| Module | Folder | Owner |
|--------|--------|-------|
| Dashboard | `src/app/modules/dashboard/` | — |
| Tables & Payment | `src/app/modules/tables/` | — |
| Kitchen Display | `src/app/modules/kitchen/` | — |
| Inventory | `src/app/modules/inventory/` | — |
| Staff / Users | `src/app/modules/staff/` | — |
| HR & Attendance | `src/app/modules/hr/` | — |
| Reports | `src/app/modules/reports/` | — |
| Accounting | `src/app/modules/accounting/` | — |
| Auth / Login | `src/app/modules/auth/` | — |
| Customer Menu | `src/app/modules/menu/` | — |
| Shared Components | `src/app/modules/shared/` | All |

---

## Project Structure

```
src/
├── lib/
│   ├── supabase.ts          ← Supabase client (do not touch)
│   ├── currency.ts          ← fmt(), CURRENCY, orderTotal()
│   └── billFormat.ts        ← Receipt settings
│
├── app/
│   ├── models/
│   │   └── types.ts         ← All TypeScript interfaces (shared)
│   │
│   ├── controllers/         ← Business logic talking to Supabase
│   │   ├── ProductController.ts
│   │   ├── TableController.ts
│   │   ├── OrderController.ts
│   │   └── ...
│   │
│   ├── context/             ← State management (do not touch unless adding new global state)
│   │   ├── AuthContext.tsx          ← login / currentUser
│   │   ├── CatalogContext.tsx       ← products / categories
│   │   ├── TablesContext.tsx        ← tables state
│   │   ├── OrdersContext.tsx        ← orders state + mapOrder helpers
│   │   ├── RealtimeSyncEngine.tsx   ← ALL Supabase realtime (do not duplicate)
│   │   └── POSContext.tsx           ← usePOS() shim (backward-compat)
│   │
│   ├── components/
│   │   ├── Layout.tsx        ← Sidebar + navigation (shared)
│   │   └── ui/               ← shadcn/ui components (do not touch)
│   │
│   ├── modules/              ← Feature modules (your work lives here)
│   │   ├── dashboard/
│   │   │   ├── AdminDashboardView.tsx
│   │   │   ├── DashboardView.tsx
│   │   │   └── index.ts
│   │   ├── tables/
│   │   │   ├── TablesView.tsx
│   │   │   ├── TableManagementView.tsx
│   │   │   ├── TableOrderingView.tsx
│   │   │   ├── TableQRView.tsx
│   │   │   ├── TableRedirectView.tsx
│   │   │   └── index.ts
│   │   ├── kitchen/
│   │   │   ├── KitchenView.tsx
│   │   │   └── index.ts
│   │   ├── inventory/ ...
│   │   ├── staff/ ...
│   │   ├── hr/ ...
│   │   ├── reports/ ...
│   │   ├── accounting/ ...
│   │   ├── auth/ ...
│   │   ├── menu/ ...
│   │   └── shared/
│   │       ├── PaymentModal.tsx    ← Reusable payment modal
│   │       └── index.ts
│   │
│   ├── App.tsx
│   └── routes.tsx            ← Central router (only add routes here)
```

---

## How to Use State

### Option A — usePOS() (backward-compatible, works everywhere)
```tsx
import { usePOS } from '../../context/POSContext';

export function MyView() {
  const { products, currentUser, orders } = usePOS();
  // ...
}
```

### Option B — Focused contexts (preferred for new code)
```tsx
import { useAuth }    from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import { useTables }  from '../../context/TablesContext';
import { useOrders }  from '../../context/OrdersContext';
```

---

## Adding a New Feature to Your Module

1. Create a file inside your module folder, e.g. `src/app/modules/kitchen/KitchenStats.tsx`
2. Export it from your module's `index.ts`
3. Import it in your main view file
4. **Do not** create new Supabase realtime subscriptions — add them to `RealtimeSyncEngine.tsx` if needed

---

## Adding a New Route

Edit `src/app/routes.tsx` only. Add your route in the correct section and
lazy-import from your module's `index.ts`.

---

## Rules

- ✅ Work only inside `src/app/modules/<your-module>/`
- ✅ Import shared utilities from `src/lib/` or `src/app/modules/shared/`
- ✅ Use `usePOS()` or focused contexts for state
- ❌ Do NOT create new realtime subscriptions (use `RealtimeSyncEngine.tsx`)
- ❌ Do NOT edit `src/app/context/` without team discussion
- ❌ Do NOT edit `src/app/models/types.ts` without team discussion
- ❌ Do NOT import between sibling modules (e.g. kitchen importing from tables)

---

## Shared Components

If you build something that other modules might need (e.g. a date picker, a
currency input, a confirmation dialog), put it in `src/app/modules/shared/`
and export it from `shared/index.ts`.

---

## Running the Project

```bash
pnpm install
pnpm dev
```

Requires a `.env` file with:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

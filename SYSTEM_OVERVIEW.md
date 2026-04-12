# Enhanced POS System - Complete Architecture

## System Status: IN DEVELOPMENT

This document outlines the complete production-ready POS system with role-based access control, table management, accounting, and multi-role interfaces.

## Implemented Components ✅

### 1. Model Layer (Complete)
- **Enhanced Type System** (`src/app/models/types.ts`)
  - User roles: Admin, Cashier, Waiter, Kitchen, HR
  - Role-based permissions matrix
  - Table management entities
  - Order with waiter attribution
  - Attendance tracking
  - Expense and accounting entities
  - Import/export types

- **Mock Data** (`src/app/models/mockData.ts`)
  - 6 users across all roles
  - 5 tables with various statuses
  - 8 products with kitchen status
  - 3 active orders with waiter attribution
  - Attendance records with late tracking
  - Expense records

### 2. Controller Layer (Partial)
- **AuthController** - PIN authentication, user management, permission checks
- **TableController** - Table management, cashier assignment, status updates
- **OrderController** - Table-based ordering, waiter attribution, item management

### 3. Still Building
- PaymentController (cash/card/QR/mixed payments)
- AttendanceController (check-in/out, late tracking)
- AccountingController (expenses, daily reconciliation)
- ImportExportController (CSV/JSON product import/export)
- ReportController (PDF/Excel generation)

## System Architecture

### Authentication Flow
```
1. User enters 4-digit PIN
2. System validates PIN and checks status
3. User redirected to role-appropriate interface
4. All actions validated against role permissions
```

### Key Workflows

#### 1. Waiter Adds Order to Table
```
Waiter logs in → Selects table → Adds items to order
→ System tracks waiter attribution → Kitchen sees pending items
→ Admin sees full order details with waiter info
```

#### 2. Kitchen Marks Item Finished
```
Kitchen logs in → Views pending orders → Marks items ready/finished
→ Item status updated → Prevents new orders for finished items
→ Existing orders preserved
```

#### 3. Cashier Processes Payment
```
Cashier logs in → Views assigned tables → Selects payment method(s)
→ Processes payment (cash/card/QR/mixed) → Updates accounting
→ Table marked available → Receipt generated
```

#### 4. Staff Check-In
```
Staff enters employment number → System records check-in time
→ Compares to scheduled time → Calculates late minutes
→ HR can view attendance reports
```

#### 5. Admin Generates Report
```
Admin selects date range → Chooses format (PDF/Excel)
→ System aggregates sales + expenses → Calculates net income
→ Exports comprehensive report
```

## Role Permissions Matrix

| Permission | Admin | Cashier | Waiter | Kitchen | HR |
|------------|-------|---------|--------|---------|-----|
| View Tables | ✅ | ✅ (assigned only) | ✅ | ❌ | ❌ |
| Add Orders | ✅ | ❌ | ✅ | ❌ | ❌ |
| Process Payments | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage Inventory | ✅ | ❌ | ❌ | ✅ | ❌ |
| View Reports | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Staff | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Accounting | ✅ | ❌ | ❌ | ❌ | ❌ |
| Export Reports | ✅ | ❌ | ❌ | ❌ | ❌ |
| Import Products | ✅ | ❌ | ❌ | ❌ | ❌ |
| View Attendance | ✅ | ❌ | ❌ | ❌ | ✅ |
| Check In | ✅ | ✅ | ✅ | ✅ | ✅ |

## Database Schema (Supabase Ready)

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  employment_number TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cashier', 'waiter', 'kitchen', 'hr')),
  pin TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active',
  branch_id UUID REFERENCES branches(id),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);
```

### Tables Table
```sql
CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  status TEXT DEFAULT 'available',
  branch_id UUID REFERENCES branches(id),
  current_order_id UUID,
  assigned_cashier_id UUID REFERENCES users(id)
);
```

### Orders Table
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id UUID REFERENCES tables(id),
  table_number INTEGER,
  subtotal DECIMAL(10,2),
  tax DECIMAL(10,2),
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2),
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  waiters TEXT[] -- Array of waiter IDs
);
```

### Order Items Table
```sql
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id),
  product_id UUID REFERENCES products(id),
  product_name TEXT,
  quantity INTEGER,
  price DECIMAL(10,2),
  subtotal DECIMAL(10,2),
  added_by UUID REFERENCES users(id),
  added_by_name TEXT,
  added_at TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  notes TEXT
);
```

### Attendance Table
```sql
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employment_number TEXT NOT NULL,
  staff_id UUID REFERENCES users(id),
  staff_name TEXT,
  check_in_time TIMESTAMP NOT NULL,
  check_out_time TIMESTAMP,
  scheduled_time TIMESTAMP NOT NULL,
  late_minutes INTEGER DEFAULT 0,
  branch_id UUID REFERENCES branches(id),
  date DATE NOT NULL
);
```

### Expenses Table
```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  date DATE NOT NULL,
  created_by UUID REFERENCES users(id),
  branch_id UUID REFERENCES branches(id),
  receipt TEXT
);
```

## Next Steps

1. ✅ Complete remaining controllers (Payment, Attendance, Accounting, Import/Export, Report)
2. ✅ Build authentication UI with PIN entry
3. ✅ Create role-specific dashboards:
   - Admin: Full system overview
   - Cashier: Payment interface with assigned tables
   - Waiter: Order management interface
   - Kitchen: Inventory status management
   - HR: Attendance tracking
4. ✅ Implement import/export (CSV/JSON)
5. ✅ Add PDF/Excel report generation
6. ✅ Wire up routing and navigation
7. ✅ Add error handling and validation
8. ✅ Connect to Supabase backend

## Default User Credentials (Mock Data)

- **Admin**: PIN `1234` (Admin User)
- **Cashier**: PIN `2345` (Sarah Johnson)
- **Waiter 1**: PIN `3456` (Mike Chen)
- **Waiter 2**: PIN `4567` (Emily Rodriguez)
- **Kitchen**: PIN `5678` (James Kim)
- **HR**: PIN `6789` (Lisa Anderson)

## Technology Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Routing**: React Router (data mode)
- **State**: React Context API
- **Charts**: Recharts
- **Icons**: Lucide React
- **Backend**: Supabase (when connected)
- **Export**: Client-side CSV generation + libraries for PDF/Excel

## Production Readiness Checklist

- [ ] Complete all controllers
- [ ] Build all role-specific UIs
- [ ] Implement authentication system
- [ ] Add comprehensive error handling
- [ ] Create unit tests for controllers
- [ ] Create integration tests for workflows
- [ ] Add data validation
- [ ] Implement audit logging
- [ ] Add session management
- [ ] Security hardening (XSS, CSRF protection)
- [ ] Performance optimization
- [ ] Accessibility compliance
- [ ] Mobile responsiveness
- [ ] Documentation (API, setup, deployment)
- [ ] Connect to Supabase
- [ ] Set up CI/CD pipeline

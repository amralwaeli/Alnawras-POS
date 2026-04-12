# POS System Architecture (MVC Pattern)

## Technology Stack
- **Frontend**: React + TypeScript + Tailwind CSS
- **State Management**: React Context API
- **Routing**: React Router
- **Charts**: Recharts
- **Icons**: Lucide React
- **Backend** (when connected): Supabase

## MVC Architecture Overview

### Model Layer (`src/app/models/`)
Handles all business logic and data persistence:

#### Data Models
- **Product**: id, name, category, price, stock, image, sku, tax_rate
- **Order**: id, items[], subtotal, tax, discount, total, payment_method, status, created_at, cashier_id
- **OrderItem**: product_id, quantity, price, subtotal
- **Customer**: id, name, email, phone, total_spent, visit_count
- **Staff**: id, name, role, email, status, hourly_rate
- **Inventory**: product_id, stock_level, reorder_point, last_updated
- **Branch**: id, name, location, manager_id
- **Payment**: id, order_id, amount, method, status, timestamp

#### Business Logic
- **Stock Management**: Deduct inventory on sale, restock tracking
- **Tax Calculation**: Apply tax rates per product
- **Discount Engine**: Percentage/fixed discounts
- **Analytics**: Sales reports, top products, revenue trends
- **Transaction Validation**: Stock availability, price validation

### Controller Layer (`src/app/controllers/`)
Request handlers that route data between View and Model:

#### Controllers
- **OrderController**: 
  - `processOrder(items, payment)`: Validates stock → creates order → updates inventory → returns receipt
  - `getOrderHistory()`: Fetches past orders
  - `getOrderById(id)`: Retrieves specific order
  
- **ProductController**:
  - `getProducts()`: Returns product catalog
  - `updateProduct(id, data)`: Updates product info
  - `adjustStock(id, quantity)`: Manual stock adjustment
  
- **InventoryController**:
  - `checkStock(productId)`: Returns current stock level
  - `getLowStockItems()`: Products below reorder point
  - `recordRestock(productId, quantity)`: Adds stock
  
- **AnalyticsController**:
  - `getSalesReport(startDate, endDate)`: Revenue, orders, items sold
  - `getTopProducts(limit)`: Best sellers
  - `getCashierPerformance()`: Sales by staff member
  
- **StaffController**:
  - `getStaff()`: All staff members
  - `updateStaff(id, data)`: Edit staff info
  - `recordClockIn/Out()`: Time tracking

### View Layer (`src/app/views/`)
User-facing interfaces:

#### Views
1. **CashierView**: 
   - Product grid with categories
   - Shopping cart
   - Payment processing
   - Receipt display
   
2. **InventoryView**:
   - Product list with stock levels
   - Low stock alerts
   - Add/edit products
   - Restock interface
   
3. **ReportsView**:
   - Sales charts (daily/weekly/monthly)
   - Revenue metrics
   - Top products table
   - Export functionality
   
4. **StaffView**:
   - Staff list
   - Add/edit staff
   - Role management
   - Performance metrics

## Data Flow Example: Processing a Sale

1. **View**: Cashier clicks "Burger" → adds to cart → clicks "Pay with Cash"
2. **Controller**: `OrderController.processOrder()` receives request
   - Validates all items have sufficient stock
   - Calculates subtotal, tax, discounts
3. **Model**: 
   - Creates new Order record
   - Deducts stock for each OrderItem
   - Records Payment
4. **Controller**: Returns order data with receipt
5. **View**: Displays receipt, resets cart

## File Structure

```
src/app/
├── models/
│   ├── types.ts              # TypeScript interfaces
│   ├── mockData.ts           # Development data
│   └── businessLogic.ts      # Calculations (tax, discounts)
├── controllers/
│   ├── OrderController.ts
│   ├── ProductController.ts
│   ├── InventoryController.ts
│   ├── AnalyticsController.ts
│   └── StaffController.ts
├── views/
│   ├── CashierView.tsx
│   ├── InventoryView.tsx
│   ├── ReportsView.tsx
│   └── StaffView.tsx
├── components/
│   ├── ProductCard.tsx
│   ├── Cart.tsx
│   ├── Receipt.tsx
│   ├── StaffTable.tsx
│   └── SalesChart.tsx
├── context/
│   └── POSContext.tsx        # Global state management
└── App.tsx                   # Main entry with routing
```

## Database Schema (for Supabase integration)

```sql
-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT,
  price DECIMAL(10,2) NOT NULL,
  stock INTEGER DEFAULT 0,
  image_url TEXT,
  sku TEXT UNIQUE,
  tax_rate DECIMAL(5,2) DEFAULT 0.10,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subtotal DECIMAL(10,2),
  tax DECIMAL(10,2),
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2),
  payment_method TEXT,
  status TEXT DEFAULT 'completed',
  cashier_id UUID REFERENCES staff(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id),
  product_id UUID REFERENCES products(id),
  quantity INTEGER,
  price DECIMAL(10,2),
  subtotal DECIMAL(10,2)
);

-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  total_spent DECIMAL(10,2) DEFAULT 0,
  visit_count INTEGER DEFAULT 0
);

-- Staff
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  role TEXT,
  email TEXT UNIQUE,
  status TEXT DEFAULT 'active',
  hourly_rate DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints (Controller Methods)

### Orders
- `POST /orders` → `OrderController.processOrder()`
- `GET /orders` → `OrderController.getOrderHistory()`
- `GET /orders/:id` → `OrderController.getOrderById()`

### Products
- `GET /products` → `ProductController.getProducts()`
- `PUT /products/:id` → `ProductController.updateProduct()`
- `PATCH /products/:id/stock` → `ProductController.adjustStock()`

### Inventory
- `GET /inventory/low-stock` → `InventoryController.getLowStockItems()`
- `POST /inventory/restock` → `InventoryController.recordRestock()`

### Analytics
- `GET /analytics/sales` → `AnalyticsController.getSalesReport()`
- `GET /analytics/top-products` → `AnalyticsController.getTopProducts()`

### Staff
- `GET /staff` → `StaffController.getStaff()`
- `PUT /staff/:id` → `StaffController.updateStaff()`

## Current Implementation Status

✅ Uses mock data for demonstration
✅ Full MVC architecture implemented
✅ All business logic functional (tax, stock updates, analytics)
⏳ Supabase integration pending (connect in Make settings)

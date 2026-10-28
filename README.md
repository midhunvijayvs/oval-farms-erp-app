# Oval Farms ERP

Comprehensive ERP software to manage all business activities of Oval Farms and all its related food products, sharing one Firebase database with the ovalfarm.in shop.

**Live app:** https://erp.ovalfarm.in

## What it does

| Area | Features |
|---|---|
| Dashboard | Month sales, money to collect, spending, harvest; 14-day sales and harvest charts; alerts for low stock, overdue invoices and expiring lots; grow rooms, recent invoices, tasks due |
| Production | **Grow batches** (spawning date, room, bags, substrate, spawn, status, contamination) with harvested kg and biological efficiency · **Harvest log** (kg, grade, flush) · **Processing runs** for value-added products (inputs used, output lot, expiry from shelf life, cost per unit and margin) |
| Inventory | Live stock calculated from every movement, with quantities held for open orders · Products & materials (fresh mushroom, value-added, raw material, packaging) with HSN, GST, prices, alert level · Website details, photos, publish/unpublish and the order products appear in on ovalfarm.in · Stock ledger per item · Adjustments (wastage, samples, count corrections) |
| Orders | One list for website (online) and phone, WhatsApp or walk-in (offline) orders, with status tabs and a badge for new ones · New Order for offline orders, with search-as-you-type customer and product pickers (product photos) and product groups (kits) that open into their items × quantity · Open orders summary (quantity, price, cost, profit per product) shared to WhatsApp as a JPG · Confirm, pack, deliver or cancel · One click turns an order into a GST invoice |
| Sales | GST invoices made from orders, with line items, discounts, CGST/SGST or IGST, round-off, amount in words · Print / save as PDF · Share on WhatsApp as text or as a JPG picture · Payment tracking (unpaid / partly paid / paid) · One customer list (online sign-ups and customers added here) with outstanding balance, credit days and website logins |
| Purchases | Purchase bills that add stock · Suppliers with payable balance |
| Finance | Expenses by category · Payments received and made, linked to invoices/bills |
| People | Daily attendance (present / half day / absent / leave) with monthly wage estimate · Employees · Tasks with daily/weekly/monthly repeats |
| Reports | Profit & loss, sales by product and customer, batch yield, processing cost, GST summary, stock valuation, receivables & payables, wages; any date range; CSV export and print |
| Settings | Business profile for invoices, team roles (Admin / Manager / Staff / Viewer), editable dropdown lists, invite link, backup & restore, light/dark theme, install |

Also: splash screen, installable app (PWA) on phones and computers, works offline, mobile-first layout with bottom navigation.

## How it's built

- Static site: `index.html`, `css/`, `js/` (ES modules), no build step.
- Sign-in with Google (Identity Services, then Firebase Auth). Only people on Settings → Team get in.
- All data lives in **Firebase** (Firestore, project oval-farms-erp), shared live with ovalfarm.in and cached offline (`js/firebase.js`, `js/store.js`). Rules in `firebase/firestore.rules` and `firebase/storage.rules`.
- Products, customers and orders are single shared collections; the site reads published products from the public `catalog` copy (`js/catalog.js`).

See **[docs/SETUP.md](docs/SETUP.md)** for publishing, Google Cloud settings and adding your team, and **[docs/FIREBASE.md](docs/FIREBASE.md)** for Firebase.

## Development

```bash
python -m http.server 8000      # then open http://localhost:8000
node tests/demo.e2e.mjs         # sample-data mode; needs Playwright and the server on port 8765
```

Security rules and the ERP + website flow run against the Firebase emulators; see docs/FIREBASE.md.

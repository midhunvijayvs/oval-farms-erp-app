# Oval Farms ERP

Google Drive based shared DB, comprehensive ERP software to manage all business activities of Oval Farms and all its related food products. The DB from free Google Drive is planned to migrate to a paid DB in future with help of AI.

**Live app:** https://midhunvijayvs.github.io/oval-farms-erp-app/ (after GitHub Pages is switched on, see setup)

## What it does

| Area | Features |
|---|---|
| Dashboard | Month sales, money to collect, spending, harvest; 14-day sales and harvest charts; alerts for low stock, overdue invoices and expiring lots; grow rooms, recent invoices, tasks due |
| Production | **Grow batches** (spawning date, room, bags, substrate, spawn, status, contamination) with harvested kg and biological efficiency · **Harvest log** (kg, grade, flush) · **Processing runs** for value-added products (inputs used, output lot, expiry from shelf life, cost per unit and margin) |
| Inventory | Live stock calculated from every movement · Products & materials (fresh mushroom, value-added, raw material, packaging) with HSN, GST, prices, alert level · Stock ledger per item · Adjustments (wastage, samples, count corrections) |
| Online orders | Orders from the ovalfarm.in shop arrive live through Firebase, with a badge for new ones · Confirm, pack, deliver or cancel · One click turns an order into a GST invoice (adds the customer, matches products) · Website customers list with orders and spend |
| Sales | GST invoices with line items, discounts, CGST/SGST or IGST, round-off, amount in words · Print / save as PDF · Share on WhatsApp · Payment tracking (unpaid / partly paid / paid) · Customers with outstanding balance and credit days |
| Purchases | Purchase bills that add stock · Suppliers with payable balance |
| Finance | Expenses by category · Payments received and made, linked to invoices/bills |
| People | Daily attendance (present / half day / absent / leave) with monthly wage estimate · Employees · Tasks with daily/weekly/monthly repeats |
| Reports | Profit & loss, sales by product and customer, batch yield, processing cost, GST summary, stock valuation, receivables & payables, wages; any date range; CSV export and print |
| Settings | Business profile for invoices, team roles (Admin / Manager / Staff / Viewer), editable dropdown lists, invite link, backup & restore, light/dark theme, install |

Also: splash screen, installable app (PWA) on phones and computers, works offline, mobile-first layout with bottom navigation.

## How it's built

- Static site: `index.html`, `css/`, `js/` (ES modules), no build step.
- Sign-in with Google Identity Services; data in one JSON file inside a shared **Oval Farms ERP** folder in Google Drive.
- Changes from different users are merged record by record (`js/merge.js`), with an offline cache in IndexedDB.
- Online orders and website customers live in **Firebase** (Firestore), shared with ovalfarm.in (`js/firebase.js`, rules in `firebase/firestore.rules`). The rest of the ERP moves from Drive to Firebase one module at a time.

See **[docs/SETUP.md](docs/SETUP.md)** for publishing, Google Cloud settings and adding your team, and **[docs/FIREBASE.md](docs/FIREBASE.md)** for Firebase.

## Development

```bash
python -m http.server 8000      # then open http://localhost:8000
node tests/merge.test.mjs       # merge logic tests
node tests/e2e.mjs              # two users sharing a (mocked) Drive folder; needs Playwright and the server on port 8765
node tests/orders.e2e.mjs       # online orders pages with sample orders (demo mode)
```

Firebase rules and the full online-order flow run against the Firebase emulators; see docs/FIREBASE.md.

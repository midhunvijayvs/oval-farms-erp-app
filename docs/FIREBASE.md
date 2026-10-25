# Firebase setup for Oval Farms (ERP + ovalfarm.in)

Do this on a computer, in a **private / incognito window** where only **ovaleggfarm@gmail.com** is signed in.
Steps 1–8 were done in October 2026. **Step 9 is new with the shared products, customers and orders update.**

You'll add Firebase to the **existing "Oval Farms ERP" Google Cloud project**, so you do not create a new project.

---

## 1 · Add Firebase to the existing project

1. Open <https://console.firebase.google.com/> as ovaleggfarm@gmail.com.
2. Click **Create a project** (or **Add project**). At the bottom of the first screen choose
   **"Add Firebase to an existing Google Cloud project"** (some screens say *Add Firebase to Google Cloud project*).
3. Pick **Oval Farms ERP** from the list → **Continue**.
4. Google Analytics: turn it **off** (you don't need it) → **Add Firebase** → wait → **Continue**.

## 2 · Make your personal account a second owner

1. Click the ⚙️ gear next to *Project Overview* → **Users and permissions**.
2. **Add member** → your personal Gmail → role **Owner** → **Add member**.
3. Accept the email invite from your personal Gmail.
4. While you're at it, turn on **2-Step Verification** for ovaleggfarm@gmail.com at <https://myaccount.google.com/security>.

## 3 · Switch to the pay-as-you-go plan, with a budget alert

Phone OTP sign-in and (later) Cloud Functions need this. Usage inside the free quota stays ₹0.

1. Bottom-left of the Firebase console, next to **Spark**, click **Upgrade** → choose **Blaze (pay as you go)**.
2. Create or pick a billing account and add a card.
3. When it asks for a budget, set **₹500** (or whatever you like). You'll get an email at 50%, 90% and 100%.
   A budget alert only warns you; it doesn't stop anything.

You can skip this step for now if you don't want phone OTP yet. Everything else works on the free Spark plan.

## 4 · Create the database (Firestore)

1. Left menu → **Build → Firestore Database** → **Create database**.
2. Edition: **Standard** if asked.
3. Location: **asia-south1 (Mumbai)**. ⚠️ This can never be changed later.
4. Start in **production mode** → **Create**.
   (Production mode blocks everything until we paste the real security rules, which Claude is preparing.)

## 5 · Turn on sign-in methods

Left menu → **Build → Authentication** → **Get started** → tab **Sign-in method**. Enable these one by one:

| Provider | What to do |
|---|---|
| **Google** | Enable → *Project support email*: ovaleggfarm@gmail.com → Save |
| **Email/Password** | Enable the first switch only (leave *Email link* off) → Save |
| **Phone** | Enable → Save. (Needs step 3. Each OTP SMS costs about ₹1.) |

Leave **Apple** off for now. It needs a paid Apple Developer account (about ₹8,300/year); we can add it later.

## 6 · Allow your websites to use sign-in

Still in **Authentication** → tab **Settings** → **Authorized domains** → **Add domain**. Add each of these:

- `erp.ovalfarm.in`
- `ovalfarm.in`
- `www.ovalfarm.in`

(`localhost` is already there; keep it.)

## 7 · Register the web app and send Claude the config

1. ⚙️ gear → **Project settings** → tab **General** → scroll to **Your apps** → click the **`</>`** (Web) icon.
2. App nickname: `Oval Farms web` → leave *Firebase Hosting* unticked → **Register app**.
3. It shows a block like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "….firebaseapp.com",
     projectId: "…",
     storageBucket: "….firebasestorage.app",
     messagingSenderId: "…",
     appId: "1:…:web:…"
   };
   ```

4. **Copy that block and paste it to Claude in the thread.** It is not a password; it's meant to be in website code.
   Both the ERP and ovalfarm.in will use this same config.
5. Click **Continue to console**. You don't need to run the `npm install` it shows.

## 8 · Google sign-in screen for customers (do this when the shop goes live)

Right now the Google sign-in screen is in **Testing**, which only lets the test users you listed sign in.
Customers signing in with Google on ovalfarm.in need it **In production**:

1. <https://console.cloud.google.com/> → project **Oval Farms ERP** → ☰ **Google Auth Platform → Audience**.
2. **Publish app** → **Confirm**.

The ERP no longer uses Google Drive, so it only asks for name and email and publishing needs no Google review.

## 9 · Shared products, customers and orders (with the October 2026 update)

1. **New database rules.** Firestore Database → **Rules** → replace everything with the contents of
   [`firebase/firestore.rules`](../firebase/firestore.rules) → **Publish**.
2. **Product photos (Storage).** Needs the Blaze plan from step 3.
   Build → **Storage** → **Get started** → location **asia-south1** → production mode → **Done**.
   Then the **Rules** tab → replace everything with [`firebase/storage.rules`](../firebase/storage.rules) → **Publish**.
   Until this is done, photos can still be added in the ERP by pasting an image link.
3. **Customer login email (optional).** Authentication → **Templates** → **Password reset** → edit the sender name to
   `Oval Farms` and the subject to something like *Set your Oval Farms password*. This free email goes to customers
   you add in the ERP so they can choose their own password.
4. **Old Drive permission (optional).** Google Cloud → Google Auth Platform → **Data access** → remove `.../auth/drive` → Save.
5. Sign in to the ERP once as ovaleggfarm@gmail.com. The products from ovalfarm.in are added to Products & Materials
   and copied to the website.

---

## How the data is organised

Everything the ERP keeps is in Firestore now; Google Drive is no longer used.

| Collection | What | Who can read / write |
|---|---|---|
| `products/{id}` | **Products & Materials**: everything the farm makes, sells or buys, including cost prices and website details (`published`, `webCategory`, `images`, `description`, `mrp`, `displayOrder`, `trackStock` …) | staff |
| `catalog/{id}` | The public copy of each **published** product that ovalfarm.in reads: no cost prices, plus `stock_status` (`in_stock` / `low` / `out`), `in_stock` and `display_order`. The ERP rewrites it whenever a product, stock or order changes (`js/catalog.js`) | anyone / staff |
| `customers/{id}` | **One customer list.** `channel`: `online` (signed up on ovalfarm.in) or `offline` (added in the ERP). `uid`: their website login, or `null`. `accountStatus`: `none`, `invited` (login made in the ERP, not used yet) or `active` | staff; the customer reads and edits their own |
| `customerInvites/{customerId}` | The temporary password of a login made in the ERP, so staff can pass it on | staff |
| `orders/{id}` | **One order list.** `channel`: `online` (placed on ovalfarm.in) or `offline` (entered in the ERP, with `source` Phone call, WhatsApp, Walk-in …). Status `placed` → `confirmed` → `packed` → `out_for_delivery` → `delivered`, or `cancelled`. `invoiceId` once invoiced | staff; the customer reads their own, creates online orders and may cancel while still `placed` |
| `sales/{id}` | Invoices. Each one is made from an order (`orderId`) | staff |
| `staff/{email}` | The ERP team and roles (Settings → Team) | staff |
| `settings`, `batches`, `harvests`, `productions`, `adjustments`, `purchases`, `suppliers`, `expenses`, `payments`, `employees`, `attendance`, `tasks` | The rest of the ERP | staff |

Order fields: `channel`, `source`, `customerId`, `customerUid`, `customer {name, phone, email}`, `address {line1, line2, landmark, city, district, state, pincode}`,
`items [{productId, name, qty, unit, price}]` (prices include GST), `itemCount`, `subtotal`, `deliveryCharge`, `total`, `note`, `staffNote`,
`payment` (`cod`, `paid`, `credit`), `status`, `invoiceId`, `invoiceNumber`, `createdAt`, `updatedAt`. Order number = `OF-` + the first 6 characters of the id.

**Website logins for customers added in the ERP.** Saving a new customer with an email and *Create an ovalfarm.in login* ticked makes
a Firebase login with a temporary password (shown in the ERP, with Copy and WhatsApp buttons) and, if ticked, sends
Firebase's free *set your password* email. The customer can also use **Continue with Google** with the same email.
When someone signs in on ovalfarm.in, the site finds their customer record by login, or links an ERP customer with the
same verified email or phone number, or else creates a new online customer.

**Stock on the website.** Available = stock − quantities in open orders (not cancelled, not invoiced yet).
Out when nothing is available, *low* at or below the product's alert level. Products with *Track stock* off always show in stock.

## Tests

```bash
npm i -g firebase-tools && npm i @firebase/rules-unit-testing firebase@12.19.0 playwright
python3 -m http.server 8765 &
firebase emulators:exec --only firestore --project demo-oval "node tests/rules.test.mjs"
firebase emulators:exec --only auth,firestore --project demo-oval "node tests/firebase.e2e.mjs"
node tests/demo.e2e.mjs        # sample-data mode, no Firebase needed
```

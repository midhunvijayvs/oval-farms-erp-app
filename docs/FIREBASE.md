# Firebase setup for Oval Farms (ERP + ovalfarm.in)

Do this on a computer, in a **private / incognito window** where only **ovaleggfarm@gmail.com** is signed in.
Takes about 20 minutes. Nothing here changes how the ERP works today; it only gets Firebase ready.

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

Side effect until the ERP stops using Google Drive (phase 2): staff signing in to the ERP see a
"Google hasn't verified this app" screen once. They click **Advanced → Go to Oval Farms ERP (unsafe)** to continue.
That's expected for a private business app and goes away once Drive is no longer used.

---

## What Claude does once you send the config

1. Puts the config into the ERP and the public site.
2. Gives you the **security rules** to paste into *Firestore Database → Rules* (one copy-paste and **Publish**).
3. Sign in to the ERP once as **ovaleggfarm@gmail.com** after the update. That copies your ERP team list
   into Firebase, so staff can see website orders.

---

## Data in Firestore (phase 1)

| Collection | Written by | Read by |
|---|---|---|
| `customers/{uid}` | the customer on ovalfarm.in (own profile); staff | that customer; staff |
| `orders/{id}` | the customer creates it with status `placed`; staff move it on (`confirmed`, `packed`, `out_for_delivery`, `delivered`, `cancelled`). A customer may cancel only while it's still `placed`. | that customer; staff |
| `staff/{email}` | ERP admins (the ERP copies Settings → Team here) | staff |

Order fields: `customerUid`, `customer {name, phone, email}`, `address {line1, line2, landmark, city, district, state, pincode}`,
`items [{productId, name, qty, unit, price}]`, `itemCount`, `subtotal`, `deliveryCharge`, `total`, `note`, `payment` (`cod`),
`status`, `source` (`website`), `createdAt`, `updatedAt`. Staff add `staffNote`, `updatedBy`, `invoiceId`, `invoiceNumber`.

The rules live in [`firebase/firestore.rules`](../firebase/firestore.rules). To test them locally:

```bash
npm i -g firebase-tools && npm i @firebase/rules-unit-testing firebase@12.19.0
firebase emulators:exec --only firestore --project demo-oval "node tests/rules.test.mjs"
FIREBASE_E2E=1 firebase emulators:exec --only auth,firestore --project demo-oval "node tests/e2e.mjs"
```

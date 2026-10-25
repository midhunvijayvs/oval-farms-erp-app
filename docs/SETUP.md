# Oval Farms ERP · Setup guide

This guide makes **ovaleggfarm@gmail.com** the owner of everything: the Google Cloud sign-in project and the
Firebase database. Staff sign in with their own Google accounts and get in only while they are on the team
(Settings → Team).

App address: **https://erp.ovalfarm.in**

Takes about 20 minutes. Do it on a computer.

> Tip: do Parts A and B in a **private / incognito window** where only ovaleggfarm@gmail.com is signed in.
> That stops Google from mixing it up with your personal account.

---

## Part A · Create the sign-in project (as ovaleggfarm@gmail.com)

This gives the app its own sign-in screen named "Oval Farms ERP", owned by the business account.

1. Open <https://console.cloud.google.com/> and sign in as **ovaleggfarm@gmail.com**. Accept the terms if asked.
2. **Create the project**
   - Click the project picker at the top (it may say *Select a project*) → **New project**.
   - Project name: `Oval Farms ERP` → **Create**.
   - When it's ready, make sure `Oval Farms ERP` is selected in the project picker.
3. **Set up the consent screen**
   - Menu ☰ → **Google Auth Platform** (older screens call it *APIs & Services → OAuth consent screen*) → **Get started**.
   - App name: `Oval Farms ERP`. User support email: `ovaleggfarm@gmail.com` → **Next**.
   - Audience: **External** → **Next**.
   - Contact email: `ovaleggfarm@gmail.com` → **Next** → tick the agreement → **Continue** → **Create**.
   - Don't upload a logo. A logo makes Google require a review.
4. **Scopes.** The app only asks for name, email and profile photo (`openid`, `userinfo.email`, `userinfo.profile`).
   If **Data access** still lists `.../auth/drive` from the old Drive version, remove it → **Save**.
5. **Add the people who will use the app**
   - Open **Audience**. Leave *Publishing status* as **Testing**.
   - Under **Test users** → **Add users**. Enter, one per line:
     - `ovaleggfarm@gmail.com`
     - `midhunvijayvs@gmail.com`
     - every staff member's Gmail
   - **Save**. You can add up to 100. Anyone not on this list is blocked from signing in, which is a useful extra lock.
6. **Create the client ID**
   - Open **Clients** → **Create client**.
   - Application type: **Web application**. Name: `Oval Farms ERP web`.
   - **Authorised JavaScript origins** → **Add URI** → `https://erp.ovalfarm.in`
     (and `https://midhunvijayvs.github.io` for the old GitHub address). No slash at the end.
     If you want to test on your computer, also add `http://localhost:8000`.
   - Leave *Authorised redirect URIs* empty → **Create**.
   - Copy the **Client ID**. It looks like `123456789012-abc…xyz.apps.googleusercontent.com`.
     It isn't a password, so it's fine to send it in the chat. You don't need the client secret.
7. **Put the Client ID into the app.** Either:
   - send it to Claude in the project chat, and it will update `config.js` for you, **or**
   - on GitHub open `config.js` → ✏️ edit → replace the value of `GOOGLE_CLIENT_ID` → **Commit changes** to `RemoteMain`.

   Wait 1–2 minutes for GitHub Pages to publish the change.

## Part B · First sign-in (as ovaleggfarm@gmail.com)

The data lives in Firebase (Firestore), project **oval-farms-erp**. See [FIREBASE.md](FIREBASE.md) for the console steps.

1. Open **https://erp.ovalfarm.in** and click **Sign in with Google** → choose **ovaleggfarm@gmail.com**.
2. ovaleggfarm@gmail.com is always **Admin** (it's in `OWNER_EMAILS` in `config.js` and in the database rules).
3. On the first sign-in the products that were on ovalfarm.in are added to **Products & Materials** automatically.
4. Go to **Settings → Business** and fill in the business name, address, phone, GSTIN, FSSAI licence, UPI ID and
   bank details → **Save profile**. These appear on invoices.

## Part C · Give your team access

1. While the consent screen is in **Testing**, add their Gmail to **Test users** (Part A, step 5).
   Because the app only asks for name and email, you can instead click **Publish app** on the Audience page;
   then any Google account can reach the sign-in, and only people on the team get in.
2. In the app as an Admin: **Settings → Team** → type their Gmail, pick a role → **Add**.
   - Make **midhunvijayvs@gmail.com** an **Admin** too, so you can manage things from your own account.
   - Admin: everything, including roles
   - Manager: everything except roles
   - Staff: production, harvests, stock, sales, orders, attendance; cannot see expenses, payments or reports, cannot delete
   - Viewer: read only
3. Send them **https://erp.ovalfarm.in**. They sign in with their own Gmail.

**To remove someone:** Settings → Team → remove. They lose access immediately; the database rules check the team list.

## Part D · Install on phones

- **Android:** open the app address in **Chrome** → sign in → menu ⋮ → **Install app** (or **Add to Home screen**).
- **iPhone:** open it in **Safari** → Share button → **Add to Home Screen**.
- **Windows / Mac:** in Chrome or Edge, click the install icon in the address bar.

---

## Keeping ovaleggfarm@gmail.com in control

- ovaleggfarm@gmail.com owns the Google Cloud / Firebase project. Keep midhunvijayvs@gmail.com as a second owner.
- Turn on **2-Step Verification** for ovaleggfarm@gmail.com (<https://myaccount.google.com/security>).
- **Backups:** once a month use **Settings → Data → Download backup** and keep the file somewhere safe.

## If something goes wrong

| What you see | Why | Fix |
|---|---|---|
| *Access blocked: Oval Farms ERP has not completed the Google verification process* | That Gmail isn't a test user | Add it under Test users, or publish the consent screen |
| *Error 400: origin_mismatch* | The site address is missing from the client's origins | Add `https://erp.ovalfarm.in` under Authorised JavaScript origins |
| *You're not on the Oval Farms team yet* | Not in Settings → Team | An Admin adds their Gmail there |
| The pill at the top says **Offline** | No internet | Keep working; changes upload when the connection is back |
| The pill says **Problem** | A save was refused (usually the role doesn't allow it) | Tap it to see the message |

## How the shared data works (for reference)

- Every screen updates live: a change one person saves shows on everyone's screen within a second or two.
- The app works offline: changes stay on the device and upload when the connection is back.
- Stock is never typed by hand. It's calculated from opening stock, harvests, production, purchases, sales and adjustments.
  Items in open orders (not cancelled, not invoiced yet) are held back from what the website can sell.

## Run it on your computer (optional)

```bash
python -m http.server 8000
# open http://localhost:8000  (add this origin in Part A step 6 first)
```

Choose **Explore with sample data** to try everything without signing in.

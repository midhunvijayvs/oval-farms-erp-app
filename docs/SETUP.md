# Oval Farms ERP · Setup guide

This guide makes **ovaleggfarm@gmail.com** the owner of everything: the Google Cloud sign-in project,
the shared data folder and the data file. Staff sign in with their own Google accounts and can only reach
the data while ovaleggfarm@gmail.com shares the folder with them.

App address: **https://midhunvijayvs.github.io/oval-farms-erp-app/**

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
3. **Turn on Google Drive API**
   - Menu ☰ → **APIs & Services → Library**.
   - Search `Google Drive API` → open it → **Enable**.
4. **Set up the consent screen**
   - Menu ☰ → **Google Auth Platform** (older screens call it *APIs & Services → OAuth consent screen*) → **Get started**.
   - App name: `Oval Farms ERP`. User support email: `ovaleggfarm@gmail.com` → **Next**.
   - Audience: **External** → **Next**.
   - Contact email: `ovaleggfarm@gmail.com` → **Next** → tick the agreement → **Continue** → **Create**.
   - Don't upload a logo. A logo makes Google require a review.
5. **Allow access to Drive**
   - In Google Auth Platform open **Data access** → **Add or remove scopes**.
   - Tick these three. Use the filter box to find them:
     - `.../auth/drive` (See, edit, create and delete all of your Google Drive files)
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
   - **Update** → **Save** at the bottom of the page.
6. **Add the people who will use the app**
   - Open **Audience**. Leave *Publishing status* as **Testing**.
   - Under **Test users** → **Add users**. Enter, one per line:
     - `ovaleggfarm@gmail.com`
     - `midhunvijayvs@gmail.com`
     - every staff member's Gmail
   - **Save**. You can add up to 100. Anyone not on this list is blocked from signing in, which is a useful extra lock.
7. **Create the client ID**
   - Open **Clients** → **Create client**.
   - Application type: **Web application**. Name: `Oval Farms ERP web`.
   - **Authorised JavaScript origins** → **Add URI** → `https://midhunvijayvs.github.io`
     Type it exactly like that: no slash at the end and no `/oval-farms-erp-app`.
     If you want to test on your computer, also add `http://localhost:8000`.
   - Leave *Authorised redirect URIs* empty → **Create**.
   - Copy the **Client ID**. It looks like `123456789012-abc…xyz.apps.googleusercontent.com`.
     It isn't a password, so it's fine to send it in the chat. You don't need the client secret.
8. **Put the Client ID into the app.** Either:
   - send it to Claude in the project chat, and it will update `config.js` for you, **or**
   - on GitHub open `config.js` → ✏️ edit → replace the value of `GOOGLE_CLIENT_ID` → **Commit changes** to `RemoteMain`.

   Wait 1–2 minutes for GitHub Pages to publish the change.

## Part B · Create the central data folder (as ovaleggfarm@gmail.com)

The folder must be **created from inside the app while signed in as ovaleggfarm@gmail.com**.
That's what makes ovaleggfarm the owner of the folder and the data file.

1. In the same private window open **https://midhunvijayvs.github.io/oval-farms-erp-app/**.
   If you see an old screen, press **Ctrl + Shift + R** to reload.
2. Click **Sign in with Google** → choose **ovaleggfarm@gmail.com**.
3. Google shows **"Google hasn't verified this app"**. This is expected for a private business app.
   Click **Continue**.
4. On the permissions page tick **all** boxes (especially *See, edit, create and delete all of your Google Drive files*) → **Continue**.
5. The app asks for the data folder. Click **Create the Oval Farms ERP folder in this Drive**.
6. The app opens on the dashboard. ovaleggfarm@gmail.com is now the **Admin**.
7. Check it: open <https://drive.google.com> as ovaleggfarm@gmail.com. **My Drive** now has a folder
   **Oval Farms ERP** with a file **oval-farms-erp-data.json** inside.
   - Never delete, rename or move that file out of the folder. That file *is* the database.
   - You may rename the folder or move it inside ovaleggfarm's Drive. The app tracks it by ID, not name.
8. In the app go to **Settings → Business** and fill in the business name, address, phone, GSTIN, FSSAI
   licence, UPI ID and bank details → **Save profile**. These appear on invoices.
9. **Lock everyone onto this folder.** Open the folder in Drive and copy the address bar. It looks like
   `https://drive.google.com/drive/folders/1AbCdEf…`. Then either:
   - send that link to Claude in the project chat, and it will set `DEFAULT_FOLDER_ID` in `config.js`, **or**
   - edit `config.js` on GitHub yourself and paste the part after `/folders/` into `DEFAULT_FOLDER_ID`.

   After this, everyone who signs in goes straight to this folder, and nobody can accidentally create a second one.

## Part C · Give your team access

Do these steps for yourself (midhunvijayvs@gmail.com) and every staff member.

1. Make sure their Gmail is in the **Test users** list (Part A, step 6).
2. In Google Drive, signed in as **ovaleggfarm@gmail.com**: right-click **Oval Farms ERP** folder → **Share** → **Share**.
   - Type their Gmail.
   - Pick **Editor**, or **Viewer** for people who should only look.
   - **Send**.
3. Send them the app address: **https://midhunvijayvs.github.io/oval-farms-erp-app/**
   (Until Part B step 9 is done, send the **invite link** instead. In the app it's under **Settings → Data & sync → Copy**.)
4. They open it, sign in with **their own** Gmail, click **Continue** on the "hasn't verified" screen, tick all boxes and continue.
5. Back in the app as ovaleggfarm@gmail.com: **Settings → Team** → set each person's role.
   - Make **midhunvijayvs@gmail.com** an **Admin** too, so you can manage things from your own account.
   - Admin: everything, including roles
   - Manager: everything except roles
   - Staff: production, harvests, stock, sales, attendance; cannot see expenses, payments or reports, cannot delete
   - Viewer: read only

**To remove someone:** in Drive, open the folder's **Share** settings and remove them. Also remove them from
Test users in Google Cloud. They lose access immediately.

## Part D · Install on phones

- **Android:** open the app address in **Chrome** → sign in → menu ⋮ → **Install app** (or **Add to Home screen**).
- **iPhone:** open it in **Safari** → Share button → **Add to Home Screen**.
- **Windows / Mac:** in Chrome or Edge, click the install icon in the address bar.

---

## Keeping ovaleggfarm@gmail.com in control

- The folder and data file belong to ovaleggfarm@gmail.com because it created them. Other people only edit them.
  Never use **Transfer ownership** on them.
- The data lives in ovaleggfarm's Drive storage. It is tiny (a few MB even after years).
- Turn on **2-Step Verification** for ovaleggfarm@gmail.com (<https://myaccount.google.com/security>), since that account holds the business data.
- **Backups:** Drive keeps version history automatically (right-click the data file → *File information → Manage versions*).
  Once a month, also use **Settings → Data & sync → Download backup** in the app and keep the file somewhere safe.
- The app stays in **Testing** mode. That's fine for up to 100 people. Google may occasionally ask someone to approve
  the permissions again; that's normal.

## If something goes wrong

| What you see | Why | Fix |
|---|---|---|
| *Access blocked: Oval Farms ERP has not completed the Google verification process* | That Gmail isn't a test user | Add it in Google Cloud → Google Auth Platform → Audience → Test users |
| *Error 400: origin_mismatch* or *redirect_uri_mismatch* | Origin typed wrongly in Part A step 7 | It must be exactly `https://midhunvijayvs.github.io` |
| Sign-in screen says **Personal Assistant** | `config.js` still has the old client ID, or the page is cached | Update `GOOGLE_CLIENT_ID`; press Ctrl + Shift + R |
| *This Google account can't open that folder* | Folder not shared with that Gmail, or they picked a different Google account | Share the folder with that exact Gmail as Editor |
| *You have view-only access* | Shared as Viewer | Change them to Editor in Drive sharing |
| The pill at the top says **Reconnect** | Google session expired | Tap it and sign in again |
| Someone's change doesn't show yet | The app checks for changes every 30 seconds | Wait, or tap the **Synced** pill to sync now |

## How the shared data works (for reference)

- Each record (item, invoice, harvest…) remembers who changed it and when. If two people add different
  records at the same time, both are kept. If two people edit the *same* record, the later save wins.
- The app works offline: changes stay on the device and upload when the connection is back.
- Stock is never typed by hand. It's calculated from opening stock, harvests, production, purchases, sales and adjustments.

## Run it on your computer (optional)

```bash
cd "D:\soulcast projects\oval-farms-erp-app"
python -m http.server 8000
# open http://localhost:8000  (add this origin in Part A step 7 first)
```

Choose **Explore with sample data** to try everything without Google.

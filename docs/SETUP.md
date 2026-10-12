# Oval Farms ERP · Setup guide

Oval Farms ERP is a static web app (plain HTML/CSS/JavaScript, no build step). It runs in the browser,
installs on phones and computers as an app, and keeps all business data in **one shared folder in the
Oval Farms Google Drive**. Everyone who signs in with a Google account that the folder is shared with
works on the same data.

It follows the same approach as the Personal Assistant app (Google Identity Services sign-in + Google
Drive REST API), with one difference: Personal Assistant keeps each person's data in their own hidden
app folder, while the ERP keeps one shared data file in a normal Drive folder so the whole team can use it.

---

## 1. Publish the app (GitHub Pages)

1. Open the repository on GitHub → **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
3. After a minute the app is live at **https://midhunvijayvs.github.io/oval-farms-erp-app/**.

## 2. Google Cloud settings (one time)

`config.js` currently uses the **same OAuth client as the Personal Assistant app**, so if Personal Assistant
already works on `https://midhunvijayvs.github.io`, you only need steps 2.2 and 2.3.

Go to <https://console.cloud.google.com/> and pick the project the Personal Assistant uses.

### 2.1 Drive API
**APIs & Services → Library → Google Drive API → Enable** (already on if Personal Assistant works).

### 2.2 Allow the Drive scope
**Google Auth Platform → Data access** (older consoles: *OAuth consent screen → Scopes*) → **Add or remove scopes** and add:

- `https://www.googleapis.com/auth/drive` (needed to read and write a folder that is **shared** with you)
- `.../auth/userinfo.email` and `.../auth/userinfo.profile`

Save.

### 2.3 Let your team sign in
**Google Auth Platform → Audience** (older consoles: *OAuth consent screen → Test users*):

- If the app's publishing status is **Testing**, add the Gmail address of **every person who will use the ERP**
  as a test user (up to 100). Only listed people can sign in, which doubles as an extra lock.
- Because the full Drive scope is a "restricted" scope, Google shows a *"Google hasn't verified this app"*
  screen the first time. Click **Continue**. This is normal for an internal app; making it public would need
  Google's verification process.

### 2.4 Authorised origins
**Credentials → your OAuth 2.0 Web client → Authorised JavaScript origins** must include:

- `https://midhunvijayvs.github.io`
- `http://localhost:8000` (only if you want to run it on your computer for testing)

### 2.5 (Recommended later) A dedicated client
The consent screen currently shows the Personal Assistant's app name. When convenient, create a new
OAuth client (or a new project) named **Oval Farms ERP**, repeat 2.1–2.4 for it, and paste its client ID into
`GOOGLE_CLIENT_ID` in `config.js`.

## 3. First sign-in (owner)

1. Open the app and sign in with the **Oval Farms Google account** (the account whose Drive should hold the data).
2. Choose **Create the Oval Farms ERP folder in this Drive**. A folder called *Oval Farms ERP* appears in that
   Drive with a file `oval-farms-erp-data.json` inside it. You become **Admin**.
3. Go to **Settings → Business** and fill in the business name, address, GSTIN, FSSAI licence, UPI ID and
   bank details. These print on invoices.
4. Optional: **Settings → Lists** to adjust mushroom types, rooms, expense categories, units and so on.

## 4. Add team members

1. In Google Drive, right-click the **Oval Farms ERP** folder → **Share** → add the person's Google account as **Editor**.
   (Viewer access lets them look but not save.)
2. In the app go to **Settings → Data & sync**, copy the **invite link** and send it to them (WhatsApp is fine).
3. They open the link, sign in with that Google account, and they're in. New people join as **Staff**.
4. In **Settings → Team**, change their role if needed:
   - **Admin**: everything, including roles
   - **Manager**: everything except roles
   - **Staff**: production, harvests, stock, sales, attendance; no expenses/payments/reports, no deleting
   - **Viewer**: read only

To remove someone, remove them from the folder's sharing in Google Drive.

Tip: put the folder ID (the part after `/folders/` in the folder's URL) in `DEFAULT_FOLDER_ID` in `config.js`
and nobody will need the invite link.

## 5. Install on phones and computers

- **Android / Chrome / Edge**: open the app → browser menu → **Install app** (or the Install button in the sidebar).
- **iPhone / iPad**: open in **Safari** → Share → **Add to Home Screen**.

## How the shared data works

- Every record (item, invoice, harvest…) carries who changed it and when. When two people edit at the same
  time, the app merges their changes record by record, so adding different invoices or customers at the same
  time never loses anything. If two people edit the **same** record, the later save wins.
- The app checks Drive for other people's changes every 30 seconds (and whenever the app comes back to the
  screen). The pill in the top-right corner shows *Synced*, *Syncing…*, *Offline* or *Reconnect*.
- It works offline: changes are stored on the device and uploaded when the connection returns.
- Stock is never typed in by hand; it is calculated from opening stock + harvests + production + purchases −
  sales ± adjustments, so it can't drift.
- **Settings → Data & sync → Download backup** saves a full copy as JSON. Google Drive also keeps version
  history of the data file (right-click the file → *Manage versions*).

## Run it on your computer

```bash
cd oval-farms-erp-app
python -m http.server 8000
# open http://localhost:8000
```

Choose **Explore with sample data** to try everything without Google.

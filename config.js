// Oval Farms ERP configuration.
// Edit these values to point the app at your own Google Cloud project and shared Drive folder.
// See docs/SETUP.md for the step-by-step guide.
window.OVAL_CONFIG = {
  // OAuth 2.0 Web client ID from Google Cloud Console (APIs & Services > Credentials).
  // "Oval Farms ERP" project owned by ovaleggfarm@gmail.com.
  GOOGLE_CLIENT_ID: "69145806484-62td7dt2gb0sgtndr0am45kd0fenqc25.apps.googleusercontent.com",

  // ID of the shared "Oval Farms ERP" folder in the Oval Farms Google Drive.
  // Owned by ovaleggfarm@gmail.com. Leave empty to let each person paste the folder link on first sign-in.
  DEFAULT_FOLDER_ID: "10N6cEH7CcGT2XcVECXYxFk2M5OJVSDcO",

  // Name of the data file kept inside that folder.
  DATA_FILE_NAME: "oval-farms-erp-data.json",

  // How often (seconds) the app checks Drive for changes made by other users.
  SYNC_INTERVAL_SECONDS: 30,

  // Firebase web app config (Firebase console > Project settings > Your apps > Web app).
  // Shared with ovalfarm.in. Powers Online Orders and Website Customers. Leave null until Firebase is set up.
  // It is not a secret: the Firestore rules in firebase/firestore.rules protect the data.
  FIREBASE: null
};

// Oval Farms ERP configuration.
// Edit these values to point the app at your own Google Cloud project and shared Drive folder.
// See docs/SETUP.md for the step-by-step guide.
window.OVAL_CONFIG = {
  // OAuth 2.0 Web client ID from Google Cloud Console (APIs & Services > Credentials).
  // This is the same client the Personal Assistant app uses, so it already works on
  // https://midhunvijayvs.github.io. Swap in a dedicated "Oval Farms ERP" client when you can.
  GOOGLE_CLIENT_ID: "196324205483-t6ulmlbh78gau4q0dg637t9bt8k8upjs.apps.googleusercontent.com",

  // ID of the shared "Oval Farms ERP" folder in the Oval Farms Google Drive.
  // Leave empty to let each person paste the folder link (or open an invite link) on first sign-in.
  DEFAULT_FOLDER_ID: "",

  // Name of the data file kept inside that folder.
  DATA_FILE_NAME: "oval-farms-erp-data.json",

  // How often (seconds) the app checks Drive for changes made by other users.
  SYNC_INTERVAL_SECONDS: 30
};

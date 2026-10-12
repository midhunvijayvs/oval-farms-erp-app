// Oval Farms ERP configuration.
// Edit these values to point the app at your own Google Cloud project and shared Drive folder.
// See docs/SETUP.md for the step-by-step guide.
window.OVAL_CONFIG = {
  // OAuth 2.0 Web client ID from Google Cloud Console (APIs & Services > Credentials).
  // "Oval Farms ERP" project owned by ovaleggfarm@gmail.com.
  GOOGLE_CLIENT_ID: "69145806484-62td7dt2gb0sgtndr0am45kd0fenqc25.apps.googleusercontent.com",

  // ID of the shared "Oval Farms ERP" folder in the Oval Farms Google Drive.
  // Leave empty to let each person paste the folder link (or open an invite link) on first sign-in.
  DEFAULT_FOLDER_ID: "",

  // Name of the data file kept inside that folder.
  DATA_FILE_NAME: "oval-farms-erp-data.json",

  // How often (seconds) the app checks Drive for changes made by other users.
  SYNC_INTERVAL_SECONDS: 30
};

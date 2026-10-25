// Oval Farms ERP configuration. See docs/FIREBASE.md for the console steps.
window.OVAL_CONFIG = {
  // OAuth 2.0 Web client ID from Google Cloud Console (APIs & Services > Credentials).
  // "Oval Farms ERP" project owned by ovaleggfarm@gmail.com. Used only for the Google sign-in button.
  GOOGLE_CLIENT_ID: "69145806484-62td7dt2gb0sgtndr0am45kd0fenqc25.apps.googleusercontent.com",

  // Always Admin, even before anyone is on the team. Must match isOwner() in firebase/firestore.rules.
  OWNER_EMAILS: ["ovaleggfarm@gmail.com"],

  // The public website. Customer login links point here.
  SHOP_URL: "https://ovalfarm.in",

  // Firebase web app config (Firebase console > Project settings > Your apps > Web app).
  // Shared with ovalfarm.in: the ERP's database, logins and product photos.
  // It is not a secret: the rules in firebase/firestore.rules and firebase/storage.rules protect the data.
  FIREBASE: {
    apiKey: "AIzaSyDIyU5niDKZC0rCWdb6N4a254LcC6dX1rc",
    authDomain: "oval-farms-erp.firebaseapp.com",
    projectId: "oval-farms-erp",
    storageBucket: "oval-farms-erp.firebasestorage.app",
    messagingSenderId: "69145806484",
    appId: "1:69145806484:web:c0e2e4eff5ecb4c2f85681"
  }
};

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: "API_KEY_PLACEHOLDER",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

export class FirebaseManager {
  private db: firebase.firestore.Firestore | null = null;

  constructor() {
    if (firebaseConfig.apiKey !== "API_KEY_PLACEHOLDER") {
      if (!firebase.apps.length) {
        const app = firebase.initializeApp(firebaseConfig);
        this.db = app.firestore();
      } else {
        this.db = firebase.app().firestore();
      }
    } else {
      console.warn("Firebase no configurado. El lobby multijugador no funcionará hasta que se añadan las credenciales.");
    }
  }

  getDb() {
    return this.db;
  }
}

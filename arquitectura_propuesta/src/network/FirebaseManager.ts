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
  private db: any = null;
  constructor() {
    if (firebaseConfig.apiKey !== "API_KEY_PLACEHOLDER") {
      firebase.initializeApp(firebaseConfig);
      this.db = firebase.firestore();
    }
  }
  getDb() { return this.db; }
}

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = (window as any).FIREBASE_CONFIG || {
  apiKey: "API_KEY_PLACEHOLDER",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

export class FirebaseManager {
  private db: firebase.firestore.Firestore | null = null;
  private initialized: boolean = false;

  constructor() {
    if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "API_KEY_PLACEHOLDER" && !firebaseConfig.apiKey.startsWith("__")) {
      firebase.initializeApp(firebaseConfig);
      this.db = firebase.firestore();
      this.initialized = true;
    } else {
      console.warn("Firebase no configurado. El lobby multijugador no funcionará hasta que se añadan las credenciales.");
    }
  }

  getDb() { return this.db; }
  isInitialized() { return this.initialized; }

  async crearPartida(idPartida: string, hostId: string, hostNick: string) {
    if (!this.db) return;
    return await this.db.collection('partidas').doc(idPartida).set({
      hostId: hostId,
      hostNick: hostNick,
      creacion: Date.now(),
      numJugadores: 1,
      estado: 'activa',
      lastSeen: Date.now()
    });
  }

  async updateHeartbeat(idPartida: string, numJugadores: number) {
    if (!this.db) return;
    return await this.db.collection('partidas').doc(idPartida).update({
      numJugadores: numJugadores,
      lastSeen: Date.now()
    });
  }

  async getPartidasActivas() {
    if (!this.db) return [];
    const snapshot = await this.db.collection('partidas')
      .where('estado', '==', 'activa')
      .get();

    const ahora = Date.now();
    const partidas: any[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (ahora - (data.lastSeen || 0) < 60000) {
        partidas.push({ id: doc.id, ...data });
      }
    });
    return partidas;
  }

  async limpiarSignaling(partidaId: string, guestId: string) {
    if (!this.db) return;
    const connRef = this.db.collection('partidas').doc(partidaId).collection('conexiones').doc(guestId);
    try {
      const hostCandidates = await connRef.collection('iceCandidatesHost').limit(50).get();
      hostCandidates.forEach(doc => doc.ref.delete());
      const guestCandidates = await connRef.collection('iceCandidatesGuest').limit(50).get();
      guestCandidates.forEach(doc => doc.ref.delete());
      await connRef.delete();
    } catch (e) {
      console.warn("Error limpiando signaling:", e);
    }
  }
}

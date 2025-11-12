// Firebase configuration for the app
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config(
  { path: ".env.local" }
);

// Client-side Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyADPe8q-LjdPKWK78VmNQzjWF2SkZBg2wI",
  authDomain: "capogol-79914.firebaseapp.com",
  projectId: "capogol-79914",
  storageBucket: "capogol-79914.firebasestorage.app",
  messagingSenderId: "835290340507",
  appId: "1:835290340507:web:b623d6882a7459d2f87a3e",
  measurementId: "G-CPR7M3F3R0",
};

// Initialize Firebase for client-side
let app;
let db;

if (typeof window !== "undefined") {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

// Server-side Firebase Admin SDK
let adminDb: admin.firestore.Firestore;

if (typeof window === "undefined") {
  try {
    if (!admin.apps.length) {
      // Verificar si hay credenciales configuradas
      const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;

      console.log('DEBUG: process.env.FIREBASE_SERVICE_ACCOUNT_KEY:', serviceAccountKey ? 'set' : 'not set');
      console.log('DEBUG: process.env.FIREBASE_PRIVATE_KEY:', privateKey ? 'set' : 'not set');
      console.log('DEBUG: process.env.FIREBASE_CLIENT_EMAIL:', clientEmail ? 'set' : 'not set');
      console.log('DEBUG: process.env.FIREBASE_PROJECT_ID:', projectId ? 'set' : 'not set');

      let serviceAccount: any;

      if (serviceAccountKey) {
        // Usar el JSON completo del service account
        try {
          serviceAccount = JSON.parse(serviceAccountKey);
        } catch (error) {
          throw new Error(
            `Error al parsear FIREBASE_SERVICE_ACCOUNT_KEY: ${error}`
          );
        }
      } else if (privateKey && clientEmail && projectId) {
        // Usar las credenciales individuales
        serviceAccount = {
          project_id: projectId,
          client_email: clientEmail,
          private_key: privateKey.replace(/\\n/g, "\n"),
        };
      } else {
        // No hay credenciales configuradas
        throw new Error(
          "Firebase Admin no está configurado. Por favor, configura una de las siguientes opciones:\n" +
            "  - FIREBASE_SERVICE_ACCOUNT_KEY (JSON completo)\n" +
            "  - O FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
        );
      }

      // Validar que las credenciales sean válidas
      if (!serviceAccount.private_key || serviceAccount.private_key.trim() === '') {
        throw new Error(
          "La propiedad 'private_key' está vacía o no está configurada correctamente."
        );
      }

      if (!serviceAccount.client_email || serviceAccount.client_email.trim() === '') {
        throw new Error(
          "La propiedad 'client_email' está vacía o no está configurada correctamente."
        );
      }

      console.log(
        "🔥 Initializing Firebase Admin with projectId:",
        serviceAccount.project_id || serviceAccount.projectId || projectId
      );

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || serviceAccount.projectId || projectId,
      });

      console.log("✅ Firebase Admin initialized successfully");
    }
    adminDb = admin.firestore();
    console.log("🗄️ Firestore database connected");
  } catch (error) {
    console.error("❌ Error initializing Firebase Admin:", error);
    adminDb = null as any;
  }
}

export { db, adminDb };

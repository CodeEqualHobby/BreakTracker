import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/**
 * Firestore Collection Schemas:
 * 
 * 'agents' collection:
 * { username, pin, fullName, role: "agent"|"admin", totalBreakTime: 5400, remainingBreakTime: 5400, status: "available"|"break", lastReset: timestamp }
 * 
 * 'breakLogs' collection:
 * { agentId, agentName, timestamp, action: "start"|"end", remainingTime, duration, deviceInfo }
 */

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDdFnFZOZxrcII9cI6xHLeTIBDnLDvNyLM",
  authDomain: "breaktracker-57174.firebaseapp.com",
  databaseURL: "https://breaktracker-57174-default-rtdb.firebaseio.com",
  projectId: "breaktracker-57174",
  storageBucket: "breaktracker-57174.firebasestorage.app",
  messagingSenderId: "401629085687",
  appId: "1:401629085687:web:c31a8d9c77d2743b45f8f2",
  measurementId: "G-F3R349VLKQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
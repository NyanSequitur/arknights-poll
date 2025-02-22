const firebaseConfig = {
  apiKey: "AIzaSyAZDQD24yTPGVPNSzAgZm-toq9-EtOoUuo",
  authDomain: "arknights-poll-eed5d.firebaseapp.com",
  databaseURL: "https://arknights-poll-eed5d-default-rtdb.firebaseio.com",
  projectId: "arknights-poll-eed5d",
  storageBucket: "arknights-poll-eed5d.firebasestorage.app",
  messagingSenderId: "945776316851",
  appId: "1:945776316851:web:1ae9bb90bc48e57d9ebbc6"
};

// Leaderboard settings
const LEADERBOARD_MIN_COMPARISONS = 2;
const LEADERBOARD_REFRESH_INTERVAL = 10000; // in milliseconds

// Database connection management
const DB_DISCONNECT_TIMEOUT = 30 * 1000; // in milliseconds

// URL for operator data
const OPERATORS_JSON_URL = "operators.json";

// Preload settings: how many voting pairs (questions) to preload in advance.
const PRELOAD_COUNT = 5;

export { 
  firebaseConfig, 
  LEADERBOARD_MIN_COMPARISONS, 
  LEADERBOARD_REFRESH_INTERVAL, 
  DB_DISCONNECT_TIMEOUT, 
  OPERATORS_JSON_URL,
  PRELOAD_COUNT
};

import firebaseConfig from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, runTransaction, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Sign in anonymously
const auth = getAuth();
signInAnonymously(auth)
  .then(() => console.log("Signed in anonymously"))
  .catch((error) => console.error("Auth Error:", error));

/** 
 * --------------------------------------------
 *        DARK MODE: REMEMBER USER CHOICE
 * --------------------------------------------
 */
const darkModeBtn = document.getElementById("toggle-dark-mode");
const DARK_MODE_KEY = "arkpoll_darkMode";

function initDarkMode() {
  const storedMode = localStorage.getItem(DARK_MODE_KEY);
  if (storedMode === "true") {
    document.documentElement.classList.add("dark-mode"); // Apply to <html> early
  }
}

darkModeBtn.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark-mode"); // Apply toggle to <html>
  localStorage.setItem(DARK_MODE_KEY, isDark.toString());
});
/** 
 * --------------------------------------------
 *     OPERATOR DATA & PAIRWISE VOTING
 * --------------------------------------------
 */
const OPERATORS_JSON_URL = "operators.json";

let operators = [];
let leftOperator, rightOperator;

async function loadOperatorData() {
  try {
    const response = await fetch(OPERATORS_JSON_URL);
    const data = await response.json();

    operators = Object.keys(data).map(opID => ({
      id: opID,
      name: data[opID].name,
      images: data[opID].images
    }));

    getRandomOperators();
  } catch (error) {
    console.error("Error loading operator data:", error);
  }
}

// Select two random operators for voting
function getRandomOperators() {
  if (operators.length < 2) return;

  let [op1, op2] = operators.sort(() => 0.5 - Math.random()).slice(0, 2);

  leftOperator = { 
    ...op1, 
    img: op1.images[Math.floor(Math.random() * op1.images.length)] 
  };
  rightOperator = { 
    ...op2, 
    img: op2.images[Math.floor(Math.random() * op2.images.length)] 
  };

  document.getElementById("left-img").src = leftOperator.img;
  document.getElementById("right-img").src = rightOperator.img;
  document.getElementById("left-name").textContent = leftOperator.name;
  document.getElementById("right-name").textContent = rightOperator.name;
}

/** Voting events: record a win & loss */
document.getElementById("left-vote").addEventListener("click", () => vote(leftOperator, rightOperator));
document.getElementById("right-vote").addEventListener("click", () => vote(rightOperator, leftOperator));

function vote(winner, loser) {
  console.log(`${winner.name} wins!`);

  // Increment winner's win count
  const winnerRef = ref(database, `votes/${winner.id}/wins`);
  runTransaction(winnerRef, current => (current || 0) + 1);

  // Increment loser's loss count
  const loserRef = ref(database, `votes/${loser.id}/losses`);
  runTransaction(loserRef, current => (current || 0) + 1);

  getRandomOperators();
}

/**
 * --------------------------------------------
 *    LEADERBOARD: CACHING & COOLDOWN LOGIC
 * --------------------------------------------
 */
const rankingsDiv = document.getElementById("rankings");
const refreshBtn = document.getElementById("refresh-rankings");

const MIN_COMPARISONS = 1;        // baseline # of comparisons
const MIN_REFRESH_INTERVAL = 10000; // 10 seconds
const LAST_REFRESH_TIME_KEY = "arkpoll_lastRefresh";
const LAST_LEADERBOARD_KEY = "arkpoll_lastLeaderboardHTML";

/** 
 * Display cached leaderboard from localStorage (if available)
 * so user sees something immediately when the page loads.
 */
function loadCachedLeaderboard() {
  const cached = localStorage.getItem(LAST_LEADERBOARD_KEY);
  if (cached) {
    rankingsDiv.innerHTML = cached;
  } else {
    rankingsDiv.innerHTML = "<p>Loading...</p>";
  }
}

/** 
 * Display the current leaderboard by fetching from Firebase.
 * Then cache the result in localStorage.
 */
function displayRankings() {
  const rankingsRef = ref(database, "votes");
  get(rankingsRef)
    .then((snapshot) => {
      if (snapshot.exists()) {
        const allVotes = snapshot.val();  // { operatorID: { wins, losses } }
        let rankings = [];

        for (const opID in allVotes) {
          const { wins = 0, losses = 0 } = allVotes[opID];
          const total = wins + losses;
          if (total >= MIN_COMPARISONS) {
            const winPct = wins / total;
            rankings.push({ id: opID, wins, losses, total, winPct });
          }
        }

        // Sort by win percentage (highest first), top 10
        rankings.sort((a, b) => b.winPct - a.winPct);
        rankings = rankings.slice(0, 10);

        // Build HTML
        let rankingHTML;
        if (rankings.length > 0) {
          rankingHTML = rankings.map(op => {
            const operator = operators.find(o => o.id === op.id);
            const displayName = operator ? operator.name : op.id;
            return `<li>${displayName}: ${(op.winPct * 100).toFixed(2)}% ` +
                   `(${op.wins} wins, ${op.losses} losses, ${op.total} comparisons)</li>`;
          }).join("");
          rankingHTML = `<ul>${rankingHTML}</ul>`;
        } else {
          rankingHTML = "<p>No operators meet the minimum comparisons yet.</p>";
        }

        // Update DOM & cache
        rankingsDiv.innerHTML = rankingHTML;
        localStorage.setItem(LAST_LEADERBOARD_KEY, rankingHTML);
      } else {
        // No data
        rankingsDiv.innerHTML = "<p>No votes yet.</p>";
        localStorage.removeItem(LAST_LEADERBOARD_KEY);
      }
    })
    .catch((error) => {
      console.error("Error fetching rankings:", error);
    });
}

/** 
 * Calculate how much time remains on the cooldown
 * Returns a positive # of ms if still on cooldown, otherwise 0.
 */
function getRemainingCooldown() {
  const lastRefresh = parseInt(localStorage.getItem(LAST_REFRESH_TIME_KEY) || "0");
  const elapsed = Date.now() - lastRefresh;
  if (elapsed < MIN_REFRESH_INTERVAL) {
    return MIN_REFRESH_INTERVAL - elapsed; 
  }
  return 0;
}

/**
 * Disable the refresh button for `ms` milliseconds, then re-enable.
 */
function disableRefreshButton(ms) {
  refreshBtn.disabled = true;
  refreshBtn.classList.add("disabled");
  setTimeout(() => {
    refreshBtn.disabled = false;
    refreshBtn.classList.remove("disabled");
  }, ms);
}

/**
 * Attempt an immediate refresh if cooldown is over, or show cached if not.
 */
function maybeAutoRefreshLeaderboard() {
  const remaining = getRemainingCooldown();
  if (remaining === 0) {
    // No cooldown, do an immediate refresh
    displayRankings();
    localStorage.setItem(LAST_REFRESH_TIME_KEY, Date.now().toString());
    disableRefreshButton(MIN_REFRESH_INTERVAL);
  } else {
    // Still on cooldown, just show the cached leaderboard
    // and schedule the refresh button to re-enable
    disableRefreshButton(remaining);
  }
}

/** 
 * User clicks "Refresh Rankings" manually.
 * If the cooldown is over, fetch & update. Otherwise, do nothing.
 */
refreshBtn.addEventListener("click", () => {
  const remaining = getRemainingCooldown();
  if (remaining === 0) {
    displayRankings();
    localStorage.setItem(LAST_REFRESH_TIME_KEY, Date.now().toString());
    disableRefreshButton(MIN_REFRESH_INTERVAL);
  } 
  // If still on cooldown, button is disabled anyway, so user can't click.
});

/**
 * --------------------------------------------
 *           PAGE INITIALIZATION
 * --------------------------------------------
 */
function init() {
  initDarkMode();          // Apply saved dark mode preference
  loadCachedLeaderboard(); // Show last known leaderboard immediately
  loadOperatorData();      // Load operator data & show poll

  // Attempt an auto-refresh if cooldown is expired, else show cached
  maybeAutoRefreshLeaderboard();
}

init();

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
let nextPair = null;  // Store preloaded next pair
let previousPair = null;  // Store previously selected pair

async function loadOperatorData() {
  try {
    const response = await fetch(OPERATORS_JSON_URL);
    const data = await response.json();

    operators = Object.keys(data).map(opID => ({
      id: opID,
      name: data[opID].name,
      images: data[opID].images
    }));
    
    // log number of operators loaded
    console.log(`Loaded ${operators.length} operators.`);

    getRandomOperators();
  } catch (error) {
    console.error("Error loading operator data:", error);
  }
}

// Helper: return a secure random integer in the range [0, max)
function secureRandomInt(max) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % max;
  }
  
  // Helper: pick two distinct operators using secure randomness
  function getTwoDistinctRandomOperators() {
    if (operators.length < 2) return null;
    const index1 = secureRandomInt(operators.length);
    let index2 = secureRandomInt(operators.length - 1);
    // Ensure distinctness: if index2 is equal to or past index1, shift it by one.
    if (index2 >= index1) index2++;
    return [operators[index1], operators[index2]];
  }
  
  function preloadNextOperators() {
    if (operators.length < 2) return;
  
    const pair = getTwoDistinctRandomOperators();
    if (!pair) return;
    const [op1, op2] = pair;
  
    // Securely select a random image for each operator
    const nextLeftOperator = { 
      ...op1, 
      img: op1.images[secureRandomInt(op1.images.length)]
    };
    const nextRightOperator = { 
      ...op2, 
      img: op2.images[secureRandomInt(op2.images.length)]
    };
  
    // Preload images
    new Image().src = nextLeftOperator.img;
    new Image().src = nextRightOperator.img;
  
    nextPair = { leftOperator: nextLeftOperator, rightOperator: nextRightOperator };
  }
  
  function getRandomOperators() {
    if (operators.length < 2) return;
  
    if (nextPair) {
      leftOperator = nextPair.leftOperator;
      rightOperator = nextPair.rightOperator;
    } else {
      const pair = getTwoDistinctRandomOperators();
      if (!pair) return;
      const [op1, op2] = pair;
      leftOperator = { ...op1, img: op1.images[secureRandomInt(op1.images.length)] };
      rightOperator = { ...op2, img: op2.images[secureRandomInt(op2.images.length)] };
    }
  
    // Update the DOM
    document.getElementById("left-img").src = leftOperator.img;
    document.getElementById("right-img").src = rightOperator.img;
    document.getElementById("left-name").textContent = leftOperator.name;
    document.getElementById("right-name").textContent = rightOperator.name;
  
    // Preload the next pair
    preloadNextOperators();
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

  // Use the preloaded images for the next comparison
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

        // Sort by win percentage (highest first), then by win count in case of ties, top 10
        rankings.sort((a, b) => {
          if (b.winPct === a.winPct) {
            return b.wins - a.wins;
          }
          return b.winPct - a.winPct;
        });
        rankings = rankings.slice(0, 10);

        // Build HTML
        let rankingHTML;
        if (rankings.length > 0) {
          rankingHTML = `
            <table class="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Operator</th>
                  <th>Win %</th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Comparisons</th>
                </tr>
              </thead>
              <tbody>
          ` + rankings.map((op, idx) => {
            const operator = operators.find(o => o.id === op.id);
            const displayName = operator ? operator.name : op.id;
            return `
              <tr>
                <td>${idx + 1}</td>
                <td>${displayName}</td>
                <td>${(op.winPct * 100).toFixed(2)}%</td>
                <td>${op.wins}</td>
                <td>${op.losses}</td>
                <td>${op.total}</td>
              </tr>
            `;
          }).join("") + `
              </tbody>
            </table>
          `;
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

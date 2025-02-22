import {
  firebaseConfig,
  LEADERBOARD_MIN_COMPARISONS,
  LEADERBOARD_REFRESH_INTERVAL,
  DB_DISCONNECT_TIMEOUT,
  OPERATORS_JSON_URL,
  PRELOAD_COUNT,
} from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  update,
  increment,
  query,
  orderByChild,
  startAt,
  goOffline,
  goOnline,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/*========================================
=           LOGGING UTILITY            =
========================================*/
const logger = {
  error: (...args) => console.error("[ERROR]", ...args),
  warn: (...args) => console.warn("[WARN]", ...args),
  info: (...args) => console.info("[INFO]", ...args),
  log: (...args) => console.log("[LOG]", ...args),
  debug: (...args) => console.debug("[DEBUG]", ...args)
};

/*========================================
=            FIREBASE SETUP            =
========================================*/
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth();

signInAnonymously(auth)
  .then(() => logger.info("Signed in anonymously"))
  .catch((error) => logger.error("Auth Error:", error));

/*========================================
=            DARK MODE SETUP           =
========================================*/
// Cache DOM elements
const darkModeBtn = document.getElementById("toggle-dark-mode");
const DARK_MODE_KEY = "arkpoll_darkMode";

function initDarkMode() {
  if (localStorage.getItem(DARK_MODE_KEY) === "true") {
    document.documentElement.classList.add("dark-mode");
    logger.debug("Dark mode enabled on init.");
  }
}
darkModeBtn.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark-mode");
  localStorage.setItem(DARK_MODE_KEY, isDark.toString());
  logger.info(`Dark mode ${isDark ? "enabled" : "disabled"}.`);
});

/*========================================
=    OPERATOR DATA & PAIRWISE VOTING    =
========================================*/
let operators = [];
// New: create a lookup map for operators
let operatorMap = new Map();

let leftOperator, rightOperator;
let preloadedPairs = [];

// Cache frequently accessed DOM elements for operator display
const leftImgEl = document.getElementById("left-img");
const rightImgEl = document.getElementById("right-img");
const leftNameEl = document.getElementById("left-name");
const rightNameEl = document.getElementById("right-name");

// Helper: get a secure random integer in [0, max)
const secureRandomInt = (max) => {
  const array = new Uint32Array(1);
  window.crypto.getRandomValues(array);
  return array[0] % max;
};

// Helper: return a random image from an operator's image list
const getRandomImage = (images) => images[secureRandomInt(images.length)];

// Helper: return a new operator object with a random image selected
const getOperatorWithRandomImage = (operator) => ({
  ...operator,
  img: getRandomImage(operator.images),
});

// Returns two distinct operators using secure randomness
function getTwoDistinctRandomOperators() {
  if (operators.length < 2) {
    logger.warn("Not enough operators available for selection.");
    return null;
  }
  const index1 = secureRandomInt(operators.length);
  let index2 = secureRandomInt(operators.length - 1);
  if (index2 >= index1) index2++;
  return [operators[index1], operators[index2]];
}

async function loadOperatorData() {
  try {
    const response = await fetch(OPERATORS_JSON_URL);
    const data = await response.json();
    operators = Object.keys(data).map((opID) => ({
      id: opID,
      name: data[opID].name,
      images: data[opID].images,
    }));
    // Build a lookup map for quick operator access later
    operatorMap = new Map(operators.map((op) => [op.id, op]));
    logger.info(`Loaded ${operators.length} operators.`);
    preloadNextOperators();
    getRandomOperators();
  } catch (error) {
    logger.error("Error loading operator data:", error);
  }
}

// Preload enough voting pairs (questions) to meet the PRELOAD_COUNT
function preloadNextOperators() {
  while (preloadedPairs.length < PRELOAD_COUNT) {
    if (operators.length < 2) {
      logger.warn("Not enough operators to preload pairs.");
      return;
    }
    const pair = getTwoDistinctRandomOperators();
    if (!pair) return;
    const [op1, op2] = pair;
    const pairObj = {
      leftOperator: getOperatorWithRandomImage(op1),
      rightOperator: getOperatorWithRandomImage(op2),
    };
    // Preload images for this pair
    [pairObj.leftOperator.img, pairObj.rightOperator.img].forEach((src) => {
      const img = new Image();
      img.src = src;
    });
    preloadedPairs.push(pairObj);
    logger.debug("Preloaded a new operator pair. Queue length:", preloadedPairs.length);
  }
}

// Get and display a random pair of operators from the preloaded queue
function getRandomOperators() {
  if (operators.length < 2) return;
  let pair;
  if (preloadedPairs.length > 0) {
    pair = preloadedPairs.shift();
    logger.debug("Using preloaded operator pair. Remaining queue length:", preloadedPairs.length);
  } else {
    logger.debug("No preloaded pairs available, generating on the fly.");
    const randomPair = getTwoDistinctRandomOperators();
    if (!randomPair) return;
    const [op1, op2] = randomPair;
    pair = {
      leftOperator: getOperatorWithRandomImage(op1),
      rightOperator: getOperatorWithRandomImage(op2),
    };
  }
  leftOperator = pair.leftOperator;
  rightOperator = pair.rightOperator;
  // Update cached DOM elements with the selected operator data
  leftImgEl.src = leftOperator.img;
  rightImgEl.src = rightOperator.img;
  leftNameEl.textContent = leftOperator.name;
  rightNameEl.textContent = rightOperator.name;
  // Refill the preloaded pairs if needed
  preloadNextOperators();
}

/*========================================
=         VOTING BUTTON HANDLERS       =
========================================*/
// Cache voting buttons
const leftVoteBtn = document.getElementById("left-vote");
const rightVoteBtn = document.getElementById("right-vote");

function disableVotingButtons() {
  leftVoteBtn.disabled = true;
  rightVoteBtn.disabled = true;
  logger.debug("Voting buttons disabled.");
}

function enableVotingButtons() {
  leftVoteBtn.disabled = false;
  rightVoteBtn.disabled = false;
  logger.debug("Voting buttons enabled.");
}

leftVoteBtn.addEventListener("click", () =>
  vote(leftOperator, rightOperator)
);
rightVoteBtn.addEventListener("click", () =>
  vote(rightOperator, leftOperator)
);

/*========================================
=       FIREBASE CONNECTION MANAGEMENT   =
========================================*/
// New flag to track connection state
let isOnline = true;
let disconnectTimer = null;

function ensureOnline() {
  if (!isOnline) {
    goOnline(database);
    isOnline = true;
    logger.debug("Connection set to online.");
  }
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
    logger.debug("Cleared disconnect timer; staying online.");
  }
}

function disconnectAfterUpdate() {
  disconnectTimer = setTimeout(() => {
    goOffline(database);
    isOnline = false;
    logger.info("Database connection closed due to inactivity.");
  }, DB_DISCONNECT_TIMEOUT);
}

/*========================================
=             VOTING LOGIC             =
========================================*/
function vote(winner, loser) {
  ensureOnline();
  logger.info(`${winner.name} wins!`);

  // Disable vote buttons immediately to prevent multiple clicks
  disableVotingButtons();

  // Optimistically update the UI immediately (fire-and-forget)
  getRandomOperators();

  const updates = {
    [`votes/${winner.id}/wins`]: increment(1),
    [`votes/${winner.id}/total`]: increment(1),
    [`votes/${loser.id}/losses`]: increment(1),
    [`votes/${loser.id}/total`]: increment(1),
  };

  update(ref(database), updates)
    .then(() => {
      logger.info("Vote successfully recorded.");
    })
    .catch((error) => {
      logger.error("Error updating votes:", error);
    })
    .finally(() => {
      disconnectAfterUpdate();
      enableVotingButtons();
    });
}

/*========================================
=            LEADERBOARD LOGIC         =
========================================*/
const rankingsDiv = document.getElementById("rankings");
const refreshBtn = document.getElementById("refresh-rankings");
const LAST_REFRESH_TIME_KEY = "arkpoll_lastRefresh";
const LAST_LEADERBOARD_KEY = "arkpoll_lastLeaderboardHTML";

// Load cached leaderboard from localStorage
function loadCachedLeaderboard() {
  const cached = localStorage.getItem(LAST_LEADERBOARD_KEY);
  rankingsDiv.innerHTML = cached || "<p>Loading...</p>";
  logger.debug("Loaded cached leaderboard from localStorage.");
}

// Fetch and display the current leaderboard from Firebase
function displayRankings() {
  ensureOnline();
  const leaderboardQuery = query(
    ref(database, "votes"),
    orderByChild("total"),
    startAt(LEADERBOARD_MIN_COMPARISONS)
  );

  get(leaderboardQuery)
    .then((snapshot) => {
      if (snapshot.exists()) {
        const allVotes = snapshot.val();
        let rankings = [];
        for (const opID in allVotes) {
          const { wins = 0, losses = 0, total = 0 } = allVotes[opID];
          if (total >= LEADERBOARD_MIN_COMPARISONS) {
            rankings.push({
              id: opID,
              wins,
              losses,
              total,
              winPct: wins / total,
            });
          }
        }
        rankings.sort((a, b) =>
          b.winPct === a.winPct ? b.wins - a.wins : b.winPct - a.winPct
        );
        rankings = rankings.slice(0, 10);

        const rankingHTML = rankings.length
          ? `
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
                ${rankings
                  .map((op, idx) => {
                    // Use the operatorMap for fast lookup
                    const operator = operatorMap.get(op.id);
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
                  })
                  .join("")}
              </tbody>
            </table>
          `
          : "<p>No operators meet the minimum comparisons yet.</p>";

        rankingsDiv.innerHTML = rankingHTML;
        localStorage.setItem(LAST_LEADERBOARD_KEY, rankingHTML);
        logger.info("Leaderboard updated.");
        disconnectAfterUpdate();
      } else {
        rankingsDiv.innerHTML = "<p>No votes yet.</p>";
        localStorage.removeItem(LAST_LEADERBOARD_KEY);
        logger.warn("No votes found when fetching leaderboard.");
      }
    })
    .catch((error) => logger.error("Error fetching rankings:", error));
}

function getRemainingCooldown() {
  const lastRefresh = parseInt(localStorage.getItem(LAST_REFRESH_TIME_KEY) || "0");
  const elapsed = Date.now() - lastRefresh;
  return elapsed < LEADERBOARD_REFRESH_INTERVAL ? LEADERBOARD_REFRESH_INTERVAL - elapsed : 0;
}

function disableRefreshButton(ms) {
  refreshBtn.disabled = true;
  refreshBtn.classList.add("disabled");
  logger.debug(`Refresh button disabled for ${ms} ms.`);
  setTimeout(() => {
    refreshBtn.disabled = false;
    refreshBtn.classList.remove("disabled");
    logger.debug("Refresh button re-enabled.");
  }, ms);
}

function refreshLeaderboard() {
  displayRankings();
  localStorage.setItem(LAST_REFRESH_TIME_KEY, Date.now().toString());
  disableRefreshButton(LEADERBOARD_REFRESH_INTERVAL);
  logger.info("Leaderboard refresh initiated.");
}

function maybeAutoRefreshLeaderboard() {
  const remaining = getRemainingCooldown();
  if (remaining === 0) {
    refreshLeaderboard();
  } else {
    disableRefreshButton(remaining);
    logger.debug("Leaderboard auto-refresh delayed due to cooldown.");
  }
}

refreshBtn.addEventListener("click", () => {
  if (getRemainingCooldown() === 0) {
    refreshLeaderboard();
  } else {
    logger.warn("Refresh button clicked but still in cooldown.");
  }
});

/*========================================
=  TEMPORARY CONNECTION ON TAB VISIBILITY =
========================================*/
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (disconnectTimer) clearTimeout(disconnectTimer);
    disconnectTimer = setTimeout(() => {
      goOffline(database);
      isOnline = false;
      logger.info("Tab hidden: disconnecting Firebase connection.");
    }, DB_DISCONNECT_TIMEOUT);
  } else {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    if (!isOnline) {
      goOnline(database);
      isOnline = true;
    }
    logger.info("Tab visible: reconnecting Firebase connection.");
    disconnectTimer = setTimeout(() => {
      goOffline(database);
      isOnline = false;
      logger.info("No activity: disconnecting Firebase connection after tab visible timeout.");
    }, DB_DISCONNECT_TIMEOUT);
  }
});

/*========================================
=           PAGE INITIALIZATION        =
========================================*/
function init() {
  initDarkMode();
  loadCachedLeaderboard();
  loadOperatorData();
  maybeAutoRefreshLeaderboard();
  logger.info("Page initialization complete.");
}

init();

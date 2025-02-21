// Import Firebase modules and your injected config
import firebaseConfig from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, runTransaction, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Sign in anonymously (needed if your DB rules require auth)
const auth = getAuth();
signInAnonymously(auth)
  .then(() => { console.log("Signed in anonymously"); })
  .catch((error) => { console.error("Auth Error:", error); });

// URL for the preprocessed operator data (with real names and image lists)
const OPERATORS_JSON_URL = "operators.json";

let operators = [];

// Load operator data from the JSON file
async function loadOperatorData() {
    try {
        const response = await fetch(OPERATORS_JSON_URL);
        const data = await response.json();

        operators = Object.keys(data).map(opID => ({
            id: opID,
            name: data[opID].name,      // Real display name
            images: data[opID].images
        }));

        getRandomOperators();
    } catch (error) {
        console.error("Error loading operator data:", error);
    }
}

let leftOperator, rightOperator;

// Pick two random operators for the vote UI
function getRandomOperators() {
    if (operators.length < 2) return;

    // Randomly select two distinct operators
    let [op1, op2] = operators.sort(() => 0.5 - Math.random()).slice(0, 2);

    leftOperator = { ...op1, img: op1.images[Math.floor(Math.random() * op1.images.length)] };
    rightOperator = { ...op2, img: op2.images[Math.floor(Math.random() * op2.images.length)] };

    document.getElementById("left-img").src = leftOperator.img;
    document.getElementById("right-img").src = rightOperator.img;
    document.getElementById("left-name").textContent = leftOperator.name;
    document.getElementById("right-name").textContent = rightOperator.name;
}

// When a vote is cast, record a win for one and a loss for the other.
document.getElementById("left-vote").addEventListener("click", () => vote(leftOperator, rightOperator));
document.getElementById("right-vote").addEventListener("click", () => vote(rightOperator, leftOperator));

async function vote(winner, loser) {
    console.log(`${winner.name} wins!`);

    // Increment winner's win count
    const winnerRef = ref(database, `votes/${winner.id}/wins`);
    runTransaction(winnerRef, (currentWins) => {
        return (currentWins || 0) + 1;
    });

    // Increment loser's loss count
    const loserRef = ref(database, `votes/${loser.id}/losses`);
    runTransaction(loserRef, (currentLosses) => {
        return (currentLosses || 0) + 1;
    });

    getRandomOperators();
}

// Display rankings based on win percentage, filtering out operators with too few comparisons
const MIN_COMPARISONS = 1; // Baseline number of comparisons required

function displayRankings() {
    const rankingsRef = ref(database, "votes");
    get(rankingsRef).then((snapshot) => {
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

            // Sort operators by win percentage (highest first)
            rankings.sort((a, b) => b.winPct - a.winPct);
            rankings = rankings.slice(0, 10);

            const rankingHTML = rankings.map(op => {
                // Look up the real display name from our loaded operator data
                const operator = operators.find(o => o.id === op.id);
                const displayName = operator ? operator.name : op.id;
                return `<li>${displayName}: ${(op.winPct * 100).toFixed(2)}% (${op.wins} wins, ${op.losses} losses, ${op.total} comparisons)</li>`;
            }).join("");

            document.getElementById("rankings").innerHTML = `<ul>${rankingHTML}</ul>`;
        } else {
            document.getElementById("rankings").innerHTML = "<p>No votes yet.</p>";
        }
    }).catch((error) => {
        console.error("Error fetching rankings:", error);
    });
}

// Refresh rankings every 10 seconds
setInterval(displayRankings, 10000);

// Initial load of operator data
loadOperatorData();

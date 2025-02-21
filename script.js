import firebaseConfig from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, runTransaction, get  } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);


const auth = getAuth();
signInAnonymously(auth).then(() => {
    console.log("Signed in anonymously");
}).catch((error) => {
    console.error("Auth Error:", error);
});

const OPERATORS_JSON_URL = "operators.json"; // Preprocessed JSON

let operators = [];

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

let leftOperator, rightOperator;

function getRandomOperators() {
    if (operators.length < 2) return;

    let [op1, op2] = operators.sort(() => 0.5 - Math.random()).slice(0, 2);

    leftOperator = { ...op1, img: op1.images[Math.floor(Math.random() * op1.images.length)] };
    rightOperator = { ...op2, img: op2.images[Math.floor(Math.random() * op2.images.length)] };

    document.getElementById("left-img").src = leftOperator.img;
    document.getElementById("right-img").src = rightOperator.img;
    document.getElementById("left-name").textContent = leftOperator.name;
    document.getElementById("right-name").textContent = rightOperator.name;
}

document.getElementById("left-vote").addEventListener("click", () => vote(leftOperator));
document.getElementById("right-vote").addEventListener("click", () => vote(rightOperator));

async function vote(winner) {
    console.log(`${winner.name} wins!`);
    const operatorID = winner.id;

    // Firebase transaction to increment vote count
    const voteRef = ref(database, `votes/${operatorID}`);
    runTransaction(voteRef, (currentVotes) => {
        return (currentVotes || 0) + 1;
    });

    getRandomOperators();
}

function displayRankings() {
    const rankingsRef = ref(database, "votes");
    get(rankingsRef).then((snapshot) => {
        if (snapshot.exists()) {
            const rankings = Object.entries(snapshot.val())
                .sort((a, b) => b[1] - a[1]) // Sort by votes descending
                .slice(0, 10); // Get top 10

            const rankingHTML = rankings.map(op => {
                return `<li>${op[0]}: ${op[1]} votes</li>`;
            }).join("");

            document.getElementById("rankings").innerHTML = `<ul>${rankingHTML}</ul>`;
        } else {
            document.getElementById("rankings").innerHTML = "<p>No votes yet.</p>";
        }
    }).catch((error) => {
        console.error("Error fetching rankings:", error);
    });
}

setInterval(displayRankings, 10000);

// Load everything
loadOperatorData();

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT.firebaseio.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

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

function vote(winner) {
    console.log(`${winner.name} wins!`);
    const operatorID = winner.id;

    // Increment the operator's vote count in Firebase
    database.ref("votes/" + operatorID).transaction(currentVotes => {
        return (currentVotes || 0) + 1;
    });

    getRandomOperators();
}

// Display rankings
function displayRankings() {
    database.ref("votes").orderByValue().limitToLast(10).once("value", snapshot => {
        const rankings = [];
        snapshot.forEach(child => {
            rankings.push({ id: child.key, votes: child.val() });
        });

        rankings.reverse(); // Show highest first
        const rankingHTML = rankings.map(op => {
            let operator = operators.find(o => o.id === op.id);
            return `<li>${operator ? operator.name : op.id}: ${op.votes} votes</li>`;
        }).join("");

        document.getElementById("rankings").innerHTML = `<ul>${rankingHTML}</ul>`;
    });
}

// Refresh rankings every 10 seconds
setInterval(displayRankings, 10000);

// Load everything
loadOperatorData();

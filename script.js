const OPERATORS_JSON_URL = "https://nyansequitur.github.io/arknights-poll/operators.json"; // Adjust if needed

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
    document.getElementById("left-img").alt = leftOperator.name;
    document.getElementById("right-img").alt = rightOperator.name;
}

document.getElementById("left-vote").addEventListener("click", () => vote(leftOperator));
document.getElementById("right-vote").addEventListener("click", () => vote(rightOperator));

function vote(winner) {
    console.log(`${winner.name} wins!`);
    getRandomOperators();
}

// Load the operator data first
loadOperatorData();

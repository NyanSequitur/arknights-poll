const NAME_MAPPING_URL = "https://raw.githubusercontent.com/PuppiizSunniiz/AN-EN-Tags/main/py/dict.json";
const GITHUB_API_URL = "https://api.github.com/repos/ArknightsAssets/ArknightsAssets/contents/assets/torappu/dynamicassets/arts/characters/";

let operators = [];

async function loadOperatorData() {
    try {
        const response = await fetch(NAME_MAPPING_URL);
        const data = await response.json();
        const charData = data["Char"]["Code2Name"];

        operators = Object.keys(charData).map(opID => ({
            id: opID,
            name: charData[opID]
        }));

        getRandomOperators();
    } catch (error) {
        console.error("Error loading operator data:", error);
    }
}

async function getOperatorImages(operatorID) {
    try {
        const response = await fetch(GITHUB_API_URL + operatorID);
        if (!response.ok) throw new Error(`Failed to fetch images for ${operatorID}`);

        const files = await response.json();
        const imageFiles = files
            .filter(file => file.name.endsWith(".png")) // Only keep PNGs
            .map(file => file.download_url); // Get direct image URLs

        return imageFiles.length > 0 ? imageFiles : null;
    } catch (error) {
        console.error(`Error fetching images for ${operatorID}:`, error);
        return null;
    }
}

let leftOperator, rightOperator;

async function getRandomOperators() {
    if (operators.length < 2) return;

    let [op1, op2] = operators.sort(() => 0.5 - Math.random()).slice(0, 2);

    let op1Images = await getOperatorImages(op1.id);
    let op2Images = await getOperatorImages(op2.id);

    if (!op1Images || !op2Images) {
        console.warn("Skipping operators due to missing images.");
        return getRandomOperators();
    }

    leftOperator = { ...op1, img: op1Images[Math.floor(Math.random() * op1Images.length)] };
    rightOperator = { ...op2, img: op2Images[Math.floor(Math.random() * op2Images.length)] };

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

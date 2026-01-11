const fs = require("fs");
const path = require("path");

const NEW_FILE = "maps_data_playwright.csv";
const MAIN_FILE = "data.csv";

// --- Helper: parse CSV safely ---
function parseCSV(content) {
    const lines = content.trim().split("\n");
    const header = lines.shift();
    const rows = lines.map(line => {
        // split CSV while respecting quotes
        const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
        return matches ? matches.map(v => v.replace(/^"|"$/g, "")) : [];
    });
    return { header, rows };
}

// --- Load files ---
if (!fs.existsSync(NEW_FILE)) {
    console.error("❌ maps_data_playwright.csv not found");
    process.exit(1);
}

if (!fs.existsSync(MAIN_FILE)) {
    console.log("ℹ️ data.csv not found, creating new one");
    fs.writeFileSync(MAIN_FILE, fs.readFileSync(NEW_FILE, "utf8"));
    process.exit(0);
}

const newContent = fs.readFileSync(NEW_FILE, "utf8");
const mainContent = fs.readFileSync(MAIN_FILE, "utf8");

const { header: newHeader, rows: newRows } = parseCSV(newContent);
const { rows: mainRows } = parseCSV(mainContent);

// --- Build set of existing names (from data.csv) ---
const existingNames = new Set(
    mainRows.map(r => (r[0] || "").toLowerCase().trim())
);

// --- Deduplicate NEW FILE by name ---
const seenNewNames = new Set();
const cleanedNewRows = [];
const rowsToAppend = [];

for (const row of newRows) {
    const name = (row[0] || "").toLowerCase().trim();
    if (!name) continue;

    // Remove duplicates inside maps_data_playwright.csv
    if (seenNewNames.has(name)) {
        continue;
    }
    seenNewNames.add(name);
    cleanedNewRows.push(row);

    // Skip if already exists in data.csv
    if (!existingNames.has(name)) {
        rowsToAppend.push(row);
        existingNames.add(name);
    }
}

// --- Write cleaned maps_data_playwright.csv ---
const rebuiltNewCSV =
    newHeader +
    "\n" +
    cleanedNewRows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");

fs.writeFileSync(NEW_FILE, rebuiltNewCSV, "utf8");

// --- Append new unique rows to data.csv ---
if (rowsToAppend.length > 0) {
    const appendCSV =
        "\n" +
        rowsToAppend.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");

    fs.appendFileSync(MAIN_FILE, appendCSV, "utf8");
}

console.log("✅ Deduplication complete");
console.log(`• Removed duplicates inside ${NEW_FILE}`);
console.log(`• Added ${rowsToAppend.length} new rows to ${MAIN_FILE}`);

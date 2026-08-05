const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      results.push(...walk(full));
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      results.push(full);
    }
  }
  return results;
}

const mdFiles = walk(".");

const entries = mdFiles.map((filePath) => {
  const content = fs.readFileSync(filePath, "utf-8");
  const titleMatch = content.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : path.basename(filePath, ".md");

  let date;
  try {
    date = execSync(`git log -1 --format=%cI -- "${filePath}"`, {
      encoding: "utf-8",
    }).trim();
  } catch {
    date = new Date().toISOString();
  }

  const relPath = filePath.replace(/^\.\//, "").replace(/\\/g, "/");
  return { title, path: relPath, date };
});

// Sort by date descending (most recent first)
entries.sort((a, b) => new Date(b.date) - new Date(a.date));

fs.writeFileSync("index.json", JSON.stringify(entries, null, 2) + "\n");
console.log(`Generated index.json with ${entries.length} entries`);

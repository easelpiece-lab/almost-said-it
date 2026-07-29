import { readFile, writeFile } from "node:fs/promises";

const source = await readFile(new URL("./index-source.html", import.meta.url), "utf8");
const boldQuizCss = await readFile(new URL("./bold-quiz.css", import.meta.url), "utf8");
const questions = await readFile(new URL("./questions-ru.js", import.meta.url), "utf8");
const app = await readFile(new URL("./app-v7.js", import.meta.url), "utf8");
const cssMarker = '  <link rel="stylesheet" href="bold-quiz.css">';
const questionMarker = '  <script src="questions-ru.js"></script>';
const appMarker = '  <script src="app-v7.js"></script>';

if (!source.includes(cssMarker) || !source.includes(questionMarker) || !source.includes(appMarker)) {
  throw new Error("Не найдены маркеры стилей, базы вопросов или приложения в index-source.html");
}

let output = source
  .replace(cssMarker, `  <style>\n${boldQuizCss}\n  </style>`)
  .replace(questionMarker, `  <script>\n${questions}\n  </script>`)
  .replace(appMarker, `  <script>\n${app}\n  </script>`);

for (const name of ["brain","search","teams","trophy"]) {
  const image = await readFile(new URL(`./assets/${name}-badge.webp`, import.meta.url));
  const dataUrl = `data:image/webp;base64,${image.toString("base64")}`;
  output = output.replace(`assets/${name}-badge.webp`, dataUrl);
}

const background = await readFile(new URL("./assets/chat-doodle-bg.webp", import.meta.url));
output = output.replace(
  "assets/chat-doodle-bg.webp",
  `data:image/webp;base64,${background.toString("base64")}`
);

for (const name of ["home","handoff","results"]) {
  const image = await readFile(new URL(`./assets/bold-${name}-bg.webp`, import.meta.url));
  const dataUrl = `data:image/webp;base64,${image.toString("base64")}`;
  output = output.replace(`assets/bold-${name}-bg.webp`, dataUrl);
}

await writeFile(new URL("./index.html", import.meta.url), output);
console.log("Создан автономный index.html");

import { readFile, writeFile } from "node:fs/promises";

const fileUrl = new URL("./questions.json", import.meta.url);
const parsed = JSON.parse(await readFile(fileUrl, "utf8"));
const questions = Array.isArray(parsed) ? parsed : parsed.questions;

if (!Array.isArray(questions) || questions.length < 4) {
  throw new Error("questions.json должен содержать массив минимум из четырёх вопросов");
}

const seen = new Set();
for (const [index, item] of questions.entries()) {
  if (!item || typeof item !== "object") throw new Error(`Вопрос ${index + 1}: ожидается объект`);
  for (const field of ["id", "category", "question", "answer"]) {
    if (!String(item[field] || "").trim()) throw new Error(`Вопрос ${index + 1}: не заполнено поле ${field}`);
  }
  if (seen.has(item.id)) throw new Error(`Повторяющийся id: ${item.id}`);
  seen.add(item.id);
  if (!Number.isInteger(item.points) || item.points < 1 || item.points > 8) {
    throw new Error(`Вопрос ${item.id}: points должен быть целым числом от 1 до 8`);
  }
}

const output = `window.ASI_QUESTION_BANK = ${JSON.stringify(questions, null, 2)};\n`;
await writeFile(new URL("./questions-ru.js", import.meta.url), output);
console.log(`Подготовлена встроенная база: ${questions.length} вопросов`);

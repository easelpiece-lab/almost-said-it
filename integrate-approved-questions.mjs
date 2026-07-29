import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../reasoning-quiz-1000/questions.json", import.meta.url);
const targetUrl = new URL("./questions.json", import.meta.url);
const source = JSON.parse(await readFile(sourceUrl, "utf8"));

if (!Array.isArray(source.questions) || source.questions.length !== 1000) {
  throw new Error("Утверждённая база должна содержать ровно 1000 вопросов");
}

const seenIds = new Set();
const questions = source.questions.map((item, index) => {
  const question = {
    id: String(item.id || "").trim(),
    category: String(item.category || "").trim(),
    category_key: String(item.category_key || "").trim(),
    subcategory: String(item.subcategory || "").trim(),
    points: Number(item.points),
    question: String(item.question || "").trim(),
    answer: String(item.answer || "").trim(),
    accepted_answers: Array.isArray(item.accepted_answers)
      ? item.accepted_answers.map(value => String(value).trim()).filter(Boolean)
      : []
  };

  if (!question.id || !question.category || !question.question || !question.answer) {
    throw new Error(`Вопрос ${index + 1}: не заполнены обязательные поля`);
  }
  if (seenIds.has(question.id)) throw new Error(`Повторяющийся id: ${question.id}`);
  if (!Number.isInteger(question.points) || question.points < 1 || question.points > 8) {
    throw new Error(`Вопрос ${question.id}: points должен быть целым числом от 1 до 8`);
  }
  seenIds.add(question.id);
  return question;
});

const output = {
  version: 4,
  updated_at: new Date().toISOString(),
  title: source.metadata?.title || "Almost Said It — 1000 вопросов",
  questions
};

await writeFile(targetUrl, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Установлена утверждённая база: ${questions.length} вопросов`);

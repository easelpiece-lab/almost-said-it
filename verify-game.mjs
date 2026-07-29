import { readFile } from "node:fs/promises";
import { randomInt } from "node:crypto";

const database = JSON.parse(await readFile(new URL("./questions.json", import.meta.url), "utf8"));
const app = await readFile(new URL("./app-v7.js", import.meta.url), "utf8");
const standalone = await readFile(new URL("./index.html", import.meta.url), "utf8");
const questions = database.questions;

if (!Array.isArray(questions) || questions.length !== 1000) {
  throw new Error("В рабочей базе должно быть ровно 1000 вопросов");
}

const ids = questions.map(question => question.id);
if (new Set(ids).size !== ids.length) throw new Error("В базе есть повторяющиеся id");
if (questions.some(question => !Number.isInteger(question.points) || question.points < 1 || question.points > 8)) {
  throw new Error("Баллы должны быть целыми числами от 1 до 8");
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

const decks = Array.from({ length: 3 }, () => shuffle(ids));
for (const deck of decks) {
  if (deck.length !== 1000 || new Set(deck).size !== 1000) {
    throw new Error("Каждая партия должна быть перестановкой 1000 уникальных вопросов");
  }
  for (let cursor = 0; cursor + 4 <= deck.length; cursor += 4) {
    if (new Set(deck.slice(cursor, cursor + 4)).size !== 4) {
      throw new Error("На одной карточке обнаружен повтор вопроса");
    }
  }
}

for (let index = 1; index < decks.length; index += 1) {
  if (decks[index].every((id, position) => id === decks[index - 1][position])) {
    throw new Error("Новая партия повторила порядок предыдущей колоды");
  }
}

const requiredRuntimeFragments = [
  'const STORE = "almost-said-it-bold-v10";',
  "target:30,",
  "teamCount:2,",
  "minutes:3,",
  "timeLeft:180,",
  "prepareFreshDeck();",
  "state.currentQuestionIds=state.questionOrder.slice(state.questionCursor,state.questionCursor+4);",
  "state.questionCursor+=4;",
  "QUESTION_BANK=incoming;",
  '<p class="answer-label">Правильный ответ</p>',
  '<h2 class="answer-value">${safeText(question.answer)}</h2>',
  'timerId=window.setInterval(()=>{',
  'badge.style.setProperty("--timer-progress",`${percent}%`);',
  "},100);"
];
for (const fragment of requiredRuntimeFragments) {
  if (!app.includes(fragment)) throw new Error(`В приложении отсутствует логика: ${fragment}`);
}
for (const removedFragment of [
  "IMPORT_STORE",
  "importedQuestions",
  "shuffle(pool).slice",
  "question.context?",
  "question.explanation||question.fact",
  '<p class="answer-question">'
]) {
  if (app.includes(removedFragment)) throw new Error(`Старая логика не удалена: ${removedFragment}`);
}
if (!standalone.includes("1000 проверенных вопросов · новая случайная колода")) {
  throw new Error("Автономный HTML не содержит обновлённую версию");
}

console.log("Проверка пройдена: 1000 вопросов, 3 разные колоды, без повторов, баллы 1–8");

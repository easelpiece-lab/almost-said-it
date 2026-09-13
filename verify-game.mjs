import { readFile } from "node:fs/promises";
import vm from "node:vm";

const read = name => readFile(new URL(`./${name}`, import.meta.url), "utf8");
const [ruData,enData,bundle,app,source,standalone] = await Promise.all([
  read("questions.json").then(JSON.parse), read("questions-en.json").then(JSON.parse),
  read("questions-ru.js"), read("app-v7.js"), read("index-source.html"), read("standalone.html")
]);

function verifyBank(database,{count,language,revised}) {
  const questions=database.questions;
  if (database.version!==5 || database.language!==language || questions.length!==count) throw new Error(`${language}: wrong metadata or count`);
  const ids=questions.map(item=>item.id);
  const texts=questions.map(item=>item.question.trim().toLocaleLowerCase().replaceAll("ё","е"));
  if (new Set(ids).size!==count || new Set(texts).size!==count) throw new Error(`${language}: duplicate IDs or questions`);
  if (questions.some(item=>!item.answer.trim() || !Number.isInteger(item.points) || item.points<1 || item.points>8)) throw new Error(`${language}: invalid answer or score`);
  if (questions.filter(item=>item.editorial_revision===5).length<revised) throw new Error(`${language}: editorial revisions missing`);
}
verifyBank(ruData,{count:1000,language:"ru",revised:171});
verifyBank(enData,{count:350,language:"en",revised:350});

const enCounts=Object.groupBy(enData.questions,item=>item.category_key);
if (Object.keys(enCounts).length!==7 || Object.values(enCounts).some(items=>items.length!==50)) throw new Error("English edition must have 50 reviewed questions in all seven categories");

const sandbox={window:{}};
vm.runInNewContext(bundle,sandbox);
if (sandbox.window.ASI_QUESTION_BANK.length!==1000 || sandbox.window.ASI_QUESTION_BANK_EN.length!==350) throw new Error("Embedded bilingual question bundle is out of sync");

for (const required of ['id="languageSwitch"','data-language="ru"','data-language="en"','<script src="i18n.js"></script>']) {
  if (!source.includes(required)) throw new Error(`Missing source UI: ${required}`);
}
for (const required of ['on("startRoundButton","click",drawQuestionCard);','const hasMarked = markedCount===4;','questions.every(question=>state.answerMarks[question.id])','QUESTION_BANK=normalizeQuestions(banks[language]);','data.version<5 || data.language!==language','updateCardAccessibility();']) {
  if (!app.includes(required)) throw new Error(`Missing game logic: ${required}`);
}
for (const removed of ["readySwipeSurface","pointerdown","pointermove","commitSwipe","Проведите, чтобы начать"]) {
  if (app.includes(removed)) throw new Error(`Swipe start remains in game logic: ${removed}`);
}
if (!standalone.includes("window.ASI_QUESTION_BANK_EN") || !standalone.includes("Start round →") || standalone.length<700_000) throw new Error("Standalone HTML is incomplete");
console.log("Verified: 1000 RU / 350 EN questions, bilingual UI, tap start, stable answer controls.");

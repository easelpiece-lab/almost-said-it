import { readFile } from "node:fs/promises";

const stopWords = new Set([
  "а","в","во","вы","где","для","до","его","её","ее","если","же","за","и","из","или","их","как","какая","какие","какой","каком","какую","когда","который","которая","которые","кто","ли","на","над","не","но","об","один","одна","по","под","при","с","со","сколько","самая","самый","среди","так","то","у","чем","чему","что","это","этой","этого",
  "a","an","and","are","as","at","by","did","do","does","for","from","has","have","how","in","is","it","its","of","on","or","the","to","was","were","what","when","where","which","who","with"
]);

const norm = value => String(value || "").toLowerCase().replace(/ё/g,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
const tokens = value => new Set(norm(value).split(" ").filter(word=>word.length>=3 && !stopWords.has(word)));
const overlap = (a,b) => {
  if (!a.size || !b.size) return 0;
  let shared=0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / Math.min(a.size,b.size);
};

function inspect(language,data) {
  const bank=data.questions;
  const problems=[];
  const normalized=[];
  const seenIds=new Set();
  const seenQuestions=new Map();
  const byAnswer=new Map();
  for (const item of bank) {
    const id=item.id;
    const question=norm(item.question);
    const answer=norm(item.answer);
    const aliases=Array.isArray(item.accepted_answers) ? item.accepted_answers : [];
    if (seenIds.has(id)) problems.push({kind:"duplicate-id",id});
    seenIds.add(id);
    if (seenQuestions.has(question)) problems.push({kind:"duplicate-question",id,other:seenQuestions.get(question)});
    seenQuestions.set(question,id);
    if (!aliases.some(alias=>norm(alias)===answer)) problems.push({kind:"primary-answer-missing",id});
    if (new Set(aliases.map(norm)).size!==aliases.length) problems.push({kind:"duplicate-alias",id});
    // In odd-one-out puzzles the correct word must appear among the options.
    if (question.includes(answer) && answer.length>=5 && !/лишнее|не является|which .* (odd|different)/i.test(item.question)) problems.push({kind:"answer-in-question",id});
    if (item.question.length>120) problems.push({kind:"long-question",id,length:item.question.length});
    if (/\b(сегодняшн|нынешн|текущ|на данный момент|в этом году|currently|as of 20\d\d|this year)\b/i.test(item.question)) problems.push({kind:"time-sensitive",id});
    const key=`${item.category_key}|${answer}`;
    const group=byAnswer.get(key) || [];
    group.push(item);
    byAnswer.set(key,group);
    normalized.push({id,raw:item,tokens:tokens(item.question)});
  }

  const near=[];
  for (const group of byAnswer.values()) {
    if (group.length<2) continue;
    for (let i=0;i<group.length;i++) for (let j=i+1;j<group.length;j++) {
      const a=normalized.find(n=>n.id===group[i].id);
      const b=normalized.find(n=>n.id===group[j].id);
      const similarity=overlap(a.tokens,b.tokens);
      // The same stock phrase ('continue the number series') is not a duplicate.
      const generic=/^(продолжите|ряд|числовой|числа|вычислите|calculate|sequence|next)$/;
      const meaningfulShared=[...a.tokens].filter(word=>b.tokens.has(word) && !generic.test(word)).length;
      if (similarity>=0.6 && meaningfulShared>=2) near.push({a:a.id,b:b.id,similarity:Number(similarity.toFixed(2)),answer:a.raw.answer,q1:a.raw.question,q2:b.raw.question});
    }
  }
  near.sort((a,b)=>b.similarity-a.similarity);
  const category=Object.groupBy(bank,item=>item.category);
  const counts=Object.groupBy(bank,item=>String(item.points));
  return {
    language,count:bank.length,
    categoryCounts:Object.fromEntries(Object.entries(category).map(([key,value])=>[key,value.length])),
    pointCounts:Object.fromEntries(Object.entries(counts).map(([key,value])=>[key,value.length])),
    issueCounts:Object.fromEntries(Object.entries(Object.groupBy(problems,item=>item.kind)).map(([key,value])=>[key,value.length])),
    issues:problems,nearDuplicates:near
  };
}

const results=[];
for (const [language,name] of [["ru","questions.json"],["en","questions-en.json"]]) {
  results.push(inspect(language,JSON.parse(await readFile(new URL(name,import.meta.url),"utf8"))));
}
if (process.argv.includes("--json")) console.log(JSON.stringify(results,null,2));
else for (const result of results) {
  console.log(`\n${result.language}: ${result.count} вопросов`);
  console.log("Баллы:",result.pointCounts);
  console.log("Категории:",result.categoryCounts);
  console.log("Сигналы:",result.issueCounts);
  console.log("Возможные смысловые дубли:",result.nearDuplicates.length);
  for (const item of result.nearDuplicates.slice(0,20)) console.log(`  ${item.a} / ${item.b} (${item.similarity}): ${item.q1} | ${item.q2}`);
  for (const item of result.issues.slice(0,25)) console.log("  REVIEW",JSON.stringify(item));
}

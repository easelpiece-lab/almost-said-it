(() => {
  "use strict";

  const STORE = "almost-said-it-bold-v10";
  const LAST_DECK_STORE = "almost-said-it-last-deck-v1";
  const TEAM_NAMES = ["Детективы","Мозговой штурм","Знатоки","Ночные совы","Вот это поворот","Дикие догадки"];
  const home = document.getElementById("main");
  const gameApp = document.getElementById("gameApp");
  const gameRoot = document.getElementById("gameRoot");
  const howButton = document.getElementById("howButton");
  const howModal = document.getElementById("howModal");
  const closeHow = document.getElementById("closeHow");
  const startButton = document.getElementById("startButton");
  const soundButton = document.getElementById("soundButton");
  const toastRoot = document.getElementById("toastRoot");
  let timerId = 0;
  let toastId = 0;

  function safeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[character]);
  }

  function stableBucket(raw) {
    const value = `${raw.id || ""}|${raw.question || ""}`;
    let hash = 2166136261;
    for (let index=0; index<value.length; index+=1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash,16777619);
    }
    return (hash>>>0)%4;
  }

  function pointsFromDifficulty(raw) {
    const difficulty = Number(raw.difficulty);
    if (difficulty===1) return 1+stableBucket(raw);
    if (difficulty===2) return 5+stableBucket(raw);
    const level = Number(raw.level);
    return Number.isFinite(level) ? level : 1;
  }

  function normalizeQuestions(input) {
    const items = Array.isArray(input) ? input : Array.isArray(input?.questions) ? input.questions : [];
    const result = [];
    const seen = new Set();
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const id = String(raw.id || "").trim();
      const question = String(raw.question || "").trim();
      const answer = String(raw.answer || "").trim();
      const category = String(raw.category || "Другое").trim() || "Другое";
      if (!id || !question || !answer || seen.has(id)) continue;
      seen.add(id);
      const explicitPoints = Number(raw.points);
      const points = Number.isFinite(explicitPoints) && explicitPoints>=1
        ? explicitPoints
        : pointsFromDifficulty(raw);
      result.push({
        id,
        category,
        categoryKey:String(raw.category_key || raw.categoryKey || "").trim(),
        subcategory:String(raw.subcategory || "").trim(),
        difficulty:Number(raw.difficulty) || 0,
        acceptedAnswers:Array.isArray(raw.accepted_answers)
          ? raw.accepted_answers.map(value=>String(value).trim()).filter(Boolean)
          : [],
        points:Math.max(1,Math.min(8,Math.round(points))),
        context:String(raw.context || "").trim(),
        question,
        answer,
        explanation:String(raw.explanation || "").trim(),
        fact:String(raw.fact || "").trim(),
        source:String(raw.source || "").trim()
      });
    }
    return result;
  }

  let QUESTION_BANK = normalizeQuestions(window.ASI_QUESTION_BANK || []);

  function categories() {
    return [...new Set(QUESTION_BANK.map(question=>question.category))].sort((a,b)=>a.localeCompare(b,"ru"));
  }

  function freshState() {
    return {
      screen:"home",
      target:30,
      teamCount:2,
      minutes:3,
      teams:TEAM_NAMES.slice(0,2).map((name,index)=>({id:index+1,name,score:0})),
      activeTeam:0,
      turn:0,
      questionOrder:[],
      questionCursor:0,
      currentQuestionIds:[],
      timeLeft:180,
      timerRunning:false,
      timeExpired:false,
      flipped:false,
      answerMarks:{},
      sound:false,
      categories:categories()
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (!saved || !Array.isArray(saved.teams)) return freshState();
      const base = freshState();
      const merged = {...base,...saved,timerRunning:false};
      merged.teams = saved.teams.slice(0,6).map((team,index)=>({
        id:index+1,
        name:String(team.name || `Команда ${index+1}`).slice(0,28),
        score:Number.isFinite(Number(team.score)) ? Number(team.score) : 0
      }));
      merged.teamCount = merged.teams.length;
      merged.categories = Array.isArray(saved.categories)
        ? saved.categories.filter(category=>categories().includes(category))
        : categories();
      if (!merged.categories.length) merged.categories = categories();
      const validIds = new Set(QUESTION_BANK.map(question=>question.id));
      merged.questionOrder = Array.isArray(saved.questionOrder)
        ? saved.questionOrder.filter(id=>validIds.has(id))
        : [];
      merged.questionCursor = Math.max(0,Math.min(
        merged.questionOrder.length,
        Number.isInteger(saved.questionCursor) ? saved.questionCursor : 0
      ));
      merged.currentQuestionIds = Array.isArray(saved.currentQuestionIds) ? saved.currentQuestionIds : [];
      merged.answerMarks = saved.answerMarks && typeof saved.answerMarks === "object" ? saved.answerMarks : {};
      if (!["home","setup","ready","play","results"].includes(merged.screen)) merged.screen = "home";
      if (merged.screen === "play" && resolveCurrentQuestions(merged).length !== 4) merged.screen = "ready";
      return merged;
    } catch (_) {
      return freshState();
    }
  }

  let state = loadState();

  function saveState() {
    try { localStorage.setItem(STORE,JSON.stringify(state)); } catch (_) {}
  }

  function currentTeam() { return state.teams[state.activeTeam] || state.teams[0]; }
  function nextTeam() { return state.teams[(state.activeTeam+1)%state.teams.length] || state.teams[0]; }
  function resolveCurrentQuestions(targetState=state) {
    return targetState.currentQuestionIds
      .map(id=>QUESTION_BANK.find(question=>question.id===id))
      .filter(Boolean);
  }
  function formatTime(seconds) {
    const safe = Math.max(0,Number(seconds) || 0);
    return `${String(Math.floor(safe/60)).padStart(2,"0")}:${String(safe%60).padStart(2,"0")}`;
  }
  function scoreWord(points) {
    const safe = Math.abs(Number(points) || 0);
    const lastTwo = safe % 100;
    const last = safe % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return "баллов";
    if (last === 1) return "балл";
    if (last >= 2 && last <= 4) return "балла";
    return "баллов";
  }

  function scoreLabel(points) {
    return `${points} ${scoreWord(points)}`;
  }

  function tone(frequency=520,duration=.07) {
    if (!state.sound) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.035,context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime+duration);
    } catch (_) {}
  }

  function showToast(message) {
    clearTimeout(toastId);
    toastRoot.innerHTML = `<div class="toast">${safeText(message)}</div>`;
    toastId = window.setTimeout(()=>{ toastRoot.innerHTML=""; },2300);
  }

  function setSound(nextValue) {
    state.sound = nextValue;
    soundButton.setAttribute("aria-pressed",String(state.sound));
    soundButton.setAttribute("aria-label",state.sound ? "Выключить звук" : "Включить звук");
    saveState();
  }

  function stopTimer() {
    if (!timerId) return;
    clearInterval(timerId);
    timerId = 0;
  }

  function openModal(modal,closeButton) {
    modal.hidden=false;
    document.body.style.overflow="hidden";
    closeButton.focus();
  }

  function closeModal(modal,returnFocus) {
    modal.hidden=true;
    document.body.style.overflow="";
    returnFocus.focus();
  }

  function showHome() {
    stopTimer();
    state.screen="home";
    state.timerRunning=false;
    home.hidden=false;
    gameApp.hidden=true;
    saveState();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function showGame() {
    home.hidden=true;
    gameApp.hidden=false;
    renderGame();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function topbar(title) {
    return `<header class="game-topbar">
      <button class="back-button" id="backButton" type="button" aria-label="Назад">←</button>
      <div class="mini-brand"><span class="mini-mark" aria-hidden="true">ASI</span><span>${safeText(title)}</span></div>
      <button class="plain-button" id="newGameButton" type="button">Новая игра</button>
    </header>`;
  }

  function setupMarkup() {
    const allCategories = categories();
    return `${topbar("Настройка игры")}
      <section class="panel setup-card" aria-labelledby="setupTitle">
        <div class="setup-head">
          <p class="screen-kicker">Подготовьте игру</p>
          <h1 class="screen-title" id="setupTitle">Настройте партию</h1>
          <p class="screen-copy">На каждом ходу команда получает одну карточку с четырьмя вопросами.</p>
        </div>
        <div class="setting-list">
          <section class="setting">
            <div class="setting-label"><strong>Играем до</strong><span>баллов</span></div>
            <div class="choice-row">${[30,50,75,100].map(value=>`<button class="choice ${state.target===value?"selected":""}" data-target="${value}" type="button">${value}</button>`).join("")}</div>
          </section>
          <section class="setting">
            <div class="setting-label"><strong>Команды</strong><span>от 2 до 6</span></div>
            <div class="choice-row">${[2,3,4,5,6].map(value=>`<button class="choice ${state.teamCount===value?"selected":""}" data-team-count="${value}" type="button">${value}</button>`).join("")}</div>
          </section>
          <section class="setting">
            <div class="setting-label"><strong>Названия команд</strong><span>нажмите, чтобы изменить</span></div>
            <div class="team-fields">${state.teams.map((team,index)=>`
              <label class="team-field">
                <span class="team-index">${index+1}</span>
                <input data-team-name="${index}" maxlength="28" value="${safeText(team.name)}" autocomplete="off" aria-label="Название команды ${index+1}">
              </label>`).join("")}
            </div>
          </section>
          <section class="setting">
            <div class="setting-label"><strong>Время на карточку</strong><span>таймер запускается автоматически</span></div>
            <div class="choice-row">${[3,5,7].map(value=>`<button class="choice ${state.minutes===value?"selected":""}" data-minutes="${value}" type="button">${value} мин</button>`).join("")}</div>
          </section>
          <section class="setting">
            <div class="setting-label"><strong>Категории</strong><span>${state.categories.length} из ${allCategories.length}</span></div>
            <div class="category-choices">${allCategories.map(category=>`
              <button class="category-choice ${state.categories.includes(category)?"selected":""}" data-category="${safeText(category)}" type="button">${safeText(category)}</button>`).join("")}
            </div>
          </section>
        </div>
      </section>
      <div class="sticky-action"><button class="button primary" id="continueButton" type="button">Готово, к игре →</button></div>`;
  }

  function teamBoardMarkup() {
    return `<div class="team-board">${state.teams.map((team,index)=>`
      <div class="team-tile ${index===state.activeTeam?"active":""}">
        <span>${safeText(team.name)}</span><strong>${team.score}</strong>
      </div>`).join("")}</div>`;
  }

  function readyMarkup() {
    return `${topbar("Almost Said It")}
      <section class="panel ready-card" aria-labelledby="readyTitle">
        <span class="ready-badge">Ход ${state.turn+1}</span>
        <h1 id="readyTitle">${safeText(currentTeam().name)}, ваш ход</h1>
        <p>Передайте телефон активной команде. После старта откроется карточка и сразу пойдёт время.</p>
        <div class="summary-grid">
          <div class="summary-item"><strong>${state.target}</strong><span>До победы</span></div>
          <div class="summary-item"><strong>${state.teams.length}</strong><span>Команд</span></div>
          <div class="summary-item"><strong>${state.minutes}</strong><span>Минут</span></div>
          <div class="summary-item"><strong>4</strong><span>Вопроса</span></div>
        </div>
        ${teamBoardMarkup()}
        <p class="ready-note">Сейчас отвечает команда «${safeText(currentTeam().name)}». Каждый вопрос приносит от 1 до 8 баллов.</p>
        <button class="button primary" id="startRoundButton" type="button">Старт</button>
      </section>`;
  }

  function questionFaceMarkup(questions) {
    const total=cardTotal(questions);
    return `<article class="game-card question-side multi-question-face" aria-label="Сторона с вопросами">
      <div class="game-card-head">
        <span class="category">4 вопроса</span>
        <span class="difficulty">до ${scoreLabel(total)}</span>
      </div>
      <div class="question-list">${questions.map((question,index)=>`
        <section class="question-row">
          <div class="question-row-head" aria-label="${scoreLabel(question.points)}">
            <span class="question-number">${question.points}</span>
            <span class="question-points">${scoreWord(question.points)}</span>
          </div>
          <h2>${safeText(question.question)}</h2>
        </section>`).join("")}
      </div>
    </article>`;
  }

  function answerFaceMarkup(questions) {
    const total=cardTotal(questions);
    return `<article class="game-card answer-side multi-answer-face" aria-label="Сторона с ответами">
      <div class="game-card-head">
        <span class="category">Ответы</span>
        <span class="difficulty">${currentScore()} из ${scoreLabel(total)}</span>
      </div>
      <div class="answer-list">${questions.map((question,index)=>{
        const mark = state.answerMarks[question.id];
        return `<section class="answer-row">
          <div class="answer-row-head" aria-label="${scoreLabel(question.points)}">
            <span class="question-number">${question.points}</span>
            <span class="question-points">${scoreWord(question.points)}</span>
          </div>
          <p class="answer-label">Правильный ответ</p>
          <h2 class="answer-value">${safeText(question.answer)}</h2>
          <div class="answer-mark">
            <button class="${mark==="correct"?"selected correct":""}" data-mark-id="${safeText(question.id)}" data-mark="correct" type="button">Правильно ✓</button>
            <button class="${mark==="missed"?"selected missed":""}" data-mark-id="${safeText(question.id)}" data-mark="missed" type="button">Неправильно ×</button>
          </div>
        </section>`;
      }).join("")}</div>
    </article>`;
  }

  function currentScore() {
    return resolveCurrentQuestions().reduce((total,question)=>{
      return total + (state.answerMarks[question.id]==="correct" ? question.points : 0);
    },0);
  }

  function cardTotal(questions=resolveCurrentQuestions()) {
    return questions.reduce((total,question)=>total+question.points,0);
  }

  function playMarkup() {
    const questions = resolveCurrentQuestions();
    const total = state.minutes*60;
    const percent = Math.max(0,Math.min(100,state.timeLeft/total*100));
    const status = state.timeExpired ? "Время вышло" : state.timerRunning ? "Идёт" : state.flipped ? "Ответы" : "Пауза";
    const allMarked = questions.length===4 && questions.every(question=>state.answerMarks[question.id]);
    return `${topbar("Карточка команды")}
      <div class="play-header">
        <div class="score-box"><span>${safeText(currentTeam().name)}</span><strong>${currentTeam().score}</strong></div>
        <div class="round-chip">Ход ${state.turn+1}</div>
        <div class="score-box next"><span>Далее · ${safeText(nextTeam().name)}</span><strong>${nextTeam().score}</strong></div>
      </div>
      <header class="quiz-card-banner">
        <div>
          <h1>Карточка ${String(state.turn+1).padStart(2,"0")}</h1>
          <span class="card-count">4 вопроса</span>
        </div>
        <div class="timer-badge ${state.timeLeft<=30?"warning":""}" id="timerBadge" style="--timer-progress:${percent}%" aria-label="Оставшееся время">
          <span class="timer-text" id="timerText">${formatTime(state.timeLeft)}</span>
          <span class="timer-state" id="timerState">${status}</span>
        </div>
      </header>
      <div class="timer-track" aria-hidden="true">
        <div class="timer-fill ${state.timeLeft<=30?"warning":""}" id="timerFill" style="width:${percent}%"></div>
      </div>
      <div class="card-scene multi-card-scene">
        <div class="flip-card multi-flip-card ${state.flipped?"flipped":""}" id="flipCard" role="button" tabindex="0" aria-label="${state.flipped?"Показать вопросы":"Показать ответы"}">
          ${questionFaceMarkup(questions)}
          ${answerFaceMarkup(questions)}
        </div>
      </div>
      <div class="play-actions single-action">
        ${state.flipped
          ? `<button class="button primary" id="confirmScoreButton" type="button" ${allMarked?"":"disabled"}>Засчитать ${scoreLabel(currentScore())}</button>`
          : `<button class="button secondary" id="manualFlipButton" type="button">Показать ответы сейчас</button>`}
      </div>`;
  }

  function resultsMarkup() {
    const ranking=[...state.teams].sort((a,b)=>b.score-a.score);
    const winner=ranking[0];
    return `${topbar("Итоги игры")}
      <section class="panel results-card" aria-labelledby="winnerTitle">
        <div class="winner-mark" aria-hidden="true">#1</div>
        <p class="screen-kicker">Победа!</p>
        <h1 class="screen-title" id="winnerTitle">${safeText(winner.name)}</h1>
        <p class="screen-copy">Ответ действительно был прямо на языке.</p>
        <div class="victory-score"><strong>${winner.score}</strong><span>${scoreWord(winner.score)}</span></div>
        <div class="ranking">${ranking.map((team,index)=>`
          <div class="ranking-row"><span>${index+1}</span><strong>${safeText(team.name)}</strong><strong>${team.score} баллов</strong></div>`).join("")}</div>
        <div class="actions">
          <button class="button primary" id="rematchButton" type="button">Сыграть ещё раз</button>
          <button class="button secondary" id="changeSetupButton" type="button">Изменить настройки</button>
        </div>
      </section>`;
  }

  function renderGame() {
    stopTimer();
    gameApp.dataset.screen = state.screen;
    gameRoot.innerHTML =
      state.screen==="setup" ? setupMarkup() :
      state.screen==="ready" ? readyMarkup() :
      state.screen==="play" ? playMarkup() :
      state.screen==="results" ? resultsMarkup() : setupMarkup();
    bindGameEvents();
    if (state.timerRunning && state.screen==="play") startTimerLoop();
    saveState();
  }

  function setTeamCount(count) {
    state.teamCount=count;
    state.teams=Array.from({length:count},(_,index)=>state.teams[index] || {
      id:index+1,name:TEAM_NAMES[index],score:0
    });
    renderGame();
  }

  function beginGame() {
    state.teams=state.teams.map((team,index)=>({
      ...team,
      name:(team.name || `Команда ${index+1}`).trim().slice(0,28) || `Команда ${index+1}`,
      score:0
    }));
    state.activeTeam=0;
    state.turn=0;
    prepareFreshDeck();
    state.currentQuestionIds=[];
    state.answerMarks={};
    state.screen="ready";
    renderGame();
  }

  function randomIndex(maxExclusive) {
    if (maxExclusive<=1) return 0;
    const cryptoApi=window.crypto;
    if (!cryptoApi?.getRandomValues) return Math.floor(Math.random()*maxExclusive);
    const range=0x100000000;
    const limit=range-(range%maxExclusive);
    const values=new Uint32Array(1);
    do cryptoApi.getRandomValues(values); while (values[0]>=limit);
    return values[0]%maxExclusive;
  }

  function shuffle(items) {
    const copy=[...items];
    for (let index=copy.length-1; index>0; index-=1) {
      const target=randomIndex(index+1);
      [copy[index],copy[target]]=[copy[target],copy[index]];
    }
    return copy;
  }

  function selectedQuestionIds() {
    const selectedCategories=state.categories.length ? state.categories : categories();
    return QUESTION_BANK
      .filter(question=>selectedCategories.includes(question.category))
      .map(question=>question.id);
  }

  function sameOrder(first,second) {
    return first.length===second.length && first.every((id,index)=>id===second[index]);
  }

  function loadLastDeck() {
    try {
      const saved=JSON.parse(localStorage.getItem(LAST_DECK_STORE));
      return Array.isArray(saved) ? saved : [];
    } catch (_) {
      return [];
    }
  }

  function prepareFreshDeck({remember=true}={}) {
    const previous=loadLastDeck();
    const next=shuffle(selectedQuestionIds());
    if (next.length>1 && sameOrder(next,previous)) {
      [next[0],next[1]]=[next[1],next[0]];
    }
    state.questionOrder=next;
    state.questionCursor=0;
    if (remember) {
      try { localStorage.setItem(LAST_DECK_STORE,JSON.stringify(next)); } catch (_) {}
    }
  }

  function drawQuestionCard() {
    const eligibleIds=selectedQuestionIds();
    if (eligibleIds.length<4) {
      showToast("В выбранных категориях должно быть минимум четыре вопроса.");
      return;
    }

    const eligibleSet=new Set(eligibleIds);
    const remaining=state.questionOrder
      .slice(state.questionCursor)
      .filter(id=>eligibleSet.has(id));
    if (remaining.length<4) {
      const currentSet=new Set(state.currentQuestionIds);
      prepareFreshDeck({remember:false});
      if (state.questionOrder.length>4 && currentSet.size) {
        state.questionOrder=[
          ...state.questionOrder.filter(id=>!currentSet.has(id)),
          ...state.questionOrder.filter(id=>currentSet.has(id))
        ];
      }
    }

    state.currentQuestionIds=state.questionOrder.slice(state.questionCursor,state.questionCursor+4);
    state.questionCursor+=4;
    state.answerMarks={};
    state.timeLeft=state.minutes*60;
    state.timerRunning=true;
    state.timeExpired=false;
    state.flipped=false;
    state.screen="play";
    tone(480);
    renderGame();
  }

  function flipCard({expired=false}={}) {
    if (state.screen!=="play") return;
    state.flipped=!state.flipped;
    if (state.flipped) {
      state.timerRunning=false;
      state.timeExpired=state.timeExpired || expired;
      stopTimer();
      tone(expired?230:620,.1);
    }
    renderGame();
  }

  function markAnswer(questionId,mark) {
    state.answerMarks[questionId]=mark;
    renderGame();
  }

  function confirmScore() {
    const questions=resolveCurrentQuestions();
    if (!questions.every(question=>state.answerMarks[question.id])) {
      showToast("Отметьте каждый ответ: «Правильно» или «Неправильно».");
      return;
    }
    const points=currentScore();
    const teamName=currentTeam().name;
    state.teams[state.activeTeam].score+=points;
    if (state.teams[state.activeTeam].score>=state.target) {
      state.screen="results";
      renderGame();
      showToast(`Команда «${teamName}» набирает ${state.teams[state.activeTeam].score} баллов!`);
      return;
    }
    state.activeTeam=(state.activeTeam+1)%state.teams.length;
    state.turn+=1;
    state.currentQuestionIds=[];
    state.answerMarks={};
    state.flipped=false;
    state.timeExpired=false;
    state.screen="ready";
    renderGame();
    showToast(`Команда «${teamName}» получает ${points} баллов.`);
  }

  function startTimerLoop() {
    stopTimer();
    const startedAt=performance.now();
    const startingSeconds=Math.max(0,state.timeLeft);
    let lastSavedSecond=state.timeLeft;
    timerId=window.setInterval(()=>{
      if (!state.timerRunning || state.screen!=="play") return stopTimer();
      const elapsedSeconds=(performance.now()-startedAt)/1000;
      const exactRemaining=Math.max(0,startingSeconds-elapsedSeconds);
      state.timeLeft=Math.ceil(exactRemaining);
      const percent=Math.max(0,exactRemaining/(state.minutes*60)*100);
      const text=document.getElementById("timerText");
      const fill=document.getElementById("timerFill");
      const badge=document.getElementById("timerBadge");
      if (text) text.textContent=formatTime(state.timeLeft);
      if (fill) {
        fill.style.width=`${percent}%`;
        fill.classList.toggle("warning",state.timeLeft<=30);
      }
      if (badge) {
        badge.style.setProperty("--timer-progress",`${percent}%`);
        badge.classList.toggle("warning",state.timeLeft<=30);
      }
      if (exactRemaining<=0) {
        state.timerRunning=false;
        state.timeExpired=true;
        state.flipped=true;
        stopTimer();
        renderGame();
        showToast("Время вышло. Карточка перевёрнута — отметьте ответы.");
      } else if (state.timeLeft%10===0 && state.timeLeft!==lastSavedSecond) {
        lastSavedSecond=state.timeLeft;
        saveState();
      }
    },100);
  }

  function resetToSetup() {
    const keepSound=state.sound;
    state=freshState();
    state.sound=keepSound;
    state.screen="setup";
    renderGame();
  }

  function rematch() {
    state.teams=state.teams.map(team=>({...team,score:0}));
    state.activeTeam=0;
    state.turn=0;
    prepareFreshDeck();
    state.currentQuestionIds=[];
    state.answerMarks={};
    state.screen="ready";
    renderGame();
  }

  async function refreshRemoteBase() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const response=await fetch("./questions.json",{cache:"no-store"});
      if (!response.ok) return;
      const incoming=normalizeQuestions(await response.json());
      if (!incoming.length) return;
      QUESTION_BANK=incoming;
      const available=categories();
      state.categories=state.categories.filter(category=>available.includes(category));
      if (!state.categories.length) state.categories=available;
      saveState();
      if (state.screen==="setup") renderGame();
    } catch (_) {}
  }

  function bindGameEvents() {
    const on=(id,event,handler)=>{
      const element=document.getElementById(id);
      if (element) element.addEventListener(event,handler);
    };
    on("backButton","click",()=>{
      if (state.screen==="setup") showHome();
      else if (state.screen==="play") {
        state.timerRunning=false;
        state.screen="ready";
        renderGame();
      } else {
        state.screen="setup";
        renderGame();
      }
    });
    on("newGameButton","click",resetToSetup);
    on("continueButton","click",beginGame);
    on("startRoundButton","click",drawQuestionCard);
    on("manualFlipButton","click",()=>flipCard());
    on("confirmScoreButton","click",confirmScore);
    on("rematchButton","click",rematch);
    on("changeSetupButton","click",resetToSetup);
    document.querySelectorAll("[data-team-count]").forEach(button=>button.addEventListener("click",()=>setTeamCount(Number(button.dataset.teamCount))));
    document.querySelectorAll("[data-target]").forEach(button=>button.addEventListener("click",()=>{state.target=Number(button.dataset.target);renderGame()}));
    document.querySelectorAll("[data-minutes]").forEach(button=>button.addEventListener("click",()=>{state.minutes=Number(button.dataset.minutes);state.timeLeft=state.minutes*60;renderGame()}));
    document.querySelectorAll("[data-category]").forEach(button=>button.addEventListener("click",()=>{
      const category=button.dataset.category;
      if (state.categories.includes(category)) {
        if (state.categories.length===1) return showToast("Оставьте хотя бы одну категорию.");
        state.categories=state.categories.filter(item=>item!==category);
      } else {
        state.categories.push(category);
      }
      renderGame();
    }));
    document.querySelectorAll("[data-team-name]").forEach(input=>input.addEventListener("input",()=>{
      const index=Number(input.dataset.teamName);
      state.teams[index].name=input.value.slice(0,28);
      saveState();
    }));
    document.querySelectorAll("[data-mark-id]").forEach(button=>button.addEventListener("click",event=>{
      event.stopPropagation();
      markAnswer(button.dataset.markId,button.dataset.mark);
    }));

    const flip=document.getElementById("flipCard");
    if (flip) {
      flip.addEventListener("click",event=>{
        if (event.target.closest("button,details,summary")) return;
        flipCard();
      });
      flip.addEventListener("keydown",event=>{
        if ((event.key==="Enter" || event.key===" ") && !event.target.closest("button,summary")) {
          event.preventDefault();
          flipCard();
        }
      });
    }
  }

  setSound(state.sound);
  soundButton.addEventListener("click",()=>{setSound(!state.sound);tone(560)});
  howButton.addEventListener("click",()=>openModal(howModal,closeHow));
  closeHow.addEventListener("click",()=>closeModal(howModal,howButton));
  howModal.addEventListener("click",event=>{if (event.target===howModal)closeModal(howModal,howButton)});
  startButton.addEventListener("click",()=>{state.screen="setup";showGame()});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!howModal.hidden)closeModal(howModal,howButton)});
  window.addEventListener("beforeunload",saveState);
  document.addEventListener("visibilitychange",()=>{
    if (!document.hidden) return;
    state.timerRunning=false;
    stopTimer();
    saveState();
  });

  if (state.screen!=="home") showGame();
  else showHome();
  refreshRemoteBase();
})();

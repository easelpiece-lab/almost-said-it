(() => {
  "use strict";

  const STORE = "almost-said-it-bold-v13";
  let language = "ru";
  try { language = localStorage.getItem("almost-said-it-language") === "en" ? "en" : "ru"; } catch (_) {}
  const translate = text => window.ASI_I18N.translate(text,language);
  const stateKey = () => `${STORE}-${language}`;
  const banks = { ru: window.ASI_QUESTION_BANK || [], en: window.ASI_QUESTION_BANK_EN || [] };
  const EN_TEAM_NAMES = ["Almost Geniuses","Brainstormers","No Googling","Last Neurons","Pure Guesswork","Tip of the Tongue","Quiz Happens","Think Again","Mind the Gap","Final Answer","Lucky Guess","Know It All","Memory Loading","Fact Finders","Plot Twist","Smart Cookies","The Brain Trust","Close Enough","Trivia Titans","Just Remembered","Question Marks","On a Roll","Team Maybe","Common Sense"];
  const LAST_DECK_STORE = "almost-said-it-last-deck-v1";
  const TEAM_NAMES = [
    "База знаний","Мимо кассы","Гении на минималках","Чисто интуиция",
    "Факты в чате","Последние нейроны","Слишком умные","Думали недолго",
    "Ответ на подходе","Без понятия","Мозги онлайн","Знали, но забыли",
    "Случайный успех","Это база","Коллективный разум","Почти эксперты",
    "Вайб эрудиции","Главные герои","Пруфы будут","Шум в голове",
    "На опыте","Четыре извилины","Умный ход","Кринж-контроль",
    "Точно знаем","Проверим теорию","Логика вышла","Гугл запрещён",
    "Фактчекеры","Вопрос закрыт","Версия есть","Дайте подумать",
    "Сейчас вспомним","Не душните","Мемологи","Культурный код",
    "Скрытый потенциал","Ответили красиво","Без спойлеров","Мозговой Wi-Fi",
    "Легенды квиза","Теория всего","Финальный ответ","Зумеры знают",
    "Турбоэрудиция","Ум в аренду","Нормально делай","Сигма-мыслители"
  ];
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

  let QUESTION_BANK = normalizeQuestions(banks[language]);

  function categories() {
    return [...new Set(QUESTION_BANK.map(question=>question.category))].sort((a,b)=>a.localeCompare(b,"ru"));
  }

  function randomTeamNames(count,excluded=[]) {
    const blocked=new Set(excluded.map(name=>String(name || "").trim()));
    let candidates=shuffle((language === "en" ? EN_TEAM_NAMES : TEAM_NAMES).filter(name=>!blocked.has(name)));
    if (candidates.length<count) candidates=shuffle(language === "en" ? EN_TEAM_NAMES : TEAM_NAMES);
    return candidates.slice(0,count);
  }

  function freshState() {
    const names=randomTeamNames(2);
    return {
      screen:"home",
      target:30,
      teamCount:2,
      minutes:3,
      teams:names.map((name,index)=>({id:index+1,name,score:0})),
      activeTeam:0,
      turn:0,
      questionOrder:[],
      questionCursor:0,
      currentQuestionIds:[],
      timeLeft:180,
      timerRunning:false,
      timerEndsAt:0,
      timeExpired:false,
      flipped:false,
      answerIndex:0,
      answerMarks:{},
      sound:false,
      categories:categories()
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(stateKey()));
      if (!saved || !Array.isArray(saved.teams)) return freshState();
      const base = freshState();
      const merged = {...base,...saved};
      merged.timerRunning = Boolean(saved.timerRunning && Number(saved.timerEndsAt)>0);
      merged.timerEndsAt = merged.timerRunning ? Number(saved.timerEndsAt) : 0;
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
      merged.answerIndex = Math.max(0,Math.min(3,Number(saved.answerIndex) || 0));
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
    try { localStorage.setItem(stateKey(),JSON.stringify(state)); } catch (_) {}
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
    if (language === "en") return Number(points) === 1 ? "point" : "points";
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
    toastRoot.innerHTML = `<div class="toast">${safeText(translate(message))}</div>`;
    toastId = window.setTimeout(()=>{ toastRoot.innerHTML=""; },2300);
  }

  function setSound(nextValue) {
    state.sound = nextValue;
    soundButton.setAttribute("aria-pressed",String(state.sound));
    soundButton.setAttribute("aria-label",translate(state.sound ? "Выключить звук" : "Включить звук"));
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
    state.timerEndsAt=0;
    home.hidden=false;
    document.body.dataset.screen="home";
    updateLanguageUi();
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
      <button class="back-button menu-home-button" id="homeMenuButton" type="button" aria-label="Вернуться в главное меню" title="В меню">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11.2 12 4l9 7.2"></path>
          <path d="M5.8 10.2V20h12.4v-9.8"></path>
          <path d="M9.6 20v-5.8h4.8V20"></path>
        </svg>
      </button>
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
            <div class="choice-row">${[30,50,75,100].map(value=>`<button class="choice ${state.target===value?"selected":""}" data-target="${value}" type="button" aria-pressed="${state.target===value}">${value}</button>`).join("")}</div>
          </section>
          <section class="setting">
            <div class="setting-label"><strong>Команды</strong><span>от 2 до 6</span></div>
            <div class="choice-row">${[2,3,4,5,6].map(value=>`<button class="choice ${state.teamCount===value?"selected":""}" data-team-count="${value}" type="button" aria-pressed="${state.teamCount===value}">${value}</button>`).join("")}</div>
          </section>
          <section class="setting">
            <div class="setting-label team-name-label">
              <div><strong>Названия команд</strong><span>можно изменить вручную</span></div>
              <button class="randomize-teams" id="randomizeTeamNamesButton" type="button" aria-label="Сгенерировать новые названия команд">↻ Другие</button>
            </div>
            <div class="team-fields">${state.teams.map((team,index)=>`
              <label class="team-field">
                <span class="team-index">${index+1}</span>
                <input data-team-name="${index}" maxlength="28" value="${safeText(team.name)}" autocomplete="off" aria-label="Название команды ${index+1}">
              </label>`).join("")}
            </div>
          </section>
          <section class="setting">
            <div class="setting-label"><strong>Время на карточку</strong><span>таймер запускается автоматически</span></div>
            <div class="choice-row">${[3,5,7].map(value=>`<button class="choice ${state.minutes===value?"selected":""}" data-minutes="${value}" type="button" aria-pressed="${state.minutes===value}">${value} мин</button>`).join("")}</div>
          </section>
          <section class="setting">
            <div class="setting-label"><strong>Категории</strong><span class="category-count">${state.categories.length} из ${allCategories.length}</span></div>
            <div class="category-choices">${allCategories.map(category=>`
              <button class="category-choice ${state.categories.includes(category)?"selected":""}" data-category="${safeText(category)}" type="button" aria-pressed="${state.categories.includes(category)}">${safeText(category)}</button>`).join("")}
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
        <span class="ready-phone-turn" aria-hidden="true">${state.turn+1}</span>
        <span class="ready-badge">Ход ${state.turn+1}</span>
        <h1 id="readyTitle">${safeText(currentTeam().name)}, ваш ход</h1>
        <p>Передайте телефон активной команде. Нажмите «Начать раунд»: откроются четыре вопроса и запустится таймер.</p>
        <div class="summary-grid">
          <div class="summary-item"><strong>${state.target}</strong><span>До победы</span></div>
          <div class="summary-item"><strong>${state.teams.length}</strong><span>Команд</span></div>
          <div class="summary-item"><strong>${state.minutes}</strong><span>Минут</span></div>
          <div class="summary-item"><strong>4</strong><span>Вопроса</span></div>
        </div>
        ${teamBoardMarkup()}
        <p class="ready-note">Каждый вопрос приносит от 1 до 8 баллов.</p>
        <button class="button primary ready-start-button" id="startRoundButton" type="button">Начать раунд →</button>
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
    return `<article class="game-card answer-side multi-answer-face" aria-label="Сторона с ответами">
      <div class="answer-list full-answer-list">${questions.map(question=>{
        const mark=state.answerMarks[question.id] || "";
        return `<section class="answer-row ${mark?`marked ${mark}`:""}">
          <div class="answer-row-head" aria-label="${scoreLabel(question.points)}">
            <span class="question-number">${question.points}</span>
            <span class="question-points">${scoreWord(question.points)}</span>
          </div>
          <h2 class="answer-value">${safeText(question.answer)}</h2>
          ${question.acceptedAnswers.filter(value=>value.toLocaleLowerCase()!==question.answer.toLocaleLowerCase()).length ? `<p class="answer-alias">${language==="en"?"Also accepted":"Допустимо"}: ${safeText(question.acceptedAnswers.filter(value=>value.toLocaleLowerCase()!==question.answer.toLocaleLowerCase()).slice(0,2).join(" · "))}</p>` : ""}
          <div class="answer-mark">
            <button class="${mark==="correct"?"selected correct":""}" data-mark-id="${safeText(question.id)}" data-mark="correct" type="button" aria-pressed="${mark==="correct"}">Правильно ✓</button>
            <button class="${mark==="missed"?"selected missed":""}" data-mark-id="${safeText(question.id)}" data-mark="missed" type="button" aria-pressed="${mark==="missed"}">Неправильно ×</button>
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
    const markedCount = questions.filter(question=>state.answerMarks[question.id]).length;
    const hasMarked = markedCount===4;
    return `${topbar("Карточка команды")}
      <div class="play-header">
        <div class="score-box"><span>${safeText(currentTeam().name)}</span><strong>${currentTeam().score}</strong></div>
        <div class="round-chip">Ход ${state.turn+1}</div>
        <div class="score-box next"><span>Далее · ${safeText(nextTeam().name)}</span><strong>${nextTeam().score}</strong></div>
      </div>
      <header class="quiz-card-banner">
        <button class="exit-home-button menu-home-button" id="exitHomeButton" type="button" aria-label="Вернуться в главное меню" title="В меню">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 11.2 12 4l9 7.2"></path>
            <path d="M5.8 10.2V20h12.4v-9.8"></path>
            <path d="M9.6 20v-5.8h4.8V20"></path>
          </svg>
        </button>
        <div class="quiz-card-copy">
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
        <div class="flip-card multi-flip-card ${state.flipped?"flipped":""}" id="flipCard" aria-live="polite">
          ${questionFaceMarkup(questions)}
          ${answerFaceMarkup(questions)}
        </div>
      </div>
      <div class="play-actions ${state.flipped?"answer-actions":"single-action"}">
        ${state.flipped
          ? `<button class="button secondary answer-back-button" id="returnQuestionsButton" type="button"><span class="answer-back-icon" aria-hidden="true">↓</span><span>К вопросам</span></button>
             <button class="button primary" id="confirmScoreButton" type="button" ${hasMarked?"":"disabled"}>${hasMarked?`Засчитать ${scoreLabel(currentScore())} →`:"Отметьте все ответы"}</button>`
          : `<button class="button secondary" id="manualFlipButton" type="button">Показать ответы ↓</button>`}
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
    const keepTimerRunning=Boolean(
      timerId && state.timerRunning && state.screen==="play"
    );
    if (!keepTimerRunning) stopTimer();
    gameApp.dataset.screen = state.screen;
    document.body.dataset.screen=state.screen;
    gameRoot.innerHTML =
      state.screen==="setup" ? setupMarkup() :
      state.screen==="ready" ? readyMarkup() :
      state.screen==="play" ? playMarkup() :
      state.screen==="results" ? resultsMarkup() : setupMarkup();
    window.ASI_I18N.apply(gameRoot,language);
    updateLanguageUi();
    updateCardAccessibility();
    bindGameEvents();
    if (state.timerRunning && state.screen==="play" && !timerId) startTimerLoop();
    saveState();
  }

  function setTeamCount(count) {
    state.teamCount=count;
    const missing=Math.max(0,count-state.teams.length);
    const additions=randomTeamNames(missing,state.teams.map(team=>team.name));
    state.teams=Array.from({length:count},(_,index)=>state.teams[index] || {
      id:index+1,name:additions[index-state.teams.length],score:0
    });
    renderGame();
  }

  function randomizeTeamNames({render=true}={}) {
    const names=randomTeamNames(state.teams.length,state.teams.map(team=>team.name));
    state.teams=state.teams.map((team,index)=>({...team,name:names[index]}));
    if (render) renderGame();
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
    state.answerIndex=0;
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
    if (state.screen!=="ready") return;
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
    state.answerIndex=0;
    state.timeLeft=state.minutes*60;
    state.timerRunning=true;
    state.timerEndsAt=Date.now()+state.timeLeft*1000;
    state.timeExpired=false;
    state.flipped=false;
    state.screen="play";
    tone(480);
    renderGame();
  }

  function flipCard() {
    if (state.screen!=="play") return;
    state.flipped=!state.flipped;
    tone(state.flipped?620:520,.08);
    const card=document.getElementById("flipCard");
    card.classList.toggle("flipped",state.flipped);
    updateCardAccessibility();
    const fresh=document.createElement("div");
    fresh.innerHTML=playMarkup();
    document.querySelector(".play-actions").replaceWith(fresh.querySelector(".play-actions"));
    window.ASI_I18N.apply(gameRoot,language);
    bindPlayActions();
    document.getElementById(state.flipped?"returnQuestionsButton":"manualFlipButton")?.focus({preventScroll:true});
    saveState();
  }

  function markAnswer(questionId,mark) {
    if (state.screen!=="play" || !state.flipped || !["correct","missed"].includes(mark) || !state.currentQuestionIds.includes(questionId)) return;
    state.answerMarks[questionId]=mark;
    tone(mark==="correct"?720:310,.07);
    // Keep the card and focused button in place when checking an answer.
    document.querySelectorAll(`[data-mark-id="${questionId}"]`).forEach(button=>{
      const selected=button.dataset.mark===mark;
      button.classList.toggle("selected",selected);
      button.classList.toggle("correct",selected && mark==="correct");
      button.classList.toggle("missed",selected && mark==="missed");
      button.setAttribute("aria-pressed",String(selected));
      const row=button.closest(".answer-row");
      row.classList.add("marked");
      row.classList.toggle("correct",mark==="correct");
      row.classList.toggle("missed",mark==="missed");
    });
    const complete=resolveCurrentQuestions().every(question=>state.answerMarks[question.id]);
    const confirm=document.getElementById("confirmScoreButton");
    confirm.disabled=!complete;
    confirm.textContent=translate(complete ? `Засчитать ${scoreLabel(currentScore())} →` : "Отметьте все ответы");
    saveState();
  }

  function confirmScore() {
    const questions=resolveCurrentQuestions();
    if (state.screen!=="play" || !state.flipped || questions.length!==4 || !questions.every(question=>state.answerMarks[question.id])) {
      showToast("Отметьте все четыре ответа.");
      return;
    }
    const points=currentScore();
    const teamName=currentTeam().name;
    state.timerRunning=false;
    state.timerEndsAt=0;
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
    state.answerIndex=0;
    state.flipped=false;
    state.timeExpired=false;
    state.screen="ready";
    renderGame();
    showToast(`Команда «${teamName}» получает ${points} баллов.`);
  }

  function startTimerLoop() {
    stopTimer();
    if (!Number.isFinite(state.timerEndsAt) || state.timerEndsAt<=0) {
      state.timerEndsAt=Date.now()+Math.max(0,state.timeLeft)*1000;
    }
    let lastSavedSecond=state.timeLeft;
    timerId=window.setInterval(()=>{
      if (!state.timerRunning || state.screen!=="play") return stopTimer();
      const exactRemaining=Math.max(0,(state.timerEndsAt-Date.now())/1000);
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
        state.timerEndsAt=0;
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
    state.answerIndex=0;
    state.screen="ready";
    renderGame();
  }

  async function refreshRemoteBase() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const requestedLanguage=language;
      const response=await fetch(language === "en" ? "./questions-en.json" : "./questions.json",{cache:"no-store"});
      if (!response.ok) return;
      const data=await response.json();
      if (requestedLanguage!==language || data.version<5 || data.language!==language || !["home","setup"].includes(state.screen)) return;
      const incoming=normalizeQuestions(data);
      if (!incoming.length) return;
      banks[language]=incoming;
      QUESTION_BANK=incoming;
      updateLanguageUi();
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
    on("homeMenuButton","click",showHome);
    on("newGameButton","click",resetToSetup);
    on("exitHomeButton","click",showHome);
    on("randomizeTeamNamesButton","click",()=>randomizeTeamNames());
    on("continueButton","click",beginGame);
    on("manualFlipButton","click",()=>flipCard());
    on("returnQuestionsButton","click",()=>flipCard());
    on("confirmScoreButton","click",confirmScore);
    on("rematchButton","click",rematch);
    on("changeSetupButton","click",resetToSetup);
    document.querySelectorAll("[data-team-count]").forEach(button=>button.addEventListener("click",()=>setTeamCount(Number(button.dataset.teamCount))));
    document.querySelectorAll("[data-target]").forEach(button=>button.addEventListener("click",()=>{state.target=Number(button.dataset.target);updateChoiceGroup("target",state.target);saveState()}));
    document.querySelectorAll("[data-minutes]").forEach(button=>button.addEventListener("click",()=>{state.minutes=Number(button.dataset.minutes);state.timeLeft=state.minutes*60;updateChoiceGroup("minutes",state.minutes);saveState()}));
    document.querySelectorAll("[data-category]").forEach(button=>button.addEventListener("click",()=>{
      const category=button.dataset.category;
      if (state.categories.includes(category)) {
        if (state.categories.length===1) return showToast("Оставьте хотя бы одну категорию.");
        state.categories=state.categories.filter(item=>item!==category);
      } else {
        state.categories.push(category);
      }
      document.querySelectorAll("[data-category]").forEach(item=>{
        const selected=state.categories.includes(item.dataset.category);
        item.classList.toggle("selected",selected);
        item.setAttribute("aria-pressed",String(selected));
      });
      document.querySelector(".category-count").textContent=translate(`${state.categories.length} из ${categories().length}`);
      saveState();
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

    on("startRoundButton","click",drawQuestionCard);
  }

  function updateChoiceGroup(key,value) {
    document.querySelectorAll(`[data-${key}]`).forEach(button=>{
      const selected=Number(button.dataset[key])===value;
      button.classList.toggle("selected",selected);
      button.setAttribute("aria-pressed",String(selected));
    });
  }

  function updateCardAccessibility() {
    const questionSide=document.querySelector(".question-side");
    const answerSide=document.querySelector(".answer-side");
    if (!questionSide || !answerSide) return;
    questionSide.inert=state.flipped;
    answerSide.inert=!state.flipped;
    questionSide.setAttribute("aria-hidden",String(state.flipped));
    answerSide.setAttribute("aria-hidden",String(!state.flipped));
  }

  function bindPlayActions() {
    document.getElementById("manualFlipButton")?.addEventListener("click",flipCard);
    document.getElementById("returnQuestionsButton")?.addEventListener("click",flipCard);
    document.getElementById("confirmScoreButton")?.addEventListener("click",confirmScore);
  }

  function updateLanguageUi() {
    document.documentElement.lang=language;
    document.title=language==="en"?"Almost Said It — team trivia":"Вертится на языке — Almost Said It";
    document.getElementById("languageSwitch").hidden=!["home","setup"].includes(state.screen);
    document.querySelectorAll("[data-language]").forEach(button=>{
      button.setAttribute("aria-pressed",String(button.dataset.language===language));
      button.classList.toggle("selected",button.dataset.language===language);
    });
    window.ASI_I18N.apply(home,language);
    window.ASI_I18N.apply(howModal,language);
    const note=home.querySelector(".desktop-note");
    note.textContent=language==="en"?`${QUESTION_BANK.length} questions · a fresh deck every game`:`${QUESTION_BANK.length} вопросов · новая колода в каждой игре`;
  }

  document.querySelectorAll("[data-language]").forEach(button=>button.addEventListener("click",()=>{
    if (button.dataset.language===language || !["home","setup"].includes(state.screen)) return;
    saveState();
    const screen=state.screen;
    language=button.dataset.language;
    try { localStorage.setItem("almost-said-it-language",language); } catch (_) {}
    QUESTION_BANK=normalizeQuestions(banks[language]);
    state=loadState();
    // Language is chosen before a game; never mix two banks in a running deck.
    state.screen=screen;
    state.timerRunning=false;
    state.timerEndsAt=0;
    updateLanguageUi();
    if (screen==="setup") renderGame();
    saveState();
    refreshRemoteBase();
  }));

  setSound(state.sound);
  soundButton.addEventListener("click",()=>{setSound(!state.sound);tone(560)});
  howButton.addEventListener("click",()=>openModal(howModal,closeHow));
  closeHow.addEventListener("click",()=>closeModal(howModal,howButton));
  howModal.addEventListener("click",event=>{if (event.target===howModal)closeModal(howModal,howButton)});
  startButton.addEventListener("click",()=>{
    state.screen="setup";
    randomizeTeamNames({render:false});
    showGame();
  });
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!howModal.hidden)closeModal(howModal,howButton)});
  window.addEventListener("beforeunload",saveState);
  document.addEventListener("visibilitychange",()=>{
    if (!document.hidden) return;
    saveState();
  });

  if (state.screen!=="home") showGame();
  else showHome();
  refreshRemoteBase();
})();


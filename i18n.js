(() => {
  "use strict";
  const translations = {
    "Перейти к содержанию":"Skip to content",
    "Главная Almost Said It":"Almost Said It home",
    "Игра Almost Said It":"Almost Said It game",
    "Ответ вертится на языке":"You know it. Almost.",
    "Начать игру →":"Start game →",
    "Правила игры":"How to play",
    "Без регистрации · Один телефон · Играют все":"No sign-up · One phone · Everyone plays",
    "Как играть":"How to play",
    "Один телефон. Три шага.":"One phone. Three steps.",
    "Закрыть":"Close",
    "Вытяните карточку":"Start a round",
    "Передайте телефон активной команде и нажмите «Начать раунд».":"Pass the phone to the active team and tap Start round.",
    "Ответьте на четыре вопроса":"Answer four questions",
    "На лицевой стороне нет вариантов и подсказок. За каждый вопрос можно получить от 1 до 8 баллов.":"No multiple choice or hints. Each question is worth 1–8 points.",
    "Переверните и оцените":"Reveal and score",
    "Откройте четыре ответа, отметьте результат и передайте телефон следующей команде.":"Reveal the answers, mark all four results and pass the phone to the next team.",
    "Вернуться в главное меню":"Return to the main menu",
    "В меню":"Main menu",
    "Новая игра":"New game",
    "Настройка игры":"Game setup",
    "Подготовьте игру":"Get ready",
    "Настройте партию":"Set up your game",
    "На каждом ходу команда получает одну карточку с четырьмя вопросами.":"Each turn gives your team a card with four questions.",
    "Играем до":"Target score",
    "баллов":"points",
    "Команды":"Teams",
    "от 2 до 6":"2 to 6",
    "Названия команд":"Team names",
    "можно изменить вручную":"make them your own",
    "Сгенерировать новые названия команд":"Generate new team names",
    "↻ Другие":"↻ Shuffle names",
    "Время на карточку":"Time per card",
    "таймер запускается автоматически":"starts when you open the card",
    "Категории":"Categories",
    "Готово, к игре →":"Ready to play →",
    "До победы":"Target score",
    "Команд":"Teams",
    "Минут":"Minutes",
    "Вопроса":"Questions",
    "Начать раунд →":"Start round →",
    "Передайте телефон активной команде. Нажмите «Начать раунд»: откроются четыре вопроса и запустится таймер.":"Pass the phone to the active team. Tap Start round to reveal four questions and start the timer.",
    "Каждый вопрос приносит от 1 до 8 баллов.":"Each question is worth 1–8 points.",
    "Сторона с вопросами":"Question side",
    "Сторона с ответами":"Answer side",
    "4 вопроса":"4 questions",
    "Правильно ✓":"Correct ✓",
    "Неправильно ×":"Incorrect ×",
    "Правильный ответ":"Answer",
    "Время вышло":"Time's up",
    "Идёт":"Running",
    "Ответы":"Answers",
    "Пауза":"Paused",
    "Карточка команды":"Team card",
    "Оставшееся время":"Time remaining",
    "К вопросам":"Questions",
    "Отметьте все ответы":"Mark all answers",
    "Показать ответы ↓":"Show answers ↓",
    "Итоги игры":"Results",
    "Победа!":"You won!",
    "Ответ действительно был прямо на языке.":"You had the answers all along.",
    "Сыграть ещё раз":"Play again",
    "Изменить настройки":"Change settings",
    "Отметьте все четыре ответа.":"Mark all four answers.",
    "Время вышло. Карточка перевёрнута — отметьте ответы.":"Time's up. Answers revealed — mark the results.",
    "Оставьте хотя бы одну категорию.":"Keep at least one category selected.",
    "В выбранных категориях должно быть минимум четыре вопроса.":"Choose categories with at least four questions.",
    "Включить звук":"Enable sound",
    "Выключить звук":"Disable sound",
    "Биология":"Biology",
    "География":"Geography",
    "История":"History",
    "Логика":"Logic",
    "Математика":"Maths",
    "Общие знания":"General knowledge",
    "Поп-культура":"Pop culture"
  };
  const originalTexts = new WeakMap();
  const originalAttributes = new WeakMap();
  function translate(text, language) {
    if (language !== "en") return text;
    const clean = text.trim().replace(/\s+/g," ");
    let value = translations[clean];
    if (value === undefined) {
      value = clean
        .replace(/^(\d+) мин$/, "$1 min")
        .replace(/^(\d+) из (\d+)$/, "$1 of $2")
        .replace(/^Название команды (\d+)$/, "Team $1 name")
        .replace(/^Ход (\d+)$/, "Turn $1")
        .replace(/^Карточка (\d+)$/, "Card $1")
        .replace(/^Далее · /, "Next · ")
        .replace(/^(.+), ваш ход$/, "$1, you're up")
        .replace(/^Засчитать (.+) →$/, "Score $1 →")
        .replace(/^(\d+) баллов$/, "$1 points")
        .replace(/^до (.+)$/, "up to $1")
        .replace(/^Команда «(.+)» получает (\d+) баллов\.$/, "$1 scores $2 points.")
        .replace(/^Команда «(.+)» набирает (\d+) баллов!$/, "$1 wins with $2 points!")
        .replace(/^Допустимо: /,"Also accepted: ")
        .replace(/^Отмечено: (\d+) из 4$/, "Marked: $1 of 4");
    }
    return text.replace(text.trim(),value);
  }
  function apply(root, language) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    for (let node=walker.nextNode();node;node=walker.nextNode()) {
      if (node.parentElement.closest("script,style,.question-row h2,.answer-value,.answer-alias,.team-tile span,.score-box span,.ranking-row strong")) continue;
      if (!originalTexts.has(node)) originalTexts.set(node,node.nodeValue);
      node.nodeValue=translate(originalTexts.get(node),language);
    }
    root.querySelectorAll("[aria-label],[title]").forEach(element=>{
      if (!originalAttributes.has(element)) {
        originalAttributes.set(element,{"aria-label":element.getAttribute("aria-label"),title:element.getAttribute("title")});
      }
      for (const [name,value] of Object.entries(originalAttributes.get(element))) {
        if (value !== null) element.setAttribute(name,translate(value,language));
      }
    });
  }
  window.ASI_I18N={translate,apply};
})();

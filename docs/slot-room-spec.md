# Mirage Slot Room Specification

Статус: черновик для согласования перед кодом.

Цель документа: зафиксировать механику, математику, визуальную структуру, анимации, экономические ограничения и порядок реализации третьей комнаты Mirage, чтобы не строить ее микроправками и не возвращаться к переделкам.

Принцип реализации: комната делается как полноценный продуктовый модуль с первого прохода. Мы не делаем "минимальную болванку", чтобы потом отдельно пришивать bonus buy, free spins, множители, анимации и нормальный UI. Все ключевые механики закладываются сразу в архитектуру, даже если отдельная кнопка может быть временно выключена до финальной проверки экономики.

## 1. Общая идея комнаты

Третья комната - слот `ФАРАОН` в стиле Mirage: Египет, магия, золото, рубины, лампы, порталы, древние артефакты.

Референс по типу механики: современные tumble/cascade slots в духе Gates of Olympus / Sweet Bonanza / Sugar Rush, но без копирования чужого бренда, ассетов, названий, закрытых таблиц выплат и коммерческой математики.

Формула комнаты:

- игровое поле 6 x 5;
- выигрыш считается по одинаковым символам "anywhere pays";
- выигрышные символы исчезают;
- сверху падают новые символы;
- каскады продолжаются, пока есть новые выигрыши;
- в базовой игре могут выпадать множители;
- scatter запускает free spins;
- целевой RTP задается математической конфигурацией и проверяется симуляцией;
- max win ограничивается x10 000 от ставки;
- bonus buy закладывается в архитектуру сразу и включается после отдельной проверки экономики.

## 2. Что мы не копируем

Нельзя брать напрямую:

- название Gates of Olympus, Pragmatic Play и любые чужие торговые марки;
- чужие символы, персонажей, звуки, фон, интерфейс;
- закрытую таблицу весов, точную математику и серверную логику;
- чужой исходный код, если лицензия не разрешает коммерческое использование.

Можно брать как жанровый принцип:

- каскадные выпадения;
- anywhere pays;
- множители;
- free spins;
- bonus buy как опциональную функцию;
- высокую волатильность;
- общий UX слота: ставка, спин, автоигра, история, таблица выплат.

## 3. Основной игровой цикл

1. Пользователь выбирает ставку.
2. Нажимает `СПИН`.
3. Движок генерирует сетку 6 x 5 через RNG.
4. Проверяются группы одинаковых символов.
5. Если есть выигрыш:
   - подсвечиваются выигрышные символы;
   - считается выплата;
   - символы исчезают;
   - сверху падают новые;
   - идет следующий каскад.
6. Если есть множители, они применяются к общей сумме выигрыша.
7. Если выпало достаточно scatter-символов, запускается free spins.
8. После завершения всех каскадов баланс обновляется.
9. В историю записывается итог спина.

## 4. Игровое поле

Базовый вариант:

- 6 колонок;
- 5 рядов;
- 30 символов на экране;
- символы квадратные или слегка вертикальные, чтобы хорошо читались на телефоне;
- сетка должна быть адаптивной, но с фиксированной внутренней системой координат, как мы уже делали для пирамиды и ковра.

Почему 6 x 5:

- это привычный формат для каскадных слотов;
- на телефоне он читается лучше, чем слишком большая сетка;
- дает достаточно места для анимаций, множителей и кнопок.

## 5. Символы

Предлагаемый набор символов Mirage:

- `lamp` - волшебная лампа, высокий символ;
- `ruby` - рубин, высокий символ;
- `scarab` - скарабей, высокий символ;
- `scroll` - золотой свиток, средний символ;
- `portal` - магический портал, средний символ;
- `ankh` - древний знак, средний символ;
- `coin` - золотая монета, низкий символ;
- `gem_blue` - синий камень, низкий символ;
- `gem_green` - зеленый камень, низкий символ;
- `wild_multiplier` - множитель;
- `scatter` - бонусный scatter.

Визуальное правило:

- символы должны быть в одном стиле, не как набор случайных картинок;
- прозрачный фон;
- одинаковая световая логика;
- читаемость на ширине 393 px обязательна;
- символы не должны быть слишком мелкими или перегруженными деталями.

## 6. Что может сделать Codex по ассетам

Я могу:

- подготовить промпты для генерации каждого символа;
- сгенерировать символы через imagegen, если ты дашь ок;
- сделать прозрачные PNG/WebP;
- собрать symbol sheet;
- оптимизировать размеры файлов;
- подключить lazy preload;
- проверить, что символы читаются на телефоне.

От тебя желательно:

- утвердить список символов;
- сказать, нужен ли более египетский, магический или драгоценный стиль;
- дать фон, если хочешь конкретный. Если нет, я могу подготовить фон сам в стиле текущих комнат.

## 7. Математика и RTP

Цель: не придумывать выплаты на глаз, а сделать конфиг, который можно проверить симуляцией.

Базовый целевой RTP:

- рабочий диапазон: 95.0% - 96.0%;
- стартовая цель для Mirage: 95.0%;
- волатильность: высокая;
- max win: x10 000 от ставки.

Банк комнаты:

- расчетный пул на комнату: $5 000;
- max payout не должен превышать допустимую долю пула;
- ставка должна ограничиваться так, чтобы потенциальный max win не ломал банк;
- если max win = x10 000, то ставка в денежном эквиваленте должна иметь жесткий верхний лимит.

Практическая формула ограничения:

```txt
maxStakeByPool = roomPoolUsd * allowedExposureShare / maxWinMultiplier
```

Например, если пул комнаты $5 000, max win x10 000, а на один экстремальный исход разрешаем рисковать не больше 25% пула:

```txt
maxStakeByPool = 5000 * 0.25 / 10000 = $0.125
```

Если разрешать риск до 100% пула:

```txt
maxStakeByPool = 5000 / 10000 = $0.50
```

Вывод: при max win x10 000 нельзя давать большие ставки без серверных лимитов, иначе один редкий выигрыш может съесть весь пул комнаты. Поэтому max bet должен считаться от пула, курса внутренней валюты и текущего риска.

Математика должна быть вынесена в конфигурацию:

```js
const SLOT_CONFIG = {
  targetRtp: 0.95,
  grid: { columns: 6, rows: 5 },
  minWinCount: 8,
  maxWinMultiplier: 10000,
  symbols: [...],
  payouts: {...},
  weights: {...},
  multiplierWeights: {...},
  scatterRules: {...}
};
```

Выплата:

- если символов одного типа на поле 8 или больше, символ дает выплату;
- чем больше одинаковых символов, тем выше коэффициент;
- несколько выигрышных символов в одном каскаде суммируются;
- множитель применяется к итоговой сумме спина или каскада, в зависимости от выбранной модели.

Пример структуры выплат:

```js
payouts: {
  lamp:   { 8: 0.5, 10: 1.2, 12: 2.5, 15: 8, 20: 25 },
  ruby:   { 8: 0.4, 10: 1.0, 12: 2.0, 15: 6, 20: 18 },
  scarab: { 8: 0.3, 10: 0.8, 12: 1.5, 15: 4, 20: 12 }
}
```

Это не финальные цифры. Финальные цифры подбираются симуляцией.

## 8. Симуляция RTP

Перед интеграцией в интерфейс нужен отдельный математический прогон.

Минимальные проверки:

- 100 000 спинов - быстрый тест;
- 1 000 000 спинов - рабочая проверка;
- 10 000 000 спинов - финальная проверка перед фиксацией;
- RTP;
- hit rate;
- средний выигрыш;
- максимальный выигрыш;
- частота free spins;
- частота множителей;
- распределение выигрышей по диапазонам.

Критерий готовности:

- RTP близко к цели;
- нет бесконечных каскадов;
- max win соблюдается;
- баланс не улетает из-за ошибок округления;
- free spins не становятся слишком частыми;
- визуализация не влияет на математику.

## 9. Множители

Вариант A: множители как отдельные символы.

- На поле могут появляться multiplier symbols.
- Если в этом спине есть выигрыш, множители суммируются и применяются к общей выплате.
- Если выигрыша нет, множитель сгорает.

Вариант B: множители только в free spins.

- В базовой игре множителей нет или они редкие.
- В free spins множители накапливаются и дают главный азарт.

Решение для `ФАРАОН`: множители должны быть заложены сразу.

- В базовой игре множители появляются редко.
- В free spins множители появляются заметно чаще.
- Множители могут суммироваться внутри спина.
- Для bonus buy используется та же модель free spins, но с отдельной стоимостью входа и отдельной RTP-проверкой.

## 10. Free Spins

Scatter-правило:

- 4 scatter - 10 free spins;
- 5 scatter - 12 free spins;
- 6+ scatter - 15 free spins.

Во free spins:

- ставка не списывается;
- выигрыши идут в общий бонусный банк;
- множители появляются чаще;
- можно добавить retrigger: 3+ scatter добавляют +5 free spins.

Это надо будет отдельно проверить симуляцией, потому что free spins сильно влияют на RTP.

## 11. Bonus Buy

Bonus buy не откладывается как архитектура. Он проектируется сразу, но может быть выключен флагом до финального согласования.

Модель:

- кнопка `БОНУС` или `КУПИТЬ БОНУС`;
- стоимость: ориентир x100 от ставки, как у популярных каскадных слотов;
- покупка запускает free spins без ожидания scatter;
- bonus buy должен иметь отдельную симуляцию RTP;
- если bonus buy включен, UI обязан ясно показывать стоимость до подтверждения.

Технический флаг:

```js
bonusBuy: {
  enabled: false,
  costMultiplier: 100,
  freeSpins: 15
}
```

Почему флаг может быть выключен на старте: это не "доделать потом", а защита от включения непроверенной экономики. Код, состояние игры, кнопка, модальное подтверждение и математическая модель должны быть готовы сразу.

## 12. Кнопки и UI

Основной интерфейс:

- `СПИН` - главный запуск;
- ставка: минус, сумма, плюс;
- `2X`;
- `MAX`;
- режим `Авто`;
- количество автоспинов;
- `Турбо` - опционально, но архитектурно закладывается сразу;
- `БОНУС` - покупка бонуса, может быть скрыта флагом до финального включения;
- `i` / правила - таблица выплат и описание механики;
- история последних спинов;
- win bar для текущего выигрыша.

Важно:

- кнопки должны повторять визуальную систему пирамиды и ковра;
- нижний блок не проектируется заново, а берется как общий UI-компонент;
- размеры, шрифты, отступы и состояния должны быть едиными во всех комнатах.

## 13. Состояния игры

Основные состояния:

- `idle` - ожидание;
- `spinning` - первичное выпадение;
- `evaluating` - подсчет выигрышей;
- `cascading` - исчезновение и падение новых символов;
- `winPresentation` - показ суммы;
- `freeSpinsIntro` - вход в бонус;
- `freeSpinsPlaying` - бонусная серия;
- `bonusBuyConfirm` - подтверждение покупки бонуса;
- `bonusBuyStarting` - запуск купленного бонуса;
- `complete` - завершение спина;
- `autoPlaying` - серия автоспинов;
- `blocked` - ставка недоступна, недостаточно баланса или идет анимация.

Правило: нельзя запускать новый спин, пока текущий не завершен, кроме четко спроектированного turbo/skip режима.

## 14. Визуальная структура комнаты

Слои:

1. Фон комнаты.
2. Легкая атмосферная анимация: дым, звезды, магические частицы.
3. Игровая сетка.
4. Символы.
5. Win effects.
6. UI-кнопки.
7. Навигация.

Фон:

- темный магический Египет;
- золото и фиолетовый как акценты;
- центр должен быть достаточно спокойным, чтобы символы читались;
- фон не должен спорить с игровым полем.

## 15. Анимации

Анимации являются частью базовой реализации, а не последующим украшением. Их нужно проектировать одновременно с механикой, потому что каскады, free spins, множители и win presentation напрямую завязаны на состояние игры.

Обязательные:

- мягкое выпадение символов;
- исчезновение выигрышных символов;
- каскад новых символов сверху;
- подсветка выигрышной комбинации;
- счетчик выигрыша;
- эффект множителя;
- вход в free spins.
- intro-анимация комнаты;
- idle-анимация символов/фона;
- bonus buy confirmation;
- free spins intro/outro;
- big win / mega win / max win presentation;
- skip/fast-forward логика, если пользователь не хочет ждать длинный каскад.

Не делать:

- слишком яркие орбы и пятна, которые перекрывают символы;
- хаотичные вспышки;
- анимации, которые выглядят отдельно от объекта;
- эффекты, которые тормозят Telegram WebView.

## 16. Техническая структура

Рекомендация: не импортировать тяжелый игровой фреймворк на этом этапе.

Причина:

- текущий проект статический;
- Telegram WebView чувствителен к весу ассетов;
- мы уже боролись с загрузками и визуальными рассинхронами;
- для слота достаточно собственного Canvas/DOM-движка.

Файлы, которые стоит создать:

- `slot-engine.js` - чистая механика и RNG;
- `slot-math.js` - выплаты, веса, симуляция;
- `slot-renderer.js` - отрисовка/анимации;
- `slot-room.css` - стили комнаты;
- `slot-assets/` - символы и фон.

Если оставаться в текущей простой структуре без модулей, то эти блоки можно временно держать в `app.telegramXXX.js`, но логически они должны быть разделены.

## 17. Порядок работы

Правильная последовательность:

1. Утвердить механику комнаты.
2. Утвердить экономические ограничения: RTP, max win, пул комнаты, max stake.
3. Утвердить список символов.
4. Утвердить UI-кнопки, включая bonus buy, auto, turbo, rules.
5. Создать математический конфиг.
6. Написать симулятор RTP без визуала.
7. Прогнать симуляции и зафиксировать таблицы.
8. Подготовить фон и символы.
9. Подготовить анимационный план: spin, cascade, multiplier, free spins, big win.
10. Собрать статичный макет комнаты.
11. Проверить адаптацию Telegram 393 x 852 и близкие размеры.
12. Подключить движок спина.
13. Подключить каскады с финальными анимационными состояниями.
14. Подключить множители и free spins.
15. Подключить bonus buy как готовый, но выключаемый флагом модуль.
16. Подключить историю, автоигру, правила.
17. Провести визуальную проверку.
18. Провести математическую проверку.
19. Только после этого готовить GitHub-версию.

Запрет: не начинать с красивой анимации, пока не утверждены математика и сетка.

## 18. Проверка перед выдачей

Перед тем как считать слот готовым к просмотру, нужно проверить:

- фон заполняет Telegram-экран без боковых стекол;
- кнопки не съезжают;
- символы не мыльные;
- шрифты совпадают с другими комнатами;
- спин нельзя нажать дважды во время активного спина;
- auto mode можно остановить;
- баланс не уходит в минус;
- RTP совпадает с конфигом;
- free spins не ломают интерфейс;
- bonus buy выключен или включен строго по согласованному флагу;
- max win и max stake соответствуют пулу комнаты;
- история не перекрывает персонажей/сетки;
- GitHub-версия совпадает с локальной.

## 19. Открытые решения для согласования

Нужно согласовать:

- название комнаты: `ФАРАОН` - согласовано;
- точный сетап: 6 x 5 - согласовано;
- RTP: 95.0% - согласовано;
- max win: x10 000 - согласовано;
- расчетный пул комнаты: $5 000 - согласовано как базовый ориентир;
- bonus buy: архитектурно закладываем сразу, кнопку включаем после проверки экономики;
- free spins: нужны сразу;
- символ scatter;
- символ multiplier;
- финальный список обычных символов;
- стиль фона.

Текущий стартовый конфиг `telegram115`:

- payout scale: 8.0;
- быстрый прогон 100 000 спинов: около 94.4% RTP;
- рабочий прогон 1 000 000 спинов: около 95.39% RTP по базовым спинам;
- hit rate: около 26.9%;
- free spin trigger rate: около 0.05%;
- важно: следующий симулятор должен считать не только факт выдачи free spins, но и полный бонусный цикл, чтобы зафиксировать итоговый RTP комнаты.
- обновленный прогон с полным free-spin циклом при payout scale 7.9: около 95.5% RTP на 1 000 000 базовых спинов;
- вклад базовой игры: около 94.7%;
- вклад free spins: около 0.9%;
- bonus buy при временной цене x100 пока не включать: текущая бонусная модель дает около 25% RTP для покупки, значит цену или силу бонуса нужно настраивать отдельным проходом перед включением кнопки.

## 20. Джин и реакционный слой

В комнате должен быть отдельный визуальный персонаж-реакция: джин в стиле Mirage, размещенный под или рядом с игровым полем, не вместо сетки.

Назначение джина:

- реагировать на запуск спина;
- усиливать эмоцию при каскаде;
- отдельно реагировать на выигрыш, big win, free spins и max win;
- быть частью комнаты с самого начала, а не случайной картинкой, добавленной после математики.

Техническое правило:

- логика джина не должна менять RTP и RNG;
- джин подписывается на состояние слота: `spinning`, `cascading`, `winPresentation`, `freeSpinsIntro`, `freeSpinsPlaying`, `complete`;
- анимация должна быть легкой для Telegram WebView;
- до финального ассета можно держать placeholder, но место в композиции и события реакции нужно заложить сразу.

## 21. Рекомендация Codex

Я бы делал так:

- комната: `ФАРАОН`;
- сетка: 6 x 5;
- механика: anywhere pays + tumble;
- min win: 8 одинаковых символов;
- RTP: 95.0%;
- volatility: высокая;
- free spins: да;
- max win: x10 000;
- пул комнаты: $5 000;
- bonus buy: готовим сразу как модуль, включаем после проверки;
- множители: в free spins активнее, в базе редко;
- визуал: темный магический Египет, золото, рубины, лампа, скарабей, портал.

Так мы получим не самодельную угадайку, а полноценный слот с проверяемой математикой и нормальным визуальным фундаментом.

## 22. Roadmap после `telegram148`

Текущий рабочий базис:

- версия `telegram148` принята как рабочая по базовой механике и слотовой сетке;
- 6 x 5 grid, anywhere pays, tumble/cascade, множители, free spins и bonus buy x100 уже заложены в архитектуру;
- canvas-рендер и анимация самих символов стали рабочими в Telegram;
- визуал самих слот-символов на текущем этапе принят как направление, но финальные ассеты могут быть заменены на более дорогие.

Зафиксированные проблемы текущего визуала:

- блок кнопок `ФАРАОН` отличается от кнопок `ПИРАМИДА` и `КОВЕР`;
- центральная кнопка `СПИН` визуально не совпадает с круглыми кнопками `ИГРАТЬ` / `СТАРТ`;
- панель ставки `1 СПИН | 10` и рубин визуально сырые, местами накладываются и требуют такой же аккуратности, как нижние панели первых двух комнат;
- чипы множителей и коэффициентов отличаются по шрифту, весу, цвету и общей премиальности;
- при выигрыше недостаточно ясно показывается сумма выигрыша и рубин;
- фон комнаты временно дублирует атмосферу пирамиды, нужен отдельный фон `ФАРАОН`;
- блок джина сейчас выглядит как рамочная вставка, а должен быть отдельным живым персонажем комнаты;
- текст `ДЖИН ВЫИГРЫШ` не подходит как финальная win-copy;
- выигрышное состояние не должно выглядеть зависшим после завершения спина;
- темп спина нужно проверить: базовый спин должен быть достаточно быстрым, но не мгновенным; выигрыши и каскады должны давать игроку успеть почувствовать событие.

Внешняя опора по механике:

- официальный Gates of Olympus 1000 фиксирует 6 x 5 grid, 8+ matching symbols anywhere, tumble, multipliers 2x-1000x, 15 free spins and bonus buy x100;
- официальные и операторские guides также используют понятные пользовательские поля `BET`, `SPIN`, `WIN`, `AUTO PLAY`, `FREE SPINS`, `BONUS BUY`, `SPIN SPEED`;
- для `ФАРАОН` мы не копируем чужой код или ассеты, но держим структуру UX близкой к понятному iGaming-паттерну.

Ссылки для сверки:

- https://www.pragmaticplay.com/en/games/gates-of-olympus-1000/
- https://slotcatalog.com/en/slots/Gates-of-Olympus-1000
- https://casino.guru/free-casino-games/slots/starlight-princess-slot-play-free
- https://casino.guru/free-casino-games

Порядок следующих этапов:

1. `telegram149` - привести нижние контролы `ФАРАОН` к общей системе Mirage: размеры, шрифты, отступы, центральная кнопка, ставка, плюс/минус, bonus buy, auto/manual.
2. `telegram150` - сделать отдельный фон `ФАРАОН`: темный магический Египет, золото, рубины, лампа, портал; не использовать фон пирамиды как финальный.
3. `telegram151` - переделать джина как живой реакционный слой: без тяжелой рамки, крупнее, с состояниями `idle`, `spin`, `cascade`, `win`, `bigWin`, `freeSpins`, `bonusBuy`.
4. `telegram152` - заменить win-copy и результат: `ВЫИГРЫШ`, `БОЛЬШОЙ ВЫИГРЫШ`, `МЕГА ВЫИГРЫШ`, `СУПЕР ВЫИГРЫШ`, `FREE SPINS`, `BONUS`, сумма + рубин всегда видны.
5. `telegram153` - настроить pacing спина: длительность базовой прокрутки, задержку перед раскрытием результата, темп каскадов, паузы на win presentation.
6. `telegram154` - polishing сетки и эффектов: молнии/связи выигрышных символов, усиление множителей, финальная подсветка крупных выигрышей.
7. `telegram155` - paytable/rules/info/history: объяснение символов, free spins, bonus buy, RTP, max win, история последних спинов.
8. `telegram156` - полный regression pass по трем комнатам: локально, Telegram-frame, GitHub Pages, Telegram mobile.

Правило контроля перед выдачей:

- не менять механику при визуальных правках без отдельного решения;
- после каждого этапа проверять локально и на GitHub Pages;
- для Telegram-проверки отдавать отдельную ссылку с новым `build`;
- если при правке `ФАРАОН` съезжают `ПИРАМИДА` или `КОВЕР`, правка считается неготовой.
## 23. Reference video audit: Gates-style tumble target

Source reviewed: `IMG_9394.MP4`, supplied by Tymur on 2026-07-22.

Product rule for `ФАРАОН`: the room must behave like a real tumble/cascade slot, not like a static grid that swaps pictures.

What the reference clearly shows:

- The base format is a 6 x 5 grid with `symbols pay anywhere on the screen`.
- A result is understandable because the game first highlights the winning symbol group, then removes it, then lets remaining symbols fall vertically by column.
- New symbols enter from above the grid after holes are created. They do not appear by instant repaint.
- Cascades repeat until there are no new wins.
- Multipliers stay visually separate from regular symbols and are applied after a winning event.
- The player always sees a reason for the win: highlighted cells, running total, multiplier state, and final win presentation.
- The timing is not instant: initial spin, highlight, vanish, gravity drop, refill, and final pause are separate phases.

Required renderer model:

1. `initialDrop`: every column spins/falls from above into the final first grid.
2. `winHold`: all winning cells for the current cascade pulse and connect visually.
3. `vanish`: winning cells shrink/fade/burst out of their positions.
4. `gravity`: non-winning symbols in the same columns fall down into empty spaces.
5. `refill`: newly generated symbols enter from above and land in the top holes.
6. Repeat steps 2-5 for each cascade.
7. `settle`: final non-winning grid stays still; status copy returns to a clean idle state.

Important implementation rule:

- Math and visual steps must be separated. Math decides `grid`, `wins`, `winningKeys`, `nextGrid`, `win`, `multiplier`, `freeSpinsAwarded`. The renderer only animates those deterministic steps.
- A visual-only change must not change RTP, symbol weights, payout tables, or bonus/free-spin rules.

Current gap before the next implementation pass:

- The math already produces cascade steps, but the canvas renderer does not yet animate holes, gravity, and refill as separate visible phases.
- That is why the current spin can feel like a scripted picture swap even when the underlying cascade math is present.
- Next build must replace the current `animateDrop(nextGrid)` shortcut with a real `animateCascadeTransition(fromGrid, winningKeys, nextGrid)` phase.

QA gate for this pass:

- In local Telegram-frame and published GitHub build, a winning cascade must visibly show: highlight -> disappear -> symbols fall -> new symbols enter from top.
- Non-winning spins must still finish quickly and not hang.
- If the renderer fails or performs badly in Telegram WebView, the round must still settle and the button must unlock.

`telegram154` note:

- The first win-presentation timing pass delays the large final win plaque until after the cascade has settled.
- This pass does not finish genie behavior, control alignment, or full win explanation. Those stay as separate roadmap items.

`telegram155` note:

- Win explanation chips are added to the existing five-chip row. During a winning cascade or after a winning spin, the row shows the main winning symbol, count, base payout, cascade multiplier, and rubies won.
- This pass does not change RNG, RTP, stake logic, cascade math, bonus rules, or lower control layout.

`telegram156` note:

- The initial Pharaoh spin renderer is changed from a reel-like symbol swap to a tumble-style drop-in: target symbols enter from above by column/row, settle into the 6 x 5 grid, then existing win highlight, vanish, gravity, and refill phases continue.
- This pass does not change RNG, RTP, payouts, free-spin rules, bonus-buy rules, or control layout.

`telegram157` note:

- Cascade gravity is polished: winning symbols hold longer with a clearer connection/glow phase, then vanish, survivors drop into empty cells, and new symbols enter from above.
- Big-win counter popup is explicitly tracked as the next presentation layer: animated rubies count-up, stronger win tiers, and genie reaction for larger wins.
- This pass does not change RNG, RTP, payouts, free-spin rules, bonus-buy rules, or control layout.

`telegram158` note:

- Mobile-safe cascade sequencing: vanish/clear and gravity/refill are now separate awaited animation phases so Telegram WebView cannot show old glowing winning symbols underneath new falling symbols.
- This pass does not change RNG, RTP, payouts, free-spin rules, bonus-buy rules, or control layout.

`telegram159` note:

- Pharaoh win presentation now uses a dedicated counted ruby value instead of a static text string. The amount counts upward after the round settles, with the same win tiers: win, big, mega, legend, and free-win.
- This pass does not change RNG, RTP, payouts, cascade sequencing, free-spin rules, bonus-buy rules, or control layout.

`telegram160` note:

- The genie is moved from the lower service panel into the Pharaoh scene as a side reaction layer beside the slot grid. It is larger, vertical, and visually connected to the spin grid through a light/mist beam.
- The win presentation is restyled from a plain text panel into a magic cartouche with sparks, a side beam, ruby value, and count-up amount.
- This pass does not change RNG, RTP, payouts, cascade sequencing, free-spin rules, bonus-buy rules, or lower control layout.

`telegram161` note:

- The `telegram160` side-genie layout is kept, but the final win/cartouche presentation stays on screen longer so the win moment is readable on mobile instead of disappearing too quickly.
- This pass does not change RNG, RTP, payouts, cascade sequencing, free-spin rules, bonus-buy rules, or lower control layout.

`telegram162` note:

- The genie is moved out of the left-side overlay into a centered framed scene under the slot board. This keeps him connected to the spin grid while preventing overlap with the grid edge.
- The history/free-spin row remains above the genie scene. Lower controls, RNG, RTP, payouts, cascade sequencing, free-spin rules, and bonus-buy rules are unchanged.

`telegram163` note:

- History chips move into the top winbar area, replacing the duplicate `+0/+win` strip.
- Free-spins status moves into the lower-left controls zone near the spin/stake controls, not between the slot board and genie scene.
- The genie scene is widened into a more rectangular panel under the slot board.
- RNG, RTP, payouts, cascade sequencing, free-spin rules, bonus-buy rules, and slot math are unchanged.

`telegram164` note:

- Free-spins status is corrected to sit under the left stake shortcuts: `СТАВКА -> [-] value [+] -> 2X/MAX -> FREE SPINS`.
- The stake and mode control columns must stay parallel; the free-spins badge is positioned without pushing the stake column upward.
- The initial spin presentation now includes an old-grid exit phase: previous symbols travel downward through the bottom of the slot board before the new grid drops from above.
- The genie scene gets distinct CSS reaction states for idle, spin, cascade, win/big/mega/legend, and free spins.
- RNG, RTP, payouts, cascade math, free-spin rules, and bonus-buy rules are unchanged.

`telegram165` note:

- The initial Pharaoh reel transition now runs as a row wave: old rows sink through the lower edge with slight column lag, then new rows fall from above one line after another.
- The genie panel becomes a richer mini-scene with state-specific dust, beam, glow, and win spark layers behind the same genie asset.
- Lower controls, free-spins placement, RNG, RTP, payouts, cascade math, free-spin rules, and bonus-buy rules are unchanged.

`telegram166` note:

- Strong Pharaoh wins now trigger a temporary magic contour on the slot-board frame. The effect is reserved for `big`, `mega`, `legend`, and `free-win` tiers so ordinary wins keep lighter feedback.
- The contour is visual-only: a running gold/pink light and corner glow on `#slot-grid`, with longer intensity for higher tiers.
- Slot math, win thresholds, RTP, payouts, cascades, free-spin rules, bonus-buy rules, and control layout are unchanged.

`telegram167` note:

- The initial Pharaoh reel transition is corrected from row-pack movement to column-first stagger. Columns now exit and refill one after another, with small row offsets inside each column.
- This is meant to avoid the "whole field dropped as one sheet" feeling while keeping the same downward old-symbol exit and top refill direction.
- Genie replacement remains a separate asset/scenery task; this pass only corrects slot-symbol motion.
- Slot math, win thresholds, RTP, payouts, cascades, free-spin rules, bonus-buy rules, prize-frame tiers, and control layout are unchanged.

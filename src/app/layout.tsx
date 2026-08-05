import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Компании',
  description: 'Справочник компаний из внутренней выгрузки',
};

// Ключ localStorage, под которым хранится явный выбор темы. Общий с
// companies/theme-toggle.tsx - строка продублирована туда намеренно: этот
// скрипт должен остаться статичной строкой, не зависящей от импортов
// клиентского бандла, а не потому что ключ мог бы разойтись случайно.
const THEME_STORAGE_KEY = 'theme';

// Блокирующий инлайн-скрипт, который выставляет класс .dark на <html> до
// первой отрисовки - именно поэтому это обычный <script> прямо в разметке
// (а не useEffect и не <Script strategy="beforeInteractive"> из next/script).
// useEffect срабатывает уже после того, как браузер нарисовал первый кадр -
// на нём успела бы мелькнуть тема по умолчанию, ровно то, что нужно
// избежать. next/script с beforeInteractive тут тоже не подошёл: он не
// вставляет скрипт как есть в HTML, а сериализует его в self.__next_s и
// реально создаёт и исполняет <script> уже из клиентского бандла, в
// app-bootstrap.js, - то есть после того, как этот бандл загрузился и
// начал выполняться, а не во время парсинга исходного HTML (проверено:
// в отданной странице вместо буквального <script> с кодом темы лежит
// self.__next_s.push([0, {children: "...", id: "theme-init"}])). Обычный
// <script> ниже, наоборот, - буквальный узел в потоке HTML: браузер
// исполняет его синхронно по ходу парсинга, до того как распарсит и
// нарисует что-либо из {children} после него в <body>.
//
// Источник темы, по приоритету: явный выбор в localStorage → системная
// prefers-color-scheme → светлая тема по умолчанию. Обёрнуто в try/catch,
// потому что доступ к localStorage может бросить исключение (приватный
// режим части браузеров, отключённое хранилище политиками) - в этом
// случае просто остаёмся при системной/светлой теме, а не роняем рендер
// всей страницы.
//
// Содержимое - статическая строка, которую пишет и полностью контролирует
// разработчик; в неё не подставляется ничего производного от пользователя
// или URL - это единственное место в проекте, где dangerouslySetInnerHTML
// оправдан.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var isDark = stored === 'dark'
      || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  } catch (error) {
    /* localStorage недоступен - остаёмся при разметке по умолчанию (светлая тема). */
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning - класс .dark на этом узле выставляет
    // THEME_INIT_SCRIPT до гидратации, в обход React. Без этой пометки
    // React считает несовпадение атрибута с тем, что он сам отрендерил на
    // сервере (без класса), ошибкой гидратации - хотя на самом деле это
    // ожидаемое, штатное расхождение ровно для одного атрибута на одном
    // узле, а не признак сломанного рендера.
    <html lang="ru" suppressHydrationWarning>
      <body className="bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- скрипт обязан
            быть синхронным и буквальным узлом HTML, см. комментарий у
            THEME_INIT_SCRIPT выше: это и есть весь смысл конструкции. */}
        <script
          id="theme-init"
          // Единственное место в проекте, где dangerouslySetInnerHTML
          // оправдан: содержимое - статическая строка, которую пишет и
          // полностью контролирует разработчик, а не что-либо производное
          // от пользовательского ввода или URL.
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}

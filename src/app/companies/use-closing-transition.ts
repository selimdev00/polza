import { useEffect, useRef, useState } from 'react';

// Общий паттерн отложенного размонтирования всплывающих элементов - список
// городов/категорий/размера страницы, модалка аномалий, попап аномалий
// строки. Раньше он был реализован только в city-select.tsx (closing +
// wasOpenRef + onAnimationEnd прямо в компоненте); здесь тот же код вынесен
// в хук, чтобы все всплывающие элементы страницы использовали ровно одну
// реализацию, а не расходящиеся копии.
//
// Почему отложенное размонтирование, а не CSS @starting-style +
// transition-behavior: allow-discrete: паттерн с closing/wasOpenRef уже был
// написан, задокументирован и работал для списка городов до этой задачи -
// продолжать его для новых попапов дешевле и надёжнее, чем вводить второй,
// параллельный механизм анимации только ради части всплывающих элементов.
// @starting-style корректно работает и был бы не хуже, но здесь нет причины
// заводить оба подхода сразу.
//
// mounted=true, пока элемент либо открыт, либо ещё доигрывает анимацию
// закрытия - именно это (а не open) решает, рендерить ли элемент в DOM.
// wasOpenRef отличает "уже был открыт и закрывается сейчас" (нужна
// анимация выхода) от "изначально закрыт" (анимировать нечего на первом
// рендере).
export function useClosingTransition(open: boolean): {
  mounted: boolean;
  closing: boolean;
  onAnimationEnd: () => void;
} {
  const [closing, setClosing] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      setClosing(false);
    } else if (wasOpenRef.current) {
      setClosing(true);
    }
    wasOpenRef.current = open;
  }, [open]);

  return {
    mounted: open || closing,
    closing,
    onAnimationEnd: () => {
      if (!open) setClosing(false);
    },
  };
}

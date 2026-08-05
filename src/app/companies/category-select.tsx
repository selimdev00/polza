'use client';

// Тонкая обёртка вокруг общего SelectDropdown (см. select-dropdown.tsx) -
// см. комментарий в city-select.tsx: один и тот же паттерн для города,
// категории и размера страницы, без трёх расходящихся копий.
import { SelectDropdown } from './select-dropdown';

const ALL_CATEGORIES_LABEL = 'Все категории';

export function CategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: string[];
  value: string;
  onChange: (category: string) => void;
}) {
  const options = [
    { value: '', label: ALL_CATEGORIES_LABEL },
    ...categories.map((category) => ({ value: category, label: category })),
  ];

  return (
    <SelectDropdown
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel="Фильтр по категории"
    />
  );
}

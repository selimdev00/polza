'use client';

// Тонкая обёртка вокруг общего SelectDropdown (см. select-dropdown.tsx) -
// вся клавиатурная навигация, ARIA-разметка и анимация закрытия живут там
// одной реализацией на все три выпадающих списка страницы (город,
// категория, размер страницы), а не расходятся по копиям.
import { SelectDropdown } from './select-dropdown';

const ALL_CITIES_LABEL = 'Все города';

export function CitySelect({
  cities,
  value,
  onChange,
}: {
  cities: string[];
  value: string;
  onChange: (city: string) => void;
}) {
  const options = [
    { value: '', label: ALL_CITIES_LABEL },
    ...cities.map((city) => ({ value: city, label: city })),
  ];

  return (
    <SelectDropdown
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel="Фильтр по городу"
    />
  );
}

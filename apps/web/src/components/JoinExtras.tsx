import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { JoinInput } from '@stalka/shared';
import { Select } from './ui';

type Props = { register: UseFormRegister<JoinInput>; errors: FieldErrors<JoinInput> };

/** Необязательный день рождения: день и месяц, без года. */
export function BirthdayFields({ register, errors }: Props) {
  const { t, i18n } = useTranslation();
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2026, i, 1)),
  );
  const error = errors.birthDay?.message ?? errors.birthMonth?.message;
  return (
    <div className="space-y-1">
      <span className="text-sm font-medium text-stone-700">{t('join.birthday')}</span>
      <div className="grid grid-cols-[5.5rem_1fr] gap-2">
        <Select aria-label={t('join.day')} defaultValue="" {...register('birthDay')}>
          <option value="">{t('join.day')}</option>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}.
            </option>
          ))}
        </Select>
        <Select aria-label={t('join.month')} defaultValue="" {...register('birthMonth')}>
          <option value="">{t('join.month')}</option>
          {months.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{t(error)}</p>
      ) : (
        <p className="text-xs text-stone-500">{t('join.birthday_hint')}</p>
      )}
    </div>
  );
}

/** Отдельное необязательное согласие на рекламные сообщения. */
export function MarketingCheckbox({ register, label }: { register: UseFormRegister<JoinInput>; label: string }) {
  return (
    <label className="flex gap-3 text-sm">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-stone-900" {...register('marketing')} />
      <span>{label}</span>
    </label>
  );
}

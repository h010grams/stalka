import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { useTranslation } from 'react-i18next';
import { buttonClass } from '../components/ui';

/**
 * Неизвестный адрес или ошибка в приложении. Частая причина — старая версия сайта
 * из кеша (PWA): обновление страницы подтягивает новую.
 */
function Screen({ title, text }: { title: string; text: string }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <img src="/mark.svg" alt="" className="h-10 w-auto" />
      <h1 className="text-3xl">{title}</h1>
      <p className="text-stone-600">{text}</p>
      <div className="flex w-full flex-col gap-2 pt-2">
        <button type="button" className={buttonClass('primary', 'w-full')} onClick={() => window.location.reload()}>
          {t('notfound.reload')}
        </button>
        <Link to="/" className={buttonClass('secondary', 'w-full')}>
          {t('notfound.home')}
        </Link>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return <Screen title={t('notfound.title')} text={t('notfound.text')} />;
}

export function RouteErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  console.error(error);
  return <Screen title={t('notfound.error_title')} text={t('notfound.error_text')} />;
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BROADCAST_MAX, type BroadcastItem, type BroadcastsDto } from '@stalka/shared';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Alert, Button, Card, ErrorAlert, Spinner } from '../components/ui';

/** Сообщение всем клиенткам с согласием — уходит уведомлением на карту в Wallet. */
export function MessagesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const data = useQuery({ queryKey: ['broadcasts'], queryFn: () => api.get<BroadcastsDto>('/broadcasts') });
  const send = useMutation({
    mutationFn: (v: string) => api.post<BroadcastItem>('/broadcasts', { text: v }),
    onSuccess: () => {
      setText('');
      void qc.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  if (data.isLoading) return <Spinner />;
  if (data.error) return <ErrorAlert error={data.error} />;
  const d = data.data!;
  const blocked = d.nextAllowedAt !== null;
  const trimmed = text.trim();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('broadcast.title')}</h1>
        <p className="text-sm text-stone-600">{t('broadcast.text')}</p>
      </div>

      {d.reachable === 0 ? (
        <Alert kind="info">{t('broadcast.nobody')}</Alert>
      ) : (
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (trimmed && window.confirm(t('broadcast.confirm', { count: d.reachable }))) send.mutate(trimmed);
            }}
          >
            <ErrorAlert error={send.error} />
            {send.isSuccess && <Alert kind="success">{t('broadcast.sent', { count: send.data.recipients })}</Alert>}
            <textarea
              className="min-h-28 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-stone-900 disabled:bg-stone-100"
              maxLength={BROADCAST_MAX}
              placeholder={t('broadcast.placeholder')}
              value={text}
              disabled={blocked}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>{t('broadcast.reachable', { count: d.reachable })}</span>
              <span className="tabular-nums">
                {text.length}/{BROADCAST_MAX}
              </span>
            </div>
            {blocked ? (
              <Alert kind="info">{t('broadcast.next_at', { when: formatDateTime(d.nextAllowedAt!) })}</Alert>
            ) : (
              <Button type="submit" className="w-full" loading={send.isPending} disabled={!trimmed}>
                {t('broadcast.send')}
              </Button>
            )}
            <p className="text-xs text-stone-500">{t('broadcast.limit_hint')}</p>
          </form>
        </Card>
      )}

      <Card flush>
        <h2 className="px-4 pt-4 font-semibold">{t('broadcast.history')}</h2>
        {d.items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-stone-500">{t('broadcast.none')}</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {d.items.map((b) => (
              <li key={b.id} className="space-y-1 px-4 py-3 text-sm">
                <p>{b.text}</p>
                <p className="text-xs text-stone-500">
                  {formatDateTime(b.createdAt)} · {t('broadcast.recipients', { count: b.recipients })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

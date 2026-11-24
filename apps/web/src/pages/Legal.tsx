import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import terms from '../legal/podmienky.md?raw';
import dpa from '../legal/spracuvanie.md?raw';

/** **tučné** → <strong>; ostatný text bez zmeny. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** Minimálny Markdown pre právne texty: nadpisy, odseky, zoznamy, tabuľky. */
function Markdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (block.startsWith('# ')) return <h1 key={i} className="text-xl font-bold text-stone-900">{block.slice(2)}</h1>;
        if (block.startsWith('## ')) return <h2 key={i} className="pt-3 text-base font-bold text-stone-900">{block.slice(3)}</h2>;
        if (block.startsWith('>')) return null;
        if (lines.every((l) => l.startsWith('|'))) {
          const rows = lines.filter((l) => !/^\|[\s|:-]+\|$/.test(l)).map((l) => l.slice(1, -1).split('|').map((c) => c.trim()));
          const [head, ...body] = rows;
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr>{head!.map((c, j) => <th key={j} className="border-b border-stone-300 p-1.5 font-semibold">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {body.map((r, k) => (
                    <tr key={k}>{r.map((c, j) => <td key={j} className="border-b border-stone-200 p-1.5 align-top">{inline(c)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const intro = lines.filter((l) => !l.startsWith('- '));
        const items = lines.filter((l) => l.startsWith('- '));
        return (
          <Fragment key={i}>
            {intro.length > 0 && (
              <p>
                {intro.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {inline(l)}
                  </Fragment>
                ))}
              </p>
            )}
            {items.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {items.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}
              </ul>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

function LegalPage({ source, other }: { source: string; other: { to: string; label: string } }) {
  const { t } = useTranslation();
  return (
    <article lang="sk" className="space-y-3 text-sm leading-relaxed text-stone-700">
      <Markdown source={source} />
      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-4 font-semibold">
        <Link to={other.to} className="underline">
          {other.label}
        </Link>
        <Link to="/register" className="underline">
          {t('legal.to_register')}
        </Link>
      </div>
    </article>
  );
}

export function TermsPage() {
  const { t } = useTranslation();
  return <LegalPage source={terms} other={{ to: '/spracovanie-udajov', label: t('legal.dpa') }} />;
}

export function DpaPage() {
  const { t } = useTranslation();
  return <LegalPage source={dpa} other={{ to: '/podmienky', label: t('legal.terms') }} />;
}

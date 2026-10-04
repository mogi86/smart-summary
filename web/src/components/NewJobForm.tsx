import { type ChangeEvent, type FormEvent, useState } from 'react';
import { type Job, submitJob } from '../api';

export function NewJobForm({ onSubmitted }: { onSubmitted: (job: Job) => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setText(await file.text());
    if (title.trim() === '') {
      setTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onSubmitted(await submitJob({ title: title.trim() || undefined, text }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">新しい要約</h2>
        <p className="mt-1 text-sm text-slate-500">
          文章から要点を抽出し、その要点をもとに要約を作成します。
        </p>
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-700">
          タイトル <span className="font-normal text-slate-400">（任意）</span>
        </label>
        <input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="未入力の場合は本文の 1 行目を使います"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
      </div>

      <div>
        <div className="flex items-end justify-between">
          <label htmlFor="text" className="block text-sm font-medium text-slate-700">
            本文
          </label>
          <label className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-500">
            テキストファイルを読み込む
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={handleFile}
              className="sr-only"
            />
          </label>
        </div>
        <textarea
          id="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={16}
          placeholder="要約したい文章を貼り付けてください"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
        <p className="mt-1 text-right text-xs text-slate-400">
          {text.length.toLocaleString('ja-JP')} 文字
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || text.trim() === ''}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {submitting ? '送信中...' : '要約する'}
      </button>
    </form>
  );
}

'use client';

import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDivider } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';

// One role — fast, deep or embed — and everything you can do to it.
//
// This is a client component for exactly one reason: choosing a provider has to
// change the list of models beside it, and that is a question a `<form>` cannot
// answer on its own. Everything else it does is a plain form post.
//
// It holds no secret and knows nothing about the database. The key is typed
// into a field and posted; it is never read back, never stored here, and never
// arrives as a prop — `maskedKey` is eight bullets and four characters
// (CLAUDE.md's Never rule 4). The three actions are passed in from the page.

type Choice = { provider: string; models: readonly string[] };

type SaveResult = { ok: boolean; message: string } | null;

type RoleCardProps = {
  role: string;
  /** One line of plain English about what this role is for. */
  blurb: string;
  /** Which providers can fill it, and what each one offers. */
  choices: Choice[];
  /** Human names for the providers, and where each one's keys live. */
  providerLabel: Record<string, string>;
  keyPage: Record<string, string>;
  /** What is saved now, if anything. Never contains a key. */
  current: {
    provider: string;
    model: string;
    maskedKey: string;
    /** Already formatted by the page — a client component gets no timezone. */
    savedLabel: string;
  } | null;
  save: (previous: SaveResult, formData: FormData) => Promise<SaveResult>;
  remove: (formData: FormData) => Promise<void>;
  test: (role: string) => Promise<{ ok: boolean; detail: string }>;
};

export function RoleCard({
  role,
  blurb,
  choices,
  providerLabel,
  keyPage,
  current,
  save,
  remove,
  test,
}: RoleCardProps) {
  const [provider, setProvider] = useState(current?.provider ?? choices[0].provider);
  const [saveState, saveAction, saving] = useActionState(save, null);

  const [testing, startTesting] = useTransition();
  const [tested, setTested] = useState<{ ok: boolean; detail: string } | null>(null);

  const models = choices.find((choice) => choice.provider === provider)?.models ?? [];
  const modelIsListed = current !== null && models.includes(current.model);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 px-4 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-16 font-medium">{role}</p>
          <p className="mt-1 text-13 text-muted">{blurb}</p>
        </div>
        {current ? <Pill tone="ok">Set up</Pill> : <Pill>Not set up</Pill>}
      </div>

      {current ? (
        <>
          <CardDivider />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-13">
            <span className="text-muted">
              {providerLabel[current.provider] ?? current.provider}
            </span>
            <span className="font-mono text-12">{current.model}</span>
            <span className="font-mono text-12 text-faint">{current.maskedKey}</span>
            <span className="text-12 text-faint">saved {current.savedLabel}</span>
          </div>
        </>
      ) : null}

      <CardDivider />

      <form action={saveAction} className="flex flex-col gap-3 px-4 py-4">
        <input type="hidden" name="role" value={role} />

        <div className="flex flex-wrap gap-3">
          <Field label="Provider" className="flex-1 basis-40">
            <Select
              name="provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            >
              {choices.map((choice) => (
                <option key={choice.provider} value={choice.provider}>
                  {providerLabel[choice.provider] ?? choice.provider}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Model" className="flex-1 basis-52">
            <Select
              name="model"
              defaultValue={modelIsListed ? current.model : models[0]}
              key={provider}
            >
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Or type a model id"
          hint="Overrides the picker. Use this when your provider ships a model before Recalc does."
        >
          <Input
            name="customModel"
            placeholder={modelIsListed || !current ? '' : current.model}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field
          label="API key"
          hint={
            current
              ? `Leave blank to keep the key already saved. Keys live at ${keyPage[provider] ?? ''}.`
              : `Your own key, from ${keyPage[provider] ?? 'your provider'}. It is encrypted before it is stored.`
          }
        >
          <Input
            name="apiKey"
            type="password"
            placeholder={current ? current.maskedKey : 'Paste your key'}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>

          <Button
            type="button"
            disabled={!current || testing}
            onClick={() =>
              startTesting(async () => {
                setTested(null);
                setTested(await test(role));
              })
            }
          >
            {testing ? 'Testing…' : 'Test connection'}
          </Button>
        </div>

        {saveState ? (
          <p className={saveState.ok ? 'text-13 text-ok' : 'text-13 text-accent'}>
            {saveState.message}
          </p>
        ) : null}

        {tested ? (
          <p className={tested.ok ? 'text-13 text-ok' : 'text-13 text-accent'}>
            {tested.ok ? 'It works. ' : 'It did not work. '}
            {tested.detail}
          </p>
        ) : null}
      </form>

      {current ? (
        <>
          <CardDivider />
          <form action={remove} className="px-4 py-3">
            <input type="hidden" name="role" value={role} />
            <button
              type="submit"
              className="text-13 text-muted underline underline-offset-4 transition-colors duration-100 hover:text-ink"
            >
              Remove this key
            </button>
          </form>
        </>
      ) : null}
    </Card>
  );
}

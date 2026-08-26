import Link from 'next/link';

import {
  removeAgentProfileAction,
  saveAgentProfileAction,
  testAgentConnectionAction,
} from './actions';
import { RoleCard } from '@/components/agents/role-card';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/server';
import { localDateKey, localTimeZone } from '@/lib/time';
import { formatShortDate } from '@/lib/today';
import {
  AGENT_ROLES,
  PROVIDER_KEY_PAGE,
  PROVIDER_LABEL,
  ROLE_BLURB,
  getAgentProfiles,
  modelChoices,
} from '@/modules/agents';

// Where the three roles are filled in. Bring your own key.
//
// Server-rendered: it reads three rows and hands each card the provider, the
// model and a mask. Nothing on this page has ever seen an API key — the mask is
// built from four characters stored in the clear, so rendering never decrypts.
//
// CLAUDE.md's Never rule 6 is what this screen exists to serve: the app asks
// for `fast`, `deep` or `embed`, and this is where a person says what each of
// those means.

export const metadata = { title: 'Agents · Recalc' };

export default async function AgentSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profiles = await getAgentProfiles(supabase, user.id);
  const byRole = new Map(profiles.map((profile) => [profile.role, profile]));
  const zone = localTimeZone();

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle="Your own API keys. Recalc asks for a role; you decide which model answers."
        actions={
          <Link
            href="/settings/drive"
            className="text-13 text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Drive
          </Link>
        }
      />

      <div className="flex flex-col gap-4 pt-2">
        {AGENT_ROLES.map((role) => {
          const current = byRole.get(role) ?? null;

          return (
            <RoleCard
              key={role}
              role={role}
              blurb={ROLE_BLURB[role]}
              choices={modelChoices(role).map((choice) => ({
                provider: choice.provider,
                models: choice.models,
              }))}
              providerLabel={PROVIDER_LABEL}
              keyPage={PROVIDER_KEY_PAGE}
              current={
                current
                  ? {
                      provider: current.provider,
                      model: current.model,
                      maskedKey: current.maskedKey,
                      // Formatted here: a client component has no timezone,
                      // and every other date on these screens goes through
                      // the same two helpers.
                      savedLabel: formatShortDate(
                        localDateKey(new Date(current.updated_at), zone)
                      ),
                    }
                  : null
              }
              save={saveAgentProfileAction}
              remove={removeAgentProfileAction}
              test={testAgentConnectionAction}
            />
          );
        })}
      </div>

      <section className="pt-8">
        <p className="pb-3 font-mono text-label text-faint uppercase">
          What happens to your key
        </p>
        <Card>
          <div className="flex flex-col gap-3 px-4 py-4 text-14 text-muted">
            <p>
              It is encrypted with AES-256-GCM before it is written down, using a key
              that lives in this server&rsquo;s environment and never in the database. It
              is decrypted for the length of one call to your provider and nowhere else.
            </p>
            <p>
              It is never sent back to your browser, never written to a log, and never
              put in an error message. This page only ever sees the last four characters.
            </p>
            <p>
              Calls are billed to your own account by your own provider. Recalc has no
              key of its own and no way to use one.
            </p>
          </div>
        </Card>
      </section>
    </>
  );
}

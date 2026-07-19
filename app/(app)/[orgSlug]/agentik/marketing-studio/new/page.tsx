/**
 * /[orgSlug]/agentik/marketing-studio/new
 *
 * Backward-compat redirect → foto-estudio/new
 */
import { redirect } from "next/navigation";

export default async function LegacyNewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/agentik/marketing-studio/foto-estudio/new`);
}

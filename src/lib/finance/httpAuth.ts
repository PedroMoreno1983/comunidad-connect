import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile, type ServerAgentProfile } from '@/lib/server/agentIdentity';

type AuthResult =
  | { error: NextResponse; profile: null; communityId: null }
  | { error: null; profile: ServerAgentProfile; communityId: string };

function denied(message: string, status: number): AuthResult {
  return { error: NextResponse.json({ error: message }, { status }), profile: null, communityId: null };
}

export async function requireCommunityMember(): Promise<AuthResult> {
  const profile = await getAuthenticatedAgentProfile();
  if (!profile) return denied('No autorizado', 401);
  if (!profile.community_id) return denied('Tu cuenta no está asociada a una comunidad.', 400);
  return { error: null, profile, communityId: profile.community_id };
}

export async function requireCommunityAdmin(): Promise<AuthResult> {
  const auth = await requireCommunityMember();
  if (auth.error || !auth.profile) return auth;
  if (auth.profile.role !== 'admin') {
    return denied('Solo la administración puede hacer esto.', 403);
  }
  return auth;
}

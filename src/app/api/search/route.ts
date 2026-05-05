/**
 * GET /api/search?q=query&scope=marketplace|profiles|all
 *
 * Endpoint de búsqueda híbrida (léxica + semántica) de ComunidadConnect.
 * Ejecuta búsqueda en Supabase via Full Text Search y pgvector.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SearchService } from '@/lib/search';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query = searchParams.get('q')?.trim() ?? '';
  const scope = searchParams.get('scope') ?? 'marketplace'; // marketplace | profiles | all

  if (!query) {
    return NextResponse.json(
      { error: 'El parámetro "q" es requerido.' },
      { status: 400 }
    );
  }

  if (query.length < 2) {
    return NextResponse.json(
      { error: 'La búsqueda debe tener al menos 2 caracteres.' },
      { status: 400 }
    );
  }

  try {
    switch (scope) {
      case 'marketplace': {
        const results = await SearchService.searchMarketplace(query);
        return NextResponse.json({
          query,
          scope,
          count: results.length,
          results,
        });
      }

      case 'profiles': {
        const results = await SearchService.searchProfiles(query);
        return NextResponse.json({
          query,
          scope,
          count: results.length,
          results,
        });
      }

      case 'all': {
        const results = await SearchService.searchAll(query);
        return NextResponse.json({
          query,
          scope,
          durationMs: results.durationMs,
          marketplace: {
            count: results.marketplace.length,
            results: results.marketplace,
          },
          profiles: {
            count: results.profiles.length,
            results: results.profiles,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: `Scope inválido: "${scope}". Usa: marketplace | profiles | all` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[API /search] Error:', error);
    return NextResponse.json(
      { error: 'Error interno en el motor de búsqueda.' },
      { status: 500 }
    );
  }
}

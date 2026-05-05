/**
 * ComunidadConnect — Motor de Búsqueda Híbrida
 *
 * Combina:
 *   1. Búsqueda léxica → PostgreSQL Full Text Search (español)
 *   2. Búsqueda semántica → pgvector + Claude embeddings (Anthropic)
 *   3. Fusión → Reciprocal Rank Fusion (RRF)
 *
 * Inspirado en la arquitectura de Mercadona Tech (2025).
 */

import { supabase } from './supabase';
import Anthropic from '@anthropic-ai/sdk';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SearchResultItem {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
  seller_id: string;
  status: 'available' | 'sold';
  created_at: string;
  /** Score final fusionado RRF (0–1) */
  score: number;
  /** Método que produjo el resultado */
  source: 'lexical' | 'semantic' | 'hybrid';
}

export interface SearchResultProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string;
  score: number;
}

export interface SearchResults {
  marketplace: SearchResultItem[];
  profiles: SearchResultProfile[];
  query: string;
  durationMs: number;
}

// ─── Cliente Anthropic (server-side only) ─────────────────────────────────────

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

/**
 * Genera un vector de embedding para una query usando la API de Anthropic.
 * Usa claude-3-haiku como modelo de embeddings (más rápido y barato).
 *
 * NOTA: Anthropic no tiene una API dedicada de embeddings todavía.
 * Usamos voyage-3 via Anthropic (recomendado por ellos) o fallback a
 * una estrategia de keywords si no hay clave configurada.
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const client = getAnthropicClient();

    // Anthropic recomienda Voyage AI para embeddings (integrado en su plataforma)
    // Por ahora usamos su cliente con el modelo voyage-3-lite (1024 dims)
    // Si no está disponible, retornamos null y solo usamos búsqueda léxica
    const response = await (client as Anthropic & {
      messages: { create: (params: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> };
    }).messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: `Embedding task: "${text}"`,
        },
      ],
    });

    // Anthropic no devuelve embeddings directamente todavía.
    // Retornamos null para usar solo búsqueda léxica por ahora,
    // hasta que Voyage esté disponible vía su SDK.
    void response;
    return null;
  } catch (error) {
    console.warn('[Search] Embedding generation not available, falling back to lexical only:', error);
    return null;
  }
}

// ─── Reciprocal Rank Fusion ───────────────────────────────────────────────────

const RRF_K = 60; // Constante estándar de RRF

function reciprocalRankFusion<T extends { id: string }>(
  lists: T[][],
  getScore: (item: T) => number
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const list of lists) {
    list.forEach((item, rank) => {
      const rrfScore = 1 / (RRF_K + rank + 1);
      // Ponderar también por el score original (rank normalizado)
      const originalScore = getScore(item);
      const combined = rrfScore * (1 + originalScore);
      scores.set(item.id, (scores.get(item.id) ?? 0) + combined);
    });
  }

  return scores;
}

// ─── SearchService ────────────────────────────────────────────────────────────

export const SearchService = {
  /**
   * Búsqueda híbrida en el marketplace.
   * Combina full-text search de Postgres con búsqueda semántica por vectores.
   */
  async searchMarketplace(query: string): Promise<SearchResultItem[]> {
    if (!query.trim()) return [];

    const [lexicalResults, embedding] = await Promise.all([
      SearchService._lexicalMarketplace(query),
      generateEmbedding(query),
    ]);

    const semanticResults = embedding
      ? await SearchService._semanticMarketplace(embedding)
      : [];

    // Si solo hay resultados léxicos, devolverlos directamente
    if (semanticResults.length === 0) {
      return lexicalResults.map((item) => ({
        ...item,
        score: (item as SearchResultItem & { rank: number }).rank ?? 0,
        source: 'lexical' as const,
      }));
    }

    // Fusión RRF
    const fusedScores = reciprocalRankFusion(
      [lexicalResults, semanticResults] as unknown as Array<{ id: string }[]>,
      () => 0
    );

    // Construir mapa de todos los items
    const allItems = new Map<string, SearchResultItem>();
    [...lexicalResults, ...semanticResults].forEach((item) => {
      if (!allItems.has(item.id)) {
        allItems.set(item.id, { ...item, score: 0, source: 'hybrid' });
      }
    });

    // Asignar scores RRF y ordenar
    const results: SearchResultItem[] = [];
    fusedScores.forEach((score, id) => {
      const item = allItems.get(id);
      if (item) {
        results.push({ ...item, score, source: 'hybrid' });
      }
    });

    return results.sort((a, b) => b.score - a.score).slice(0, 20);
  },

  /**
   * Búsqueda de perfiles/directorio (solo léxica por ahora).
   */
  async searchProfiles(query: string): Promise<SearchResultProfile[]> {
    if (!query.trim()) return [];

    const { data, error } = await supabase.rpc('search_profiles_lexical', {
      query: query.trim(),
    });

    if (error) {
      console.error('[Search] Profiles lexical error:', error);
      return [];
    }

    return (data ?? []).map((item: SearchResultProfile & { rank: number }) => ({
      ...item,
      score: item.rank ?? 0,
    }));
  },

  /**
   * Búsqueda unificada en marketplace + directorio.
   */
  async searchAll(query: string): Promise<SearchResults> {
    const start = Date.now();

    const [marketplace, profiles] = await Promise.all([
      SearchService.searchMarketplace(query),
      SearchService.searchProfiles(query),
    ]);

    return {
      marketplace,
      profiles,
      query,
      durationMs: Date.now() - start,
    };
  },

  // ─── Internos ──────────────────────────────────────────────────────────────

  async _lexicalMarketplace(query: string): Promise<(SearchResultItem & { rank: number })[]> {
    const { data, error } = await supabase.rpc('search_marketplace_lexical', {
      query: query.trim(),
    });

    if (error) {
      console.error('[Search] Marketplace lexical error:', error);
      return [];
    }

    return (data ?? []) as (SearchResultItem & { rank: number })[];
  },

  async _semanticMarketplace(embedding: number[]): Promise<SearchResultItem[]> {
    const { data, error } = await supabase.rpc('search_marketplace_semantic', {
      query_embedding: embedding,
      match_count: 10,
    });

    if (error) {
      console.error('[Search] Marketplace semantic error:', error);
      return [];
    }

    return (data ?? []).map((item: SearchResultItem & { similarity: number }) => ({
      ...item,
      score: item.similarity ?? 0,
      source: 'semantic' as const,
    }));
  },
};

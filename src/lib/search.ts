/**
 * Convive Connect hybrid search engine.
 *
 * Combines PostgreSQL full text search, Voyage AI embeddings and pgvector.
 * If Voyage is not configured or unavailable, the endpoint keeps returning
 * lexical results instead of breaking the user flow.
 */

import { supabase } from './supabase';

export interface SearchResultItem {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
  images?: string[];
  seller_id: string;
  status: 'available' | 'reserved' | 'sold' | 'hidden';
  allow_sale?: boolean;
  allow_swap?: boolean;
  swap_details?: string;
  allow_barter?: boolean;
  barter_details?: string;
  payment_status?: 'none' | 'pending' | 'completed';
  created_at: string;
  score: number;
  source: 'lexical' | 'semantic' | 'hybrid';
}

export interface SearchResultProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string;
  score: number;
  source?: 'lexical' | 'semantic' | 'hybrid';
}

export interface SearchResults {
  marketplace: SearchResultItem[];
  profiles: SearchResultProfile[];
  query: string;
  durationMs: number;
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const model = process.env.VOYAGE_EMBEDDING_MODEL?.trim() || 'voyage-3.5-lite';
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: [text],
        model,
        input_type: 'query',
        output_dimension: 1024,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[Search] Voyage embedding failed (${response.status}): ${body}`);
      return null;
    }

    const payload = await response.json() as {
      data?: Array<{ embedding?: number[] }>;
    };

    return payload.data?.[0]?.embedding ?? null;
  } catch (error) {
    console.warn('[Search] Voyage embedding unavailable, falling back to lexical only:', error);
    return null;
  }
}

const RRF_K = 60;

function reciprocalRankFusion<T extends { id: string }>(lists: T[][]): Map<string, number> {
  const scores = new Map<string, number>();

  for (const list of lists) {
    list.forEach((item, rank) => {
      const rrfScore = 1 / (RRF_K + rank + 1);
      scores.set(item.id, (scores.get(item.id) ?? 0) + rrfScore);
    });
  }

  return scores;
}

export const SearchService = {
  async searchMarketplace(query: string): Promise<SearchResultItem[]> {
    if (!query.trim()) return [];

    const [lexicalResults, embedding] = await Promise.all([
      SearchService._lexicalMarketplace(query),
      generateEmbedding(query),
    ]);

    const semanticResults = embedding
      ? await SearchService._semanticMarketplace(embedding)
      : [];

    if (semanticResults.length === 0) {
      return lexicalResults.map((item) => ({
        ...item,
        score: item.rank ?? 0,
        source: 'lexical' as const,
      }));
    }

    const fusedScores = reciprocalRankFusion([
      lexicalResults,
      semanticResults,
    ] as Array<Array<{ id: string }>>);

    const allItems = new Map<string, SearchResultItem>();
    [...lexicalResults, ...semanticResults].forEach((item) => {
      if (!allItems.has(item.id)) {
        allItems.set(item.id, { ...item, score: 0, source: 'hybrid' });
      }
    });

    const results: SearchResultItem[] = [];
    fusedScores.forEach((score, id) => {
      const item = allItems.get(id);
      if (item) results.push({ ...item, score, source: 'hybrid' });
    });

    return results.sort((a, b) => b.score - a.score).slice(0, 20);
  },

  async searchProfiles(query: string): Promise<SearchResultProfile[]> {
    if (!query.trim()) return [];

    const [lexicalResults, embedding] = await Promise.all([
      SearchService._lexicalProfiles(query),
      generateEmbedding(query),
    ]);

    const semanticResults = embedding
      ? await SearchService._semanticProfiles(embedding)
      : [];

    if (semanticResults.length === 0) {
      return lexicalResults.map((item) => ({
        ...item,
        score: item.rank ?? 0,
        source: 'lexical' as const,
      }));
    }

    const fusedScores = reciprocalRankFusion([
      lexicalResults,
      semanticResults,
    ] as Array<Array<{ id: string }>>);

    const allProfiles = new Map<string, SearchResultProfile>();
    [...lexicalResults, ...semanticResults].forEach((item) => {
      if (!allProfiles.has(item.id)) {
        allProfiles.set(item.id, { ...item, score: 0, source: 'hybrid' });
      }
    });

    const results: SearchResultProfile[] = [];
    fusedScores.forEach((score, id) => {
      const profile = allProfiles.get(id);
      if (profile) results.push({ ...profile, score, source: 'hybrid' });
    });

    return results.sort((a, b) => b.score - a.score).slice(0, 20);
  },

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

  async _lexicalProfiles(query: string): Promise<(SearchResultProfile & { rank: number })[]> {
    const { data, error } = await supabase.rpc('search_profiles_lexical', {
      query: query.trim(),
    });

    if (error) {
      console.error('[Search] Profiles lexical error:', error);
      return [];
    }

    return (data ?? []) as (SearchResultProfile & { rank: number })[];
  },

  async _semanticProfiles(embedding: number[]): Promise<SearchResultProfile[]> {
    const { data, error } = await supabase.rpc('search_profiles_semantic', {
      query_embedding: embedding,
      match_count: 10,
    });

    if (error) {
      console.error('[Search] Profiles semantic error:', error);
      return [];
    }

    return (data ?? []).map((item: SearchResultProfile & { similarity: number }) => ({
      ...item,
      score: item.similarity ?? 0,
      source: 'semantic' as const,
    }));
  },
};

/**
 * GET /api/templates
 *
 * Lists or searches templates.
 *
 * Query parameters:
 *   q            — Full-text search query (keyword, phrase, prefix).
 *                  Uses Postgres tsvector + ts_rank for relevance ranking.
 *                  Example: ?q=decentralized+exchange
 *   search       — Legacy ilike search (kept for backward compatibility).
 *   category     — Filter by category: dex | lending | payment | asset-issuance
 *   blockchainType — Filter by blockchain: stellar
 *
 * When `q` is supplied it takes precedence over `search` and results are
 * ordered by relevance score rather than created_at.
 *
 * Issue: feat/template-full-text-search-index
 */

import { NextRequest, NextResponse } from 'next/server';
import { templateService } from '@/services/template.service';
import { handlePreflight } from '@/lib/api/cors';
import type { TemplateFilters, TemplateCategory } from '@craft/types';

const VALID_CATEGORIES: readonly TemplateCategory[] = [
    'dex',
    'lending',
    'payment',
    'asset-issuance',
];

const VALID_BLOCKCHAIN_TYPES = ['stellar'] as const;
type BlockchainType = (typeof VALID_BLOCKCHAIN_TYPES)[number];

export function OPTIONS(req: NextRequest) {
    return handlePreflight(req);
}

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;

        const rawCategory = searchParams.get('category');
        const rawBlockchainType = searchParams.get('blockchainType');

        if (rawCategory !== null && !VALID_CATEGORIES.includes(rawCategory as TemplateCategory)) {
            return NextResponse.json(
                {
                    error: 'Invalid category',
                    validValues: [...VALID_CATEGORIES],
                },
                { status: 400 }
            );
        }

        if (
            rawBlockchainType !== null &&
            !VALID_BLOCKCHAIN_TYPES.includes(rawBlockchainType as BlockchainType)
        ) {
            return NextResponse.json(
                {
                    error: 'Invalid blockchainType',
                    validValues: [...VALID_BLOCKCHAIN_TYPES],
                },
                { status: 400 }
            );
        }

        const filters: TemplateFilters = {
            // Full-text search query (new — takes precedence)
            q: searchParams.get('q') || undefined,
            // Legacy ilike search
            search: searchParams.get('search') || undefined,
            category: (rawCategory as TemplateCategory) || undefined,
            blockchainType: (rawBlockchainType as BlockchainType) || undefined,
        };

        // Remove undefined values so the service can detect which filters were set
        (Object.keys(filters) as (keyof TemplateFilters)[]).forEach((key) => {
            if (filters[key] === undefined || filters[key] === null) {
                delete filters[key];
            }
        });

        const templates = await templateService.listTemplates(filters);

        return NextResponse.json(templates);
    } catch (error: any) {
        console.error('Error listing templates:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to list templates' },
            { status: 500 }
        );
    }
}

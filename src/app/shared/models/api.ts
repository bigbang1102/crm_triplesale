/** Page metadata returned by list endpoints (`meta`). */
export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasMore?: boolean;
}

/**
 * Standard envelope of triplesale-service / triplesale-chat ("API Dev Standards V.0.0.2").
 * Older endpoints deviate (documents: `result.items[]`; dashboards: raw objects) — see
 * docs/analysis/02-backend-auth-api-i18n.md §5.1.
 */
export interface Envelope<T> {
  timestamp?: string;
  status: number;
  message?: string;
  result: T;
  meta?: PageMeta;
}

/** Body of a 401 produced by the BFF `SessionTokenFilter`. */
export interface AuthRequiredBody {
  authRequired: true;
  responseCode: 'NO_TOKEN' | 'TOKEN_EXPIRED';
  message?: string;
  status?: number;
}

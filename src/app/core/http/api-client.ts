import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Envelope } from '@shared/models/api';
import { ConfigService } from '../config/config.service';
import { ApiError, errorText } from './api-error';

type ParamValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type QueryParams = Record<string, ParamValue>;

/**
 * Thin wrapper around HttpClient for the BFF (the old Java WAR).
 *
 * - prefixes `config.apiBase`
 * - drops null/undefined query values, joins arrays with ","  (e.g. tagIds=1,2)
 * - `result()` unwraps the standard envelope and treats a body `status >= 400` as an error even
 *   when HTTP was 2xx (some services do that — docs/analysis/02-… §5.1)
 *
 * Feature code should NOT call this directly from components: put calls in a feature `*.api.ts`
 * service (e.g. features/lead/lead.api.ts) so endpoints stay in one place.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http.get<T>(this.config.apiUrl(path), { params: toParams(params) });
  }

  post<T>(path: string, body?: unknown, params?: QueryParams): Observable<T> {
    return this.http.post<T>(this.config.apiUrl(path), body ?? null, { params: toParams(params) });
  }

  put<T>(path: string, body?: unknown, params?: QueryParams): Observable<T> {
    return this.http.put<T>(this.config.apiUrl(path), body ?? null, { params: toParams(params) });
  }

  patch<T>(path: string, body?: unknown, params?: QueryParams): Observable<T> {
    return this.http.patch<T>(this.config.apiUrl(path), body ?? null, { params: toParams(params) });
  }

  delete<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http.delete<T>(this.config.apiUrl(path), { params: toParams(params) });
  }

  /** Unwraps `{status, result}`; throws ApiError when the body says the call failed. */
  result<T>(source: Observable<Envelope<T>>): Observable<T> {
    return source.pipe(
      map((body) => {
        if (body && typeof body.status === 'number' && body.status >= 400) {
          throw new ApiError(body.status, errorText(body, `HTTP ${body.status}`), { body });
        }
        return body.result;
      }),
    );
  }
}

export function toParams(params?: QueryParams): HttpParams {
  let out = new HttpParams();
  if (!params) return out;
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    out = out.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return out;
}

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ConfigService } from '@core/config/config.service';
import { ApiError, errorText } from '@core/http/api-error';
import { QueryParams, toParams } from '@core/http/api-client';
import {
  AdjustmentsRequest,
  AdjustmentsResponse,
  ConfigDetail,
  ConfigStatusRequest,
  ConfigStatusResponse,
  ConfigsQuery,
  ConfigsResponse,
  CreateConfigRequest,
  CreateConfigResponse,
  DashboardQuery,
  DashboardResponse,
  HistoryQuery,
  HistoryResponse,
  Lookups,
  LookupsQuery,
  OpportunitiesQuery,
  OpportunitiesResponse,
  PeriodStatusRequest,
  PeriodStatusResponse,
  PeriodsResponse,
  SaveWorkspaceRequest,
  SaveWorkspaceResponse,
  SummaryRequest,
  SummaryResponse,
  TargetsQuery,
  TargetsResponse,
} from './forecast.types';

/** Base path ของแท็บ "Endpoint ที่ใช้" (`/api/v1/forecast`) ต่อจาก `api.service` ซึ่งลงท้ายด้วย `/api/v1` อยู่แล้ว */
export const FORECAST_BASE = '/forecast';

/**
 * ทุก HTTP call ของเมนู Forecast — 14 endpoint ตามแท็บ "Endpoint ที่ใช้" ของต้นแบบ (method + path + พารามิเตอร์ตรงตามนั้น).
 *
 *   EP-01 GET  /lookups                  EP-08 POST /summary
 *   EP-02 GET  /configs                  EP-09 GET  /opportunities
 *   EP-03 GET  /configs/{id}             EP-10 POST /adjustments
 *   EP-04 POST /configs                  EP-11 GET  /configs/{id}/periods
 *   EP-05 PUT  /configs/{id}             EP-12 POST /periods/{id}/status
 *   EP-06 POST /configs/{id}/status      EP-13 GET  /dashboard
 *   EP-07 GET  /configs/{id}/targets     EP-14 GET  /history   (+ format=xlsx = Export)
 *
 * อยู่ใต้ triplesale-service (`config.serviceUrl`) : path ของแท็บคือ `/api/v1/forecast/*` และ `api.service` คือ `<gateway>/api/v1`,
 * ตารางที่อ่าน (opportunity · employee · sale_person …) เป็นของ service นี้ และ "businessentityid มาจาก session" = Bearer token
 * ที่ `bearerInterceptor` แนบให้เอง — ไม่ส่งบริษัท/ผู้ใช้ใน request.
 *
 * คำตอบ : รับทั้งซองมาตรฐานของ service (`{status, message, result}`) และตัวข้อมูลตรง ๆ ; สิ่งที่ไม่ใช่ JSON object
 * (เช่น index.html ที่ dev server ตอบแทนเส้นทางที่ไม่มี) ถือว่าเรียกไม่สำเร็จ (status 0) — ForecastBackend จะตกไปใช้ข้อมูลจำลอง.
 * ห้ามเรียกไฟล์นี้จาก component โดยตรง : หน้าเรียกผ่าน ForecastBackend.
 */
@Injectable({ providedIn: 'root' })
export class ForecastApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);

  /** EP-01 ข้อมูลอ้างอิงสำหรับหน้าจอ */
  lookups(q: LookupsQuery = {}): Observable<Lookups> {
    return this.get('/lookups', { configId: q.configId, include: q.include });
  }

  /** EP-02 รายการ Configuration */
  configs(q: ConfigsQuery = {}): Observable<ConfigsResponse> {
    return this.get('/configs', { year: q.year, status: q.status, sort: q.sort });
  }

  /** EP-03 รายละเอียด Configuration และประวัติ Version (`include=versions`) */
  configDetail(id: string, include?: string): Observable<ConfigDetail> {
    return this.get(`/configs/${seg(id)}`, { include });
  }

  /** EP-04 สร้าง Configuration (หรือคัดลอกเป็นปีถัดไปด้วย `copyFromId`) */
  createConfig(body: CreateConfigRequest): Observable<CreateConfigResponse> {
    return this.unwrap(this.http.post<unknown>(this.url('/configs'), body));
  }

  /** EP-05 บันทึก Workspace (Configuration + Sales Target) */
  saveWorkspace(id: string, body: SaveWorkspaceRequest): Observable<SaveWorkspaceResponse> {
    return this.unwrap(this.http.put<unknown>(this.url(`/configs/${seg(id)}`), body));
  }

  /** EP-06 เปลี่ยนสถานะ Configuration : release | block | unblock | delete */
  configStatus(id: string, body: ConfigStatusRequest): Observable<ConfigStatusResponse> {
    return this.unwrap(this.http.post<unknown>(this.url(`/configs/${seg(id)}/status`), body));
  }

  /** EP-07 อ่าน Sales Target ของเดือนและ Pipeline ที่เลือก */
  targets(id: string, q: TargetsQuery): Observable<TargetsResponse> {
    return this.get(`/configs/${seg(id)}/targets`, { periodIds: q.periodIds, pipelineId: q.pipelineId, teamId: q.teamId });
  }

  /** EP-08 คำนวณยอด Forecast (สรุป + Preview เมื่อส่ง `draft`) */
  summary(body: SummaryRequest): Observable<SummaryResponse> {
    return this.unwrap(this.http.post<unknown>(this.url('/summary'), body));
  }

  /** EP-09 รายการ Opportunity ของงวด */
  opportunities(q: OpportunitiesQuery): Observable<OpportunitiesResponse> {
    return this.get('/opportunities', {
      periodId: q.periodId,
      pipelineId: q.pipelineId,
      teamId: q.teamId,
      employeeId: q.employeeId,
      page: q.page,
      pageSize: q.pageSize,
    });
  }

  /** EP-10 บันทึก Opportunity Judgment และ Manager Adjustment */
  saveAdjustments(body: AdjustmentsRequest): Observable<AdjustmentsResponse> {
    return this.unwrap(this.http.post<unknown>(this.url('/adjustments'), body));
  }

  /** EP-11 รายการงวดของปี (`includeTotals` = คำนวณ Target และ Final ปัจจุบันด้วย) */
  periods(id: string, includeTotals = false): Observable<PeriodsResponse> {
    return this.get(`/configs/${seg(id)}/periods`, { includeTotals: includeTotals || undefined });
  }

  /** EP-12 ปิดงวด / เปิดงวดอีกครั้ง */
  periodStatus(periodId: string, body: PeriodStatusRequest): Observable<PeriodStatusResponse> {
    return this.unwrap(this.http.post<unknown>(this.url(`/periods/${seg(periodId)}/status`), body));
  }

  /** EP-13 ข้อมูลกราฟ Dashboard */
  dashboard(q: DashboardQuery): Observable<DashboardResponse> {
    return this.get('/dashboard', { level: q.level, year: q.year, quarter: q.quarter, month: q.month, pipelineId: q.pipelineId, teamId: q.teamId });
  }

  /** EP-14 ประวัติการเปลี่ยนแปลง */
  history(q: HistoryQuery = {}): Observable<HistoryResponse> {
    return this.get('/history', historyParams(q));
  }

  /** EP-14 Export Excel ด้วยตัวกรองเดียวกัน (`format=xlsx`) */
  historyExport(q: HistoryQuery = {}): Observable<Blob> {
    return this.http.get(this.url('/history'), { params: toParams({ ...historyParams(q), format: 'xlsx' }), responseType: 'blob' });
  }

  private url(path: string): string {
    return this.config.serviceUrl(FORECAST_BASE + path);
  }

  private get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.unwrap(this.http.get<unknown>(this.url(path), { params: toParams(params) }));
  }

  private unwrap<T>(source: Observable<unknown>): Observable<T> {
    return source.pipe(
      map((body) => {
        if (!body || typeof body !== 'object') throw new ApiError(0, 'Forecast API: unexpected response');
        const b = body as { status?: unknown; result?: unknown };
        if (typeof b.status === 'number' && 'result' in b) {
          if (b.status >= 400) throw new ApiError(b.status, errorText(body, `HTTP ${b.status}`), { body });
          if (!b.result || typeof b.result !== 'object') throw new ApiError(0, 'Forecast API: unexpected response');
          return b.result as T;
        }
        return body as T;
      }),
    );
  }
}

/** ตัวคั่นเส้นทาง : id มาจาก server จึงเข้ารหัสไว้เสมอ */
const seg = (id: string): string => encodeURIComponent(id);

function historyParams(q: HistoryQuery): QueryParams {
  return { type: q.type, configId: q.configId, periodId: q.periodId, from: q.from, to: q.to, page: q.page, pageSize: q.pageSize };
}

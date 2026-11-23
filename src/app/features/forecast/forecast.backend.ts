import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { ForecastApi } from './forecast.api';
import { mockupEnabled } from '@core/mockup/mockup-datasource';
import { journaledSync } from '@core/mockup/mockup-journal';
import { ForecastMock, MockRole } from './forecast.mock';
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

/**
 * API ยังใช้งานไม่ได้ = ต่อไม่ได้ (0) · ไม่มี route (404 / 405) · server ล้ม (5xx รวม 501 ของ mock interceptor) ·
 * ตอบ 2xx แต่ไม่ใช่ JSON (dev server ส่ง index.html แทนเส้นทางที่ไม่มี). ที่เหลือ (401 / 403 / 409 / 422 / 423 …) คือ
 * คำตอบของ API ที่ทำงานอยู่ — ส่งต่อให้หน้าแสดงข้อความ ไม่สลับไปข้อมูลจำลอง.
 */
export function isUnavailable(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return false;
  return status === 0 || status === 404 || status === 405 || status >= 500 || (status >= 200 && status < 300);
}

/**
 * ที่เดียวที่หน้า Forecast ใช้ขอข้อมูล : **เรียก API จริงก่อนทุกครั้ง** (forecast.api.ts) แล้วถ้า API ยังใช้งานไม่ได้
 * จึงตอบจาก server จำลอง (forecast.mock.ts = ข้อมูลชุดเดียวกับต้นแบบ) — หน้าจึงใช้งานได้ครบโดยไม่มี backend และพอ backend
 * พร้อม ก็ได้ข้อมูลจริงเองโดยไม่ต้องแก้หน้า.
 *
 * `offline` = มีคำขอที่ตอบจากข้อมูลจำลอง (หน้าแสดงป้าย "ข้อมูลตัวอย่าง" + ตัวเลือกบริษัท / บทบาทจำลองของต้นแบบ).
 * ข้อจำกัด : ตัดสินทีละคำขอ — ถ้า backend มีแค่บาง endpoint ข้อมูลจริงกับข้อมูลจำลองจะปนกัน (ใช้ได้เฉพาะช่วงพัฒนา).
 */
// FAST-DEBT(API): backend Forecast ยังไม่มี · ยังไม่เคยยิง API จริง · ตกไปใช้ข้อมูลจำลอง (forecast.mock.ts) · รูปคำตอบใน forecast.types.ts ที่ติด (เพิ่ม) เป็นการตีความเอง · เมื่อ backend พร้อมให้ยืนยันรูปคำตอบแล้วตัด fallback · somyot · 2026-11-19
@Injectable({ providedIn: 'root' })
export class ForecastBackend {
  private readonly api = inject(ForecastApi);
  private mockServer: ForecastMock | null = null;

  readonly offline = signal(false);

  /** server จำลอง (สร้างเมื่อใช้ครั้งแรก ; สถานะอยู่จนกว่าจะโหลดหน้าใหม่) */
  get mock(): ForecastMock {
    return (this.mockServer ??= journaledForecast());
  }

  /** บริษัท / บทบาทจำลองของต้นแบบ — มีผลกับข้อมูลจำลองเท่านั้น (API จริงรู้จาก token) */
  setMockSession(patch: { company?: string; role?: MockRole }): void {
    this.mock.session = { ...this.mock.session, ...patch };
  }

  lookups(q: LookupsQuery = {}): Promise<Lookups> {
    return this.call(() => this.api.lookups(q), (m) => m.lookups(q));
  }
  configs(q: ConfigsQuery = {}): Promise<ConfigsResponse> {
    return this.call(() => this.api.configs(q), (m) => m.configs(q));
  }
  configDetail(id: string, include?: string): Promise<ConfigDetail> {
    return this.call(() => this.api.configDetail(id, include), (m) => m.config(id, include));
  }
  createConfig(body: CreateConfigRequest): Promise<CreateConfigResponse> {
    return this.call(() => this.api.createConfig(body), (m) => m.createConfig(body));
  }
  saveWorkspace(id: string, body: SaveWorkspaceRequest): Promise<SaveWorkspaceResponse> {
    return this.call(() => this.api.saveWorkspace(id, body), (m) => m.saveWorkspace(id, body));
  }
  configStatus(id: string, body: ConfigStatusRequest): Promise<ConfigStatusResponse> {
    return this.call(() => this.api.configStatus(id, body), (m) => m.configStatus(id, body));
  }
  targets(id: string, q: TargetsQuery): Promise<TargetsResponse> {
    return this.call(() => this.api.targets(id, q), (m) => m.targets(id, q));
  }
  summary(body: SummaryRequest): Promise<SummaryResponse> {
    return this.call(() => this.api.summary(body), (m) => m.summary(body));
  }
  opportunities(q: OpportunitiesQuery): Promise<OpportunitiesResponse> {
    return this.call(() => this.api.opportunities(q), (m) => m.opportunities(q));
  }
  saveAdjustments(body: AdjustmentsRequest): Promise<AdjustmentsResponse> {
    return this.call(() => this.api.saveAdjustments(body), (m) => m.saveAdjustments(body));
  }
  periods(id: string, includeTotals = false): Promise<PeriodsResponse> {
    return this.call(() => this.api.periods(id, includeTotals), (m) => m.periods(id, includeTotals));
  }
  periodStatus(periodId: string, body: PeriodStatusRequest): Promise<PeriodStatusResponse> {
    return this.call(() => this.api.periodStatus(periodId, body), (m) => m.periodStatus(periodId, body));
  }
  dashboard(q: DashboardQuery): Promise<DashboardResponse> {
    return this.call(() => this.api.dashboard(q), (m) => m.dashboard(q));
  }
  history(q: HistoryQuery = {}): Promise<HistoryResponse> {
    return this.call(() => this.api.history(q), (m) => m.history(q));
  }

  /** ไฟล์ Excel ของประวัติ ; `null` = API ยังใช้งานไม่ได้ (ต้นแบบก็ยังไม่มีไฟล์จริง — หน้าแจ้งผู้ใช้แทน) */
  async historyExport(q: HistoryQuery = {}): Promise<Blob | null> {
    try {
      const file = await firstValueFrom(this.api.historyExport(q));
      // dev server ตอบ index.html (text/html) แทนเส้นทางที่ไม่มี
      return file.type.includes('html') ? this.fellBack(null) : file;
    } catch (err) {
      if (!isUnavailable(err)) throw err;
      return this.fellBack(null);
    }
  }

  private async call<T>(real: () => Observable<T>, mock: (m: ForecastMock) => T): Promise<T> {
    // the mockup has no /forecast service, and asking one with its mock sign-in token comes back 401 — which ends the session — so the sample data answers at once
    if (mockupEnabled()) return this.fellBack(mock(this.mock));
    let out: T;
    try {
      out = await firstValueFrom(real());
    } catch (err) {
      if (!isUnavailable(err)) throw err;
      return this.fellBack(mock(this.mock));
    }
    return out;
  }

  private fellBack<T>(value: T): T {
    this.offline.set(true);
    return value;
  }
}

/** the changes the user makes on the sample data are kept in Datasource/journal.forecast.json (mockup file server) and replayed at the next start */
function journaledForecast(): ForecastMock {
  return journaledSync<ForecastMock, ForecastMock['session']>('forecast', {
    make: () => new ForecastMock(),
    writes: ['createConfig', 'saveWorkspace', 'configStatus', 'saveAdjustments', 'periodStatus'],
    context: (mock) => ({
      get: () => ({ ...mock.session }),
      set: (value) => {
        mock.session = { ...value };
      },
    }),
    // the company and the role the user chose are not in the journal: they stay when the copy is built again
    carry: (from, to) => {
      to.session = { ...from.session };
    },
  });
}

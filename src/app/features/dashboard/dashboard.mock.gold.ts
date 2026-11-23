/**
 * Fake "gold" API of the two iframe tabs of the Dashboard: the calendar (ปฏิทินงาน) and the KPI event movements.
 *
 * The real service is `dashboard-triplesale-service` (`/calendar`, `/calendar-task`, `/my-task`, `/my-calendar-list`,
 * `/my-task-list`, `/eventmovements[/{id}]`, `/masters/*`). Here the same paths are answered from two small in-memory stores so
 * that creating a task, editing a KPI row or deleting one behaves like the real thing for as long as the page is open.
 *
 * Framework-free (no Angular imports): the comparison harness loads this file in Node.
 */
/** "today" of the fake data — fixed so that days-pending and the like are the same on every run */
import { SEED_EMPLOYEES } from '@core/mock/crm-seed';
import { reference } from '@core/mock/reference';

export const MOCK_TODAY = '2026-10-20';

const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (result: unknown): Response => json({ status: 200, message: 'OK', result });

// ---- master data ------------------------------------------------------------------------------------------------------
const CAST_EMPLOYEES = SEED_EMPLOYEES.slice(0, 6).map((e) => ({ id: Number(e.code.slice(1)), code: e.code, name: e.name }));
const MASTERS: Record<string, Record<string, unknown>[]> = reference<Record<string, Record<string, unknown>[]>>('dashboard.goldMasters', {
  branches: [
    { id: 1, code: 'SUN', name: 'SUN GATEWAY' },
    { id: 2, code: 'GOLD', name: 'GOLD' },
    { id: 3, code: 'ACE', name: 'ACE' },
  ],
  pillars: ['P1', 'P2', 'P3', 'P4', 'P5'].map((code, i) => ({ id: i + 1, code, name: ['Sales', 'Service', 'Credit', 'Collection', 'Growth'][i] })),
  'task-types': [
    { id: 1, code: 'TT01', name: 'ติดตามลูกค้า', taskType: 'normal' },
    { id: 2, code: 'TT02', name: 'นัดหมายพบลูกค้า', taskType: 'trackingsetdate' },
    { id: 3, code: 'TT03', name: 'ส่งเอกสาร', taskType: 'normal' },
    { id: 4, code: 'TT04', name: 'ประสานงานภายใน', taskType: 'normal' },
  ],
  'pillar-tasks': [
    { id: 1, code: 'PT01', name: 'โทรสอบถามความสนใจ' },
    { id: 2, code: 'PT02', name: 'นำเสนอผลิตภัณฑ์' },
    { id: 3, code: 'PT03', name: 'รวบรวมเอกสารประกอบ' },
    { id: 4, code: 'PT04', name: 'ติดตามผลการอนุมัติ' },
  ],
  products: [
    { id: 1, code: 'PD01', name: 'สินเชื่อบุคคล' },
    { id: 2, code: 'PD02', name: 'สินเชื่อธุรกิจ' },
    { id: 3, code: 'PD03', name: 'สินเชื่อที่อยู่อาศัย' },
  ],
  prospects: Array.from({ length: 12 }, (_, i) => ({ id: 2000 + i, code: `PS26-${String(i + 1).padStart(5, '0')}`, name: ['คุณสมชาย ใจดี', 'คุณวิชัย มั่นคง', 'คุณนภา ทองดี', 'คุณธนากร บุญมา', 'Mr. Kenji Tanaka', 'Ms. Emma Brown', 'คุณมาลี ศรีสุข', 'คุณกิตติ วงศ์ไทย', 'Mr. Wei Chen', 'คุณรัตนา แสงทอง', 'คุณภานุ รักษา', 'Mr. Hans Mueller'][i] })),
  contacts: [
    { id: 1, code: 'CH01', name: 'โทรศัพท์' },
    { id: 2, code: 'CH02', name: 'LINE OA' },
    { id: 3, code: 'CH03', name: 'Facebook' },
    { id: 4, code: 'CH04', name: 'พบหน้า' },
  ],
  levels: [
    { id: 1, code: 'LV1', name: 'ด่วนมาก', sla: 4, kpiUnitCode: 'Hour', kpiUnitId: 1 },
    { id: 2, code: 'LV2', name: 'ด่วน', sla: 1, kpiUnitCode: 'Day', kpiUnitId: 2 },
    { id: 3, code: 'LV3', name: 'ปกติ', sla: 3, kpiUnitCode: 'Day', kpiUnitId: 2 },
  ],
  'kpi-tasks': [
    { id: 1, code: 'KT01', name: 'จำนวนสายที่ติดต่อได้' },
    { id: 2, code: 'KT02', name: 'จำนวนนัดหมายสำเร็จ' },
    { id: 3, code: 'KT03', name: 'มูลค่าสินเชื่อที่ปิดได้' },
  ],
  employees: CAST_EMPLOYEES,
  'kpi-units': [
    { id: 1, code: 'Hour', name: 'ชั่วโมง' },
    { id: 2, code: 'Day', name: 'วัน' },
    { id: 3, code: 'Percent', name: '%' },
  ],
});
const EMPLOYEES = MASTERS['employees'] as { id: number; code: string; name: string }[];

// ---- calendar ---------------------------------------------------------------------------------------------------------
interface Task {
  id: number;
  title_task: string;
  description_task: string;
  appointment_date: string;
  appointment_time: string;
  start_repeat: string;
  stop_repat: string;
  repeat_time: string;
  status: string;
  schedule_type: string;
  user_owner: string;
  assign_toid: string;
  assign_tocode: string;
  assign_toname: string;
  assige_toshared: unknown[];
  calendarmasterid: string;
  calendarmastercode: string;
  calendarmastername: string;
  createAttachItems: unknown[];
  successAttachItems: unknown[];
  [k: string]: unknown;
}
interface Schedule {
  id: number;
  name: string;
  code: string;
  calendarTypeName: 'MyCalendar' | 'TaskCalendar';
  task_list: Task[];
}

/** the calendars (`type`: MyCalendar / TaskCalendar) and their tasks as [title, date, time ('' = all day), kind (appointment / task), status, owner, description] */
const CALENDARS = reference<Record<string, string | number>[]>('dashboard.goldCalendars', [
  { id: 1, name: 'งานของฉัน', code: 'MY01', type: 'MyCalendar' },
  { id: 2, name: 'ติดตามลูกค้า', code: 'MY02', type: 'MyCalendar' },
  { id: 3, name: 'งานทีม', code: 'TK01', type: 'TaskCalendar' },
]);
const CALENDAR_TASKS = reference<Record<string, string[][]>>('dashboard.goldCalendarTasks', {
  MY01: [
    ['ประชุมสรุปยอดประจำสัปดาห์', '2026-10-05', '09:30', 'appointment', 'done', 'demo', 'ห้องประชุมใหญ่ ชั้น 5'],
    ['ส่งรายงาน Pipeline', '2026-10-09', '', 'task', 'done', 'demo', ''],
    ['อบรมระบบ Triple Sales', '2026-10-14', '13:00', 'appointment', 'done', 'demo', ''],
    ['ประชุมทีมขายรายเดือน', '2026-10-20', '10:00', 'appointment', 'doing', 'demo', 'วาระ: เป้าหมายไตรมาส 4'],
    ['เตรียมเอกสารนำเสนอลูกค้า', '2026-10-20', '', 'task', 'doing', 'demo', ''],
    ['โทรติดตามลีดค้างทำ', '2026-10-22', '14:30', 'task', 'doing', 'demo', ''],
    ['พบลูกค้า คุณสมชาย', '2026-10-27', '11:00', 'appointment', 'doing', 'demo', ''],
  ],
  MY02: [
    ['ติดตามผลอนุมัติสินเชื่อ — คุณวิชัย', '2026-10-12', '10:15', 'task', 'done', 'demo', ''],
    ['นัดตรวจสอบเอกสาร — Mr. Kenji', '2026-10-16', '15:00', 'appointment', 'done', 'demo', ''],
    ['แจ้งผลวิเคราะห์ — คุณนภา', '2026-10-21', '09:00', 'task', 'doing', 'demo', ''],
    ['นัดทำสัญญา — คุณธนากร', '2026-10-23', '13:30', 'appointment', 'doing', 'demo', ''],
    ['สำรวจความพึงพอใจหลังโอนเงิน', '2026-10-29', '', 'task', 'doing', 'demo', ''],
  ],
  TK01: [
    ['Review ลีดค้างเกิน SLA', '2026-10-08', '16:00', 'task', 'done', 'E102', ''],
    ['ประสานงานทีมวิเคราะห์', '2026-10-19', '11:30', 'task', 'doing', 'E105', ''],
    ['Kick-off แคมเปญปลายปี', '2026-10-26', '10:00', 'appointment', 'doing', 'E101', 'ร่วมกับทีม Marketing'],
    ['ส่งสรุปผลงานประจำเดือน', '2026-10-30', '', 'task', 'doing', 'E101', ''],
  ],
});

function seedCalendar(): Schedule[] {
  let tid = 500;
  const mk = (cal: Schedule, title: string, date: string, time: string, kind: 'appointment' | 'task', status: string, owner: string, desc = ''): Task => ({
    id: ++tid, title_task: title, description_task: desc, appointment_date: date, appointment_time: time ? time + ':00' : '',
    start_repeat: date, stop_repat: date, repeat_time: time ? time + ':00' : '', status, schedule_type: kind, user_owner: owner,
    assign_toid: '101', assign_tocode: 'E101', assign_toname: 'สมชาย ใจดี', assige_toshared: [],
    calendarmasterid: String(cal.id), calendarmastercode: cal.code, calendarmastername: cal.name, createAttachItems: [], successAttachItems: [],
  });
  const own = (code: string): Schedule => {
    const c = CALENDARS.find((x) => x['code'] === code);
    return { id: Number(c?.['id']), name: String(c?.['name']), code, calendarTypeName: c?.['type'] === 'TaskCalendar' ? 'TaskCalendar' : 'MyCalendar', task_list: [] };
  };
  const mine = own('MY01');
  const follow = own('MY02');
  const team = own('TK01');
  for (const cal of [mine, follow, team]) {
    for (const [title, date, time, kind, status, owner, desc] of CALENDAR_TASKS[cal.code] ?? []) {
      cal.task_list.push(mk(cal, title, date, time, kind === 'appointment' ? 'appointment' : 'task', status, owner, desc));
    }
  }
  return [mine, follow, team];
}

// ---- KPI event movements ----------------------------------------------------------------------------------------------
interface EventMovement {
  id: number;
  [k: string]: unknown;
}
function seedEvents(): EventMovement[] {
  const STATUS = ['Open', 'In Progress', 'Done', 'Closed'];
  const out: EventMovement[] = [];
  for (let i = 0; i < 24; i++) {
    const tt = MASTERS['task-types'][i % 4];
    const jt = MASTERS['pillar-tasks'][i % 4];
    const pd = MASTERS['products'][i % 3];
    const pr = MASTERS['prospects'][i % 12];
    const lv = MASTERS['levels'][i % 3];
    const ch = MASTERS['contacts'][i % 4];
    const kt = MASTERS['kpi-tasks'][i % 3];
    const un = MASTERS['kpi-units'][i % 3];
    const pl = MASTERS['pillars'][i % 5];
    const emp = EMPLOYEES[i % 6];
    const day = 1 + ((i * 3) % 27);
    const month = i < 10 ? '09' : '10';
    const start = `2026-${month}-${pad2(day)} ${pad2(8 + (i % 9))}:${i % 2 ? '30' : '00'}:00`;
    const st = STATUS[i % 4];
    out.push({
      id: 9000 + i,
      txno: `KPI-2026-${String(i + 1).padStart(5, '0')}`,
      pillar: pl['name'], pillarId: pl['id'], pillarCode: pl['code'],
      kpiTaskTypeName: tt['name'], kpiTaskTypeId: tt['id'],
      kpiPilerTaskName: jt['name'], kpiPilerTaskId: jt['id'],
      prospectName: pr['name'], prospectId: pr['id'],
      kpiProductName: pd['name'], kpiProductId: pd['id'],
      detail: ['โทรสอบถามความสนใจสินเชื่อ', 'นำเสนอผลิตภัณฑ์และเงื่อนไข', 'รวบรวมเอกสารประกอบการขอสินเชื่อ', 'ติดตามผลการอนุมัติ'][i % 4],
      solution: st === 'Done' || st === 'Closed' ? 'ดำเนินการเรียบร้อย ลูกค้ารับทราบ' : '',
      eventStatus: st,
      startDate: start,
      closeDate: st === 'Closed' ? start.replace(/ \d\d:/, ' 17:') : '',
      targetClose: '',
      contactChannelName: ch['name'], contactChannelId: ch['id'],
      kpiLevelName: lv['name'], kpiLevelId: lv['id'],
      kpiTopic: kt['name'], kpiTopicId: kt['id'],
      keyFigure: String(10 + i * 3),
      kpiUnit: un['name'], kpiUnitId: un['id'],
      assingToName: emp.name, assingToId: emp.id,
      createByName: 'demo', createBy: 'demo',
      createTime: `2026-${month}-${pad2(day)} 08:00:00`,
      createAttachItems: i % 5 === 0 ? [{ description: 'ใบเสนอราคา', attachFile: [{ detailOrderNo: 1, url: 'https://example.invalid/files/quotation.pdf' }], attachFileTypeId: 1, attachFileTypeCode: 'DOC', attachFileTypeName: 'เอกสาร' }] : [],
      successAttachItems: [],
    });
  }
  return out;
}

const KPI_COLUMNS = reference<string[][]>('dashboard.goldKpiColumns', [
  ['txno', 'เลขที่เอกสาร'], ['pillar', 'Pillar'], ['kpitasktype', 'ประเภทงาน'], ['kpijobtitle', 'หัวข้องาน'], ['kpiproduct', 'บริการ'],
  ['prospect', 'ลูกค้า'], ['channel', 'ช่องทาง'], ['priority', 'ความสำคัญ'], ['eventstatus', 'สถานะevents'], ['startdate', 'วันที่เริ่มกิจกรรม'],
  ['detail', 'รายละเอียด'], ['closedate', 'วันที่ปิดกิจกรรม'], ['solution', 'สรุปการดำเนินการ'], ['kpitopic', 'หัวข้อ KPI'], ['keyfigure', 'key figure'],
  ['kpiunit', 'KPI Unit'], ['responsibleby', 'ผู้รับผิดชอบ'], ['createby', 'ผู้จัดทำ'], ['createtime', 'เวลาที่สร้างเอกสาร'],
]).map(([field, title]) => ({ field, title, type: field === 'startdate' || field === 'closedate' || field === 'createtime' ? 'datetime' : 'string' }));
const STATUS_OPTIONS = reference('dashboard.goldStatusOptions', ['Open', 'In Progress', 'Done', 'Closed']);

/** the record the page keeps for one event movement (Java: CalendarDashboardBean.fromEventMovementJSON) */
function toKpiRecord(api: EventMovement, rid: number): Record<string, unknown> {
  const s = (k: string): string => (api[k] == null ? '' : String(api[k]));
  const idStr = (k: string): string => {
    const v = parseInt(String(api[k]), 10);
    return !isNaN(v) && v > 0 ? String(v) : '';
  };
  const txno = s('txno') || String(api.id);
  return {
    _rid: String(rid), eventId: String(api.id), txno, refdocno: txno,
    pillar: s('pillar'), pillarId: idStr('pillarId'), pillarCode: s('pillarCode'),
    kpitasktype: s('kpiTaskTypeName'), kpitasktypeId: idStr('kpiTaskTypeId'),
    kpijobtitle: s('kpiPilerTaskName'), kpijobtitleId: idStr('kpiPilerTaskId'),
    prospect: s('prospectName'), prospectId: idStr('prospectId'),
    kpiproduct: s('kpiProductName'), kpiproductId: idStr('kpiProductId'),
    detail: s('detail'), solution: s('solution'), eventstatus: s('eventStatus'), startdate: s('startDate'), closedate: s('closeDate'),
    targetClose: s('targetClose'), targetDate: s('targetClose'),
    channel: s('contactChannelName'), channelId: idStr('contactChannelId'),
    priority: s('kpiLevelName'), priorityId: idStr('kpiLevelId'),
    kpitopic: s('kpiTopic'), kpitopicId: idStr('kpiTopicId'),
    keyfigure: s('keyFigure'), kpiunit: s('kpiUnit'), kpiunitId: idStr('kpiUnitId'),
    responsibleby: s('assingToName'), responsiblebyId: idStr('assingToId'),
    createby: s('createByName'), createByName: s('createByName'), createtime: s('createTime'),
    createAttachItems: api['createAttachItems'] ?? [], successAttachItems: api['successAttachItems'] ?? [],
  };
}

// ---- the store + router ----------------------------------------------------------------------------------------------
export interface GoldMock {
  /** answers `path` (relative to the gold API base, e.g. "/calendar") or returns null when it is not one of ours */
  answer(path: string, url: URL, init?: RequestInit): Response | null;
  /** the values CalendarDashboardView rendered into the calendar frame */
  calendarValues(goldApi: string, employeeCode: string): Record<string, string>;
  /** the value CalendarDashboardView rendered into the KPI frame */
  kpiListDataJson(): string;
}

export function createGoldMock(): GoldMock {
  const calendars = seedCalendar();
  const events = seedEvents();
  let nextTaskId = 900;
  let nextCalendarId = 10;
  let nextEventId = 9500;

  const bodyOf = (init?: RequestInit): Record<string, unknown> => {
    try {
      return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  /** schedules that match the filters of GET /calendar (calendartype = names separated by commas) */
  const schedules = (q: URLSearchParams): Schedule[] => {
    const ct = q.get('calendartype') ?? 'all';
    const names = ct === 'all' || ct === '' ? null : new Set(ct.split(',').map((x) => x.trim()));
    return calendars.filter((c) => !names || names.has(c.name));
  };
  const eventOf = (t: Task, c: Schedule): Record<string, unknown> => ({
    id: `${c.id}-${t.id}`, scheduleId: c.id, taskId: t.id, title: t.title_task, date: t.appointment_date,
    start: t.appointment_time ? t.appointment_time.slice(0, 5) : null, end: null, allDay: !t.appointment_time,
    type: 'event', color: 'blue', calendar: c.name, reminderMinutes: 0, description: t.description_task,
  });

  const answer: GoldMock['answer'] = (path, url, init) => {
    const q = url.searchParams;
    const method = (init?.method ?? 'GET').toUpperCase();

    if (path === '/calendar') {
      if (method === 'POST') {
        const name = String(bodyOf(init)['name'] ?? '').trim();
        if (!name) return json({ status: 400, message: 'name is required' }, 400);
        const id = ++nextCalendarId;
        calendars.push({ id, name, code: 'MY' + id, calendarTypeName: 'MyCalendar', task_list: [] });
        return ok({ id });
      }
      return json({ status: 200, message: 'OK', result: schedules(q), meta: { page: 1, perPage: 20, total: calendars.length, totalPages: 1 } });
    }
    if (path === '/calendar-task') {
      const b = bodyOf(init);
      if (method === 'POST') {
        const cal = calendars.find((c) => String(c.id) === String(b['calendarmasterid'])) ?? calendars[0];
        const id = ++nextTaskId;
        const date = String(b['start_repeat'] ?? '') || MOCK_TODAY;
        const time = String(b['repeat_time'] ?? '');
        cal.task_list.push({
          id, title_task: String(b['title_task'] ?? ''), description_task: String(b['description_task'] ?? ''), appointment_date: date, appointment_time: time,
          start_repeat: date, stop_repat: String(b['stop_repat'] ?? date), repeat_time: time, status: String(b['status'] ?? 'doing'),
          schedule_type: String(b['schedule_type'] ?? 'appointment'), user_owner: String(b['user_ownser'] ?? ''),
          assign_toid: String(b['assign_toid'] ?? ''), assign_tocode: String(b['assign_tocode'] ?? ''), assign_toname: String(b['assign_toname'] ?? ''),
          assige_toshared: (b['assige_toshared'] as unknown[]) ?? [], calendarmasterid: String(cal.id), calendarmastercode: cal.code, calendarmastername: cal.name,
          createAttachItems: (b['createattachItems'] as unknown[]) ?? [], successAttachItems: [],
        });
        return ok({ id });
      }
      if (method === 'PUT') {
        for (const c of calendars) {
          const t = c.task_list.find((x) => String(x.id) === String(b['id']));
          if (!t) continue;
          t.title_task = String(b['title_task'] ?? t.title_task);
          t.description_task = String(b['description_task'] ?? t.description_task);
          t.status = String(b['status'] ?? t.status);
          const date = String(b['start_repeat'] ?? '');
          if (date) {
            t.appointment_date = date;
            t.start_repeat = date;
          }
          if (b['repeat_time'] != null) {
            t.repeat_time = String(b['repeat_time']);
            t.appointment_time = String(b['repeat_time']);
          }
          return ok({ id: t.id });
        }
        return json({ status: 404, message: 'task not found' }, 404);
      }
    }
    if (path === '/my-task') return ok(calendars.flatMap((c) => c.task_list.slice(0, 2)).map((t) => ({ id: t.id, code: 'T' + t.id, name: t.title_task })));
    if (path === '/my-calendar-list') return ok(calendars.filter((c) => c.calendarTypeName === 'MyCalendar').map((c) => ({ id: c.id, code: c.code, name: c.name })));
    if (path === '/my-task-list') return ok(calendars.filter((c) => c.calendarTypeName === 'TaskCalendar').map((c) => ({ id: c.id, code: c.code, name: c.name })));
    if (path === '/employee-gold') return ok(EMPLOYEES);
    if (path === '/calendar-detail') return ok(calendars.flatMap((c) => c.task_list).find((t) => String(t.id) === q.get('id')) ?? null);

    const master = /^\/masters\/([a-z-]+)$/.exec(path);
    if (master && master[1] in MASTERS) {
      let rows = MASTERS[master[1]];
      if (master[1] === 'levels' && q.get('kpiProductId')) rows = rows.slice(0, 2);
      return ok(rows);
    }

    if (path === '/eventmovements' && method === 'GET') {
      const f = (k: string): string => (q.get(k) ?? '').trim();
      const search = f('search').toLowerCase();
      const rows = events.filter((e) => {
        if (f('kpiTaskTypeName') && e['kpiTaskTypeName'] !== f('kpiTaskTypeName')) return false;
        if (f('kpiJobTitleName') && e['kpiPilerTaskName'] !== f('kpiJobTitleName')) return false;
        if (f('prospectName') && e['prospectName'] !== f('prospectName')) return false;
        if (f('eventStatus') && e['eventStatus'] !== f('eventStatus')) return false;
        if (f('kpiProductName') && e['kpiProductName'] !== f('kpiProductName')) return false;
        return !search || JSON.stringify(e).toLowerCase().includes(search);
      });
      return json({ status: 200, message: 'OK', result: rows, meta: { page: 1, perPage: 20, total: rows.length, totalPages: 1 } });
    }
    if (path === '/eventmovements' && method === 'POST') {
      const b = bodyOf(init);
      const id = ++nextEventId;
      const ref = (k: string): { id: number; code: string; name: string } => (b[k] as { id: number; code: string; name: string }) ?? { id: 0, code: '', name: '' };
      events.unshift({
        id, txno: `KPI-2026-${String(id - 9000 + 1).padStart(5, '0')}`,
        pillar: b['pillar'] ?? '', pillarId: b['pillarId'] ?? 0, pillarCode: b['pillarCode'] ?? '',
        kpiTaskTypeName: ref('kpiTaskType').name || b['kpiTaskTypeName'] || '', kpiTaskTypeId: ref('kpiTaskType').id,
        kpiPilerTaskName: ref('kpiPilerTask').name || b['kpiPilerTaskName'] || '', kpiPilerTaskId: ref('kpiPilerTask').id,
        prospectName: ref('prospect').name || b['prospectName'] || '', prospectId: ref('prospect').id,
        kpiProductName: ref('kpiProduct').name || b['kpiProductName'] || '', kpiProductId: ref('kpiProduct').id,
        detail: b['detail'] ?? '', solution: b['solution'] ?? '', eventStatus: b['eventStatus'] ?? 'Open', startDate: b['startDate'] ?? '', closeDate: b['closeDate'] ?? '',
        targetClose: b['targetClose'] ?? '', contactChannelName: b['contactChannelName'] ?? '', kpiLevelName: b['kpiLevelName'] ?? '', kpiTopic: b['kpiTopic'] ?? '',
        keyFigure: String(b['keyFigure'] ?? ''), kpiUnit: b['kpiUnitName'] ?? '', assingToName: b['assingToName'] ?? '', assingToId: b['assingToId'] ?? 0,
        createByName: b['createByName'] ?? 'demo', createBy: b['createByName'] ?? 'demo', createTime: `${MOCK_TODAY} 09:00:00`,
        createAttachItems: b['createAttachItems'] ?? [], successAttachItems: b['successAttachItems'] ?? [],
      });
      return ok({ id });
    }
    const one = /^\/eventmovements\/(\d+)$/.exec(path);
    if (one) {
      const i = events.findIndex((e) => String(e.id) === one[1]);
      if (i < 0) return json({ status: 404, message: 'not found' }, 404);
      if (method === 'DELETE') {
        events.splice(i, 1);
        return ok(null);
      }
      if (method === 'PATCH' || method === 'PUT') {
        const b = bodyOf(init);
        const e = events[i];
        for (const k of ['pillar', 'kpiTaskTypeName', 'kpiPilerTaskName', 'prospectName', 'kpiProductName', 'detail', 'solution', 'eventStatus', 'startDate', 'closeDate', 'targetClose', 'contactChannelName', 'kpiLevelName', 'kpiTopic', 'keyFigure', 'kpiUnitName', 'assingToName', 'createAttachItems', 'successAttachItems']) {
          if (k in b) e[k === 'kpiUnitName' ? 'kpiUnit' : k] = b[k];
        }
        return ok({ id: e.id });
      }
    }
    return null;
  };

  return {
    answer,
    calendarValues(goldApi, employeeCode) {
      const all = calendars.flatMap((c) => c.task_list.map((t) => eventOf(t, c)));
      return {
        calendarDataJson: JSON.stringify({ today: MOCK_TODAY, defaultYear: 2026, defaultMonth: 10, events: all }),
        calendarApiUrl: `${goldApi}/calendar`,
        employeeCode,
        myTaskListJson: JSON.stringify(calendars.flatMap((c) => c.task_list.slice(0, 2)).map((t) => ({ id: t.id, code: 'T' + t.id, name: t.title_task }))),
        calendarTaskCreateUrl: `${goldApi}/calendar-task`,
        myCalendarListJson: JSON.stringify(calendars.filter((c) => c.calendarTypeName === 'MyCalendar').map((c) => ({ id: c.id, code: c.code, name: c.name }))),
        myTaskCalendarListJson: JSON.stringify(calendars.filter((c) => c.calendarTypeName === 'TaskCalendar').map((c) => ({ id: c.id, code: c.code, name: c.name }))),
      };
    },
    kpiListDataJson() {
      const records = events.map((e, i) => toKpiRecord(e, i));
      return JSON.stringify({ columns: KPI_COLUMNS, statusOptions: STATUS_OPTIONS, records, total: records.length, masters: {} });
    },
  };
}

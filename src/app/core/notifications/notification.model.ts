/**
 * The notifications of the bell (Figma "Notification" panel): what the model of the panel holds and the pure rules the panel applies —
 * the seed of the mockup, the filter (tab · date range) and the grouping (today / earlier). Framework-free (the tests load it in Node).
 */

/** one piece of the body text: plain, bold (a name) or a link to a document / opportunity */
export interface NotificationPart {
  text: string;
  bold?: boolean;
  /** router link of a document the text names */
  link?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: NotificationPart[];
  /** when it was raised, ISO 8601 with the offset of Asia/Bangkok */
  at: string;
}

/** what a user did with the notifications (kept per user: a notification is for everybody of the company, read/hidden is each one's own) */
export interface NotificationMarks {
  read: string[];
  hidden: string[];
}

export type NotificationTab = 'all' | 'unread';
export type NotificationSection = 'today' | 'earlier';

/** the badge of the unread tab / the bell shows 99+ above this */
export const BADGE_CAP = 99;

const MS_PER_DAY = 86_400_000;
const BANGKOK_OFFSET_HOURS = 7;

const plain = (text: string): NotificationPart => ({ text });
const bold = (text: string): NotificationPart => ({ text, bold: true });
const link = (text: string, to: string): NotificationPart => ({ text, link: to });

/** `yyyy-MM-dd` of an instant in Asia/Bangkok (the zone of the whole system, whatever the machine says) */
export function bangkokDay(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Date(d.getTime() + BANGKOK_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `dd/MM/yyyy HH:mm` of an instant in Asia/Bangkok */
export function bangkokDateTime(instant: string): string {
  const shifted = new Date(new Date(instant).getTime() + BANGKOK_OFFSET_HOURS * 3_600_000);
  const day = shifted.toISOString().slice(0, 10).split('-');
  return `${day[2]}/${day[1]}/${day[0]} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** an instant `daysAgo` days before `now` at the Bangkok clock time `hour:minute` */
function instantAt(now: Date, daysAgo: number, hour: number, minute: number): string {
  const day = bangkokDay(new Date(now.getTime() - daysAgo * MS_PER_DAY));
  const utc = new Date(`${day}T${pad(hour)}:${pad(minute)}:00.000Z`);
  return new Date(utc.getTime() - BANGKOK_OFFSET_HOURS * 3_600_000).toISOString();
}

/** the notifications the mockup starts with: the four of the design, then older ones, all dated back from `now` so the panel always looks alive */
export function seedNotifications(now: Date = new Date()): NotificationItem[] {
  const at = (daysAgo: number, hour: number, minute: number): string => instantAt(now, daysAgo, hour, minute);
  return [
    {
      id: 'n-follow-up',
      title: 'ถึงกำหนดติดตามลูกค้า',
      body: [plain('วันนี้ 14:00 น. โทรติดตามคุณสารภี ใจน้อม เรื่องเอกสารสินเชื่อ')],
      at: at(0, 13, 30),
    },
    {
      id: 'n-quote-approved',
      title: 'ใบเสนอราคาของคุณกิตติพงษ์ รุ่งทิพย์ ได้รับการอนุมัติแล้ว',
      body: [
        plain('ใบเสนอราคา '),
        link('QT-2026-0089', '/sales/docs/qt'),
        plain(' ได้รับการอนุมัติจาก '),
        bold('คุณวันเพ็ญ ศรีสุข'),
        plain(' แล้ว สามารถส่งให้ลูกค้าได้ทันที หากลูกค้ายืนยัน ให้เปลี่ยนสถานะโอกาสขายเป็น "เจรจา" และนัดวันเซ็นสัญญา'),
      ],
      at: at(0, 9, 0),
    },
    {
      id: 'n-docs-uploaded',
      title: 'ลูกค้าส่งเอกสารเพิ่มเติมแล้ว',
      body: [
        plain('คุณสุรพล อุดมวงศ์ อัปโหลดสลิปเงินเดือนและ statement ย้อนหลัง 6 เดือน ในโอกาสขาย '),
        link('OPP-2026-0098', '/crm/opportunities'),
        plain(' กรุณาตรวจสอบก่อนส่งเรื่องให้ธนาคาร'),
      ],
      at: at(5, 16, 45),
    },
    {
      id: 'n-new-leads',
      title: 'มีลีดใหม่จากแคมเปญ Facebook 5 รายการ',
      body: [plain('ลีดถูกเพิ่มเข้าระบบแล้ว กรุณาติดต่อกลับภายใน 24 ชั่วโมง')],
      at: at(9, 9, 30),
    },
    {
      id: 'n-appointment',
      title: 'นัดหมายพรุ่งนี้ 10:30 น.',
      body: [plain('นัดชมรถกับคุณอนุชา แสงทอง ที่โชว์รูมสาขาพระราม 9 กรุณาเตรียมเอกสารเปรียบเทียบรุ่น')],
      at: at(10, 17, 5),
    },
    {
      id: 'n-booking-paid',
      title: 'ลูกค้าชำระเงินจองแล้ว',
      body: [plain('ใบจอง '), link('BK-2026-0041', '/sales/docs/bk'), plain(' ได้รับเงินจอง 20,000 บาท ตรวจสอบรายการรับเงินและส่งใบเสร็จให้ลูกค้า')],
      at: at(14, 11, 20),
    },
    {
      id: 'n-lead-assigned',
      title: 'ลีดถูกมอบหมายให้คุณ',
      body: [bold('คุณธนากร พงษ์ศิริ'), plain(' มอบหมายลีด '), link('LD-2026-0312', '/crm/leads'), plain(' ให้คุณดูแล')],
      at: at(16, 8, 45),
    },
    {
      id: 'n-target',
      title: 'ยอดขายเดือนนี้ถึง 80% ของเป้าแล้ว',
      body: [plain('ยอดปิดการขายสะสม 8.0 ล้านบาท จากเป้า 10.0 ล้านบาท เหลืออีก 2 ล้านบาทถึงเป้าหมาย')],
      at: at(21, 15, 0),
    },
    {
      id: 'n-opp-stale',
      title: 'โอกาสขายไม่มีความเคลื่อนไหว 7 วัน',
      body: [plain('โอกาสขาย '), link('OPP-2026-0061', '/crm/opportunities'), plain(' ยังไม่มีการติดต่อลูกค้าเกิน 7 วัน กรุณาอัปเดตสถานะ')],
      at: at(27, 10, 10),
    },
  ];
}

export interface NotificationFilter {
  tab: NotificationTab;
  /** `yyyy-MM-dd` or '' (no bound) */
  from: string;
  to: string;
}

/** the notifications the panel lists: not hidden, inside the date range (both days included), unread only on the unread tab; the newest first */
export function visibleNotifications(all: readonly NotificationItem[], marks: NotificationMarks, filter: NotificationFilter): NotificationItem[] {
  return all
    .filter((n) => !marks.hidden.includes(n.id))
    .filter((n) => {
      const day = bangkokDay(n.at);
      return (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to);
    })
    .filter((n) => filter.tab === 'all' || !marks.read.includes(n.id))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** how many not-hidden notifications are unread (the badge) */
export const unreadCount = (all: readonly NotificationItem[], marks: NotificationMarks): number =>
  all.filter((n) => !marks.hidden.includes(n.id) && !marks.read.includes(n.id)).length;

/** the text of a badge: the number, or `99+` */
export const badgeText = (count: number): string => (count > BADGE_CAP ? `${BADGE_CAP}+` : String(count));

/** which section of the panel a notification belongs to: the Bangkok day of `now` = today */
export function sectionOf(item: NotificationItem, now: Date = new Date()): NotificationSection {
  return bangkokDay(item.at) === bangkokDay(now) ? 'today' : 'earlier';
}

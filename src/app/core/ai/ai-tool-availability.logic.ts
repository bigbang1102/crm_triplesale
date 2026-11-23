/**
 * Which AI HUB tools the service cannot run right now (framework-free — see `AiToolAvailability`).
 *
 * The service (`GET /aihub-api/tools`) lists the tools it has and whether image / video rendering is switched on; the voice-over
 * tool answers `voiceover-voices` with `enabled` (a key for Azure Speech or Google Text-to-Speech is set). A tool the service
 * cannot run is shown grey and cannot be opened, instead of failing after the user typed a request.
 */

/**
 * `not-installed` = the service has no such tool · `not-configured` = it has it but the key / switch it needs is not set ·
 * `not-wired` = the service has it but this app does not feed it yet (see `NOT_WIRED`) ·
 * `no-vocals` = the music tool, while the service has no singing-voice provider (Lyria key): its songs would be instrumental only
 */
export type OffReason = 'not-installed' | 'not-configured' | 'not-wired' | 'no-vocals';

export interface ToolsInfo {
  tools?: readonly { id?: string }[];
  image?: { enabled?: boolean } | null;
  video?: { renderEnabled?: boolean } | null;
  /** `vocals` = the service has a singing-voice provider (Lyria) for the music tool; otherwise it makes instrumental demos only */
  music?: { vocals?: boolean } | null;
}

export interface VoiceInfo {
  enabled?: boolean;
}

/**
 * Tools the service runs but the Angular app cannot feed yet. `customer-brief` needs the customer's data as JSON (prospect + leads) that the Java
 * `AiHubProxyServlet` read from triplesale-service with the user's token; the page only sends `prospectId`, and the dev proxy does not build that
 * JSON, so the service answers "เลือกลูกค้าก่อน" to every call (checked 21/11/2026).
 */
// FAST-DEBT(API): สรุปลูกค้า (customer-brief) ใช้ไม่ได้จนกว่า proxy/gateway จะประกอบ JSON ลูกค้าให้ service · somyot · 2026-11-21
const NOT_WIRED: Readonly<Record<string, OffReason>> = { 'customer-brief': 'not-wired' };

/** tools that are made with another tool of the service (the GIF maker draws its frames with the image tool and joins them in the browser) */
const MADE_WITH: Readonly<Record<string, string>> = { gif: 'image' };

/**
 * `toolIds` = the tools the hub offers; `info` = the answer of `/tools` (null = the service did not answer: nothing is judged);
 * `voice` = the answer of `voiceover-voices` (null = unknown).
 */
export function unavailableTools(
  toolIds: readonly string[],
  info: ToolsInfo | null,
  voice: VoiceInfo | null,
): Record<string, OffReason> {
  const off: Record<string, OffReason> = {};
  if (!info) return off;
  const served = new Set(
    (info.tools ?? []).map((tool) => tool.id).filter((id): id is string => !!id),
  );
  const switchedOff = (id: string): boolean =>
    (id === 'image' && info.image?.enabled === false) ||
    (id === 'video' && info.video?.renderEnabled === false) ||
    (id === 'voiceover' && voice?.enabled === false);
  // a song without a singing voice is not what the user asks for: the music tool stays grey until the service can sing
  const noVocals = info.music?.vocals !== true;

  for (const id of toolIds) {
    if (id === 'music' && noVocals) {
      off[id] = 'no-vocals';
      continue;
    }
    if (NOT_WIRED[id]) {
      off[id] = NOT_WIRED[id];
      continue;
    }
    const base = MADE_WITH[id];
    if (!base && !served.has(id)) off[id] = 'not-installed';
    else if (switchedOff(base ?? id)) off[id] = 'not-configured';
  }
  return off;
}

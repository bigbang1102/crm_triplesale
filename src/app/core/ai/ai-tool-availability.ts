import { Injectable, inject, signal } from '@angular/core';
import { ConfigService } from '@core/config/config.service';
import { AI_TOOL_ROLE } from '@core/permissions/ai-hub-roles';
import {
  unavailableTools,
  type OffReason,
  type ToolsInfo,
  type VoiceInfo,
} from './ai-tool-availability.logic';

const TOOL_IDS: readonly string[] = Object.keys(AI_TOOL_ROLE);

/**
 * What the AI HUB service can run now, for the hub home and the AI HUB menu (a tool it cannot run is grey and not clickable).
 * Asked once per session; a service that does not answer (or the mock backend) leaves every tool open.
 */
@Injectable({ providedIn: 'root' })
export class AiToolAvailability {
  private readonly config = inject(ConfigService);
  private readonly state = signal<Readonly<Record<string, OffReason>>>({});
  private readonly singing = signal(false);
  private asked: Promise<void> | undefined;

  /** tool id → why it cannot be used (absent = usable) */
  readonly off = this.state.asReadonly();

  /** the music tool makes songs with a singing voice (the service has a Lyria key) */
  readonly musicVocals = this.singing.asReadonly();

  ensureLoaded(): Promise<void> {
    return (this.asked ??= this.load());
  }

  private async load(): Promise<void> {
    const { apiBase, mock, features } = this.config.value;
    if (mock && !features.aiHubService) return;
    // FAST-DEBT(SEC): same dev-proxy route as the hub page (`/triplesale/aihub`, the proxy holds the key) · production waits for the gateway (ADR-001) · somyot · 2026-11-21
    const base = `${apiBase}/aihub`;
    try {
      const info = await this.getJson<ToolsInfo & { ok?: boolean }>(`${base}/tools`);
      if (!info?.ok) return;
      this.singing.set(info.music?.vocals === true);
      const voice = await this.voiceStatus(base);
      this.state.set(unavailableTools(TOOL_IDS, info, voice));
    } catch {
      // the service is down: the hub page says so itself, nothing is greyed here
    }
  }

  private async getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json' },
    });
    return res.ok ? ((await res.json()) as T) : null;
  }

  private async voiceStatus(base: string): Promise<VoiceInfo | null> {
    try {
      const answer = await this.getJson<{ ok?: boolean; result?: VoiceInfo }>(
        `${base}/tools/voiceover-voices`,
        { method: 'POST', body: new FormData() },
      );
      return answer?.ok ? (answer.result ?? null) : null;
    } catch {
      return null;
    }
  }
}

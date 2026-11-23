import { beforeEach, describe, expect, it } from 'vitest';
import { markMusicVocals, markUnavailableTools } from './ai-hub-availability';

const reason = (r: string): string => `why:${r}`;

describe('markUnavailableTools', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement('div');
    root.innerHTML = `
      <a class="aih-tool" href="/ai/hub/voiceover"><span class="aih-tool-txt"><b>เสียงพากย์ไทย</b></span></a>
      <a class="aih-tool" href="/ai/hub/music"><span class="aih-tool-txt"><b>สร้างเพลง</b></span></a>
      <a class="aih-tool" href="/ai/translator"><span class="aih-tool-txt"><b>แปลเอกสาร</b></span></a>`;
  });
  const card = (href: string): HTMLElement => root.querySelector<HTMLElement>(`a[href="${href}"]`)!;

  it('should grey only the tools named, say why, and make them unfocusable', () => {
    markUnavailableTools(root, { voiceover: 'not-configured' }, reason, 'ยังไม่เปิดใช้งาน');
    const off = card('/ai/hub/voiceover');
    expect(off.classList.contains('is-off')).toBe(true);
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(off.getAttribute('tabindex')).toBe('-1');
    expect(off.title).toBe('why:not-configured');
    expect(off.querySelector('.aih-tool-off')?.textContent).toBe('ยังไม่เปิดใช้งาน');
    expect(card('/ai/hub/music').classList.contains('is-off')).toBe(false);
    expect(card('/ai/translator').classList.contains('is-off')).toBe(false);
  });

  it('should move the grey cards to the end of their group and put them back in the original order when usable again', () => {
    const order = (): string[] =>
      Array.from(root.querySelectorAll('a.aih-tool')).map(
        (a) => (a.getAttribute('href') ?? '').split('/').pop() ?? '',
      );
    expect(order()).toEqual(['voiceover', 'music', 'translator']);
    markUnavailableTools(root, { voiceover: 'not-configured' }, reason, 'x');
    expect(order()).toEqual(['music', 'translator', 'voiceover']);
    markUnavailableTools(root, { voiceover: 'not-configured', music: 'no-vocals' }, reason, 'x');
    expect(order()).toEqual(['translator', 'voiceover', 'music']);
    markUnavailableTools(root, {}, reason, 'x');
    expect(order()).toEqual(['voiceover', 'music', 'translator']);
  });

  it('should not add the badge twice, and should undo it when the tool works again', () => {
    markUnavailableTools(root, { voiceover: 'not-configured' }, reason, 'x');
    markUnavailableTools(root, { voiceover: 'not-configured' }, reason, 'x');
    expect(root.querySelectorAll('.aih-tool-off')).toHaveLength(1);
    markUnavailableTools(root, {}, reason, 'x');
    const back = card('/ai/hub/voiceover');
    expect(back.classList.contains('is-off')).toBe(false);
    expect(back.querySelector('.aih-tool-off')).toBeNull();
    expect(back.hasAttribute('aria-disabled')).toBe(false);
  });
});

describe('markMusicVocals', () => {
  const page = (): HTMLElement => {
    const root = document.createElement('div');
    root.innerHTML = `
      <a class="aih-tool" href="/ai/hub/music"><span class="aih-tool-txt"><b>สร้างเพลง</b><small>old card</small></span></a>
      <section class="aih-view" data-tool="music">
        <div class="aih-head-title">สร้างเพลง<small>old head</small></div>
        <div class="aih-note tip"><i></i><span>old note</span></div>
      </section>
      <section class="aih-view" data-tool="voiceover"><div class="aih-note tip"><span>voice note</span></div></section>`;
    return root;
  };
  const texts = { subtitle: 'sung', note: 'sung note' };

  it('should rewrite the card, the header and the note of the music tool only when the service can sing', () => {
    const root = page();
    markMusicVocals(root, true, texts);
    expect(root.querySelector('a.aih-tool small')?.textContent).toBe('sung');
    expect(root.querySelector('[data-tool="music"] .aih-head-title small')?.textContent).toBe(
      'sung',
    );
    expect(root.querySelector('[data-tool="music"] .aih-note.tip span')?.textContent).toBe(
      'sung note',
    );
    expect(root.querySelector('[data-tool="voiceover"] .aih-note.tip span')?.textContent).toBe(
      'voice note',
    );
  });

  it('should leave the page as generated when the service cannot sing', () => {
    const root = page();
    markMusicVocals(root, false, texts);
    expect(root.querySelector('a.aih-tool small')?.textContent).toBe('old card');
    expect(root.querySelector('[data-tool="music"] .aih-note.tip span')?.textContent).toBe(
      'old note',
    );
  });
});

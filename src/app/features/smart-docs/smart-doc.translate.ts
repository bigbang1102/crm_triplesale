/**
 * Puts the Smart Doc page in English (smart-doc.i18n.ts) while the language is English, and back to the prototype's Thai: every
 * text of the page and its placeholder / title / aria-label / alt, also what the script writes later (a MutationObserver).
 * The script's data are never touched (it keeps its own); only what is shown changes, and Thai comes back as it was.
 */

const THAI = /[฀-๿]/;
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
/** whose text is a value the user edits or the page reads as code */
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA']);

/**
 * a text in English: the whole text as a known phrase, or made of known phrases and non-Thai bits (numbers, document numbers,
 * symbols) put together; null = leave it (no Thai, or a Thai name / address / amount in words)
 */
export function translator(
  dict: Readonly<Record<string, string>>,
): (text: string) => string | null {
  const pieces = Object.entries(dict)
    .filter(([th]) => th.length > 1)
    .sort((a, b) => b[0].length - a[0].length);
  const cache = new Map<string, string | null>();
  return (text) => {
    if (!THAI.test(text)) return null;
    const hit = cache.get(text);
    if (hit !== undefined) return hit;
    const lead = /^\s*/.exec(text)?.[0] ?? '';
    const trail = /\s*$/.exec(text)?.[0] ?? '';
    const core = text.trim().replace(/\s+/g, ' ');
    let out: string | null = dict[core] ?? null;
    if (out === null) {
      let built = core;
      for (const [th, en] of pieces)
        if (built.includes(th)) built = built.split(th).join(` ${en} `);
      out = THAI.test(built)
        ? null
        : built
            .replace(/\s+/g, ' ')
            .replace(/ ([,.:;)\]%])/g, '$1')
            .replace(/([([]) /g, '$1')
            .trim();
    }
    const result = out === null ? null : lead + out + trail;
    cache.set(text, result);
    return result;
  };
}

export class PageTranslator {
  /** a text / attribute shown in English → its Thai, and the English written (a change by the script replaces both) */
  private readonly texts = new WeakMap<Text, { th: string; shown: string }>();
  private readonly attrs = new WeakMap<Element, Map<string, { th: string; shown: string }>>();
  private observer: MutationObserver | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly translate: (text: string) => string | null,
    private readonly keep: ReadonlySet<string> = new Set(),
    /** words translated otherwise inside the elements a selector finds (checked first) */
    private readonly within: readonly {
      selector: string;
      words: Readonly<Record<string, string>>;
    }[] = [],
  ) {}

  get english(): boolean {
    return this.observer !== null;
  }

  setEnglish(on: boolean): void {
    if (on === this.english) return;
    if (on) {
      this.observer = new MutationObserver((records) => this.changed(records));
      this.observer.observe(this.root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTRS,
      });
      this.visit(this.root, (n) => this.toEnglish(n));
    } else {
      this.observer?.disconnect();
      this.observer = null;
      this.visit(this.root, (n) => this.toThai(n));
    }
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private changed(records: MutationRecord[]): void {
    for (const r of records) {
      if (r.type === 'childList')
        r.addedNodes.forEach((n) => this.visit(n, (x) => this.toEnglish(x)));
      else this.toEnglish(r.target, r.attributeName ?? undefined);
    }
  }

  private visit(node: Node, each: (n: Node) => void): void {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!SKIP.has(node.parentElement?.tagName ?? '')) each(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || SKIP.has((node as Element).tagName)) return;
    each(node);
    for (const child of Array.from(node.childNodes)) this.visit(child, each);
  }

  private toEnglish(node: Node, only?: string): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const known = this.texts.get(text);
      if (known && known.shown === text.data) return; // ours
      const en = this.inPlace(text) ?? this.translate(text.data);
      if (en === null) {
        this.texts.delete(text);
        return;
      }
      this.texts.set(text, { th: text.data, shown: en });
      text.data = en;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    for (const name of only ? [only] : ATTRS) {
      const value = el.getAttribute(name);
      if (value === null || this.keep.has(value.trim())) continue;
      const map = this.attrs.get(el) ?? new Map<string, { th: string; shown: string }>();
      if (map.get(name)?.shown === value) continue; // ours
      const en = this.translate(value);
      if (en === null) {
        map.delete(name);
        continue;
      }
      map.set(name, { th: value, shown: en });
      this.attrs.set(el, map);
      el.setAttribute(name, en);
    }
  }

  /** the English a text has where it is (SMART_DOC_EN_IN), or null */
  private inPlace(text: Text): string | null {
    const el = text.parentElement;
    const core = text.data.trim();
    if (!el || !core) return null;
    for (const { selector, words } of this.within) {
      const en = words[core];
      if (en !== undefined && el.closest(selector)) return text.data.replace(core, en);
    }
    return null;
  }

  private toThai(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const known = this.texts.get(text);
      if (known && known.shown === text.data) text.data = known.th;
      this.texts.delete(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const map = this.attrs.get(el);
    if (!map) return;
    for (const [name, { th, shown }] of map)
      if (el.getAttribute(name) === shown) el.setAttribute(name, th);
    this.attrs.delete(el);
  }
}

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatorView } from './translator-view';

/**
 * AI Document Translator route (`/ai/translator`) — pages/ai_translator.xhtml, opened from the floating AI menu or the AI
 * tab. Not in PageAccessRules: every signed-in user may open it. The page texts are Thai only (like the Java page).
 */
@Component({
  selector: 'ts-translator',
  imports: [TranslatorView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-translator-view />`,
})
export class Translator {}

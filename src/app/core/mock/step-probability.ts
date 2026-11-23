/**
 * The probability (0..100) of a step of the sales pipeline by its name — the one number the design (opportunity-complete-design.md §3, §6.3) hangs the
 * closing on: an opportunity that enters a step of 100% is sold, one that enters a step of 0% is lost. Used by the opportunity list and by the detail page, so
 * both close the same opportunity in the same step.
 */
import { datasourceDoc } from '@core/mockup/mockup-datasource';

/**
 * The pipeline of the formula (a company without a Seed Workbook) has one step of 100%: the last of the loan line, where the registration of the collateral is
 * done. A company whose document has `stepProbability` uses that alone.
 * FAST-DEBT(REQ): the formula has no step of 0% (design 3: a pipeline needs one of each), so nothing closes it as lost until a configuration adds one · somyot · 2026-11-21
 */
const CODE_STEP_PROBABILITY: Record<string, number> = { จดทะเบียนหลักประกัน: 100 };

/** `ref.opportunityDetail.json` → `stepProbability` (the cast of a company writes it at the start of the app, a test sets it); undefined = an ordinary step */
export function stepProbability(name: string): number | undefined {
  const map = datasourceDoc<Record<string, unknown>>('ref.opportunityDetail')?.['stepProbability'];
  if (map === undefined) return CODE_STEP_PROBABILITY[name];
  const value = typeof map === 'object' && map !== null ? (map as Record<string, unknown>)[name] : undefined;
  return typeof value === 'number' ? value : undefined;
}

/** what entering a step of this probability does to the opportunity: the status it closes as, or undefined when it stays open */
export const closingOutcome = (probability: number | undefined): 'SUCCESS' | 'LOST' | undefined => (probability === 100 ? 'SUCCESS' : probability === 0 ? 'LOST' : undefined);

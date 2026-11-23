/**
 * What the single opportunity does not have (opportunity-complete-design.md §1, §4.1, §5): no "close opportunity" button (the system closes it on
 * entering a step of 100% / 0%), no steps of a workflow (forward to a group, send back, close the group, close the step) and the products are read-only.
 * The page is the generated Java one, which has all of those: the host hides them by the button codes of `core/permissions/access-buttons.ts`.
 * Framework-free.
 */
import type { AccessButtonCode } from '@core/permissions/access-buttons';

export const SINGLE_MODE_HIDDEN: ReadonlySet<AccessButtonCode> = new Set<AccessButtonCode>([
  'PL-OP-DT-11', // add a product (read-only)
  'PL-OP-DT-16', // forward to another group (multiple only)
  'PL-OP-DT-18', // send back (multiple only)
  'PL-OP-DT-19', // close the group (multiple only)
  'PL-OP-DT-20', // close the opportunity (the system does)
  'PL-OP-DT-27', // close the step (multiple only)
]);

let enabled = true;
/** the specs of the generated Java page turn it off to check every button code of the page (its own spec turns it on) */
export const setSingleMode = (on: boolean): void => {
  enabled = on;
};

/** whether a button of the page is drawn: not one the single opportunity lacks, and one the person may use */
export const accessInSingleMode = (code: AccessButtonCode, canUse: (code: AccessButtonCode) => boolean): boolean => !(enabled && SINGLE_MODE_HIDDEN.has(code)) && canUse(code);

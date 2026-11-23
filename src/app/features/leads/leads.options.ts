/**
 * The choices of the Lead form that are not Leads: the dial codes and the countries (`ref.leads.json` › `phoneCodes` / `countries` of the shared
 * Datasource when it has them, else these). The first of each is the default of a new Lead. Framework-free (the export of the seed documents loads it).
 */
import { reference } from '@core/mock/reference';

export const PHONE_CODES = reference<string[]>('leads.phoneCodes', ['+66', '+61', '+81', '+65', '+1']);
export const COUNTRIES = reference<string[]>('leads.countries', ['ไทย', 'Australia', 'Japan', 'Singapore', 'United States']);

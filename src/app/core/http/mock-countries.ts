/**
 * Fake answer of `GET {apiBase}/board/chat-master-data?type=countries` (BFF → master data): the countries with their
 * dial code and phone number mask, as read by TsPhone (phone_format.js). Development mock only (`mock: true`).
 *
 * Erasable TypeScript only (the one import is the list lookup of the Datasource — `ref.shared.json` › `phoneCountries` when it has one): the Node harness that compares the shell scripts with the Java ones
 * imports this very file, so both sides are fed the same master data.
 *
 * It covers the cases the rules of phone_format.js are about: a country that shares its dial code (+1: USA / CAN / AIA —
 * the longest mask wins, USA first), a mask with alternatives ("A / B": only the first counts), a country without any dial
 * code (ATA / ASN), a mask with fewer digit groups, and unsorted input (the script sorts by dial code, then country).
 */
import { reference } from '@core/mock/reference';

export interface MockCountry {
  code: string;
  phoneCountryCode: string;
  phoneNumberFormat: string;
}

export const MOCK_COUNTRIES: MockCountry[] = reference<MockCountry[]>('shared.phoneCountries', [
  { code: 'USA', phoneCountryCode: '+1', phoneNumberFormat: 'XXX XXX XXXX' },
  { code: 'THA', phoneCountryCode: '+66', phoneNumberFormat: 'XX XXX XXXX / X XXXX XXXX' },
  { code: 'JPN', phoneCountryCode: '+81', phoneNumberFormat: 'XX XXXX XXXX' },
  { code: 'AIA', phoneCountryCode: '+1', phoneNumberFormat: 'XXX XXXX' },
  { code: 'GBR', phoneCountryCode: '+44', phoneNumberFormat: 'XXXX XXX XXXX' },
  { code: 'SGP', phoneCountryCode: '+65', phoneNumberFormat: 'XXXX XXXX' },
  { code: 'CAN', phoneCountryCode: '+1', phoneNumberFormat: 'XXX XXX XXXX' },
  { code: 'MYS', phoneCountryCode: '+60', phoneNumberFormat: 'XX XXX XXXX' },
  { code: 'LAO', phoneCountryCode: '+856', phoneNumberFormat: 'XX XXX XXX' },
  { code: 'VNM', phoneCountryCode: '+84', phoneNumberFormat: 'XX XXXX XXX' },
  { code: 'KHM', phoneCountryCode: '+855', phoneNumberFormat: '' },
  { code: 'ATA', phoneCountryCode: '', phoneNumberFormat: '' },
  { code: 'ASN', phoneCountryCode: '', phoneNumberFormat: '' },
]);

/** the envelope of the BFF servlet: `{status, result}` */
export function mockCountriesResponse(): Response {
  return new Response(JSON.stringify({ status: 200, result: MOCK_COUNTRIES }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

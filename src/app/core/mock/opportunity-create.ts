/**
 * Creating an opportunity from a customer (opportunity-complete-design.md §6.1): the rules of the "สร้าง OPP" action, on the shared database.
 * The pipeline, the person in charge and the sales person are chosen by the caller; the opportunity starts NEW, with amount 0, on the first group of
 * the pipeline, and the customer keeps its owner. Framework-free (a modal that asks for the three fields only has to call it).
 */
import { SEED_GROUPS, SEED_TODAY, isKnownProspect, leadIds, seedLead } from './crm-seed';
import { sharedDb, upsertSharedLead } from './shared-db';
import { isInQueue, isMember } from './waitlist';

export interface CreateOpportunityInput {
  prospectId: number;
  /** the opportunity config (pipeline) chosen */
  pipelineId: number | null;
  /** the activity group the pipeline starts with (the person in charge must be in it) */
  firstGroupId: number | null;
  responsibleCode: string;
  salePersonCode: string;
}

export type CreateOpportunityResult =
  | { ok: true; opportunityId: number; openOpportunities: number }
  | { ok: false; status: 404 | 409 | 422; code: 'NOT_FOUND' | 'PROSPECT_NOT_AVAILABLE' | 'VALIDATION_FAILED'; field?: string };

const FIRST_NEW_ID = 8000;
const fail = (status: 404 | 409 | 422, code: 'NOT_FOUND' | 'PROSPECT_NOT_AVAILABLE' | 'VALIDATION_FAILED', field?: string): CreateOpportunityResult => ({ ok: false, status, code, ...(field ? { field } : {}) });

/** the opportunities that are still open for a customer (the creation warns about them but goes on, design 6.1) */
export function openOpportunitiesOf(prospectId: number): number {
  return leadIds().filter((id) => {
    const lead = seedLead(id);
    return lead.prospectId === prospectId && lead.status === 'ACTIVE';
  }).length;
}

export function createOpportunity(input: CreateOpportunityInput, today = SEED_TODAY): CreateOpportunityResult {
  if (!isKnownProspect(input.prospectId)) return fail(404, 'NOT_FOUND');
  // a customer waiting in the queue (or draft / blocked / trashed) gets no opportunity
  if (isInQueue('prospect', input.prospectId)) return fail(409, 'PROSPECT_NOT_AVAILABLE');
  if (input.pipelineId === null) return fail(422, 'VALIDATION_FAILED', 'opportunityConfigId');
  if (!input.responsibleCode || (input.firstGroupId !== null && !isMember(input.firstGroupId, input.responsibleCode))) return fail(422, 'VALIDATION_FAILED', 'responsibleEmployeeId');
  if (!input.salePersonCode) return fail(422, 'VALIDATION_FAILED', 'salePersonId');
  const warning = openOpportunitiesOf(input.prospectId);
  const used = [...leadIds(), ...Object.keys(sharedDb().leads).map(Number)];
  const opportunityId = Math.max(FIRST_NEW_ID, ...used) + 1;
  const groupIdx = Math.max(0, SEED_GROUPS.findIndex((g) => g.id === input.firstGroupId));
  upsertSharedLead(opportunityId, { prospectId: input.prospectId, status: 'ACTIVE', interest: 'NEW', groupIdx, amount: 0, createdDate: today, ownerCode: input.responsibleCode }, true);
  return { ok: true, opportunityId, openOpportunities: warning };
}

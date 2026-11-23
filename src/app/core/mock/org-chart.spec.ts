import { describe, expect, it } from 'vitest';
import { canSeeOpportunity, employeeCodeOfId, isSuperiorOf, ownerCodeOf } from './org-chart';

const viewer = (employeeCode: string, seesAll = false) => ({ employeeCode, seesAll });

describe('employeeCodeOfId', () => {
  it('should map the employee id of the session to the employee code', () => {
    expect(employeeCodeOfId(1001)).toBe('E101');
    expect(employeeCodeOfId(1008)).toBe('E108');
  });
});

describe('org chart', () => {
  it('should walk up every level of the chart', () => {
    expect(isSuperiorOf('CS0001', 'CS0004')).toBe(true);
    expect(isSuperiorOf('CS0003', 'CS0004')).toBe(true);
    expect(isSuperiorOf('CS0004', 'CS0003')).toBe(false);
  });

  it('should put every employee of the cast in the chart', () => {
    for (let n = 101; n <= 108; n++) expect(ownerCodeOf(`E${n}`)).not.toBe('');
  });
});

describe('canSeeOpportunity', () => {
  it('should let a supervisor see the opportunities of the whole team below', () => {
    const sup = viewer('E101');
    for (const owner of ['E101', 'E102', 'E103', 'E104', 'E105', 'E106', 'E107', 'E108']) {
      expect(canSeeOpportunity(sup, owner)).toBe(true);
    }
  });

  it('should show a middle head only its own and its team', () => {
    const head = viewer('E103');
    expect(canSeeOpportunity(head, 'E103')).toBe(true);
    expect(canSeeOpportunity(head, 'E104')).toBe(true);
    expect(canSeeOpportunity(head, 'E106')).toBe(true);
    expect(canSeeOpportunity(head, 'E101')).toBe(false);
    expect(canSeeOpportunity(head, 'E102')).toBe(false);
    expect(canSeeOpportunity(head, 'E105')).toBe(false);
  });

  it('should show a sales person only the own opportunities', () => {
    const sales = viewer('E102');
    expect(canSeeOpportunity(sales, 'E102')).toBe(true);
    expect(canSeeOpportunity(sales, 'E103')).toBe(false);
    expect(canSeeOpportunity(sales, 'E101')).toBe(false);
  });

  it('should show an opportunity nobody owns to everyone', () => {
    expect(canSeeOpportunity(viewer('E102'), null)).toBe(true);
  });

  it('should show everything to a user with the whole-company permission', () => {
    expect(canSeeOpportunity(viewer('E102', true), 'E103')).toBe(true);
  });

  it('should show everything to a user who is not in the chart (a viewer account)', () => {
    expect(canSeeOpportunity(viewer('E112'), 'E103')).toBe(true);
  });
});

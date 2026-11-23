import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { seedLead } from '@core/mock/crm-seed';
import { resetSharedDb } from '@core/mock/shared-db';
import type { PipelineChoice } from '../../prospects.mock';
import { CreateOpportunityDialog } from './create-opportunity-dialog';

const choices: PipelineChoice[] = [
  { id: 11, name: 'ขายรถ', firstGroupId: 101, members: [{ code: 'E101', name: 'สมชาย' }, { code: 'E102', name: 'สุดา' }] },
  { id: 12, name: 'ประกัน', firstGroupId: 102, members: [{ code: 'E105', name: 'ธนากร' }] },
];

function open(prospectId = 1) {
  const fixture = TestBed.createComponent(CreateOpportunityDialog);
  fixture.componentRef.setInput('prospectId', prospectId);
  fixture.componentRef.setInput('choices', choices);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  const select = (id: string): HTMLSelectElement => el.querySelector<HTMLSelectElement>(`#${id}`)!;
  const choose = (id: string, value: string): void => {
    select(id).value = value;
    select(id).dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const created: number[] = [];
  fixture.componentInstance.created.subscribe((id) => created.push(id));
  return { fixture, el, select, choose, created, save: () => { el.querySelector<HTMLButtonElement>('button.primary')!.click(); fixture.detectChanges(); } };
}

describe('create opportunity dialog', () => {
  afterEach(() => resetSharedDb());

  it('should ask for the three fields and say so when one is missing', () => {
    const d = open();
    d.save();
    expect(d.el.querySelector('[role=alert]')?.textContent).toContain('app.prospects.createOpportunityMissing');
    expect(d.created).toEqual([]);
  });

  it('should offer as person in charge only the people of the first group of the chosen pipeline, and fill the sales person', () => {
    const d = open();
    d.choose('co-pipeline', '11');
    expect([...d.select('co-responsible').options].map((o) => o.value)).toEqual(['', 'E101', 'E102']);
    d.choose('co-responsible', 'E102');
    expect(d.select('co-sale').value).toBe('E102');
    d.choose('co-pipeline', '12');
    expect(d.select('co-responsible').value).toBe('');
  });

  it('should create the opportunity and hand its number back', () => {
    const d = open();
    d.choose('co-pipeline', '11');
    d.choose('co-responsible', 'E101');
    d.save();
    expect(d.created).toHaveLength(1);
    expect(seedLead(d.created[0]!)).toMatchObject({ interest: 'NEW', amount: 0, prospectId: 1, ownerCode: 'E101' });
  });

  it('should close when the backdrop is clicked or Escape is pressed', () => {
    const d = open();
    let closed = 0;
    d.fixture.componentInstance.closed.subscribe(() => closed++);
    d.el.querySelector<HTMLElement>('.backdrop')!.click();
    d.el.querySelector<HTMLElement>('.box')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(2);
  });
});

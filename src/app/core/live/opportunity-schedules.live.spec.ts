import { describe, expect, it } from 'vitest';
import { fetchOpportunitySchedules, scheduleRows } from './opportunity-schedules.live';
import { fakeRest, type FakeAnswer } from './rest-fake';

describe('OP06 appointments and tasks of an opportunity', () => {
  it('rows are given the names the page reads (topic → title, appointmentDate → date, taskAssignee → taskAssigneeId|Code|Name); what the row has is kept', () => {
    expect(scheduleRows({ result: [{ id: 's1', topic: 'นัดพบ', appointmentDate: '2026-11-20', appointmentTime: '10:00', taskAssignee: { id: 'e1', code: 'E01', name: 'สมหญิง' }, status: 'WAIT' }] })).toEqual([
      { id: 's1', topic: 'นัดพบ', appointmentDate: '2026-11-20', appointmentTime: '10:00', taskAssignee: { id: 'e1', code: 'E01', name: 'สมหญิง' }, status: 'WAIT', date: '2026-11-20', time: '10:00', title: 'นัดพบ', taskAssigneeId: 'e1', taskAssigneeCode: 'E01', taskAssigneeName: 'สมหญิง' },
    ]);
    expect(scheduleRows({ result: { items: [{ id: 's2', title: 'x', date: 'd' }] } })).toEqual([{ id: 's2', title: 'x', date: 'd' }]);
    expect(scheduleRows({ result: {} })).toEqual([]);
  });

  it('the activity of a row is its step: { id, name } → procedureId / procedureName (a text is the name); activityGroup → procedureGroupId / procedureGroupName; a name the row has is kept', () => {
    const [byObject, byText, kept, none] = scheduleRows({
      result: [
        { id: 'a', activity: { id: 'st1', name: 'นัดพบลูกค้า' }, activityGroup: { id: 'g1', name: 'ขาย' } },
        { id: 'b', activity: 'โทรติดตาม' },
        { id: 'c', activity: { id: 'st2', name: 'x' }, procedureName: 'เดิม' },
        { id: 'd', activity: null },
      ],
    });
    expect(byObject).toMatchObject({ procedureId: 'st1', procedureName: 'นัดพบลูกค้า', procedureGroupId: 'g1', procedureGroupName: 'ขาย' });
    expect(byText).toMatchObject({ procedureName: 'โทรติดตาม' });
    expect(kept['procedureName']).toBe('เดิม');
    expect(none['procedureName']).toBeUndefined();
  });

  it('a row with no date and no time (null) is "all day"; with a date or a time it is not', () => {
    const rows = scheduleRows({ result: [{ id: 'a', date: null, time: null }, { id: 'b' }, { id: 'c', date: '2026-11-20', time: null }, { id: 'd', date: null, time: '09:00' }, { id: 'e', date: null, time: null, allDay: false }] });
    expect(rows.map((r) => r['allDay'])).toEqual([true, true, undefined, undefined, true]); // no date and no time wins over allDay false (the data is wrong for now)
  });

  it('allDay true from the service (also allDays / "true") is all day even with a date and a time; false stays false', () => {
    const rows = scheduleRows({ result: [{ id: 'a', allDay: true, date: '2026-11-20', time: '10:00' }, { id: 'b', allDays: 'true', date: 'd', time: 't' }, { id: 'c', allDay: false, date: '2026-11-20', time: '10:00' }, { id: 'd', is_all_day: 1 }] });
    expect(rows.map((r) => r['allDay'])).toEqual([true, true, false, true]);
  });

  it('asks the two endpoints (no query); one that is refused gives an empty list and the other still fills', async () => {
    const { deps, calls } = fakeRest((c) => (c.path.endsWith('/tasks') ? ({ status: 403, text: '{}' } as FakeAnswer) : ({ status: 200, text: JSON.stringify({ result: [{ id: 'a1', topic: 'นัด' }] }) } as FakeAnswer)));
    const got = await fetchOpportunitySchedules(deps, 'o-1');
    expect(calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(['GET /opportunities/o-1/appointments', 'GET /opportunities/o-1/tasks']);
    expect(got.appointmentList.map((r) => r['title'])).toEqual(['นัด']);
    expect(got.taskList).toEqual([]);
  });

  it('the rule of "all day" is the same for the tasks as for the appointments (both lists go through the same reading)', async () => {
    const { deps } = fakeRest((c) =>
      ({ status: 200, text: JSON.stringify({ result: c.path.endsWith('/tasks') ? [{ id: 't1', allDay: true, date: '2026-11-20', time: '10:00' }, { id: 't2', date: null, time: null }] : [{ id: 'a1', allDay: true }, { id: 'a2', date: null, time: null }] }) }) as FakeAnswer);
    const got = await fetchOpportunitySchedules(deps, 'o-1');
    expect(got.taskList.map((r) => r['allDay'])).toEqual([true, true]);
    expect(got.appointmentList.map((r) => r['allDay'])).toEqual([true, true]);
  });
});

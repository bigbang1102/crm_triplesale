import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../config/config.service';
import { authStub, configStub } from '../testing/test-helpers';
import { PermissionService } from './permission.service';
import { ROLE } from './roles';

function setup(roles: string[] | null, employeeId: number | null = 1001) {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: authStub(roles, employeeId) },
      { provide: ConfigService, useValue: configStub({ features: { aiHubEnabled: false, pageGuardEnabled: true } }) },
    ],
  });
  return TestBed.inject(PermissionService);
}

describe('PermissionService', () => {
  it('opens a page that asks for the old CRM key to the holder of the new Pipeline permission, and only that one', () => {
    const perm = setup([ROLE.pipelineProspectView, ROLE.modulePipeline]);
    expect(perm.has(ROLE.featureProspect)).toBe(true);
    expect(perm.has(ROLE.prospectView)).toBe(true);
    expect(perm.has(ROLE.moduleCrm)).toBe(true);
    expect(perm.has(ROLE.featureLead)).toBe(false);
    expect(perm.has(ROLE.featureCalendar)).toBe(false);
  });

  it('allows when there is no requirement', () => {
    const perm = setup([]);
    expect(perm.has(null)).toBe(true);
    expect(perm.has('')).toBe(true);
  });

  it('"…_For_Other" passes the checks of the schedule roles it stands in for — and nothing else', () => {
    const appt = setup([ROLE.pipelineScheduleAppointmentAddEditForOther]);
    expect(appt.has(ROLE.pipelineScheduleAppointmentView)).toBe(true);
    expect(appt.has(ROLE.pipelineScheduleAppointmentAddEdit)).toBe(true);
    expect(appt.has(ROLE.pipelineScheduleTaskView)).toBe(false);
    expect(appt.has(ROLE.pipelineScheduleTaskAddEdit)).toBe(false);
    TestBed.resetTestingModule();
    const task = setup([ROLE.pipelineScheduleTaskAddEditForOther]);
    expect(task.has(ROLE.pipelineScheduleTaskView)).toBe(true);
    expect(task.has(ROLE.pipelineScheduleTaskAddEdit)).toBe(true);
    expect(task.has(ROLE.pipelineScheduleAppointmentView)).toBe(false);
    expect(task.has(`${ROLE.featureReport}, ${ROLE.pipelineScheduleTaskView}`)).toBe(true);
    TestBed.resetTestingModule();
    // the other way round does not hold: the plain roles do not give "for other"
    expect(setup([ROLE.pipelineScheduleAppointmentAddEdit]).has(ROLE.pipelineScheduleAppointmentAddEditForOther)).toBe(false);
  });

  it('Pipeline_Prospect_Responsible_Person passes the prospect view / edit / attachment-view and the assigned-chat view / reply — and nothing else', () => {
    const perm = setup([ROLE.pipelineProspectResponsiblePerson]);
    for (const r of [ROLE.pipelineProspectView, ROLE.pipelineProspectEdit, ROLE.pipelineProspectAttachmentView, ROLE.chatViewAssigned, ROLE.chatReplyAssigned]) {
      expect(perm.has(r), r).toBe(true);
    }
    for (const r of [ROLE.pipelineProspectCreate, ROLE.pipelineProspectAttachmentDownload, ROLE.pipelineProspectTrash, ROLE.chatViewUnassigned]) {
      expect(perm.has(r), r).toBe(false);
    }
  });

  it('Pipeline_Opportunity_Responsible_Person passes the opportunity, schedule and assigned-chat roles listed — and nothing else', () => {
    const perm = setup([ROLE.pipelineOpportunityResponsiblePerson]);
    for (const r of [
      ROLE.pipelineOpportunityView, ROLE.pipelineOpportunityEdit, ROLE.pipelineOpportunityContactView, ROLE.pipelineOpportunityContactActivityCreate,
      ROLE.pipelineOpportunityAttachmentView, ROLE.pipelineOpportunityWorkflowStepClose, ROLE.pipelineScheduleAppointmentView,
      ROLE.pipelineScheduleAppointmentAddEdit, ROLE.pipelineScheduleTaskView, ROLE.pipelineScheduleTaskAddEdit, ROLE.chatViewAssigned, ROLE.chatReplyAssigned,
    ]) {
      expect(perm.has(r), r).toBe(true);
    }
    for (const r of [ROLE.pipelineOpportunityAttachmentDownload, ROLE.pipelineOpportunityAttachmentUpload, ROLE.pipelineProspectView, ROLE.pipelineScheduleTaskAddEditForOther, ROLE.chatViewUnassigned]) {
      expect(perm.has(r), r).toBe(false);
    }
  });

  it('is fail-closed: no roles → nothing visible', () => {
    expect(setup(null).has(ROLE.featureLead)).toBe(false);
    TestBed.resetTestingModule();
    expect(setup([]).has(ROLE.featureLead)).toBe(false);
  });

  it('treats a comma list as OR and matches case-sensitively', () => {
    const perm = setup([ROLE.featureLead]);
    expect(perm.has(`${ROLE.featureReport}, ${ROLE.featureLead}`)).toBe(true);
    expect(perm.has(ROLE.featureReport)).toBe(false);
    expect(perm.has('feature_crm_lead')).toBe(false);
  });

  it.each(['super_admin', 'SuperAdmin', 'Super Admin', 'ROLE_SUPER_ADMIN', 'super_super_crm'])(
    'super-admin alias "%s" passes every check',
    (alias) => {
      const perm = setup([alias]);
      expect(perm.isSuperAdmin()).toBe(true);
      expect(perm.has(ROLE.featureReport)).toBe(true);
      expect(perm.hasPrefix('Report_')).toBe(true);
    },
  );

  it('hasPrefix shows the Report menu for any Report_* key', () => {
    expect(setup(['Report_SUN-LD-01_View']).hasPrefix('Report_')).toBe(true);
    TestBed.resetTestingModule();
    expect(setup([ROLE.featureLead]).hasPrefix('Report_')).toBe(false);
  });

  it('canAct: base key needs ownership, the _Sup key does not', () => {
    const owner = setup([ROLE.scheduleCreate], 1001);
    expect(owner.canAct(ROLE.scheduleCreate, 1001)).toBe(true);
    expect(owner.canAct(ROLE.scheduleCreate, 2002)).toBe(false);
    expect(owner.canAct(ROLE.scheduleCreate, null)).toBe(false);

    TestBed.resetTestingModule();
    const sup = setup([ROLE.scheduleCreateSup], 1001);
    expect(sup.canAct(ROLE.scheduleCreate, 2002)).toBe(true);
  });

  it('exposes feature flags from config', () => {
    expect(setup([]).flag('aiHubEnabled')).toBe(false);
  });
});

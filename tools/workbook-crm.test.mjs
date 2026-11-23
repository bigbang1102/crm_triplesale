import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCrm, buildCrmDocuments, buildMaster, records } from './lib/workbook-crm.mjs';

/** the shape of the Gen workbook: a main sheet has header · label · type rows, an item sheet header · type rows */
const lpo = {
  Lead: [
    ['code', 'name', 'country', 'country', 'businessentity'],
    ['รหัส', 'ชื่อ', 'ประเทศ', 'ประเทศ(อ้างอิง)', 'บริษัท'],
    ['StringM', 'StringM', 'String', 'Reference', 'Reference'],
    ['LD-1', 'นันทิดา', 'ไทย', 'THA', 'A1'],
    ['LD-2', 'อนุชา', null, 'THA', 'B1'],
    [null, null, null, null, null],
  ],
  'Lead.SocialItem': [['[parent] Lead.code', 'social_key', 'social_id'], ['ใช้ผูกแถวกับใบแม่', 'String', 'String'], ['LD-1', 'line', 'u1'], ['LD-1', 'facebook', 'u2']],
  Prospect: [['code', 'name', 'businessentity'], ['x', 'x', 'x'], ['x', 'x', 'x'], ['PS-1', 'นันทิดา', 'A1']],
  'Prospect.SocialItem': [['[parent] Prospect.code', 'social_key'], ['ผูก', 'String']],
  'Prospect.LatestOpportunity': [['[parent] Prospect.code', 'opportunity_txno'], ['ผูก', 'String'], ['PS-1', 'OP-1']],
  Opportunity: [['txNo', 'amount', 'businessentity'], ['x', 'x', 'x'], ['x', 'x', 'x'], ['OP-1', 13833700, 'A1']],
  'Opp.Activitystatusitem': [['[parent] Opportunity.txNo', 'activity'], ['ผูก', 'Reference'], ['OP-1', 'A1-AC-01'], ['OP-1', 'A1-AC-02']],
  'Opp.Responsibleitem': [['[parent] Opportunity.txNo', 'res_employee'], ['ผูก', 'Reference'], ['OP-1', 'A1-E011']],
  'Opp.CurrentStepItem': [['[parent] Opportunity.txNo', 'activity'], ['ผูก', 'Reference'], ['OP-1', 'A1-AC-02']],
  'Opp.SharingGroupItem': [['[parent] Opportunity.txNo', 'sharinggroup'], ['ผูก', 'Reference']],
  'Opp.PeerSharingItem': [['[parent] Opportunity.txNo', 'position'], ['ผูก', 'Reference'], ['OP-1', 'A1-SR-1']],
};

describe('workbook crm', () => {
  it('should read the data rows under the header, label and type rows, leave out empty cells and rename a repeated column', () => {
    const [first, second] = records(lpo, 'Lead', 3);
    assert.deepEqual(first, { code: 'LD-1', name: 'นันทิดา', country: 'ไทย', country_ref: 'THA', businessentity: 'A1' });
    assert.deepEqual(second, { code: 'LD-2', name: 'อนุชา', country_ref: 'THA', businessentity: 'B1' });
    assert.equal(records(lpo, 'Lead', 3).length, 2);
    assert.throws(() => records(lpo, 'nope', 3), /no sheet/);
  });

  it('should split the rows by company and embed the children of each row', () => {
    const crm = buildCrm(lpo);
    assert.deepEqual(Object.keys(crm).sort(), ['A1', 'B1']);
    assert.deepEqual(crm.A1.leads[0].social, [{ social_key: 'line', social_id: 'u1' }, { social_key: 'facebook', social_id: 'u2' }]);
    assert.deepEqual(crm.B1.leads[0].social, []);
    assert.equal(crm.A1.prospects[0].latestOpportunities[0].opportunity_txno, 'OP-1');
    const opp = crm.A1.opportunities[0];
    assert.equal(opp.amount, 13833700);
    assert.equal(opp.activityStatus.length, 2);
    assert.deepEqual(opp.responsible, ['A1-E011']);
    assert.equal(opp.currentStep.activity, 'A1-AC-02');
    assert.deepEqual(opp.sharingGroups, []);
    assert.equal(opp.peerSharing[0].position, 'A1-SR-1');
  });

  it('should keep only the master sheets that exist and name the documents by company', () => {
    const master = buildMaster({ '16_salegroup': [['code', 'name'], ['A1-SG-01', 'ทีมมังกร'], [null, null]], '99_other': [['x'], ['y']] });
    assert.deepEqual(master, { '16_salegroup': [{ code: 'A1-SG-01', name: 'ทีมมังกร' }] });
    const docs = buildCrmDocuments(lpo, { '16_salegroup': [['code'], ['A1-SG-01']] });
    assert.deepEqual(Object.keys(docs).sort(), ['seed.workbook.crm.a1', 'seed.workbook.crm.b1', 'seed.workbook.master']);
  });
});

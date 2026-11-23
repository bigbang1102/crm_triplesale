import { describe, expect, it } from 'vitest';
import { javaLinkToRoute } from './java-links';

describe('javaLinkToRoute', () => {
  it('drops the menu parameters the router no longer needs', () => {
    expect(javaLinkToRoute('lead.face?pid=1&page_id=3&act=3&action_type=list')).toBe('/crm/opportunities');
    expect(javaLinkToRoute('sales_doc_rv_list.xhtml?navbar_menu=navbar_menu_sale')).toBe('/sales/receipts');
  });

  it('turns the business parameter into a path segment', () => {
    expect(javaLinkToRoute('lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=42')).toBe('/crm/opportunities/42');
    expect(javaLinkToRoute('/triplesale/pages/sales_doc_type_list.xhtml?navbar_menu=navbar_menu_sale&doc=qt')).toBe('/sales/docs/qt');
    expect(javaLinkToRoute('sales_doc_rv.xhtml?navbar_menu=navbar_menu_sale&leadId=9')).toBe('/sales/receipts/new?opportunityId=9');
  });

  it('hands the workflow group of the board on to the lead page (lead.xhtml: ldSelectLead → …&activityGroupId=)', () => {
    expect(javaLinkToRoute('lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=42&activityGroupId=101')).toBe('/crm/opportunities/42?activityGroupId=101');
    // no group (a lead of a product without workflow, or the group 0 = "every group" that the page does not send) → no query
    expect(javaLinkToRoute('lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=7')).toBe('/crm/opportunities/7');
  });

  it('Activities (activity.xhtml / work_modal.xhtml): the links to the lead page keep the workflow group of the row', () => {
    expect(javaLinkToRoute('lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=43&activityGroupId=102')).toBe('/crm/opportunities/43?activityGroupId=102');
    expect(javaLinkToRoute('lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=' + encodeURIComponent('a b/1'))).toBe('/crm/opportunities/a%20b%2F1');
    // without an open lead the "go to lead" button goes to the list
    expect(javaLinkToRoute('lead.face?pid=1&page_id=3&act=3&action_type=list')).toBe('/crm/opportunities');
    // the top-bar tab of the page itself
    expect(javaLinkToRoute('activity.face?pid=1&page_id=4&act=4&action_type=list')).toBe('/crm/activities');
  });

  it('drilldown: the report code is the last segment; without a code the page opens its default report', () => {
    expect(javaLinkToRoute('drilldown.face?pid=1&page_id=1&act=1&acts=11&sub_id=8&code=T-PLS-02')).toBe('/crm/drilldown/T-PLS-02');
    expect(javaLinkToRoute('/triplesale/pages/drilldown.xhtml?code=T-FI-01&navbar_menu=navbar_menu_home')).toBe('/crm/drilldown/T-FI-01');
    expect(javaLinkToRoute('drilldown.face')).toBe('/crm/drilldown/T-CS-01');
    expect(javaLinkToRoute('drilldown.xhtml?code=')).toBe('/crm/drilldown/T-CS-01');
  });

  it('prospects: the list, and the form with its mode (add | view | edit) kept as action_type', () => {
    expect(javaLinkToRoute('contracts.face?pid=1&page_id=2&act=2&action_type=list')).toBe('/crm/prospects');
    expect(javaLinkToRoute('contracts_master_data.face?pid=1&amp;page_id=1&amp;act=2&amp;action_type=add')).toBe('/crm/prospects/new?action_type=add');
    expect(javaLinkToRoute('contracts_master_data.face?pid=1&page_id=1&act=2&action_type=view&pms=detail&id=17')).toBe('/crm/prospects/17/detail?pms=detail');
    // the link of the "deleted" tab: the detail page is told it is a record of the trash (it reads GET /prospects/trash/{id})
    expect(javaLinkToRoute('contracts_master_data.face?pid=1&page_id=1&act=2&action_type=view&pms=detail&id=17&trash=1')).toBe('/crm/prospects/17/detail?pms=detail&trash=1');
    expect(javaLinkToRoute('contracts_master_data.face?pid=1&page_id=1&act=2&action_type=edit&pms=detail&id=17')).toBe('/crm/prospects/17?action_type=edit&pms=detail');
  });

  it('ai_hub (the "customer summary" link of the prospect form): the tool is the last segment, the prospect stays in the query', () => {
    expect(javaLinkToRoute('ai_hub.face?pid=1&amp;page_id=16&amp;act=21&amp;acts=211&amp;tool=customer-brief&amp;prospectId=17&amp;navbar_menu=navbar_menu_aihub')).toBe('/ai/hub/customer-brief?prospectId=17');
    expect(javaLinkToRoute('ai_hub.face?pid=1&page_id=16&act=21')).toBe('/ai/hub');
  });

  it('CRM home (index.xhtml): the external-link icons go to the calendar page and to the market plan; the rows and cards go to the lead', () => {
    expect(javaLinkToRoute('/triplesale/pages/schedule.face?pid=1&amp;page_id=5&amp;act=5&amp;sub_id=1')).toBe('/crm/schedule');
    expect(javaLinkToRoute('/triplesale/pages/market_plan.face?pid=1&amp;page_id=5&amp;act=12')).toBe('/market-plan');
    expect(javaLinkToRoute('lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=8&activityGroupId=104')).toBe('/crm/opportunities/8?activityGroupId=104');
    expect(javaLinkToRoute('/triplesale/pages/index.face?pid=1&page_id=1&act=1')).toBe('/crm/home');
  });

  it('keeps what is left as the query and decodes &amp;', () => {
    expect(javaLinkToRoute('schedule.face?pid=1&amp;page_id=5&amp;act=5&amp;sub_id=1&amp;view=board')).toBe('/crm/schedule?view=board');
  });

  it('maps the seven supporting-document families', () => {
    expect(javaLinkToRoute('sales_document.face?pid=1&page_id=7&act=7&acts=71&sub_id=1&action_type=list')).toBe('/crm/supporting-docs/letter-of-intent');
    expect(javaLinkToRoute('sales_document_7.face?pid=1&page_id=7&act=7&acts=77&sub_id=7&action_type=list')).toBe('/crm/supporting-docs/credit-application');
    expect(javaLinkToRoute('sales_document_sub_3.xhtml?id=5')).toBe('/crm/supporting-docs/service-contract/5');
    // the forms: quotation_id is the document, action_type edit / detail the mode (add is the new one), the menu parameters go
    expect(javaLinkToRoute('sales_document_sub_1.face?pid=1&page_id=7&act=7&acts=71&sub_id=1&action_type=add&pms=')).toBe('/crm/supporting-docs/letter-of-intent/new');
    expect(javaLinkToRoute('sales_document_sub_1.face?pid=1&page_id=7&act=7&acts=71&sub_id=1&action_type=edit&quotation_id=1004')).toBe('/crm/supporting-docs/letter-of-intent/1004?action_type=edit');
    expect(javaLinkToRoute('/triplesale/pages/sales_document_sub_7.face?pid=1&page_id=7&act=7&acts=77&sub_id=7&action_type=detail&quotation_id=7012')).toBe('/crm/supporting-docs/credit-application/7012?action_type=detail');
    expect(javaLinkToRoute('sales_document_sub_2.face?action_type=edit')).toBe('/crm/supporting-docs/legal-credit-request/new'); // no document: nothing to edit
  });

  it('is null for anything that is not a page of the app', () => {
    expect(javaLinkToRoute('https://example.com/x.pdf')).toBeNull();
    expect(javaLinkToRoute('#')).toBeNull();
    expect(javaLinkToRoute('unknown_page.face')).toBeNull();
    expect(javaLinkToRoute('')).toBeNull();
  });
});

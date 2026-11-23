/* ============================================================================
 * no_autofill.js — ปิด autofill / ประวัติการกรอกของเบราว์เซอร์ให้ทั้งระบบ
 * ----------------------------------------------------------------------------
 * ทำไมต้องมี: ช่องกรอกในระบบส่วนใหญ่เป็นค่าเฉพาะของเอกสาร/รายการนั้นๆ
 *   (เลขที่ใบกำกับภาษี, หมายเหตุ, มูลค่า ฯลฯ) ไม่ใช่ค่าที่ผู้ใช้กรอกซ้ำเดิม
 *   การที่เบราว์เซอร์เด้ง dropdown ค่าที่เคยกรอกของเอกสารใบก่อนหน้าขึ้นมา
 *   นอกจากไม่ช่วยอะไรแล้ว ยังเสี่ยงกดเลือกผิดใบ
 *
 * ทำไมทำที่นี่ที่เดียว (ไม่ไล่ใส่ autocomplete="off" ทีละ tag ทุกหน้า):
 *   - ช่องกรอกในระบบมีหลายร้อยจุดกระจายอยู่หลายสิบหน้า + หลายจุด JS สร้างทีหลัง
 *     (แถวตาราง, dialog, ส่วนที่ JSF ajax re-render) ใส่ในมาร์กอัปอย่างเดียวไม่ครบ
 *   - หน้าใหม่ที่ทำเพิ่มทีหลังได้ผลนี้อัตโนมัติ ไม่ต้องจำว่าต้องใส่
 *   โหลดจาก WEB-INF/pages/template.xhtml (ครอบทุกหน้าที่ใช้เทมเพลตกลาง)
 *   ส่วนหน้าที่เป็น HTML เดี่ยวๆ (iframe frame) ต้องแปะ <script> เองในหน้านั้น
 * ========================================================================== */
(function () {
    'use strict';

    /* หน้าที่ยังให้เบราว์เซอร์จำค่าที่เคยกรอกได้ตามปกติ — ใส่ชื่อไฟล์ไม่ต้องมีนามสกุล
       (ตามที่ user ระบุ: หน้าปฏิทินงาน = schedule.face)
       หมายเหตุ: dashboard_calendar_frame.xhtml (ปฏิทินในแดชบอร์ด) ไม่ได้แปะ script นี้อยู่แล้ว */
    var EXCLUDED_PAGES = ['schedule'];

    /* ยกเว้นทั้งตระกูล — ครอบทั้งชื่อที่ตรงตัวและที่ขึ้นต้นด้วย <ชื่อ>_ ทั้งหมด
       'lead' = หน้าโอกาสขายทั้งชุด (lead, lead_detail, lead_step, lead_detail_step, lead_detail_sub1-3 ฯลฯ)
       หน้าตระกูลนี้ที่ทำเพิ่มทีหลังจะถูกยกเว้นอัตโนมัติ ไม่ต้องมาเติมชื่อทีละหน้า */
    var EXCLUDED_PAGE_FAMILIES = ['lead'];

    /* input type ที่ไม่มี dropdown ประวัติการกรอกอยู่แล้ว จึงไม่ต้องแตะ
       - password เว้นไว้ตั้งใจ: ไม่ยุ่งกับ password manager ของผู้ใช้ */
    var SKIP_INPUT_TYPES = ['hidden', 'checkbox', 'radio', 'file', 'submit', 'reset',
                            'button', 'image', 'range', 'color', 'password'];

    var FIELD_SELECTOR = 'input, textarea';
    var OFF = 'off';

    /** ชื่อหน้าปัจจุบันจาก URL เช่น /triplesale/pages/lead.face -> "lead" */
    function currentPageName() {
        var path = (window.location && window.location.pathname) || '';
        var file = path.substring(path.lastIndexOf('/') + 1);
        var dot = file.lastIndexOf('.');
        return (dot > -1 ? file.substring(0, dot) : file).toLowerCase();
    }

    function isExcludedPage() {
        var page = currentPageName();
        if (EXCLUDED_PAGES.indexOf(page) > -1) {
            return true;
        }
        for (var i = 0; i < EXCLUDED_PAGE_FAMILIES.length; i++) {
            var family = EXCLUDED_PAGE_FAMILIES[i];
            if (page === family || page.indexOf(family + '_') === 0) {
                return true;
            }
        }
        return false;
    }

    function disableAutofill(element) {
        if (!element || element.nodeType !== 1) {
            return;
        }
        var tag = (element.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
            return;
        }
        /* หน้าไหนตั้ง autocomplete ไว้เองแล้วถือว่าตั้งใจ — ไม่ทับ */
        if (element.hasAttribute('autocomplete')) {
            return;
        }
        if (tag === 'input') {
            var type = (element.getAttribute('type') || 'text').toLowerCase();
            if (SKIP_INPUT_TYPES.indexOf(type) > -1) {
                return;
            }
        }
        element.setAttribute('autocomplete', OFF);
    }

    function scan(root) {
        if (!root) {
            return;
        }
        disableAutofill(root);
        if (typeof root.querySelectorAll !== 'function') {
            return;
        }
        var fields = root.querySelectorAll(FIELD_SELECTOR);
        for (var i = 0; i < fields.length; i++) {
            disableAutofill(fields[i]);
        }
    }

    /** ช่องที่ถูกสร้างทีหลัง (JSF ajax, dialog, แถวตารางจาก JS) ต้องตามไปตั้งให้ด้วย */
    function watchNewFields() {
        if (!window.MutationObserver) {
            return;
        }
        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    scan(added[j]);
                }
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function start() {
        scan(document);
        watchNewFields();
    }

    if (isExcludedPage()) {
        return;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

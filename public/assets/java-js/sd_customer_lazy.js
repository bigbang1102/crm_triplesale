/* ★ 02/10/2026 — dropdown "ลูกค้า" (p:selectOneMenu widgetVar=sdCustomerWv) ของ sales_document_sub_1..7
   เปลี่ยนจาก preload ทุกหน้า เป็น lazy ผ่าน p:remoteCommand sdProsLoad → Sales_DocumentView.loadProspectPageAjax
   - เลื่อนใกล้ item สุดท้าย (เหลือ ~2 แถว) → page++ ยิงต่อเมื่อหน้าก่อนหน้าได้เต็ม 20 (ได้ไม่ถึง 20 = หยุด)
   - พิมพ์ในช่องค้นหา → debounce 1500ms → reset page=0 + ส่ง key (เลื่อนต่อก็ page++ พร้อม key เดิม)
   UI คงเดิม (selectOneMenu + ช่องค้นหาในแผง) — widget เทียบ <option>/<li> ตาม index จึงสร้างทั้งคู่ใหม่พร้อมกันทุกครั้ง */
window.sdCustomerLazy = (function () {
    var PER_PAGE = 20, DEBOUNCE_MS = 1500, NEAR_ROWS = 2;
    var S = { wv: null, key: '', nextPage: 1, hasMore: true, loading: false, gen: 0, timer: null, reqPage: 0, reqGen: 0, io: null };

    function wgt() { try { return PF(S.wv); } catch (e) { return null; } }
    function esc(t) { return $('<div>').text(t == null ? '' : String(t)).html(); }

    function request(page) {
        S.loading = true; S.reqPage = page; S.reqGen = S.gen;
        var w = wgt();
        if (w && w.itemsContainer && !w.itemsContainer.children('.sd-pros-loading').length) {
            w.itemsContainer.append('<li class="sd-pros-loading" style="padding:8px 12px;color:#8A92A6;list-style:none;">กำลังโหลด...</li>');
        }
        window.sdProsLoad([{ name: 'key', value: S.key }, { name: 'page', value: page }, { name: 'gen', value: S.gen }]);
    }

    function startSearch(key) {
        S.gen++; S.key = key; S.nextPage = 1; S.hasMore = true;
        request(0);
    }

    /* สร้าง <option> + <li> ใหม่ทั้งชุด: placeholder + items (+ ลูกค้าที่เลือกอยู่ถ้าไม่อยู่ในผลลัพธ์ → ซ่อน li ไว้) */
    function render(w, items, reset, keepId) {
        var $sel = w.input, selVal = $sel.val() || '';
        var existing = [];   // [{value,label}] จาก option ปัจจุบัน (ไม่รวม placeholder)
        $sel.find('option').each(function (i) { if (i > 0) { existing.push({ value: this.value, label: $(this).text() }); } });
        var rows = reset ? [] : existing.slice();
        var seen = {}; rows.forEach(function (o) { seen[o.value] = true; });
        items.forEach(function (it) {
            var v = String(it.id);
            if (seen[v]) { return; }
            seen[v] = true; rows.push({ value: v, label: (it.code + ' ' + it.name).trim() });
        });
        var hidden = {};
        if (selVal && !seen[selVal]) {   // ลูกค้าที่เลือกอยู่ต้องคงอยู่ใน <select> (ไม่งั้นค่าหายตอนบันทึก)
            var old = existing.filter(function (o) { return o.value === selVal; })[0] ||
                { value: selVal, label: w.label.text() };
            rows.push(old); hidden[selVal] = true;
        }
        var $ph = $sel.find('option').first().clone();
        var $phLi = w.itemsContainer.children('li').first().clone();
        var scrollTop = w.itemsWrapper.scrollTop();
        $sel.empty().append($ph);
        var $ul = w.itemsContainer.empty().append($phLi);
        rows.forEach(function (o) {
            $sel.append('<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>');
            $ul.append('<li class="ui-selectonemenu-item ui-selectonemenu-list-item ui-corner-all" tabindex="-1" role="option" data-label="' +
                esc(o.label).replace(/"/g, '&quot;') + '"' + (hidden[o.value] ? ' style="display:none"' : '') + '>' + esc(o.label) + '</li>');
        });
        $sel.val(selVal);
        w.options = $sel.find('option');
        w.initContents();
        w.bindItemEvents();
        w.itemsWrapper.scrollTop(reset ? 0 : scrollTop);
        w.alignPanel();
        watchLast(w);
    }

    function maybeLoad() { if (!S.loading && S.hasMore) { request(S.nextPage); } }

    /* ตรวจว่า item สุดท้ายเข้ามาในจอ — ครอบกรณีแผง dropdown ยาวเกินจอแล้ว scroll เป็นของทั้งหน้า (ไม่ใช่กล่องรายการ)
       ที่ event scroll ของกล่องรายการไม่ยิง ; ผูกใหม่ทุกครั้งที่สร้างรายการใหม่ */
    function watchLast(w) {
        if (!window.IntersectionObserver || !w.items) { return; }
        if (S.io) { S.io.disconnect(); }
        var rowH = (w.items && w.items.length ? w.items.first().outerHeight() : 32) || 32;
        S.io = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) { if (entries[i].isIntersecting) { maybeLoad(); break; } }
        }, { rootMargin: '0px 0px ' + (rowH * NEAR_ROWS) + 'px 0px' });
        var last = w.items.filter(function () { return this.style.display !== 'none'; }).last()[0];
        if (last) { S.io.observe(last); }
    }

    function onScroll() {
        var w = wgt(); if (!w || S.loading || !S.hasMore) { return; }
        var el = w.itemsWrapper[0], rowH = (w.items && w.items.length ? w.items.first().outerHeight() : 32) || 32;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - rowH * NEAR_ROWS) { maybeLoad(); }
    }

    return {
        init: function (widgetVar) {
            S.wv = widgetVar;
            var tries = 0;
            (function boot() {
                var w = wgt();
                // ★ 21/10: ไม่รอ itemsContainer แล้ว — PF 14 ไม่มี var บน p:selectOneMenu = renderPanelContentOnClient
                //   รายการ (ul/li) ถูกสร้างตอนเปิดแผงครั้งแรกเท่านั้น ⇒ เดิมถ้าไม่เปิด dropdown ภายใน 5 วิหลังโหลดหน้า
                //   boot เลิกรอ w.filter ไม่ถูกแทน → เหลือ filter ฝั่ง client ของ PF ไม่ยิง search เลยจน refresh
                if (!w || !w.filterInput || !w.itemsWrapper) { if (tries++ < 100) { setTimeout(boot, 100); } return; }
                // รายการที่ server render มา = page 0 (edit อาจมีลูกค้าเดิมเพิ่มอีก 1) → ถ้าได้เต็มหน้าแปลว่าอาจมีต่อ
                S.hasMore = (w.input.find('option').length - 1) >= PER_PAGE;
                // แทนที่ filter แบบ client ของ PrimeFaces (ยิง keyup ทุกครั้ง ไม่ debounce) ด้วยค้นฝั่ง server + debounce
                w.filter = function (val) {
                    var v = $.trim(val || '');
                    clearTimeout(S.timer);
                    if (v === S.key) { return; }
                    S.timer = setTimeout(function () { startSearch(v); }, DEBOUNCE_MS);
                };
                w.itemsWrapper.off('scroll.sdpros').on('scroll.sdpros', onScroll);
                // รายการเพิ่งมีตอนเปิดแผง → ผูกตัวดู item สุดท้ายหลัง show ทุกครั้ง (render ผูกใหม่เองอยู่แล้ว)
                var origShow = w.show;
                w.show = function () { var r = origShow.apply(this, arguments); watchLast(this); return r; };
                watchLast(w);
            })();
        },
        onComplete: function (args) {
            var w = wgt(), data = null;
            try { data = JSON.parse(args.prosJson); } catch (e) { data = null; }
            S.loading = false;
            if (w && w.itemsContainer) { w.itemsContainer.children('.sd-pros-loading').remove(); }
            if (!w || !data || String(data.gen) !== String(S.gen)) { return; }   // ผลเก่า (มีค้นหาใหม่แล้ว) ทิ้ง
            S.hasMore = !!data.hasMore;
            S.nextPage = data.page + 1;
            render(w, data.items || [], data.page === 0, data.keepId);
        },
        onError: function () {
            S.loading = false;
            var w = wgt(); if (w && w.itemsContainer) { w.itemsContainer.children('.sd-pros-loading').remove(); }
        }
    };
})();

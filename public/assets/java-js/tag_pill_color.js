/*
 * tag_pill_color.js — สี pill ของ "แท็ก" (tag) มาตรฐานกลาง (★ 12/10/2026)
 *
 * พอร์ตตรงจาก ld2TagPillStyle() ใน lead_detail.xhtml (ผู้ใช้สั่งให้หน้า lead listing ทั้ง tab board + tab list
 * ใช้สีแท็กเหมือนหน้า lead_detail) — กฎเดียวกันทุกประการ:
 *   - พื้นหลัง = สีของแท็ก (colorCode จาก master-data/tags) opacity 20%
 *   - ตัวอักษร = สีเดิม แต่บังคับให้เข้ม: คง hue/saturation เดิม ตรึง lightness ไม่เกิน 30%
 *     (แท็กหลายตัวเป็นพาสเทล ถ้าใช้สีดิบเป็นตัวอักษรจะอ่านไม่ออกบนพื้นขาว) — สีที่เข้มกว่า 30% อยู่แล้วปล่อยไว้ตามเดิม
 *   - ไม่ใส่ !important ที่ color: dark theme ที่บังคับสีตัวอักษรอ่อนด้วย CSS ชนะ inline ได้ (พื้น tint ยังติดมาตามปกติ)
 *   - colorCode ไม่ใช่ hex (#rgb / #rrggbb) หรือว่าง → คืน "" = ไม่ใส่ style ปล่อยใช้สี default ของ CSS หน้านั้น
 *
 * ใช้: TagPillColor.style(colorCode [, withBorder]) → "background:...;color:...;" (หรือ "")
 *
 * หมายเหตุ: lead_detail.xhtml ยังมีสำเนาของตัวเองอยู่ (ld2TagPillStyle) — ถ้าแก้กฎสีที่นี่ ต้องแก้ที่นั่นให้ตรงกันด้วย
 * (หรือย้าย lead_detail มาใช้ไฟล์นี้ในภายหลัง)
 */
(function (w) {
    "use strict";

    var TEXT_L = 0.30;   /* เพดาน lightness ของสีตัวอักษร (LD2_TAG_TEXT_L ของ lead_detail) */

    function hex2rgb(c) {
        var v = String(c || '').trim();
        if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
            return null;
        }
        var h = v.slice(1);
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
    }

    function rgb2hsl(rgb) {
        var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        var h = 0, s = 0, l = (mx + mn) / 2;
        if (d) {
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            if (mx === r) { h = ((g - b) / d + (g < b ? 6 : 0)); }
            else if (mx === g) { h = ((b - r) / d + 2); }
            else { h = ((r - g) / d + 4); }
            h = h / 6;
        }
        return [h, s, l];
    }

    function hsl2rgb(hsl) {
        var h = hsl[0], s = hsl[1], l = hsl[2];
        if (!s) {
            return [Math.round(l * 255), Math.round(l * 255), Math.round(l * 255)];
        }
        var q = l < 0.5 ? l * (1 + s) : (l + s - l * s);
        var p = 2 * l - q;
        function hue(t) {
            if (t < 0) { t += 1; }
            if (t > 1) { t -= 1; }
            if (t < 1 / 6) { return p + (q - p) * 6 * t; }
            if (t < 1 / 2) { return q; }
            if (t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
            return p;
        }
        return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
    }

    function rgb2hex(rgb) {
        return '#' + rgb.map(function (v) {
            v = Math.max(0, Math.min(255, Math.round(v)));
            return (v < 16 ? '0' : '') + v.toString(16);
        }).join('');
    }

    function style(colorCode, withBorder) {
        var rgb = hex2rgb(colorCode);
        if (!rgb) {
            return '';
        }
        var rgba20 = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.2)';
        var hsl = rgb2hsl(rgb);
        hsl[2] = Math.min(hsl[2], TEXT_L);   /* บังคับเข้ม */
        /* withBorder — chip ที่มีเส้นขอบอยู่แล้วต้องทับให้เป็นสีเดียวกับพื้น (เหมือน ld2TagPillStyle) */
        return 'background:' + rgba20 + ';color:' + rgb2hex(hsl2rgb(hsl)) + ';'
            + (withBorder ? 'border-color:' + rgba20 + ';' : '');
    }

    w.TagPillColor = { style: style };
})(window);

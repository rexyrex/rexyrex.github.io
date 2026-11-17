/* 알바수첩 — /apps/alba_pay/
   The signature demo: a month of a regular schedule → the app's pay
   breakdown, calendar and 주휴 weeks. Dependency-free.

   ENGINE is a straight port of the app's lib/domain/pay_calculator.dart,
   lib/core/labor_rules.dart and lib/core/holidays_kr.dart (same rules,
   same rounding, same order of operations). VIEW turns a result into
   the HTML the page shows; the static fallback in index.html is VIEW's
   output for the 카페 오픈 sample, so the page reads the same without JS.
   Everything below runs in the visitor's browser; nothing is sent. */
(function () {
    'use strict';

    /* ENGINE:BEGIN */
    var Pay = (function () {
        var DAY = 1440;

        // 최저임금 (시간급, 원) — labor_rules.dart
        var MIN_WAGE = { 2024: 9860, 2025: 10030, 2026: 10320, 2027: 10700 };

        // 4대보험 근로자 부담분 — labor_rules.dart (2027 장기요양·고용 are not decided yet)
        var INSURANCE = {
            2024: { pension: 0.045, health: 0.03545, care: 0.1295, employment: 0.009, provisional: false },
            2025: { pension: 0.045, health: 0.03545, care: 0.1295, employment: 0.009, provisional: false },
            2026: { pension: 0.0475, health: 0.03595, care: 0.1314, employment: 0.009, provisional: false },
            2027: { pension: 0.05, health: 0.03595, care: 0.1314, employment: 0.009, provisional: true }
        };

        // 관공서의 공휴일 — holidays_kr.dart
        var HOLIDAYS = {
            2025: { '01-01': '신정', '01-27': '임시공휴일', '01-28': '설날 연휴', '01-29': '설날', '01-30': '설날 연휴', '03-01': '삼일절', '03-03': '대체공휴일', '05-01': '근로자의 날', '05-05': '어린이날·부처님오신날', '05-06': '대체공휴일', '06-03': '대통령선거', '06-06': '현충일', '08-15': '광복절', '10-03': '개천절', '10-05': '추석 연휴', '10-06': '추석', '10-07': '추석 연휴', '10-08': '대체공휴일', '10-09': '한글날', '12-25': '성탄절' },
            2026: { '01-01': '신정', '02-16': '설날 연휴', '02-17': '설날', '02-18': '설날 연휴', '03-01': '삼일절', '03-02': '대체공휴일', '05-01': '노동절', '05-05': '어린이날', '05-24': '부처님오신날', '05-25': '대체공휴일', '06-03': '지방선거', '06-06': '현충일', '07-17': '제헌절', '08-15': '광복절', '08-17': '대체공휴일', '09-24': '추석 연휴', '09-25': '추석', '09-26': '추석 연휴', '10-03': '개천절', '10-05': '대체공휴일', '10-09': '한글날', '12-25': '성탄절' },
            2027: { '01-01': '신정', '02-06': '설날 연휴', '02-07': '설날', '02-08': '설날 연휴', '02-09': '대체공휴일', '03-01': '삼일절', '05-01': '노동절', '05-03': '대체공휴일', '05-05': '어린이날', '05-13': '부처님오신날', '06-06': '현충일', '07-17': '제헌절', '07-19': '대체공휴일', '08-15': '광복절', '08-16': '대체공휴일', '09-14': '추석 연휴', '09-15': '추석', '09-16': '추석 연휴', '10-03': '개천절', '10-04': '대체공휴일', '10-09': '한글날', '10-11': '대체공휴일', '12-25': '성탄절', '12-27': '대체공휴일' }
        };

        var K = {
            weeklyHolidayMin: 15 * 60,  // 주휴수당: 주 15시간 이상
            weeklyStandard: 40 * 60,    // 법정 주 40시간
            dailyStandard: 8 * 60,      // 법정 1일 8시간
            nightStart: 22,
            nightEnd: 6,
            overtime: 0.5,
            night: 0.5,
            holidayWithin8h: 0.5,
            holidayBeyond8h: 1.0,
            businessTax: 0.03,          // 소득세 3%
            localOfIncome: 0.1,         // 지방소득세 = 소득세의 10%
            minimumWithholding: 1000,   // 소액부징수
            insuranceMinMonthly: 60 * 60
        };

        function clampYear(table, y) {
            var ys = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
            if (y <= ys[0]) return ys[0];
            if (y >= ys[ys.length - 1]) return ys[ys.length - 1];
            return y;
        }
        function minimumWageFor(y) { return MIN_WAGE[clampYear(MIN_WAGE, y)]; }
        function insuranceRatesFor(y) { return INSURANCE[clampYear(INSURANCE, y)]; }
        function minWageYears() { return Object.keys(MIN_WAGE).map(Number); }

        // Wall-clock dates as whole days since 1970-01-01, times as minutes
        // since then (the app keeps wall times in UTC for the same reason:
        // no DST, so every difference is the minutes actually worked).
        function dayOf(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
        function ymd(day) {
            var t = new Date(day * 86400000);
            return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
        }
        // 1 = Monday … 7 = Sunday, like Dart's DateTime.weekday (1970-01-01 was a Thursday)
        function weekday(day) { return (((day + 3) % 7) + 7) % 7 + 1; }
        function weekStartOf(day, weekStart) { return day - ((((weekday(day) - weekStart) % 7) + 7) % 7); }
        function two(v) { return (v < 10 ? '0' : '') + v; }
        function holidayName(day) {
            var p = ymd(day);
            var t = HOLIDAYS[p.y];
            return (t && t[two(p.m) + '-' + two(p.d)]) || null;
        }
        function hasHolidayData(y) { return Object.prototype.hasOwnProperty.call(HOLIDAYS, y); }
        function holidayYears() { return Object.keys(HOLIDAYS).map(Number); }

        /* PayCalculator.rawNightMinutes: minutes of [start, end) in 22:00–06:00 */
        function rawNightMinutes(start, end) {
            var total = 0;
            var day = Math.floor(start / DAY) - 1;
            while (day * DAY < end) {
                var ws = day * DAY + K.nightStart * 60;
                var we = (day + 1) * DAY + K.nightEnd * 60;
                var a = start > ws ? start : ws;
                var b = end < we ? end : we;
                if (b > a) total += b - a;
                day++;
            }
            return total;
        }

        /* paid minutes (break removed) and break-scaled night minutes */
        function shiftMinutes(s) {
            var total = s.end - s.start;
            if (total <= 0) return { paid: 0, night: 0 };
            var paid = Math.max(0, total - s.breakMinutes);
            return { paid: paid, night: Math.round(rawNightMinutes(s.start, s.end) * paid / total) };
        }

        function shiftPay(s, m, overtime, holiday, holidayExtra, premiumsApply) {
            var wage = s.wage;
            var base = m.paid / 60 * wage;
            var ot = premiumsApply ? overtime / 60 * wage * K.overtime : 0;
            var night = premiumsApply ? m.night / 60 * wage * K.night : 0;
            var hol = premiumsApply
                ? holiday / 60 * wage * K.holidayWithin8h + holidayExtra / 60 * wage * K.holidayBeyond8h
                : 0;
            var premiums = ot + night + hol;
            return {
                shift: s,
                paidMinutes: m.paid,
                nightMinutes: m.night,
                overtimeMinutes: overtime,
                holidayMinutes: holiday,
                holidayExtraMinutes: holidayExtra,
                basePay: base,
                overtimePremium: ot,
                nightPremium: night,
                holidayPremium: hol,
                total: base + premiums
            };
        }

        /* PayCalculator.computeWeek */
        function computeWeek(w, weekStartDay, shifts) {
            var sorted = shifts.slice().sort(function (a, b) { return a.start - b.start; });
            var pays = [];
            var regularAccum = 0;
            var paidAccum = 0;
            var wageWeighted = 0;
            var dayAccum = {};
            var holidayDayAccum = {};
            sorted.forEach(function (s) {
                var m = shiftMinutes(s);
                var date = Math.floor(s.start / DAY);
                paidAccum += m.paid;
                if (s.holiday) {
                    var hb = holidayDayAccum[date] || 0;
                    var ha = hb + m.paid;
                    holidayDayAccum[date] = ha;
                    var extra = Math.max(0, ha - K.dailyStandard) - Math.max(0, hb - K.dailyStandard);
                    pays.push(shiftPay(s, m, 0, m.paid - extra, extra, w.fivePlus));
                    return;
                }
                var db = dayAccum[date] || 0;
                var da = db + m.paid;
                dayAccum[date] = da;
                var dailyOt = Math.max(0, da - K.dailyStandard) - Math.max(0, db - K.dailyStandard);
                var regular = m.paid - dailyOt;
                var before = regularAccum;
                var after = regularAccum + regular;
                var weeklyOt = Math.max(0, after - K.weeklyStandard) - Math.max(0, before - K.weeklyStandard);
                var kept = regular - weeklyOt;
                regularAccum = Math.min(after, K.weeklyStandard);
                wageWeighted += kept * s.wage;
                pays.push(shiftPay(s, m, dailyOt + weeklyOt, 0, 0, w.fivePlus));
            });
            var eligible = w.weeklyHolidayPay && regularAccum >= K.weeklyHolidayMin;
            var averageWage = regularAccum > 0 ? wageWeighted / regularAccum : w.wage;
            var holidayPayMinutes = eligible ? Math.round(Math.min(regularAccum, K.weeklyStandard) / 5) : 0;
            return {
                pays: pays,
                week: {
                    start: weekStartDay,
                    lastDay: weekStartDay + 6,
                    regularMinutes: regularAccum,
                    paidMinutes: paidAccum,
                    eligible: eligible,
                    minutesToEligible: Math.max(0, K.weeklyHolidayMin - regularAccum),
                    averageWage: averageWage,
                    holidayPayMinutes: holidayPayMinutes,
                    holidayPay: holidayPayMinutes / 60 * averageWage
                }
            };
        }

        function floor10(v) { return Math.floor(v / 10) * 10; }

        /* PayCalculator.computeDeductions */
        function computeDeductions(mode, gross, paidMinutes, year) {
            var d = { mode: mode, incomeTax: 0, localTax: 0, pension: 0, health: 0, care: 0, employment: 0, shortHoursExempt: false, provisionalRates: false, belowMinimumWithholding: false };
            if (gross <= 0 || mode === 'none') return finish(d);
            if (mode === 'tax33') {
                var tax = floor10(gross * K.businessTax);
                if (tax < K.minimumWithholding) {
                    d.belowMinimumWithholding = true;
                    return finish(d);
                }
                d.incomeTax = tax;
                d.localTax = floor10(tax * K.localOfIncome);
                return finish(d);
            }
            var r = insuranceRatesFor(year);
            var shortHours = paidMinutes < K.insuranceMinMonthly;
            var health = shortHours ? 0 : floor10(gross * r.health);
            d.pension = shortHours ? 0 : floor10(gross * r.pension);
            d.health = health;
            d.care = floor10(health * r.care);
            d.employment = floor10(gross * r.employment);
            d.shortHoursExempt = shortHours;
            d.provisionalRates = r.provisional;
            return finish(d);

            function finish(x) {
                x.total = x.incomeTax + x.localTax + x.pension + x.health + x.care + x.employment;
                return x;
            }
        }

        /* PayCalculator.summarize for one workplace and one period [start, end) in days */
        function summarize(w, allShifts, period) {
            var first = weekStartOf(period.start, w.weekStart);
            var last = weekStartOf(period.end - 1, w.weekStart);
            var buckets = {};
            var order = [];
            for (var ws = first; ws <= last; ws += 7) {
                buckets[ws] = [];
                order.push(ws);
            }
            allShifts.forEach(function (s) {
                if (s.workplaceId != null && w.id != null && s.workplaceId !== w.id) return;
                var k = weekStartOf(Math.floor(s.start / DAY), w.weekStart);
                if (buckets[k]) buckets[k].push(s);
            });
            var weeks = order.map(function (k) { return computeWeek(w, k, buckets[k]); });
            var inPeriod = [];
            weeks.forEach(function (wk) {
                wk.pays.forEach(function (p) {
                    var d = Math.floor(p.shift.start / DAY);
                    if (d >= period.start && d < period.end) inPeriod.push(p);
                });
            });
            inPeriod.sort(function (a, b) { return a.shift.start - b.shift.start; });
            var paidWeeks = weeks
                .map(function (wk) { return wk.week; })
                .filter(function (wk) { return wk.lastDay >= period.start && wk.lastDay < period.end && wk.paidMinutes > 0; })
                .sort(function (a, b) { return a.start - b.start; });

            function sum(f) { return inPeriod.reduce(function (a, p) { return a + f(p); }, 0); }
            function sumInt(f) { return inPeriod.reduce(function (a, p) { return a + f(p); }, 0); }

            var base = Math.round(sum(function (p) { return p.basePay; }));
            var overtime = Math.round(sum(function (p) { return p.overtimePremium; }));
            var night = Math.round(sum(function (p) { return p.nightPremium; }));
            var holiday = Math.round(sum(function (p) { return p.holidayPremium; }));
            var weekly = Math.round(paidWeeks.reduce(function (a, wk) { return a + wk.holidayPay; }, 0));
            var gross = base + overtime + night + holiday + weekly;
            var paidMinutes = sumInt(function (p) { return p.paidMinutes; });
            var deductions = computeDeductions(w.deduction, gross, paidMinutes, ymd(period.end - 1).y);
            var workDays = {};
            inPeriod.forEach(function (p) { workDays[Math.floor(p.shift.start / DAY)] = true; });

            return {
                period: period,
                shifts: inPeriod,
                weeks: paidWeeks,
                deductions: deductions,
                basePay: base,
                overtimePay: overtime,
                nightPay: night,
                holidayWorkPay: holiday,
                weeklyHolidayPay: weekly,
                gross: gross,
                net: gross - deductions.total,
                paidMinutes: paidMinutes,
                nightMinutes: sumInt(function (p) { return p.nightMinutes; }),
                overtimeMinutes: sumInt(function (p) { return p.overtimeMinutes; }),
                holidayWorkMinutes: sumInt(function (p) { return p.holidayMinutes + p.holidayExtraMinutes; }),
                weeklyHolidayMinutes: paidWeeks.reduce(function (a, wk) { return a + wk.holidayPayMinutes; }, 0),
                workDays: Object.keys(workDays).length
            };
        }

        function hhmm(v) {
            var m = /^(\d{1,2}):(\d{2})/.exec(v || '');
            if (!m) return null;
            var h = +m[1];
            var mi = +m[2];
            return h < 24 && mi < 60 ? h * 60 + mi : null;
        }

        /* A regular schedule (the calendar's 여러 날 추가) priced for one
           calendar month: shifts on the chosen weekdays across every week
           that touches the month, so a week straddling the 1st counts the
           days before it too — as it would with real records. 공휴일 default
           to 휴일근무 only at 5인 이상, like the app's shift editor. */
        function month(plan) {
            var period = { start: dayOf(plan.year, plan.month, 1), end: dayOf(plan.year, plan.month + 1, 1) };
            var w = { wage: plan.wage, fivePlus: plan.fivePlus, weeklyHolidayPay: true, deduction: plan.deduction, weekStart: 1 };
            var startMin = hhmm(plan.start);
            var endMin = hhmm(plan.end);
            var shifts = [];
            var length = 0;
            if (startMin != null && endMin != null) {
                length = endMin > startMin ? endMin - startMin : endMin + DAY - startMin;
                var from = weekStartOf(period.start, w.weekStart);
                var to = weekStartOf(period.end - 1, w.weekStart) + 7;
                for (var d = from; d < to; d++) {
                    if (plan.days.indexOf(weekday(d)) < 0) continue;
                    shifts.push({
                        id: d,
                        start: d * DAY + startMin,
                        end: d * DAY + startMin + length,
                        breakMinutes: plan.breakMinutes,
                        wage: plan.wage,
                        holiday: plan.fivePlus && !!holidayName(d)
                    });
                }
            }
            return {
                plan: plan,
                period: period,
                overnight: startMin != null && endMin != null && endMin <= startMin,
                shiftMinutes: length,
                summary: summarize(w, shifts, period)
            };
        }

        return {
            DAY: DAY,
            K: K,
            minimumWageFor: minimumWageFor,
            minWageYears: minWageYears,
            insuranceRatesFor: insuranceRatesFor,
            dayOf: dayOf,
            ymd: ymd,
            weekday: weekday,
            weekStartOf: weekStartOf,
            holidayName: holidayName,
            hasHolidayData: hasHolidayData,
            holidayYears: holidayYears,
            rawNightMinutes: rawNightMinutes,
            shiftMinutes: shiftMinutes,
            computeWeek: computeWeek,
            computeDeductions: computeDeductions,
            summarize: summarize,
            hhmm: hhmm,
            month: month
        };
    })();
    /* ENGINE:END */

    /* VIEW:BEGIN */
    var View = (function () {
        var WD = ['월', '화', '수', '목', '금', '토', '일'];
        var nf = new Intl.NumberFormat('ko-KR');

        function grouped(n) { return nf.format(n); }
        function won(n) { return grouped(n) + '원'; }
        function minus(n) { return '-' + won(n); }
        // `510` → `8시간 30분` (core/format.dart duration)
        function duration(min) {
            var h = Math.floor(min / 60);
            var m = min % 60;
            if (h === 0) return m + '분';
            if (m === 0) return h + '시간';
            return h + '시간 ' + m + '분';
        }
        // calendar cells: `93750` → `9.4만`
        function wonCompact(n) {
            if (Math.abs(n) < 10000) return grouped(n);
            var man = n / 10000;
            var s = man >= 100 ? String(Math.round(man)) : man.toFixed(1);
            return (s.slice(-2) === '.0' ? s.slice(0, -2) : s) + '만';
        }
        function wd(day) { return WD[Pay.weekday(day) - 1]; }
        function dateShort(day) { var p = Pay.ymd(day); return p.m + '.' + p.d + ' (' + wd(day) + ')'; }
        function monthLabel(y, m) { return y + '년 ' + m + '월'; }

        function row(label, detail, value, cls) {
            return '<div class="row' + (cls ? ' ' + cls : '') + '"><dt>' + label +
                (detail ? '<small>' + detail + '</small>' : '') + '</dt><dd>' + value + '</dd></div>';
        }

        /* the pay screen: 예상 실수령액, 지급 내역 (_BreakdownCard), 주휴수당 주별 내역 (_WeeksCard) */
        function slip(res) {
            var s = res.summary;
            var d = s.deductions;
            var plan = res.plan;
            var premiums = plan.fivePlus;
            var year = Pay.ymd(s.period.end - 1).y;
            var minWage = Pay.minimumWageFor(year);
            var eligibleWeeks = s.weeks.filter(function (w) { return w.eligible; }).length;
            var h = [];

            h.push('<div class="slip-total">');
            h.push('<p class="slip-k">예상 실수령액</p>');
            h.push('<p class="slip-net"><span class="ab-mark" data-net>' + won(s.net) + '</span></p>');
            h.push('<p class="slip-sub"><span>세전 ' + won(s.gross) + '</span> · <span>공제 ' + won(d.total) + '</span> · <span>' + s.workDays + '일 ' + duration(s.paidMinutes) + '</span></p>');
            h.push('</div>');

            h.push('<div class="slip-sec"><h4>지급 내역</h4><dl class="rows">');
            h.push(row('기본급', duration(s.paidMinutes), won(s.basePay)));
            h.push(row('주휴수당', s.weeklyHolidayMinutes > 0 ? eligibleWeeks + '주 · ' + duration(s.weeklyHolidayMinutes) : '주 15시간 이상인 주가 없어요', won(s.weeklyHolidayPay)));
            if (premiums || s.overtimeMinutes > 0) h.push(row('연장근로수당', s.overtimeMinutes > 0 ? duration(s.overtimeMinutes) + ' × 50%' : '', won(s.overtimePay), premiums ? '' : 'is-muted'));
            if (premiums || s.nightMinutes > 0) h.push(row('야간근로수당', s.nightMinutes > 0 ? duration(s.nightMinutes) + ' × 50%' : '', won(s.nightPay), premiums ? '' : 'is-muted'));
            if (premiums || s.holidayWorkMinutes > 0) h.push(row('휴일근로수당', s.holidayWorkMinutes > 0 ? duration(s.holidayWorkMinutes) : '', won(s.holidayWorkPay), premiums ? '' : 'is-muted'));
            h.push(row('세전 합계', '', won(s.gross), 'is-sum'));
            if (d.incomeTax > 0) h.push(row('소득세 (3%)', '', minus(d.incomeTax), 'is-minus'));
            if (d.localTax > 0) h.push(row('지방소득세', '', minus(d.localTax), 'is-minus'));
            if (d.mode === 'insurance') {
                h.push(row('국민연금', '', minus(d.pension), 'is-minus'));
                h.push(row('건강보험', '', minus(d.health), 'is-minus'));
                h.push(row('장기요양보험', '', minus(d.care), 'is-minus'));
                h.push(row('고용보험', '', minus(d.employment), 'is-minus'));
            }
            h.push(row('실수령액', '', won(s.net), 'is-net'));
            h.push('</dl>');

            if (plan.wage < minWage) {
                h.push('<p class="slip-warn">시급이 ' + year + '년 최저시급(' + won(minWage) + ')보다 낮아요.</p>');
            }
            var notes = [];
            if (!premiums && (s.nightMinutes > 0 || s.overtimeMinutes > 0 || s.holidayWorkMinutes > 0)) notes.push('5인 미만 사업장은 연장·야간·휴일 가산수당이 적용되지 않아요.');
            if (d.belowMinimumWithholding) notes.push('세액이 1,000원 미만이라 원천징수되지 않아요 (소액부징수).');
            if (d.shortHoursExempt) notes.push('월 60시간 미만 근무는 보통 국민연금·건강보험 가입 대상이 아니에요.');
            if (d.provisionalRates) notes.push(year + '년 일부 보험료율은 확정 전이라 기존 요율로 계산했어요.');
            if (notes.length) h.push('<ul class="slip-notes">' + notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>');
            h.push('</div>');

            h.push('<div class="slip-sec"><h4>주휴수당 주별 내역</h4>');
            if (!s.weeks.length) {
                h.push('<p class="slip-empty">이 기간에 끝나는 근무 주가 없어요.</p>');
            } else {
                h.push('<ul class="weeks">');
                s.weeks.forEach(function (w) {
                    h.push('<li class="' + (w.eligible ? 'is-ok' : 'is-short') + '"><span class="wk-ico" aria-hidden="true"></span><span class="wk-t"><b>' +
                        dateShort(w.start) + ' – ' + dateShort(w.lastDay) + '</b><small>' +
                        (w.eligible
                            ? '소정근로 ' + duration(w.regularMinutes) + ' → 주휴 ' + duration(w.holidayPayMinutes)
                            : '소정근로 ' + duration(w.regularMinutes) + ' · ' + duration(w.minutesToEligible) + ' 부족') +
                        '</small></span><span class="wk-v">' +
                        (w.eligible ? '+' + won(Math.round(w.holidayPay)) : '<span aria-hidden="true">–</span><span class="app-visually-hidden">주휴수당 없음</span>') +
                        '</span></li>');
                });
                h.push('</ul>');
            }
            h.push('</div>');
            return h.join('');
        }

        /* the calendar tab: 일-first month grid, 공휴일 in red, the day's 기본+가산 */
        function calendar(res, today) {
            var s = res.summary;
            var p = res.period;
            var ym = Pay.ymd(p.start);
            var byDay = {};
            var sum = 0;
            s.shifts.forEach(function (x) {
                var day = Math.floor(x.shift.start / Pay.DAY);
                byDay[day] = (byDay[day] || 0) + x.total;
                sum += x.total;
            });
            var h = [];
            h.push('<div class="cal-head"><h3>' + ym.m + '월 근무 달력</h3><p>근무 ' + s.workDays + '일 · ' + duration(s.paidMinutes) + ' · 기본+가산 ' + won(Math.round(sum)) + '</p></div>');
            h.push('<div class="cal-wd" aria-hidden="true"><span class="is-sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span class="is-sat">토</span></div>');
            h.push('<ol class="cal-grid">');
            var lead = Pay.weekday(p.start) % 7; // Sunday-first columns
            for (var i = 0; i < lead; i++) h.push('<li class="is-pad" aria-hidden="true"></li>');
            for (var day = p.start; day < p.end; day++) {
                var col = Pay.weekday(day) % 7;
                var hol = Pay.holidayName(day);
                var worked = Object.prototype.hasOwnProperty.call(byDay, day);
                var amount = worked ? Math.round(byDay[day]) : 0;
                var cls = ['cal-day'];
                if (col === 0 || hol) cls.push('is-sun');
                else if (col === 6) cls.push('is-sat');
                if (worked) cls.push('is-work');
                if (today === day) cls.push('is-today');
                var d = Pay.ymd(day).d;
                // only days with something on them are read out
                if (!worked && !hol) {
                    h.push('<li class="' + cls.join(' ') + '" aria-hidden="true"><span class="cal-n">' + d + '</span></li>');
                    continue;
                }
                var label = ym.m + '월 ' + d + '일' + (hol ? ', ' + hol : '') + (worked ? ', 근무 ' + won(amount) : '');
                h.push('<li class="' + cls.join(' ') + '"><span class="cal-n" aria-hidden="true">' + d + '</span>' +
                    (worked ? '<span class="cal-dot" aria-hidden="true"></span><span class="cal-amt" aria-hidden="true">' + wonCompact(amount) + '</span>'
                        : '<span class="cal-hol" aria-hidden="true">' + hol.split('·')[0].replace(/ /g, '') + '</span>') +
                    '<span class="app-visually-hidden">' + label + '</span></li>');
            }
            h.push('</ol>');
            return h.join('');
        }

        return { won: won, duration: duration, wonCompact: wonCompact, dateShort: dateShort, monthLabel: monthLabel, slip: slip, calendar: calendar };
    })();
    /* VIEW:END */

    if (typeof document === 'undefined') return;

    /* ---------- the demo ------------------------------------------ */

    var root = document.getElementById('calc');
    var form = document.getElementById('calc-form');
    if (root && form) initCalc();

    function initCalc() {
        var PRESETS = {
            cafe: { wage: 12500, days: [1, 3, 5], start: '09:30', end: '17:30', breakMinutes: 30, fivePlus: true, deduction: 'tax33' },
            night: { wage: 'min', days: [5, 6, 7], start: '22:00', end: '07:00', breakMinutes: 60, fivePlus: false, deduction: 'none' },
            weekend: { wage: 11000, days: [6, 7], start: '11:00', end: '17:30', breakMinutes: 30, fivePlus: false, deduction: 'none' }
        };
        var years = Pay.holidayYears();
        var minYear = Math.min.apply(null, years);
        var maxYear = Math.max.apply(null, years);

        var now = new Date();
        var todayDay = Pay.dayOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
        var state = { preset: 'cafe', year: now.getFullYear(), month: now.getMonth() + 1 };
        if (state.year < minYear) { state.year = minYear; state.month = 1; }
        if (state.year > maxYear) { state.year = maxYear; state.month = 12; }

        var $ = function (sel) { return root.querySelector(sel); };
        var wageIn = $('#f-wage');
        var startIn = $('#f-start');
        var endIn = $('#f-end');
        var minBtn = $('#f-minwage');
        var overnightNote = $('#f-overnight');
        var breakHint = $('#f-break-hint');
        var holidayHint = $('#f-holiday-hint');
        var presetBtns = Array.prototype.slice.call(root.querySelectorAll('[data-preset]'));
        var slipBody = $('#slip-body');
        var cal = $('#cal');
        var monthOut = $('#slip-month');
        var rangeOut = $('#slip-range');
        var prevBtn = $('#slip-prev');
        var nextBtn = $('#slip-next');
        var live = $('#calc-live');
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var lastNet = null;
        var liveTimer = 0;

        form.hidden = false;
        root.classList.add('is-live');
        Array.prototype.forEach.call(root.querySelectorAll('[data-js-only]'), function (el) { el.hidden = false; });
        Array.prototype.forEach.call(root.querySelectorAll('[data-no-js]'), function (el) { el.hidden = true; });

        function radios(name) { return Array.prototype.slice.call(form.querySelectorAll('input[name="' + name + '"]')); }
        function radioValue(name) {
            var r = radios(name).filter(function (x) { return x.checked; })[0];
            return r ? r.value : null;
        }
        function setRadio(name, value) { radios(name).forEach(function (x) { x.checked = x.value === String(value); }); }

        function apply(id) {
            var p = PRESETS[id];
            state.preset = id;
            wageIn.value = p.wage === 'min' ? Pay.minimumWageFor(state.year) : p.wage;
            radios('day').forEach(function (x) { x.checked = p.days.indexOf(+x.value) >= 0; });
            startIn.value = p.start;
            endIn.value = p.end;
            setRadio('brk', p.breakMinutes);
            setRadio('size', p.fivePlus ? '5' : '4');
            setRadio('ded', p.deduction);
        }

        function read() {
            var wage = parseInt(String(wageIn.value).replace(/[^\d]/g, ''), 10);
            return {
                year: state.year,
                month: state.month,
                wage: isNaN(wage) ? 0 : wage,
                days: radios('day').filter(function (x) { return x.checked; }).map(function (x) { return +x.value; }),
                start: startIn.value,
                end: endIn.value,
                breakMinutes: +(radioValue('brk') || 0),
                fivePlus: radioValue('size') === '5',
                deduction: radioValue('ded') || 'none'
            };
        }

        function render() {
            var plan = read();
            var res = Pay.month(plan);
            var s = res.summary;

            presetBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === state.preset)); });
            monthOut.textContent = View.monthLabel(state.year, state.month);
            rangeOut.textContent = View.dateShort(s.period.start) + ' ~ ' + View.dateShort(s.period.end - 1);
            prevBtn.disabled = state.year === minYear && state.month === 1;
            nextBtn.disabled = state.year === maxYear && state.month === 12;
            var mw = Pay.minimumWageFor(state.year);
            minBtn.textContent = state.year + '년 최저시급 ' + View.won(mw) + ' 넣기';
            minBtn.disabled = plan.wage === mw;

            overnightNote.hidden = !res.overnight;

            // 근로기준법 제54조 — the shift editor's hint
            var worked = res.shiftMinutes - plan.breakMinutes;
            var hint = '';
            if (res.shiftMinutes > 0 && worked >= 8 * 60 && plan.breakMinutes < 60) hint = '8시간 이상 근무하면 1시간 이상의 휴게시간이 법정 의무예요.';
            else if (res.shiftMinutes > 0 && worked >= 4 * 60 && plan.breakMinutes < 30) hint = '4시간 이상 근무하면 30분 이상의 휴게시간이 법정 의무예요.';
            breakHint.textContent = hint;
            breakHint.hidden = !hint;

            var hols = s.shifts.map(function (p) { return Math.floor(p.shift.start / Pay.DAY); }).filter(function (d) { return Pay.holidayName(d); });
            var hh = '';
            if (hols.length) {
                var p1 = Pay.ymd(hols[0]);
                hh = hols.length === 1 ? p1.m + '월 ' + p1.d + '일은 ' + Pay.holidayName(hols[0]) + '(공휴일)이에요.' : '공휴일 ' + hols.length + '일이 포함돼 있어요.';
                hh += plan.fivePlus ? ' 그날은 자동으로 휴일근무로 계산해요.' : ' 5인 미만 사업장은 공휴일 가산이 없어요.';
            }
            holidayHint.textContent = hh;
            holidayHint.hidden = !hh;

            slipBody.innerHTML = View.slip(res);
            cal.innerHTML = View.calendar(res, todayDay);

            if (lastNet !== null && lastNet !== s.net && !reduced) {
                var mark = slipBody.querySelector('[data-net]');
                if (mark) mark.classList.add('is-tick');
            }
            lastNet = s.net;

            window.clearTimeout(liveTimer);
            liveTimer = window.setTimeout(function () {
                live.textContent = state.month + '월 예상 실수령액 ' + View.won(s.net) + ', 세전 ' + View.won(s.gross) + '.';
            }, 500);
        }

        presetBtns.forEach(function (b) {
            b.addEventListener('click', function () {
                apply(b.getAttribute('data-preset'));
                render();
            });
        });

        function edited() {
            state.preset = null;
            render();
        }
        form.addEventListener('input', function (e) {
            if (e.target === wageIn) {
                var digits = wageIn.value.replace(/[^\d]/g, '').slice(0, 7);
                if (digits !== wageIn.value) wageIn.value = digits;
            }
            edited();
        });
        form.addEventListener('change', edited);
        form.addEventListener('submit', function (e) { e.preventDefault(); });

        minBtn.addEventListener('click', function () {
            wageIn.value = Pay.minimumWageFor(state.year);
            edited();
        });

        function step(delta) {
            var m = state.month + delta;
            var y = state.year;
            if (m < 1) { m = 12; y--; }
            if (m > 12) { m = 1; y++; }
            if (y < minYear || y > maxYear) return;
            state.year = y;
            state.month = m;
            // the 편의점 sample is paid the minimum wage of whichever year is shown
            if (state.preset && PRESETS[state.preset].wage === 'min') wageIn.value = Pay.minimumWageFor(y);
            render();
        }
        prevBtn.addEventListener('click', function () { step(-1); });
        nextBtn.addEventListener('click', function () { step(1); });

        apply('cafe');
        render();
    }

    /* ---------- reveals ------------------------------------------- */

    (function reveals() {
        var els = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
        if (!els.length || !('IntersectionObserver' in window)) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        document.documentElement.classList.add('ab-motion');
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (!e.isIntersecting) return;
                e.target.classList.add('is-in');
                io.unobserve(e.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        els.forEach(function (el) { io.observe(el); });
    })();
})();

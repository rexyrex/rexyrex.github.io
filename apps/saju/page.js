/* /apps/saju/ — the 사주팔자 board and the 오행 wheel.
   Dependency-free. The pillar maths mirrors the app (lunar 1.7.8,
   EightChar with sect 1): the year turns at 입춘, the month at each
   절기 (節), the day from the Julian day, and a birth from 23:00 takes
   the next day's pillar; the hour stem follows that day stem.
   JIE holds the twelve 節 for 1899–2052 exported from the same library:
   per year 小寒 立春 驚蟄 淸明 立夏 芒種 小暑 立秋 白露 寒露 立冬 大雪, each as
   4 base-36 digits = minutes after 1 Jan 00:00 of that year (rounded
   up, so "minute >= value" equals the library's second-exact test). */
(function () {
    'use strict';

    var JIE =
        '05du125j1z8f2wtl3uzn4tnh5sky6rh07q108o1w9lhzaih505ng12f41zhy2x353v984tx35sun6rqr7qat8obq9lrsaiqw' +
        '05x612os1zrn2xcx3vj34u715t4k6s0n7qkn8olj9m1naj0t067412yr201k2xmq3vsr4ugk5tdz6s9z7qtz8ouy9mb6ajai' +
        '06gw138k20bb2xwe3w2e4uq85tnp6sjs7r3v8p4u9ml2ajkc06qq13id20l42y673wc74v015txk6sto7rdq8peo9mutaju2' +
        '05wg12o41zqy2xc33vi34u5u5t386rz97qja8ok89m0eaizn066212xs200p2xlw3vrx4ufp5td46s947qt58ou39mabaj9m' +
        '06g0137n20ag2xvj3w1i4up95tmo6sio7r2r8p3r9mk1ajjc06pq13hc20k22y543wb34uyw5twc6ssf7rch8pdf9mtnajsw' +
        '05va12mx1zpp2xau3vgv4u4q5t286ryb7qib8oj89lzeaiyn065212ws1zzl2xkn3vqk4ue95tbm6s7m7qrn8osm9m8uaj85' +
        '06el136b20932xu53w014unq5tl56sh97r1e8p2f9minajhw06o813fu20il2y3p3w9o4uxg5tux6sr27rb68pc79msfajrn' +
        '05ty12lj1zo92x9c3vfb4u325t0f6rwg7qgj8ohk9lxuaix6063j12v61zxw2xiy3vox4uco5ta46s667qq98orb9m7oaj72' +
        '06dh1352207p2xsm3vyf4um55tjk6sfo7qzu8p0x9mhaajgo06n413eq20he2y2a3w824uvq5tt66spb7r9h8pak9mqvajq7' +
        '05sm12ka1zn12x823vdy4u1o5sz36rv77qfc8ogf9lwpaiw1062h12u61zwx2xhy3vnr4ubb5t8l6s4k7qoo8opt9m67aj5n' +
        '06c4133s206i2xrh3vxa4ukx5ti96seb7qyg8ozm9mg0ajfe06lt13df20g42y133w704uur5ts76sob7r8f8p9i9mptajp7' +
        '05rm12j91zly2x6x3vct4u0i5sxv6rtw7qdy8oez9lvaaiuo061512sv1zvm2xgm3vmh4ua75t7m6s3q7qnv8ooy9m5aaj4n' +
        '06b2132p205d2xqa3vw34ujr5th76sdd7qxm8oys9mf5ajeh06ku13ce20f12xzy3w5q4ute5tqu6sn17r7a8p8h9mouajo5' +
        '05qi12i11zko2x5n3vbi4tz95swp6rsw7qd58oec9luraiu5060j12s31zuo2xfj3vl94u8u5t666s297qmg8onp9m48aj3r' +
        '06a9131v204f2xp73vuu4uid5tfq6sbw7qw68oxg9mdxajdf06jw13bh20e22xyv3w4k4us65tpl6sls7r628p7a9mnqajn6' +
        '05pn12h91zjw2x4s3vah4txz5sv86rr97qbg8oco9lt4aisl05z312qs1zth2xee3vk34u7n5t4w6s0x7ql58ome9m2xaj2f' +
        '068w130h20332xnx3vtm4uh65tei6sal7quu8ow39mcmajc506im13a620cq2xxj3w384uqs5to56sk87r4f8p5m9mm2ajlj' +
        '05o012fm1zi82x333v8u4twi5stx6rq27qaa8obg9lrvairc05xt12pg1zs32xcw3vij4u625t3d6rzg7qjp8okx9m1faj0x' +
        '067f12z1201n2xmf3vs14ufi5tcu6s907qtd8ouo9mb6ajal06gz138i20b22xvv3w1l4up75tmn6siw7r398p4l9ml3ajkj' +
        '05mw12ee1zgx2x1q3v7f4tuz5ssa6roe7q8o8o9z9lqkaiq305wk12o31zqm2xbd3vh04u4j5t1w6ry17qid8ojq9m0daizy' +
        '066g12xz200f2xl23vqm4ue45tbj6s7s7qs78otl9ma8aj9t06gc137w20ac2xuz3w0h4unx5tl96shg7r1u8p379mjrajja' +
        '05ls12de1zfz2x0p3v6a4tts5sr46rna7q7o8o939lppaip805vr12nd1zpy2xao3vg74u3l5t0s6rwv7qh78oim9lzcaiyz' +
        '065j12x51zzn2xkc3vpu4ud75taf6s6j7qqw8osb9m8zaj8l06f4136n20952xtu3vzg4umz5tkd6sgj7r0w8p299mivajig' +
        '05kz12ck1zf22wzs3v5d4tsu5sq36rm67q6f8o7q9lobainw05uh12m41zop2x9f3vey4u2d5szn6rvs7qg48ohh9ly4aixp' +
        '064712vr1zy82xix3vof4ubw5t986s5h7qpy8ore9m81aj7l06e1135i207y2xsm3vy54ull5tiw6sf37qzh8p0x9mhjajh2' +
        '05ji12az1zdg2wy43v3p4tr75sok6rkr7q578o6o9lncaimy05tf12kx1znc2x7x3vdd4u0r5sy26ru87qem8og49lwwaiwm' +
        '063712uq1zx32xhl3vmy4ua95t7i6s3q7qo78opp9m6faj6306cm1345206k2xr43vwj4ujx5th96sdj7qy28ozl9mgaajfw' +
        '05if129y1zcf2wx13v2h4tpt5smz6rj37q3h8o4z9llpaild05ry12jj1zm12x6o3vc34tzd5swk6rso7qd28oem9lvfaiv5' +
        '061o12t61zvj2xg33vli4u8w5t666s2f7qmw8ooh9m5aaj4z06bj1330205d2xpw3vva4uio5tfy6sc57qwj8oy09meqajef' +
        '05gz128j1zaz2wvj3v0z4tod5slp6rhx7q2d8o3u9lklaik805qt12ie1zkt2x5d3vaq4ty15sva6rri7qbz8odk9lucaiu2' +
        '060n12s71zul2xf43vkf4u7p5t4w6s157qlo8ona9m43aj3q06a7131o20412xok3vtz4uhd5tep6sb07qvm8ox99me3ajdq' +
        '05g7127n1z9z2wuj3uzy4tna5skj6rgp7q168o2r9ljnaije05pz12hi1zju2x4b3v9m4tww5su46rqa7qas8oce9ltbait5' +
        '05zr12r81zti2xdv3vj44u6f5t3q6s027qko8omd9m39aj31069n1315203g2xnv3vt44ugc5tdl6s9t7quc8ovy9mcsajci' +
        '05f2126n1z912wtj3uyu4tm35sja6rfh7q008o1o9lijaiia05ov12ge1zis2x393v8j4tvq5ssv6rp17q9l8ob99ls8ais2' +
        '05yp12q71zsi2xcx3vi64u5d5t2i6ryn7qj68oku9m1qaj1i068312zk201u2xm93vrk4uew5tc66s8g7qt08oun9mbiajb9' +
        '05dt125b1z7n2ws33uxe4tko5shw6re37pyk8o059lh0aigs05ne12ey1zhb2x1q3v6y4tu55srb6rnj7q828o9q9lqmaiqe' +
        '05wy12oe1zqn2xb03vg94u3h5t0s6rx57qhv8ojn9m0laj0c066u12y9200h2xkt3vq24uda5taj6s6t7qrg8ot69ma4aj9v' +
        '05ce123t1z612wqe3uvn4tiv5sg46rcd7px08nys9lfsaifn05m812dp1zfw2x053v5a4tsg5spo6rly7q6m8o8f9lpiaiph' +
        '05w612no1zpu2xa23vf44u275szc6rvl7qga8oi39lz3aiyz065m12x41zzd2xjn3vor4ubw5t936s5f7qq58orz9m8zaj8t' +
        '05bg122y1z592wpm3uus4thx5sf06rb77pvs8nxk9lemaiej05l812cr1zf32wzg3v4l4tro5sop6rku7q5f8o779lobaio9' +
        '05uw12md1zok2x8u3ve04u165syd6run7qfc8oh79ly9aiy6064t12wa1zyh2xir3vnx4ub45t8c6s4l7qp68oqw9m7vaj7q' +
        '05ad121w1z462woi3utn4tgt5se06raa7puw8nwm9ldlaidg05k312bm1zdv2wy53v384tqc5snj6rju7q4k8o6f9lnhaind' +
        '05tz12lg1zno2x7x3vcz4u025sx86rti7qe98og49lx5aiwy063h12uv1zx12xhb3vmf4u9l5t6u6s367qny8opv9m6yaj6t' +
        '059c120o1z2t2wn23us74tfc5scj6r8t7pti8nvd9lciaich05j512ak1zcp2wwv3v1v4tox5sm16ria7q2z8o4v9lm1aim1' +
        '05sp12k41zm62x693vb64ty75svf6rru7qcp8oeo9lvuaivt062g12tv1zvz2xg43vl24u835t596s1l7qmc8oo99m5daj5b' +
        '057y11zg1z1n2wlu3uqu4tdu5saw6r747pru8nts9layaiax05hm12921zb82wvd3v0c4tnb5skd6rgm7q1e8o3e9lkoaikr' +
        '05rh12ix1zl12x553va34tx35su56rqe7qb48od29lu8aiu8060x12sd1zuh2xem3vjl4u6n5t3t6s047qkv8oms9m3yaj3x' +
        '056l11y21z072wke3upe4tcg5s9l6r5u7pqk8nsh9l9mai9m05gd127v1za22wu83uz74tm55sj86rfh7q088o269ljcaijb' +
        '05pz12hd1zjh2x3l3v8j4tvj5ssp6rp47qa18oc49ltcaitb05zw12r81zta2xdf3vif4u5h5t2o6rz17qjv8olv9m33aj32' +
        '055p11x21yz52wj93uo84tb95s8e6r4p7pph8nri9l8rai8t05fj126x1z8y2wsx3uxs4tkq5shv6re87pz48o189lilaiiq' +
        '05pi12gy1ziy2x2x3v7p4tum5srp6ro37q8y8ob19lsaaisc05z112qh1zsj2xck3vhf4u4b5t1e6rxr7qio8okr9m21aj22' +
        '054q11w51yy92wid3un94ta65s776r3h7pob8nqe9l7pai7t05ek12611z842ws73ux24tjx5sgx6rd47pxw8nzy9lhaaihf' +
        '05o412fi1zhh2x1h3v6b4tt85sqc6rmp7q7l8o9p9lr2air605xv12p91zr82xb83vg34u325t086rwk7qhd8oje9m0naj0p' +
        '053f11uw1ywy2wgz3ult4t8q5s5t6r247pmx8noy9l67ai6905cz124g1z6h2wqg3uv74ti15sf46rbh7pwg8nym9lfzaig3' +
        '05mt12e71zg62x053v4x4trs5sou6rl87q668o8c9lppaipr05wd12np1zpn2x9m3veg4u1c5syf6rut7qfr8ohx9lzbaizf' +
        '052311te1yvc2wfa3uk34t705s426r0e7pla8nnh9l4xai5505bx123c1z5b2wp73utx4tgq5sdr6ra27pux8nx39lejaier' +
        '05lj12cx1zeu2wyo3v3c4tq45sn66rjm7q4n8o6w9lobaioh05v812mn1zom2x8i3vd84u025sx56rtj7qei8ogo9ly2aiy7' +
        '050y11se1yuf2wef3uj74t605s2z6qz97pk58nmb9l3qai3x05ap12241z432wnz3uso4tfg5scf6r8r7ptq8nw09ldjaidt' +
        '05kl12bz1zdw2wxs3v2h4tpb5smd6riq7q3o8o5v9lnbaini05u912ln1znk2x7g3vc64tz15sw46rsi7qdg8ofm9lx0aix6' +
        '04zw11rb1yt92wd63uhw4t4p5s1r6qy57pj38nlb9l2qai2x059p12151z352wn13urq4tei5sbi6r7v7psu8nv39lckaicq' +
        '05jf12ar1zcm2wwg3v134tnv5skx6rhe7q2h8o4u9lmdaimj05t712kg1zm92x633vas4txn5sur6rr77qc98oek9lw2aiwa' +
        '04z011qb1ys62wc03ugo4t3h5s0i6qwu7pht8nk49l1nai1y058r12031z1w2wll3uq24tcq5s9r6r667pr98ntn9lbaaibn' +
        '05ih129v1zbp2wve3uzv4tmj5sjj6rfz7q138o3g9ll0ail905s212jg1zlb2x533v9n4twa5st96rpm7qao8od09lulaiuu' +
        '04xl11oz1yqw2wap3ufa4t1x5ryt6qv47pg48nii9l05ai0h057c11yr1z0n2wkg3up14tbp5s8l6r4v7ppu8ns69l9taia5' +
        '05gy128b1za42wtu3uye4tl25si26ref7pzh8o1u9ljfaijq05qj12hw1zjp2x3g3v814tus5srv6roa7q9b8obl9lt4aitd' +
        '04w611nl1ypi2w9b3udw4t0m5rxn6qu07pf08nhb9kytahz2055v11x91yz42wiu3unb4t9x5s6w6r3c7poh8nqy9l8lai8w' +
        '05fo126z1z8s2wsh3ux04tjo5sgp6rd77pyf8o0v9liiaiir05ph12gp1zih2x263v6q4ttg5sqh6rmx7q828oaj9ls7aisi' +
        '04v911mi1yo92w7x3uce4sz25rw16qsg7pdl8ng29kxuahy9055511wi1yy92whv3uma4t8v5s5u6r2a7pne8npw9l7mai81' +
        '05ew12681z7y2wri3uvv4tif5sfe6rbv7px38nzm9lhcaihq05ok12fw1zho2x1b3v5q4tsc5spa6rlp7q6v8o9d9lr3airh' +
        '04ub11lo1ynj2w793ubq4syb5rv86qrk7pcm8nf29kwtahx8054311vg1yx82wgu3ul84t7q5s4l6r0y7pm38nom9l6fai6x' +
        '05dt12551z6w2wqg3uuv4thg5sef6rav7pw18nyi9lg7aigm05ng12es1zgk2x063v4m4tr95so86rkn7q5r8o869lpuaiq7' +
        '04t111ke1ym62w5t3ua74swq5rtn6qq17pb68ndn9kveahvs052o11u11yvu2wfh3ujv4t6f5s3c6qzr7pky8nnh9l58ai5m' +
        '05ce123n1z5c2wox3utb4tfv5scs6r997puj8nx49lewaifa05m112d91zew2wyg3v2u4tph5smg6rix7q458o6q9lojaioy' +
        '04rr11j11ykq2w4a3u8o4sva5rs96qoo7p9u8ncd9ku6ahuo051l11sw1yui2wdy3ui54t4l5s1h6qxy7pj88nlv9l3rai4a' +
        '05b7122j1z462wnl3urt4te95sb76r7q7pt38nvq9ldkaie005ku12c51zdv2wxe3v1p4to75sl36rhj7q2t8o5f9ln9ainp' +
        '04qj11hu1yjk2w333u7d4sts5rql6qmz7p868nau9ksrahtb050811rk1yt92wcs3uh34t3j5s0e6qwt7pi18nkp9l2mai36' +
        '05a3121d1z2z2wme3uqo4td55sa26r6i7prs8nuf9lcbaict05jp12b01zcm2ww23v0b4tmu5sjt6rga7q1j8o449llyaimg';
    var GAN = '甲乙丙丁戊己庚辛壬癸';
    var ZHI = '子丑寅卯辰巳午未申酉戌亥';
    var GAN_KR = '갑을병정무기경신임계';
    var ZHI_KR = '자축인묘진사오미신유술해';
    var GAN_EL = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
    var ZHI_EL = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];
    var ANIMAL = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];

    function mod(a, n) { return ((a % n) + n) % n; }

    function jieMinute(year, k) {
        var i = ((year - 1899) * 12 + k) * 4;
        return Date.UTC(year, 0, 1) / 60000 + parseInt(JIE.substr(i, 4), 36);
    }

    /* y, m, d: solar date; h, mi: hour and minute, or null when unknown.
       Returns stem/branch indices for each pillar (time is null). */
    function computePillars(y, m, d, h, mi) {
        var hasTime = h !== null && h !== undefined;
        var t = Date.UTC(y, m - 1, d, hasTime ? h : 0, hasTime ? mi : 0) / 60000;

        var lyear = t >= jieMinute(y, 1) ? y : y - 1;
        var yg = mod(lyear - 4, 10);
        var yz = mod(lyear - 4, 12);

        var k = -1;
        for (var j = 11; j >= 0; j--) {
            if (t >= jieMinute(y, j)) { k = j; break; }
        }
        var mz = k < 0 ? 0 : (k + 1) % 12;
        var mg = mod(yg * 2 + 2 + mod(mz - 2, 12), 10);

        var off = Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 2440588 - 11;
        var dg = mod(off, 10);
        var dz = mod(off, 12);
        if (hasTime && h === 23) { dg = (dg + 1) % 10; dz = (dz + 1) % 12; }

        var time = null;
        if (hasTime) {
            var tz = Math.floor((h + 1) / 2) % 12;
            time = { g: (dg % 5 * 2 + tz) % 10, z: tz };
        }
        return { y: { g: yg, z: yz }, m: { g: mg, z: mz }, d: { g: dg, z: dz }, t: time };
    }

    function hanja(p) { return p ? GAN[p.g] + ZHI[p.z] : undefined; }

    if (typeof module === 'object' && module.exports) {
        module.exports = {
            computePillars: computePillars,
            pillarsHanja: function (y, m, d, h, mi) {
                var r = computePillars(y, m, d, h, mi);
                return { y: hanja(r.y), m: hanja(r.m), d: hanja(r.d), t: hanja(r.t) };
            }
        };
        return;
    }

    /* ---------- page ------------------------------------------------ */

    var doc = document;
    doc.documentElement.classList.add('js');

    var EL = {
        '목': { hz: '木', name: '나무', k: 0, gist: '자라고 뻗어 나가는 기운. 봄, 동쪽, 새로 시작하는 힘이에요.' },
        '화': { hz: '火', name: '불', k: 1, gist: '위로 타오르며 밝히는 기운. 여름, 남쪽, 드러내고 표현하는 힘이에요.' },
        '토': { hz: '土', name: '흙', k: 2, gist: '받아들이고 품어 주는 기운. 계절과 계절 사이에서 가운데를 잡아 주는 힘이에요.' },
        '금': { hz: '金', name: '쇠', k: 3, gist: '단단하게 맺고 거두는 기운. 가을, 서쪽, 결단하고 정리하는 힘이에요.' },
        '수': { hz: '水', name: '물', k: 4, gist: '낮은 곳으로 스며 흐르는 기운. 겨울, 북쪽, 조용히 모으고 헤아리는 힘이에요.' }
    };
    var ORDER = ['목', '화', '토', '금', '수'];
    var SAENG_TXT = {
        '목': '나무는 불을 지펴요.',
        '화': '불이 타고 남은 재는 흙이 돼요.',
        '토': '흙 속에서 쇠붙이가 나와요.',
        '금': '차가운 쇠에 물방울이 맺혀요.',
        '수': '물은 나무를 자라게 해요.'
    };
    var GEUK_TXT = {
        '목': '나무뿌리는 흙을 파고들어요.',
        '토': '흙으로 둑을 쌓아 물을 막아요.',
        '수': '물은 불을 꺼요.',
        '화': '불은 쇠를 녹여요.',
        '금': '쇠로 만든 도끼는 나무를 베어요.'
    };
    function next(el, step) { return ORDER[(EL[el].k + step) % 5]; }

    var board = doc.getElementById('board');
    var wheel = doc.getElementById('wheel');
    var panel = doc.getElementById('el-panel');
    if (!board || !wheel || !panel) return;

    var grid = board.closest('.palja-grid');
    var cells = Array.prototype.slice.call(board.querySelectorAll('.glyph-cell'));
    var discs = Array.prototype.slice.call(wheel.querySelectorAll('.el'));
    var paths = Array.prototype.slice.call(wheel.querySelectorAll('.wheel-lines path'));
    var coreGlyph = doc.getElementById('wheel-core-glyph');
    var readout = doc.getElementById('board-readout');
    var whenEl = doc.getElementById('board-when');
    var tagEl = board.parentNode.querySelector('.board-caption-tag');

    var state = { counts: { '목': 2, '화': 4, '토': 1, '금': 0, '수': 1 }, dayEl: '화', sel: null };

    cells.forEach(function (c, i) { c.style.setProperty('--i', i); });
    discs.forEach(function (b) { b.style.setProperty('--k', EL[b.dataset.el].k); });

    /* ----- selection ----- */

    function countText(n) { return n > 0 ? '이 사주에 ' + n + '개' : '이 사주에는 없어요'; }

    function relItem(cls, label, code, text) {
        return '<li class="' + cls + '"><span class="rel-k">' + label + '</span><span class="rel-v"><b>' +
            code + '</b> ' + text + '</span></li>';
    }

    function fillPanel(el) {
        var e = EL[el];
        var gives = next(el, 1), givenBy = next(el, 4), beats = next(el, 2), beatenBy = next(el, 3);
        panel.setAttribute('data-el', el);
        panel.innerHTML =
            '<p class="el-panel-head"><span class="el-panel-hz" aria-hidden="true">' + e.hz + '</span>' +
            '<span class="el-panel-name">' + e.name + '의 기운</span>' +
            '<span class="el-panel-count">' + countText(state.counts[el]) + '</span></p>' +
            '<p class="el-panel-gist">' + e.gist + '</p>' +
            '<ul class="el-rel">' +
            relItem('rel-saeng', '내가 살리는 기운', el + '생' + gives, SAENG_TXT[el]) +
            relItem('rel-saeng', '나를 살리는 기운', givenBy + '생' + el, SAENG_TXT[givenBy]) +
            relItem('rel-geuk', '내가 누르는 기운', el + '극' + beats, GEUK_TXT[el]) +
            relItem('rel-geuk', '나를 누르는 기운', beatenBy + '극' + el, GEUK_TXT[beatenBy]) +
            '</ul>';
    }

    function select(el, fromUser) {
        if (!EL[el]) return;
        var changed = state.sel !== el;
        state.sel = el;
        wheel.classList.add('has-sel');
        discs.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.el === el ? 'true' : 'false'); });
        paths.forEach(function (p) {
            p.classList.toggle('is-on', p.getAttribute('data-from') === el || p.getAttribute('data-to') === el);
        });
        if (coreGlyph) coreGlyph.textContent = EL[el].hz;
        if (fromUser) {
            board.classList.add('has-sel');
            cells.forEach(function (c) { c.classList.toggle('is-match', c.dataset.el === el); });
        }
        if (changed) fillPanel(el);
    }

    function clearBoard() {
        board.classList.remove('has-sel');
        cells.forEach(function (c) { c.classList.remove('is-match'); });
    }

    function bind(btn) {
        btn.addEventListener('pointerenter', function (e) {
            if (e.pointerType === 'mouse' || e.pointerType === 'pen') select(btn.dataset.el, true);
        });
        /* a second tap (or Enter) on the chosen element lifts the board
           highlight again; read the state before focus re-selects it */
        var toggleOnClick = false;
        btn.addEventListener('pointerdown', function (e) {
            toggleOnClick = e.pointerType !== 'mouse' && state.sel === btn.dataset.el && board.classList.contains('has-sel');
        });
        btn.addEventListener('focus', function () { if (!btn.disabled) select(btn.dataset.el, true); });
        btn.addEventListener('click', function (e) {
            var el = btn.dataset.el;
            if (!el) return;
            var toggle = e.detail === 0 ? state.sel === el && board.classList.contains('has-sel') : toggleOnClick;
            toggleOnClick = false;
            if (toggle) { clearBoard(); return; }
            select(el, true);
        });
    }
    discs.forEach(bind);
    cells.forEach(bind);

    if (grid) {
        grid.addEventListener('pointerleave', function (e) {
            if (e.pointerType === 'mouse') clearBoard();
        });
        grid.addEventListener('focusout', function (e) {
            if (!e.relatedTarget || !grid.contains(e.relatedTarget)) clearBoard();
        });
    }
    doc.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && board.classList.contains('has-sel')) clearBoard();
    });

    wheel.addEventListener('keydown', function (e) {
        var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: 4, ArrowUp: 4 }[e.key];
        if (!step || !e.target.classList.contains('el')) return;
        e.preventDefault();
        var target = next(e.target.dataset.el, step);
        discs.forEach(function (b) { if (b.dataset.el === target) b.focus(); });
    });

    state.sel = null;
    select(state.dayEl, false);

    /* ----- rendering a chart ----- */

    var PILLARS = [['y', '연주'], ['m', '월주'], ['d', '일주'], ['t', '시주']];

    function render(r) {
        var counts = { '목': 0, '화': 0, '토': 0, '금': 0, '수': 0 };
        PILLARS.forEach(function (pp, idx) {
            var p = r[pp[0]];
            var stem = cells[idx * 2], branch = cells[idx * 2 + 1];
            [[stem, '천간'], [branch, '지지']].forEach(function (pair, j) {
                var cell = pair[0];
                var glyph = cell.querySelector('.glyph');
                var reading = cell.querySelector('.reading');
                if (!p) {
                    cell.removeAttribute('data-el');
                    cell.classList.add('is-unknown');
                    cell.disabled = true;
                    glyph.textContent = '?';
                    reading.textContent = '모름';
                    cell.setAttribute('aria-label', pp[1] + ' ' + pair[1] + ', 시간을 몰라 비워 둠');
                    return;
                }
                var hz = j === 0 ? GAN[p.g] : ZHI[p.z];
                var kr = j === 0 ? GAN_KR[p.g] : ZHI_KR[p.z];
                var el = j === 0 ? GAN_EL[p.g] : ZHI_EL[p.z];
                counts[el]++;
                cell.disabled = false;
                cell.classList.remove('is-unknown');
                cell.setAttribute('data-el', el);
                glyph.textContent = hz;
                reading.textContent = kr + ' · ' + el;
                cell.setAttribute('aria-label', pp[1] + ' ' + pair[1] + ' ' + kr + ', ' + EL[el].name + '(' + el + ')' +
                    (idx === 2 && j === 0 ? '. 나를 뜻하는 일간' : ''));
            });
        });

        state.counts = counts;
        state.dayEl = GAN_EL[r.d.g];
        discs.forEach(function (b) {
            var el = b.dataset.el, n = counts[el];
            b.querySelector('.el-count').textContent = n;
            b.classList.toggle('is-empty', n === 0);
            b.setAttribute('aria-label', EL[el].name + '(' + el + '), ' + (n > 0 ? '이 사주에 ' + n + '개' : '이 사주에 없음'));
        });

        var text = GAN_KR[r.y.g] + ZHI_KR[r.y.z] + '년 ' + GAN_KR[r.m.g] + ZHI_KR[r.m.z] + '월 ' +
            GAN_KR[r.d.g] + ZHI_KR[r.d.z] + '일' + (r.t ? ' ' + GAN_KR[r.t.g] + ZHI_KR[r.t.z] + '시' : '') + '. ' +
            '일간(나)은 ' + GAN_KR[r.d.g] + state.dayEl + ', ' + ANIMAL[r.y.z] + '띠예요.' +
            (r.t ? '' : ' 시간을 몰라 시주는 비워 두었어요.');
        if (readout) readout.textContent = text;

        state.sel = null;
        clearBoard();
        select(state.dayEl, false);
    }

    /* ----- brush-in ----- */

    var motionOK = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    function draw() {
        board.classList.remove('is-drawing');
        void board.offsetWidth;
        board.classList.add('is-drawing');
        wheel.classList.add('is-drawing');
    }

    if (motionOK && 'IntersectionObserver' in window) {
        board.classList.add('is-armed');
        wheel.classList.add('is-armed');
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { draw(); io.disconnect(); }
            });
        }, { threshold: 0.3 });
        io.observe(board);
    }

    /* ----- the form ----- */

    var form = doc.getElementById('birth-form');
    if (form) {
        var dateIn = doc.getElementById('birth-date');
        var timeIn = doc.getElementById('birth-time');
        var noTime = doc.getElementById('birth-notime');
        var err = doc.getElementById('birth-error');
        form.hidden = false;

        noTime.addEventListener('change', function () {
            timeIn.disabled = noTime.checked;
            timeIn.removeAttribute('aria-invalid');
        });

        function fail(input, msg) {
            err.textContent = msg;
            if (input) {
                input.setAttribute('aria-invalid', 'true');
                input.focus();
            }
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            err.textContent = '';
            dateIn.removeAttribute('aria-invalid');
            timeIn.removeAttribute('aria-invalid');

            var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIn.value || '');
            var y, m, d;
            if (dm) {
                y = +dm[1]; m = +dm[2]; d = +dm[3];
                var check = new Date(Date.UTC(y, m - 1, d));
                if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) dm = null;
            }
            if (!dm) return fail(dateIn, '생년월일을 다시 확인해 주세요.');
            if (y < 1900 || y > 2050) return fail(dateIn, '1900년 1월 1일부터 2050년 12월 31일 사이의 날짜를 넣어 주세요.');

            var h = null, mi = null;
            if (!noTime.checked) {
                var tm = /^(\d{1,2}):(\d{2})/.exec(timeIn.value || '');
                if (!tm) return fail(timeIn, '태어난 시각을 넣거나 ‘시간을 몰라요’를 골라 주세요.');
                h = +tm[1]; mi = +tm[2];
                if (h > 23 || mi > 59) return fail(timeIn, '태어난 시각을 다시 확인해 주세요.');
            }

            render(computePillars(y, m, d, h, mi));
            if (tagEl) tagEl.textContent = '입력';
            if (whenEl) {
                whenEl.textContent = y + '년 ' + m + '월 ' + d + '일 ' +
                    (h === null ? '태어난 시간 모름' : h + '시' + (mi ? ' ' + mi + '분' : '')) + ' (양력)';
            }
            if (motionOK && board.classList.contains('is-armed')) draw();
        });
    }
})();

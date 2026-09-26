/* ==========================================================================
   一封信 — 交互与画布动画
   零依赖、零外部请求；所有图形用 Canvas 2D 程序化绘制。
   每个正文段落通过 data-scene 绑定一个动画场景，滚动时自动交叉淡入。
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- 工具 */
  var TAU = Math.PI * 2, D2R = Math.PI / 180;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutBack(t, s) { s = s == null ? 1.7 : s; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function rrPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ------------------------------------------------------------ 色与字 */
  var C = {
    paper: '#F0EEE6', paperA: '#F8F6EF', paperB: '#E9E6DB',
    ink: '#191919', soft: '#3D3D3A', muted: '#6B6B63',
    line: 'rgba(25,25,25,.13)',
    clay: '#CC785C', clayD: '#A85539',
    kraft: '#D4A27F', manilla: '#EBDBBC',
    sky: '#6A9BCC', olive: '#788C5D',
    violet: '#6D5BD0', violetL: '#9A8AE8', violetD: '#3B2E7E',
    pink: '#E8A0B4', pinkD: '#CE7E97',
    rain: ['#CC785C', '#D4A27F', '#E4D3A8', '#9FB183', '#9CC3DD', '#B0A3E6', '#EFC3CE']
  };
  var F = {
    serif: '"Songti SC","STSong","Source Han Serif SC","Noto Serif SC",Georgia,serif',
    sans: '-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif',
    mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
  };
  function fSerif(px, w) { return (w || 400) + ' ' + px + 'px ' + F.serif; }
  function fSans(px, w) { return (w || 400) + ' ' + px + 'px ' + F.sans; }
  function fMono(px, w) { return (w || 400) + ' ' + px + 'px ' + F.mono; }

  /* 纸张底 */
  function paper(c, w, h) {
    var g = c.createLinearGradient(0, 0, w * .3, h);
    g.addColorStop(0, '#F9F7F1'); g.addColorStop(.55, '#F2EFE7'); g.addColorStop(1, '#EBE8DD');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    var v = c.createRadialGradient(w * .5, h * .42, Math.min(w, h) * .15, w * .5, h * .5, Math.max(w, h) * .78);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(70,52,34,.10)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
  }

  /* 模拟模糊（不支持 ctx.filter 时用多次偏移绘制） */
  var ctx0 = document.createElement('canvas').getContext('2d');
  var canFilter = (function () {
    try { ctx0.filter = 'blur(2px)'; var ok = ctx0.filter !== 'none'; ctx0.filter = 'none'; return ok; }
    catch (e) { return false; }
  })();

  function blurText(c, str, x, y, font, color, r, alpha) {
    c.save();
    c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = color; c.globalAlpha = alpha == null ? 1 : alpha;
    if (canFilter && r > .6) {
      c.filter = 'blur(' + r.toFixed(1) + 'px)';
      c.fillText(str, x, y);
      c.filter = 'none';
      c.globalAlpha = (alpha == null ? 1 : alpha) * .85;
      c.fillText(str, x, y);
    } else {
      var N = 9;
      for (var i = 0; i < N; i++) {
        var a = i / N * TAU;
        c.globalAlpha = (alpha == null ? 1 : alpha) * .55 / N * 2;
        c.fillText(str, x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      c.globalAlpha = (alpha == null ? 1 : alpha) * .5;
      c.fillText(str, x, y);
    }
    c.restore();
  }

  /* ---------------------------------------------------------------- 图片 */
  /* 到需要的页码再下载，下完再做「模糊 → 清晰」 */
  var IMG = {
    girl: { src: 'pic1.png', el: null, ready: 0 },
    rainbow: { src: 'pic2.jpg', el: null, ready: 0 }
  };
  function loadImg(key) {
    var o = IMG[key];
    if (o.el) return o.el;
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () { o.ready = nowMs(); };
    im.onerror = function () { o.failed = true; };
    im.src = o.src;
    o.el = im;
    return im;
  }
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* 画一张模糊的图：支持 ctx.filter 就用它，否则缩到很小再放大来等效模糊 */
  var blurCv = null;
  function drawBlurred(img, x, y, w, h, r) {
    if (r < .5) { ctx.drawImage(img, x, y, w, h); return; }
    if (canFilter) {
      ctx.save();
      ctx.filter = 'blur(' + r.toFixed(1) + 'px)';
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
      return;
    }
    if (!blurCv) blurCv = document.createElement('canvas');
    var kk = clamp(1 / (1 + r * .55), .02, 1);
    var bw = Math.max(4, Math.round(w * kk)), bh = Math.max(4, Math.round(h * kk));
    blurCv.width = bw; blurCv.height = bh;
    var bc = blurCv.getContext('2d');
    bc.clearRect(0, 0, bw, bh);
    bc.drawImage(img, 0, 0, bw, bh);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(blurCv, 0, 0, bw, bh, x, y, w, h);
    ctx.restore();
  }

  /* 图片在画布里按比例居中放置 */
  function fitBox(img, w, h, maxW, maxH) {
    var iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
    var sc = Math.min(maxW / iw, maxH / ih);
    var dw = iw * sc, dh = ih * sc;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  }

  /* ==========================================================================
     场景 01 · 时间（早上好 / 下午好 / 晚上好）
     ========================================================================== */
  function phase() {
    var d = new Date(), hr = d.getHours() + d.getMinutes() / 60;
    var label, key;
    if (hr >= 5 && hr < 11) { key = 'morning'; label = '早上好'; }
    else if (hr >= 11 && hr < 17) { key = 'afternoon'; label = '下午好'; }
    else { key = 'evening'; label = '晚上好'; }
    return {
      key: key, label: label, hour: hr, d: d,
      hh: ('0' + d.getHours()).slice(-2), mm: ('0' + d.getMinutes()).slice(-2)
    };
  }

  function sceneGreeting(w, h) {
    var P = phase(), R = mulberry32(11);
    var clouds = [], stars = [], i;
    for (i = 0; i < 4; i++) clouds.push({ x: R() * w, y: h * (.10 + i * .07) + R() * 6, s: .62 + R() * .8, v: 3 + R() * 6, a: .26 + R() * .2 });
    for (i = 0; i < 30; i++) stars.push({ x: R() * w, y: R() * h * .5, r: .5 + R() * 1.1, ph: R() * TAU });
    var sky = {
      morning: ['#E7D3B4', '#F2E9D8', '#F6F2E8'],
      afternoon: ['#C6DCEA', '#E6EDEC', '#F4F1E8'],
      evening: ['#33304F', '#6E5C7C', '#C9B6A8']
    }[P.key];
    var dark = P.key === 'evening';
    var u = P.key === 'morning' ? (P.hour - 5) / 6 : (P.key === 'afternoon' ? (P.hour - 11) / 6 : (P.hour - 17) / 7);
    u = clamp(u, 0, 1);
    var sx = w * (.10 + .80 * u), sy = h * .78 - Math.sin(u * Math.PI) * h * .52;

    return {
      draw: function (t) {
        var g = ctx.createLinearGradient(0, 0, w * .18, h);
        g.addColorStop(0, sky[0]); g.addColorStop(.52, sky[1]); g.addColorStop(1, sky[2]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

        if (dark) {
          for (var s = 0; s < stars.length; s++) {
            var st = stars[s];
            ctx.globalAlpha = (.25 + .55 * (.5 + .5 * Math.sin(t * 1.3 + st.ph))) * (.35 + .65 * (1 - st.y / (h * .5)));
            ctx.fillStyle = '#FFF6E4';
            ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        /* 云 */
        for (var k = 0; k < clouds.length; k++) {
          var cl = clouds[k];
          var x = ((cl.x + t * cl.v) % (w + 160)) - 80, y = cl.y;
          ctx.save();
          ctx.globalAlpha = cl.a * (dark ? .5 : 1);
          ctx.fillStyle = dark ? '#8C7E96' : '#FFFFFF';
          var rr = 30 * cl.s;
          ctx.beginPath();
          ctx.ellipse(x, y, rr, rr * .42, 0, 0, TAU);
          ctx.ellipse(x + rr * .8, y + rr * .10, rr * .62, rr * .30, 0, 0, TAU);
          ctx.ellipse(x - rr * .78, y + rr * .12, rr * .55, rr * .26, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }

        /* 日 / 月 */
        ctx.save();
        var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * .5);
        var gc = dark ? 'rgba(246,240,222,.30)' : (P.key === 'morning' ? 'rgba(232,160,106,.42)' : 'rgba(233,180,120,.36)');
        glow.addColorStop(0, gc); glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
        var r = Math.min(w, h) * (dark ? .085 : .10);
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU);
        ctx.fillStyle = dark ? '#F4EEDF' : (P.key === 'morning' ? '#E9A268' : '#E8B173');
        ctx.fill();
        if (dark) { /* 月牙 */
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath(); ctx.arc(sx - r * .48, sy - r * .22, r * .92, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();

        /* 远山 */
        ctx.save();
        var hy = h * .80;
        ctx.beginPath(); ctx.moveTo(-4, hy + 20);
        ctx.quadraticCurveTo(w * .22, hy - h * .10, w * .48, hy + 2);
        ctx.quadraticCurveTo(w * .72, hy - h * .13, w + 4, hy - 2);
        ctx.lineTo(w + 4, h + 4); ctx.lineTo(-4, h + 4); ctx.closePath();
        ctx.fillStyle = dark ? 'rgba(40,34,58,.55)' : 'rgba(120,140,93,.18)'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-4, hy + 26);
        ctx.quadraticCurveTo(w * .30, hy + h * .04, w * .62, hy + 16);
        ctx.quadraticCurveTo(w * .84, hy + h * .05, w + 4, hy + 20);
        ctx.lineTo(w + 4, h + 4); ctx.lineTo(-4, h + 4); ctx.closePath();
        ctx.fillStyle = dark ? 'rgba(30,26,46,.62)' : 'rgba(120,140,93,.30)'; ctx.fill();
        ctx.strokeStyle = dark ? 'rgba(244,238,223,.30)' : 'rgba(25,25,25,.16)';
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, hy + 2); ctx.lineTo(w, hy - 2); ctx.stroke();
        ctx.restore();

        /* 字 */
        var fs = clamp(w * .062, 15, 26);
        ctx.save();
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = fSerif(fs, 400);
        ctx.fillStyle = dark ? 'rgba(246,241,229,.96)' : C.ink;
        ctx.fillText(P.label, 16, h - 24);
        ctx.font = fMono(clamp(fs * .46, 9, 12), 400);
        ctx.fillStyle = dark ? 'rgba(246,241,229,.62)' : 'rgba(25,25,25,.5)';
        ctx.letterSpacing = '1px';
        ctx.fillText(P.hh + ':' + P.mm, 17, h - 10);
        ctx.restore();
      }
    };
  }

  /* ==========================================================================
     场景 02 · 小卡（按需求：这一段画布留空，只保留纸面）
     ========================================================================== */
  function sceneBlank(w, h) {
    return {
      draw: function () { paper(ctx, w, h); }
    };
  }

  /* ==========================================================================
     场景 03 · 打字
     ========================================================================== */
  function sceneTyping(w, h) {
    var SEQ = [{ s: '我还是更倾向于', hold: .75 }, { s: '把文字打出来', hold: 1.7 }];
    var step = .085, gap = .55, cycle = 0, i;
    for (i = 0; i < SEQ.length; i++) cycle += SEQ[i].s.length * step + SEQ[i].hold + gap;
    var fs = clamp(w * .055, 14, 24);
    return {
      draw: function (t) {
        paper(ctx, w, h);
        var cyc = t % cycle;
        /* 纸面横线 */
        ctx.save();
        ctx.strokeStyle = 'rgba(25,25,25,.055)'; ctx.lineWidth = 1;
        for (var r = 0; r < 5; r++) {
          var y = h * .26 + r * (h * .13);
          ctx.beginPath(); ctx.moveTo(w * .12, y); ctx.lineTo(w * .88, y); ctx.stroke();
        }
        ctx.restore();

        var y0 = h * .34, lh = clamp(h * .18, 26, 46);
        var acc = 0, cursor = null;
        ctx.save();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        for (var s = 0; s < SEQ.length; s++) {
          var item = SEQ[s], chars = item.s.length;
          var show = clamp((cyc - acc) / step, 0, chars);
          var fade = seg(cyc, acc + chars * step + item.hold, acc + chars * step + item.hold + gap);
          if (cyc >= acc - .01) {
            ctx.font = fSans(fs, 500);
            var y = y0 + s * lh;
            for (var k = 0; k < Math.floor(show); k++) {
              var ap = clamp(show - k, 0, 1) * (1 - fade);
              var ch2 = item.s[k];
              ctx.globalAlpha = ap;
              ctx.fillStyle = C.ink;
              var adv = ctx.measureText(item.s.slice(0, k)).width;
              ctx.fillText(ch2, w * .5 - ctx.measureText(item.s).width / 2 + adv, y + (1 - clamp(show - k, 0, 1)) * 7);
              /* 光标只跟随正在打的那一行 */
              if (ap > .35) {
                cursor = { x: w * .5 - ctx.measureText(item.s).width / 2 + adv + ctx.measureText(ch2).width, y: y };
              }
            }
            ctx.globalAlpha = 1;
          }
          acc += chars * step + item.hold + gap;
        }
        ctx.restore();

        /* 光标 */
        if (cursor) {
          var bl = (Math.sin(t * 7.5) * .5 + .5) > .42 ? 1 : 0;
          ctx.save();
          ctx.globalAlpha = bl * .9;
          ctx.fillStyle = C.clay;
          ctx.fillRect(cursor.x + 2, cursor.y - fs * .62, 2, fs * 1.24);
          ctx.restore();
        }
      }
    };
  }

  /* ==========================================================================
     场景 04 / 06 · 一句话从模糊里浮现（三个点 → 浮现 → 散开）
     "洒脱" 那段参考这段来做，只换字、换色、加一层暖光
     ========================================================================== */
  function makeReveal(w, h, PH, o) {
    o = o || {};
    var cyc = o.cycle || 4.6;
    var inkCol = o.ink || C.ink;
    var accent = o.accent || C.clay;
    var glowCol = o.glow || null;
    var R = mulberry32(o.seed || 5), motes = [], i;
    for (i = 0; i < 18; i++) {
      motes.push({ x: R() * w, y: R() * h, sp: .3 + R() * .6, sz: .6 + R() * 1.4 });
    }
    return {
      draw: function (t) {
        paper(ctx, w, h);
        var k = Math.floor(t / cyc) % PH.length, lt = t % cyc;
        var r = clamp(w * .016, 4, 7), gapx = r * 2.9;
        var cy = h * .40;
        var inA = seg(lt, .9, 1.9), outA = seg(lt, 3.4, 4.3);
        var alpha = inA * (1 - outA);

        /* 暖光：整段话浮起来的时候，底下透出一层光 */
        if (glowCol) {
          var gp = .25 + alpha * .75;
          var g = ctx.createRadialGradient(w * .5, h * .58, 0, w * .5, h * .58, Math.min(w, h) * .68);
          g.addColorStop(0, glowCol);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.save(); ctx.globalAlpha = gp; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
        }

        /* 三点呼吸 */
        var near = seg(lt, 0, .9), away = seg(lt, 1.5, 2.2);
        ctx.save();
        for (var d2 = 0; d2 < 3; d2++) {
          var ph2 = Math.sin(t * 3 - d2 * .7) * .5 + .5;
          ctx.globalAlpha = (1 - away) * (.30 + .70 * ph2) * Math.max(.15, near);
          ctx.fillStyle = inkCol;
          ctx.beginPath();
          ctx.arc(w / 2 + (d2 - 1) * gapx, cy - 8, r * (.72 + .28 * ph2), 0, TAU);
          ctx.fill();
        }
        ctx.restore();

        /* 浮现的句子 */
        if (alpha > .01) {
          var fs = clamp(w * .062, 15, 26);
          var baseY = h * .70;
          ctx.save();
          ctx.translate(w / 2, baseY + (1 - inA) * 14 - outA * 10);
          blurText(ctx, PH[k], 0, 0, fSerif(fs, 400), inkCol, lerp(9, .35, inA), alpha);
          ctx.restore();
          /* 下划线 */
          ctx.save();
          ctx.globalAlpha = alpha * .55;
          ctx.strokeStyle = accent; ctx.lineWidth = 1.4;
          var lw = clamp(w * .10, 24, 54) * easeOutCubic(inA);
          ctx.beginPath();
          ctx.moveTo(w / 2 - lw, baseY + fs * .95);
          ctx.lineTo(w / 2 + lw, baseY + fs * .95);
          ctx.stroke();
          ctx.restore();
          /* 光点：只有带暖光的版本有 */
          if (glowCol) {
            ctx.save();
            for (var s = 0; s < 7; s++) {
              var a2 = s / 7 * TAU + t * .25;
              var rr2 = Math.min(w, h) * (.24 + .10 * Math.sin(t * 1.3 + s));
              var tw = .5 + .5 * Math.sin(t * 2 + s * 1.7);
              ctx.globalAlpha = alpha * tw * .7;
              ctx.fillStyle = s % 2 ? accent : C.kraft;
              ctx.beginPath();
              ctx.arc(w / 2 + Math.cos(a2) * rr2 * 1.5, baseY - r * 3 + Math.sin(a2) * rr2, 1.6 + tw * 1.4, 0, TAU);
              ctx.fill();
            }
            ctx.restore();
          }
        }

        /* 飘散的尘点 */
        ctx.save();
        for (var d = 0; d < motes.length; d++) {
          var mo = motes[d];
          var yy = (mo.y - t * mo.sp * 12 % (h + 40) + h + 40) % (h + 40);
          ctx.globalAlpha = .22 * (1 - Math.abs(yy / h - .5) * .9);
          ctx.fillStyle = C.kraft;
          ctx.beginPath(); ctx.arc(mo.x, yy, mo.sz, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    };
  }
  function sceneGuess(w, h) {
    return makeReveal(w, h, ['或许你已经猜到', '接下来的话'], { accent: C.clay, seed: 5 });
  }
  function sceneOpen(w, h) {
    return makeReveal(w, h, ['洒脱一些', '不再遮掩'], {
      accent: C.violet,
      glow: 'rgba(212,162,127,.30)',
      seed: 17,
      cycle: 4.3
    });
  }

  /* ==========================================================================
     场景 05 · 四年 / 只剩一年
     ========================================================================== */
  function sceneTimeline(w, h) {
    var L = ['大一', '大二', '大三', '大四'];
    var Hh = [.46, .46, .80, .30];
    var base = h * .80;
    var bw = clamp(w * .11, 18, 34), gapx = clamp(w * .075, 12, 30);
    var total = bw * 4 + gapx * 3, x0 = (w - total) / 2;
    return {
      draw: function (t) {
        paper(ctx, w, h);
        /* 基线 */
        var bl = easeOutCubic(seg(t, .1, 1.0));
        ctx.save();
        ctx.strokeStyle = 'rgba(25,25,25,.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0 - 14, base + .5); ctx.lineTo(x0 + total * bl + (bl >= 1 ? 14 : 0), base + .5); ctx.stroke();
        ctx.restore();

        for (var i = 0; i < 4; i++) {
          var g = easeOutCubic(seg(t, .25 + i * .18, 1.15 + i * .18));
          var bh = (base - h * .24) * Hh[i] * g;
          var x = x0 + i * (bw + gapx), y = base - bh;
          var hi = i === 2;
          ctx.save();
          if (i === 3) { /* 实习：斜纹 */
            rrPath(ctx, x, y, bw, bh, 5);
            ctx.fillStyle = 'rgba(25,25,25,.055)'; ctx.fill();
            ctx.save(); ctx.clip();
            ctx.strokeStyle = 'rgba(25,25,25,.16)'; ctx.lineWidth = 1;
            for (var s = -bw; s < bh + bw; s += 6) {
              ctx.beginPath(); ctx.moveTo(x + s, base); ctx.lineTo(x + s + bh, base - bh); ctx.stroke();
            }
            ctx.restore();
            ctx.strokeStyle = 'rgba(25,25,25,.20)'; ctx.lineWidth = 1; rrPath(ctx, x, y, bw, bh, 5); ctx.stroke();
          } else {
            var pulse = hi ? (.86 + .14 * (.5 + .5 * Math.sin(t * 1.9))) : .34;
            ctx.globalAlpha = pulse;
            var lg = ctx.createLinearGradient(0, y, 0, base);
            if (hi) { lg.addColorStop(0, C.clay); lg.addColorStop(1, '#B0654B'); }
            else { lg.addColorStop(0, '#B9B4A6'); lg.addColorStop(1, '#9E998C'); }
            ctx.fillStyle = lg;
            rrPath(ctx, x, y, bw, bh, 5); ctx.fill();
            if (hi) {
              ctx.globalAlpha = .22 * (.5 + .5 * Math.sin(t * 1.9));
              ctx.shadowColor = C.clay; ctx.shadowBlur = 22;
              rrPath(ctx, x, y, bw, bh, 5); ctx.fill();
            }
          }
          ctx.restore();
          /* 标签 */
          ctx.save();
          ctx.globalAlpha = clamp(seg(t, .5 + i * .18, 1.3 + i * .18), 0, 1);
          ctx.font = fSans(clamp(w * .036, 10, 13.5), hi ? 600 : 400);
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillStyle = hi ? C.ink : 'rgba(25,25,25,.55)';
          ctx.fillText(L[i], x + bw / 2, base + 7);
          ctx.restore();
        }

        /* 高亮说明 */
        var ap = seg(t, 1.5, 2.4), fs = clamp(w * .036, 10, 13);
        ctx.save();
        ctx.globalAlpha = ap;
        ctx.font = fMono(fs, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var hx = x0 + 2 * (bw + gapx) + bw / 2;
        var txt = '在校 · 仅此一年';
        var tw = ctx.measureText(txt).width;
        rrPath(ctx, hx - tw / 2 - 9, h * .16 - fs * 1.1, tw + 18, fs * 2.2, 999);
        ctx.fillStyle = 'rgba(204,120,92,.14)'; ctx.fill();
        ctx.fillStyle = C.clayD; ctx.fillText(txt, hx, h * .16);
        ctx.restore();

        /* 浮尘 */
        var R = mulberry32(19);
        ctx.save();
        for (var d = 0; d < 14; d++) {
          var x1 = R() * w, y1 = (R() * h - t * (6 + R() * 10)) % h;
          if (y1 < 0) y1 += h;
          ctx.globalAlpha = .18;
          ctx.fillStyle = C.kraft;
          ctx.beginPath(); ctx.arc(x1, y1, .7 + R() * 1.2, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    };
  }

  /* ==========================================================================
     场景 07 · 记不得初见（模糊的影像）
     ========================================================================== */
  function sceneBlur(w, h) {
    var R = mulberry32(47), motes = [], blobs = [];
    for (var i = 0; i < 22; i++) motes.push({ x: R() * w, y: R() * h, s: .5 + R() * 1.3, v: 4 + R() * 12, ph: R() * TAU });
    for (i = 0; i < 4; i++) blobs.push({ x: R(), y: R(), r: .22 + R() * .22, vx: .18 + R() * .3, vy: .12 + R() * .2, c: i % 2 ? 'rgba(150,140,170,.55)' : 'rgba(190,165,140,.5)' });
    return {
      draw: function (t) {
        paper(ctx, w, h);
        var fw = Math.min(w * .62, h * 1.05), fh = fw * .78;
        var fx = (w - fw) / 2, fy = (h - fh) / 2 - h * .02;
        ctx.save();
        ctx.translate(w / 2, fy + fh / 2);
        ctx.rotate(Math.sin(t * .32) * .012);
        ctx.translate(-w / 2, -(fy + fh / 2));
        /* 模糊的记忆块 */
        ctx.save();
        rrPath(ctx, fx, fy, fw, fh, 8); ctx.clip();
        ctx.fillStyle = 'rgba(228,223,210,.75)'; ctx.fillRect(fx, fy, fw, fh);
        for (var i = 0; i < blobs.length; i++) {
          var b = blobs[i];
          var bx = fx + (b.x + Math.sin(t * b.vx) * .16) * fw;
          var by = fy + (b.y + Math.cos(t * b.vy) * .16) * fh;
          var br = b.r * fw;
          var g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          g.addColorStop(0, b.c); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.fillRect(fx, fy, fw, fh);
        }
        /* 虚线相框 */
        ctx.save();
        ctx.strokeStyle = 'rgba(25,25,25,.30)'; ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 6;
        rrPath(ctx, fx, fy, fw, fh, 8); ctx.stroke();
        ctx.restore();
        /* 问号 */
        var qa = .30 + .18 * Math.sin(t * .9);
        ctx.save();
        ctx.globalAlpha = qa;
        ctx.font = fSerif(clamp(fw * .26, 26, 68), 400);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink;
        ctx.fillText('?', fx + fw * .5, fy + fh * .47 + Math.sin(t * .9) * 3);
        ctx.restore();
        /* 未知的日期 */
        ctx.save();
        ctx.globalAlpha = .5;
        ctx.font = fMono(clamp(fw * .045, 8.5, 11), 400);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = C.muted;
        ctx.fillText('— · — · —', fx + fw * .5, fy + fh - 10);
        ctx.restore();
        /* 浮尘 */
        ctx.save();
        for (var m = 0; m < motes.length; m++) {
          var mo = motes[m];
          var yy = mo.y - (t * mo.v) % (h + 30);
          if (yy < -15) yy += h + 30;
          ctx.globalAlpha = .30 * (.4 + .6 * (.5 + .5 * Math.sin(t * 1.4 + mo.ph)));
          ctx.fillStyle = C.kraft;
          ctx.beginPath(); ctx.arc(mo.x + Math.sin(t * .6 + mo.ph) * 6, yy, mo.s, 0, TAU); ctx.fill();
        }
        ctx.restore();
        ctx.restore();
      }
    };
  }

  /* ==========================================================================
     场景 08 · 黑框眼镜 / 粉色长裙 / 高跟鞋
     ========================================================================== */
  function drawGlasses(c, x, y, s) {
    var gw = s * .58, gh = s * .44, gap = s * .10, r = s * .13;
    c.lineWidth = Math.max(1.4, s * .045);
    c.strokeStyle = C.ink;
    rrPath(c, x - gap / 2 - gw, y - gh / 2, gw, gh, r); c.stroke();
    rrPath(c, x + gap / 2, y - gh / 2, gw, gh, r); c.stroke();
    c.beginPath();
    c.moveTo(x - gap / 2, y - gh * .16); c.lineTo(x + gap / 2, y - gh * .16);
    c.moveTo(x - gap / 2 - gw, y - gh * .30); c.lineTo(x - gap / 2 - gw - s * .22, y - gh * .62);
    c.moveTo(x + gap / 2 + gw, y - gh * .30); c.lineTo(x + gap / 2 + gw + s * .22, y - gh * .62);
    c.stroke();
  }
  function drawDress(c, x, y, s) {
    c.lineWidth = Math.max(1.4, s * .042);
    c.strokeStyle = C.pinkD;
    c.fillStyle = 'rgba(232,160,180,.32)';
    /* 连衣裙：收肩、束腰、A 字裙摆 */
    c.beginPath();
    c.moveTo(x - s * .13, y - s * .42);
    c.lineTo(x + s * .13, y - s * .42);
    c.lineTo(x + s * .10, y - s * .04);
    c.lineTo(x + s * .33, y + s * .30);
    c.quadraticCurveTo(x, y + s * .45, x - s * .33, y + s * .30);
    c.lineTo(x - s * .10, y - s * .04);
    c.closePath();
    c.fill(); c.stroke();
    /* 肩带 + 腰线 */
    c.beginPath();
    c.moveTo(x - s * .11, y - s * .42); c.lineTo(x - s * .085, y - s * .58);
    c.moveTo(x + s * .11, y - s * .42); c.lineTo(x + s * .085, y - s * .58);
    c.moveTo(x - s * .115, y - s * .10); c.lineTo(x + s * .115, y - s * .10);
    c.stroke();
  }
  function drawHeel(c, x, y, s) {
    c.lineWidth = Math.max(1.4, s * .042);
    c.strokeStyle = C.pinkD;
    c.fillStyle = 'rgba(232,160,180,.30)';
    /* 侧面轮廓：鞋跟底 → 足弓 → 脚尖 → 脚背 → 鞋口 → 后跟包裹 */
    c.beginPath();
    c.moveTo(x - s * .16, y + s * .30);
    c.quadraticCurveTo(x + s * .12, y + s * .12, x + s * .42, y + s * .28);
    c.quadraticCurveTo(x + s * .14, y + s * .06, x - s * .02, y - s * .30);
    c.lineTo(x - s * .20, y - s * .26);
    c.quadraticCurveTo(x - s * .26, y + s * .04, x - s * .16, y + s * .30);
    c.closePath();
    c.fill(); c.stroke();
    /* 细鞋跟 */
    c.beginPath();
    c.moveTo(x - s * .16, y + s * .29);
    c.lineTo(x - s * .05, y + s * .29);
    c.lineTo(x - s * .03, y + s * .58);
    c.lineTo(x - s * .12, y + s * .58);
    c.closePath();
    c.fillStyle = 'rgba(232,160,180,.45)'; c.fill(); c.stroke();
  }
  function sceneIcons(w, h) {
    var items = [
      { t: '黑框眼镜', f: drawGlasses },
      { t: '粉色长裙', f: drawDress },
      { t: '高跟鞋', f: drawHeel }
    ];
    var colW = w / (items.length + .4);
    var s = Math.min(colW * .62, h * .40);
    var cy = h * .42;
    return {
      draw: function (t) {
        paper(ctx, w, h);
        for (var i = 0; i < items.length; i++) {
          var x = w * .5 + (i - 1) * colW;
          var p = clamp(seg(t, .25 + i * .32, 1.35 + i * .32), 0, 1);
          var fy = cy + Math.sin(t * .9 + i * 1.1) * 2.2;
          /* 底光 */
          ctx.save();
          ctx.globalAlpha = .30 * p;
          var g = ctx.createRadialGradient(x, fy, 0, x, fy, s * .9);
          g.addColorStop(0, i === 0 ? 'rgba(25,25,25,.14)' : 'rgba(232,160,180,.42)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.fillRect(x - s, fy - s, s * 2, s * 2);
          ctx.restore();
          /* 从左到右揭示 */
          ctx.save();
          ctx.beginPath();
          ctx.rect(x - colW * .5, 0, colW * p, h);
          ctx.clip();
          ctx.globalAlpha = .25 + .75 * p;
          items[i].f(ctx, x, fy, s);
          ctx.restore();
          /* 标签 */
          ctx.save();
          ctx.globalAlpha = clamp(seg(t, .7 + i * .32, 1.5 + i * .32), 0, 1) * .9;
          ctx.font = fSans(clamp(w * .033, 9.5, 12.5), 400);
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillStyle = C.muted;
          ctx.fillText(items[i].t, x, h * .76);
          ctx.restore();
        }
      }
    };
  }

  /* ==========================================================================
     场景 09 · 富有活力的姑娘（pic1.png：由模糊到清晰）
     ========================================================================== */
  function sceneGirl(w, h) {
    var im = loadImg('girl');
    var born = nowMs();
    return {
      draw: function () {
        paper(ctx, w, h);
        var o = IMG.girl;
        if (!o.ready || !im.naturalWidth) return;          /* 还没下完就先空着 */
        var k = reduceMotion ? 1 : smoothstep(clamp((nowMs() - Math.max(born, o.ready)) / 1700, 0, 1));
        if (k <= .001) return;
        var bx = fitBox(im, w, h, w * .80, h * .90);
        ctx.save();
        /* 投影 */
        ctx.save();
        ctx.globalAlpha = k * .5;
        ctx.shadowColor = 'rgba(70,52,34,.34)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
        ctx.fillStyle = '#FBFAF6';
        rrPath(ctx, bx.x, bx.y, bx.w, bx.h, 12); ctx.fill();
        ctx.restore();
        /* 图片：模糊 → 清晰，略微收一下缩放 */
        ctx.save();
        ctx.beginPath(); rrPath(ctx, bx.x, bx.y, bx.w, bx.h, 12); ctx.clip();
        ctx.translate(bx.x + bx.w / 2, bx.y + bx.h / 2);
        ctx.scale(lerp(1.04, 1, k), lerp(1.04, 1, k));
        ctx.translate(-(bx.x + bx.w / 2), -(bx.y + bx.h / 2));
        ctx.globalAlpha = k;
        drawBlurred(im, bx.x, bx.y, bx.w, bx.h, lerp(18, 0, k));
        ctx.restore();
        /* 细边 */
        ctx.globalAlpha = k * .45;
        ctx.strokeStyle = 'rgba(25,25,25,.18)'; ctx.lineWidth = 1;
        rrPath(ctx, bx.x + .5, bx.y + .5, bx.w - 1, bx.h - 1, 12); ctx.stroke();
        ctx.restore();
      }
    };
  }

  /* ==========================================================================
     场景 10 · 紫色
     ========================================================================== */
  function scenePurple(w, h) {
    var R = mulberry32(83), blobs = [];
    for (var i = 0; i < 6; i++) {
      blobs.push({
        a: R() * TAU, d: .10 + R() * .32, r: .34 + R() * .40, sp: (.05 + R() * .12) * (R() > .5 ? 1 : -1),
        c: ['#6D5BD0', '#8B5CF6', '#C084FC', '#4C1D95', '#7C6BE0', '#A855F7'][i], o: R() * TAU
      });
    }
    return {
      draw: function (t) {
        paper(ctx, w, h);                                     /* 纸 */
        var grow = easeOutCubic(seg(t, .10, 1.5));            /* 紫色洇开 */
        var maxR = Math.hypot(w, h) * .62;
        ctx.save();
        ctx.beginPath(); ctx.arc(w * .5, h * .5, maxR * grow, 0, TAU); ctx.clip();
        ctx.fillStyle = '#2A2150'; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'screen';
        for (var i = 0; i < blobs.length; i++) {
          var b = blobs[i], ang = b.a + t * b.sp;
          var x = w * .5 + Math.cos(ang) * w * b.d;
          var y = h * .5 + Math.sin(ang * 1.2) * h * b.d;
          var rr = Math.min(w, h) * b.r * (.85 + .15 * Math.sin(t * .8 + b.o)) * lerp(.5, 1, grow);
          var g = ctx.createRadialGradient(x, y, 0, x, y, rr);
          g.addColorStop(0, b.c); g.addColorStop(.55, b.c + '66'); g.addColorStop(1, 'rgba(42,33,80,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
        }
        /* 生命力的细纹 */
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(200,180,255,.10)'; ctx.lineWidth = 1;
        for (var k = 0; k < 10; k++) {
          var yy = (k / 10) * h + Math.sin(t * .5 + k) * 6;
          ctx.beginPath(); ctx.moveTo(0, yy);
          for (var x2 = 0; x2 <= w; x2 += 18) ctx.lineTo(x2, yy + Math.sin(t * .9 + k + x2 * .03) * 5);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        /* 中心提亮 */
        var cg = ctx.createRadialGradient(w * .5, h * .48, 0, w * .5, h * .5, Math.min(w, h) * .8);
        cg.addColorStop(0, 'rgba(255,240,255,.16)'); cg.addColorStop(1, 'rgba(20,12,40,.42)');
        ctx.fillStyle = cg; ctx.fillRect(0, 0, w, h);
        ctx.restore();
        /* 洇开边缘 */
        if (grow < 1) {
          ctx.save();
          ctx.globalAlpha = .35;
          ctx.strokeStyle = 'rgba(109,91,208,.7)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(w * .5, h * .5, maxR * grow, 0, TAU); ctx.stroke();
          ctx.restore();
        }
      }
    };
  }

  /* ==========================================================================
     场景 11 · 蝴蝶（点 → 连线 → 3D 扇翅）
     ========================================================================== */
  function sceneButterfly(w, h) {
    var R = mulberry32(2026);
    var N = Math.round(clamp((w * h) / 1800, 150, 290));
    var bodyN = Math.max(10, Math.round(N * .11));
    var span = Math.min(w * .72, h * 1.22);
    var pts = [], i, j;

    function wingR(p) {
      return 1.02
        + .58 * Math.exp(-Math.pow((p + 42) / 24, 2))
        + .50 * Math.exp(-Math.pow((p - 44) / 21, 2))
        - .46 * Math.exp(-Math.pow(p / 12, 2));
    }
    for (i = 0; i < bodyN; i++) {
      var vy = R() * 2 - 1, taper = 1 - Math.abs(vy) * .82;
      pts.push({
        x: (R() * 2 - 1) * .045 * taper, y: vy * .95, z: (R() * 2 - 1) * .045 * taper,
        side: 0, hue: 0, r: .9 + R() * .7, ph: R() * TAU
      });
    }
    for (i = bodyN; i < N; i++) {
      var side = (i % 2 === 0) ? 1 : -1;
      var phi = (R() * 2 - 1) * (Math.PI * .5);
      var onEdge = (i - bodyN) % 5 < 2;                       /* 约 40% 沿着轮廓，形状更清晰 */
      var kk = onEdge ? (.88 + R() * .12) : Math.sqrt(R()) * .88;
      var rr = wingR(phi / D2R) * kk;
      var hh = R();
      pts.push({
        x: Math.cos(phi) * rr * side, y: Math.sin(phi) * rr, z: 0,
        side: side, hue: hh, edge: onEdge,
        r: onEdge ? 1.5 + R() * 1.3 : 1 + R() * 1.2, ph: R() * TAU
      });
    }
    /* 散落起点 */
    for (i = 0; i < pts.length; i++) {
      pts[i].sx = w * (.06 + R() * .88);
      pts[i].sy = h * (.10 + R() * .80);
      pts[i].sph = .5 + R() * 1.4;
    }
    /* 连线：目标构型里的近邻 */
    var edges = [], maxD = .26;
    for (i = 0; i < pts.length; i++) {
      var best = [];
      for (j = 0; j < pts.length; j++) {
        if (i === j) continue;
        var A = pts[i], B = pts[j];
        if (A.side !== B.side && A.side !== 0 && B.side !== 0) continue;
        var dx = A.x - B.x, dy = A.y - B.y, dz = A.z - B.z;
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < maxD) best.push({ j: j, d: d });
      }
      best.sort(function (a, b) { return a.d - b.d; });
      for (var q = 0; q < Math.min(2, best.length); q++) {
        if (best[q].j > i) edges.push({ a: i, b: best[q].j, d: best[q].d });
      }
    }

    var T0 = 2.0, T1 = 4.9;    /* 散点 → 聚合 */
    /* 光晕预渲染一次，避免每帧生成径向渐变 */
    var gs = Math.max(8, Math.round(Math.min(w, h) * 1.5));
    var glowCv = document.createElement('canvas');
    glowCv.width = glowCv.height = gs;
    (function () {
      var gc = glowCv.getContext('2d');
      var gg = gc.createRadialGradient(gs / 2, gs / 2, 0, gs / 2, gs / 2, gs / 2);
      gg.addColorStop(0, 'rgba(122,104,220,.85)');
      gg.addColorStop(.55, 'rgba(109,91,208,.28)');
      gg.addColorStop(1, 'rgba(109,91,208,0)');
      gc.fillStyle = gg; gc.fillRect(0, 0, gs, gs);
    })();
    return {
      draw: function (t) {
        paper(ctx, w, h);
        var cx = w * .5 + Math.sin(t * .21) * w * .05;
        var cy = h * .50 + Math.sin(t * .6) * h * .018;
        var grow = smoothstep(seg(t, 3.4, 5.6));                 /* 扇翅幅度渐入 */
        var pitch = lerp(.24, .52, smoothstep(seg(t, 2.0, 4.4)));
        var yaw = Math.sin(t * .27) * .38;
        var scale = span / 3.3;
        var flap = Math.sin(t * TAU * 1.02) * .86 * grow;
        var cosP = Math.cos(pitch), sinP = Math.sin(pitch);
        var cosY = Math.cos(yaw), sinY = Math.sin(yaw);
        var VSQ = .86, FZ = 3.0;                                 /* 垂直压缩 / 透视焦距 */

        var scr = new Array(pts.length);
        for (var i2 = 0; i2 < pts.length; i2++) {
          var p = pts[i2];
          /* 扇翅：绕身体轴转 */
          var dist = Math.min(1, Math.abs(p.x) / 1.55);
          var ang = flap * (.28 + .72 * dist) * p.side;
          var ca = Math.cos(ang), sa = Math.sin(ang);
          var x1 = p.x * ca, z1 = p.x * sa, y1 = p.y;
          /* 偏航 */
          var x2 = x1 * cosY + z1 * sinY, z2 = -x1 * sinY + z1 * cosY;
          /* 俯仰 */
          var y3 = y1 * cosP - z2 * sinP, z3 = y1 * sinP + z2 * cosP;
          /* 透视 */
          var k = FZ / (FZ + z3);
          scr[i2] = {
            x: cx + x2 * k * scale,
            y: clamp(cy + y3 * k * scale * VSQ, 8, h - 8),
            rawY: cy + y3 * k * scale * VSQ,
            z: z3, k: k, side: p.side, hue: p.hue, r: p.r
          };
        }
        /* 光晕 */
        if (grow > .01) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, .30 * grow);
          ctx.drawImage(glowCv, cx - gs / 2, cy - gs / 2);
          ctx.restore();
        }

        var connected = smoothstep(seg(t, T0 + 1.4, T1));
        /* 连线：按长度分档批量描边，几百条只画 4 次 */
        if (connected > .01) {
          ctx.save();
          ctx.lineWidth = .9;
          ctx.strokeStyle = C.violet;
          var LV = 4;
          var moveIn = smoothstep(seg(t, T0 + .2, T1 - .1));
          for (var lv = 0; lv < LV; lv++) {
            var lo = lv / LV, hi = (lv + 1) / LV;
            ctx.globalAlpha = connected * .52 * ((lo + hi) / 2);
            ctx.beginPath();
            for (var e = 0; e < edges.length; e++) {
              var eg = edges[e];
              var w2 = 1 - eg.d / maxD;
              if (w2 < lo || w2 >= hi) continue;
              var A2 = scr[eg.a], B2 = scr[eg.b];
              var mid = (A2.x + B2.x) / 2;
              ctx.moveTo(lerp(A2.x, mid, (1 - moveIn) * .5), A2.y);
              ctx.lineTo(lerp(B2.x, mid, (1 - moveIn) * .5), B2.y);
            }
            ctx.stroke();
          }
          ctx.restore();
        }

        /* 点 */
        ctx.save();
        for (var q2 = 0; q2 < scr.length; q2++) {
          var sp = pts[q2], s2 = scr[q2];
          var app = smoothstep(seg(t, .05 + q2 / pts.length * 1.5, .7 + q2 / pts.length * 1.5));
          var prog = smoothstep(seg(t, T0 + q2 / pts.length * 1.3, T0 + 1.7 + q2 / pts.length * 1.3));
          var x = lerp(sp.sx, s2.x, prog);
          var y = lerp(sp.sy, s2.y, prog);
          /* 未聚合时轻微游动 */
          if (prog < 1) {
            x += Math.sin(t * sp.sph + sp.ph) * 8 * (1 - prog);
            y += Math.cos(t * sp.sph * .8 + sp.ph) * 8 * (1 - prog);
          }
          var depth = (s2.z + 1.6) / 3.2;
          var rr2 = sp.r * lerp(.9, 1.3, depth) * (.8 + .4 * prog);
          var col, al;
          if (sp.side === 0) { col = C.violetD; }
          else if (sp.hue > .94) { col = C.kraft; }
          else if (sp.edge || sp.hue > .66) { col = C.violetL; }
          else { col = C.violet; }
          al = app * lerp(.62, 1, depth) * lerp(.78, 1, prog);
          /* 微光 */
          if (prog > .98 && (q2 % 11 === 0)) {
            al *= .6 + .4 * (.5 + .5 * Math.sin(t * 2.4 + sp.ph));
            ctx.globalAlpha = al * .22;
            ctx.fillStyle = C.violetL;
            ctx.beginPath(); ctx.arc(x, y, rr2 * 2.6, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = al;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(x, y, rr2, 0, TAU); ctx.fill();
        }
        ctx.restore();

        /* 触角 */
        var aa2 = smoothstep(seg(t, T1 - .5, T1 + .9));
        if (aa2 > .01) {
          var hz = -.95 * sinP, hy = -.95 * cosP;
          var hk = FZ / (FZ + hz);
          var topX = cx, topY = cy + hy * hk * scale * VSQ;
          ctx.save();
          ctx.globalAlpha = aa2 * .85;
          ctx.strokeStyle = C.violetD; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
          for (var s3 = -1; s3 <= 1; s3 += 2) {
            var sway = Math.sin(t * 1.6 + s3 * 2) * 4;
            ctx.beginPath();
            ctx.moveTo(topX + s3 * 1.5, topY + 4);
            ctx.quadraticCurveTo(topX + s3 * (7 + sway * .5), topY - 8,
              topX + s3 * (13 + sway), topY - 16);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    };
  }

  /* ==========================================================================
     场景 12 · 雨后的一抹彩虹（自定义正方形图像）
     ========================================================================== */
  function sceneRainbow(w, h) {
    var R = mulberry32(23), drops = [], i;
    for (i = 0; i < 46; i++) {
      drops.push({ x: R(), y: R(), v: .30 + R() * .55, l: 5 + R() * 11, a: .16 + R() * .30 });
    }
    var im = loadImg('rainbow');          /* pic2.jpg：等动画播完再浮出来 */
    var born = nowMs();
    var PHOTO_AT = 3400;                  /* 动画完整播完的时刻（毫秒） */
    return {
      draw: function (t) {
        paper(ctx, w, h);
        var side = Math.min(w * .64, h * .86);
        var app = easeOutCubic(seg(t, .05, .85));
        var px = (w - side) / 2, py = (h - side) / 2;
        ctx.save();
        ctx.translate(w / 2, h / 2 + (1 - app) * 10);
        ctx.scale(lerp(.93, 1, app), lerp(.93, 1, app));
        ctx.translate(-w / 2, -h / 2);
        ctx.globalAlpha = app;
        /* 投影 */
        ctx.save();
        ctx.shadowColor = 'rgba(70,52,34,.28)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
        ctx.fillStyle = '#FBFAF6';
        rrPath(ctx, px, py, side, side, 10); ctx.fill();
        ctx.restore();
        /* 画面内容 */
        ctx.save();
        rrPath(ctx, px, py, side, side, 10); ctx.clip();
        var g = ctx.createLinearGradient(px, py, px, py + side);
        g.addColorStop(0, '#F7F4EA'); g.addColorStop(.62, '#F1F0E6'); g.addColorStop(1, '#E8E6DA');
        ctx.fillStyle = g; ctx.fillRect(px, py, side, side);

        var horizon = py + side * .74;
        /* 雨 */
        ctx.save();
        ctx.strokeStyle = C.sky; ctx.lineWidth = 1;
        for (i = 0; i < drops.length; i++) {
          var d = drops[i];
          var yy = py + ((d.y + t * d.v) % 1) * side * .78;
          var xx = px + d.x * side;
          ctx.globalAlpha = d.a;
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - d.l * .34, yy + d.l); ctx.stroke();
        }
        ctx.restore();
        /* 山 */
        ctx.save();
        ctx.fillStyle = 'rgba(120,140,93,.20)';
        ctx.beginPath(); ctx.moveTo(px, horizon);
        ctx.quadraticCurveTo(px + side * .26, horizon - side * .16, px + side * .54, horizon);
        ctx.lineTo(px, horizon); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(106,155,204,.16)';
        ctx.beginPath(); ctx.moveTo(px + side * .40, horizon);
        ctx.quadraticCurveTo(px + side * .74, horizon - side * .20, px + side, horizon - side * .01);
        ctx.lineTo(px + side, horizon); ctx.closePath(); ctx.fill();
        ctx.restore();
        /* 彩虹 */
        var ccx = px + side * .5, ccy = horizon + side * .02;
        var bands = C.rain.length, bw = side * .020;
        ctx.save();
        ctx.lineCap = 'butt';
        for (i = 0; i < bands; i++) {
          var bp = easeOutCubic(seg(t, .55 + i * .12, 2.2 + i * .12));
          var rr = side * .30 + (bands - 1 - i) * bw;
          var spread = Math.PI / 2 * bp;
          ctx.globalAlpha = .78 * clamp(bp * 1.4, 0, 1);
          ctx.strokeStyle = C.rain[i];
          ctx.lineWidth = bw * .96;
          ctx.beginPath();
          ctx.arc(ccx, ccy, rr, Math.PI * 1.5 - spread, Math.PI * 1.5 + spread);
          ctx.stroke();
        }
        ctx.restore();
        /* 地面 */
        ctx.save();
        ctx.strokeStyle = 'rgba(25,25,25,.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, horizon + .5); ctx.lineTo(px + side, horizon + .5); ctx.stroke();
        ctx.restore();

        /* 驻足的人 + 伞 */
        var figH = side * .26;
        var fxp = px + side * .30, fyp = horizon + Math.sin(t * 1.1) * 1.6;
        ctx.save();
        ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1.1, side * .007);
        ctx.lineCap = 'round';
        /* 伞 */
        ctx.fillStyle = 'rgba(204,120,92,.82)';
        ctx.beginPath();
        ctx.arc(fxp, fyp - figH * .78, figH * .40, Math.PI, TAU);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(25,25,25,.35)'; ctx.stroke();
        ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1, side * .006);
        ctx.beginPath(); ctx.moveTo(fxp, fyp - figH * .78); ctx.lineTo(fxp, fyp - figH * .30); ctx.stroke();
        /* 人 */
        ctx.lineWidth = Math.max(1.2, side * .008);
        ctx.beginPath(); ctx.arc(fxp, fyp - figH * .44, figH * .075, 0, TAU);
        ctx.fillStyle = '#EFD3BC'; ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(fxp, fyp - figH * .36); ctx.lineTo(fxp, fyp - figH * .10);
        ctx.moveTo(fxp, fyp - figH * .10); ctx.lineTo(fxp - figH * .08, fyp);
        ctx.moveTo(fxp, fyp - figH * .10); ctx.lineTo(fxp + figH * .08, fyp);
        ctx.moveTo(fxp, fyp - figH * .30); ctx.lineTo(fxp + figH * .13, fyp - figH * .22);
        ctx.stroke();
        ctx.restore();
        /* 水洼涟漪 */
        ctx.save();
        for (i = 0; i < 3; i++) {
          var rp = ((t * .45 + i / 3) % 1);
          ctx.globalAlpha = (1 - rp) * .35;
          ctx.strokeStyle = C.sky; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(px + side * (.62 + i * .10), horizon + side * (.06 + i * .02), side * .05 * (.3 + rp * 2), side * .014 * (.3 + rp * 2), 0, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
        /* 动画播完之后：方框里的画面 → pic2.jpg（由模糊到清晰） */
        var o2 = IMG.rainbow;
        if (o2.ready && im.naturalWidth) {
          var pk = reduceMotion ? 1 : smoothstep(clamp((nowMs() - Math.max(born + PHOTO_AT, o2.ready)) / 1500, 0, 1));
          if (pk > .001) {
            ctx.save();
            ctx.globalAlpha = pk;
            ctx.translate(px + side / 2, py + side / 2);
            ctx.scale(lerp(1.05, 1, pk), lerp(1.05, 1, pk));
            ctx.translate(-(px + side / 2), -(py + side / 2));
            drawBlurred(im, px, py, side, side, lerp(20, 0, pk));
            ctx.restore();
          }
        }
        /* 一次性高光扫过 */
        var sh = seg(t, .9, 2.2);
        if (sh > 0 && sh < 1) {
          ctx.save();
          ctx.globalAlpha = Math.sin(sh * Math.PI) * .30;
          ctx.translate(px + side * (-.4 + sh * 1.8), py);
          ctx.rotate(.38);
          var sg = ctx.createLinearGradient(-side * .18, 0, side * .18, 0);
          sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, '#FFFFFF'); sg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sg; ctx.fillRect(-side * .18, -side, side * .36, side * 2.4);
          ctx.restore();
        }
        ctx.restore();
        /* 画框 */
        ctx.save();
        ctx.strokeStyle = 'rgba(25,25,25,.18)'; ctx.lineWidth = 1;
        rrPath(ctx, px + .5, py + .5, side - 1, side - 1, 10); ctx.stroke();
        ctx.restore();
        ctx.restore();
      }
    };
  }

  /* ==========================================================================
     场景 13 · 收好（折信 · 火漆）
     ========================================================================== */
  function sceneSeal(w, h) {
    var R = mulberry32(97), motes = [], i;
    for (i = 0; i < 16; i++) motes.push({ x: R(), y: R(), s: .8 + R() * 1.8, v: .10 + R() * .3, ph: R() * TAU });
    var ew = Math.min(w * .48, h * .92, 220), eh = ew / 1.62;
    return {
      draw: function (t) {
        paper(ctx, w, h);
        var cx = w / 2, cy = h * .50 + Math.sin(t * .8) * 2;
        var fold = easeInOutCubic(seg(t, .1, 1.1));
        var sealP = easeOutBack(seg(t, 1.1, 2.0), 1.4);
        var axis = lerp(-eh * .48, eh * .62, fold);
        ctx.save();
        ctx.translate(cx, cy + Math.sin(t * .9) * 1.5);
        /* 影子 */
        ctx.save();
        ctx.globalAlpha = .5;
        ctx.fillStyle = 'rgba(70,52,34,.16)';
        ctx.beginPath(); ctx.ellipse(0, eh * .58, ew * .52 * fold, eh * .07, 0, 0, TAU); ctx.fill();
        ctx.restore();
        /* 信封主体 */
        ctx.save();
        ctx.shadowColor = 'rgba(70,52,34,.20)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
        ctx.fillStyle = '#F6F1E4';
        rrPath(ctx, -ew / 2, -eh / 2, ew, eh, 9); ctx.fill();
        ctx.restore();
        /* 信纸露头 */
        ctx.save();
        ctx.globalAlpha = fold * .9;
        ctx.fillStyle = '#FBFAF6';
        rrPath(ctx, -ew * .43, -eh * .58 - fold * eh * .04, ew * .86, eh * .5, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(25,25,25,.10)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        /* 翻下的封口 */
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(-ew / 2, -eh / 2 + 1);
        ctx.lineTo(ew / 2, -eh / 2 + 1);
        ctx.lineTo(0, axis);
        ctx.closePath();
        var fg = ctx.createLinearGradient(0, -eh / 2, 0, axis);
        fg.addColorStop(0, '#F3EBDC'); fg.addColorStop(1, '#E7DCC7');
        ctx.fillStyle = fg; ctx.fill();
        ctx.strokeStyle = 'rgba(25,25,25,.16)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        /* 火漆印 */
        if (sealP > .02) {
          ctx.save();
          var sr = Math.min(ew * .17, 34) * sealP;
          ctx.globalAlpha = clamp(sealP, 0, 1);
          var sg = ctx.createRadialGradient(-sr * .3, -sr * .35, 0, 0, 0, sr * 1.4);
          sg.addColorStop(0, '#D98A6C'); sg.addColorStop(.6, '#C06B4E'); sg.addColorStop(1, '#A85539');
          ctx.fillStyle = sg;
          ctx.beginPath();
          for (var a2 = 0; a2 < TAU; a2 += .32) {
            var rr2 = sr * (1 + Math.sin(a2 * 5.2) * .045);
            var xx = Math.cos(a2) * rr2, yy = Math.sin(a2) * rr2 * .98;
            if (a2 === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
          }
          ctx.closePath(); ctx.fill();
          /* 蝶标 */
          ctx.globalAlpha = clamp(sealP, 0, 1) * .92;
          ctx.fillStyle = '#F6F1E7';
          var m = sr * .62;
          for (var i2 = 0; i2 < 4; i2++) {
            var ang = [-22, 22, 18, -18][i2] * D2R, k2 = i2 < 2 ? 1 : .82;
            ctx.save();
            ctx.rotate(ang);
            ctx.beginPath();
            ctx.ellipse((i2 % 2 ? 1 : -1) * m * .28, (i2 < 2 ? -.28 : .30) * m, m * .40 * k2, m * .34 * k2, 0, 0, TAU);
            ctx.fill(); ctx.restore();
          }
          rrPath(ctx, -m * .045, -m * .62, m * .09, m * 1.26, m * .045); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        /* 尘埃 */
        ctx.save();
        for (i = 0; i < motes.length; i++) {
          var mo = motes[i];
          var yy = h * (mo.y - (t * mo.v) % 1) + (t * mo.v) % 1 * 0;
          yy = h * mo.y - (t * mo.v * h) % (h + 40);
          if (yy < -20) yy += h + 40;
          ctx.globalAlpha = .22 * (.4 + .6 * (.5 + .5 * Math.sin(t * 1.6 + mo.ph)));
          ctx.fillStyle = C.kraft;
          ctx.beginPath(); ctx.arc(w * mo.x + Math.sin(t * .5 + mo.ph) * 5, yy, mo.s, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    };
  }

  /* ==========================================================================
     引擎
     ========================================================================== */
  var SCENES = {
    greeting: { make: sceneGreeting, label: '时间' },
    card: { make: sceneBlank, label: '小卡' },
    typing: { make: sceneTyping, label: '打字' },
    guess: { make: sceneGuess, label: '下文' },
    timeline: { make: sceneTimeline, label: '四年' },
    reveal: { make: sceneOpen, label: '洒脱' },
    blur: { make: sceneBlur, label: '初见' },
    icons: { make: sceneIcons, label: '印象' },
    girl: { make: sceneGirl, label: '姑娘' },
    purple: { make: scenePurple, label: '紫色' },
    butterfly: { make: sceneButterfly, label: '蝴蝶' },
    rainbow: { make: sceneRainbow, label: '彩虹' },
    seal: { make: sceneSeal, label: '收好' }
  };

  var stage = document.getElementById('stage');
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var barEl = document.getElementById('bar');
  var gate = document.getElementById('gate');
  var gateBtn = document.getElementById('gateBtn');
  var appEl = document.getElementById('app');
  var swipeEl = document.getElementById('swipe');
  var stampEl = document.getElementById('stamp');
  var pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
  var deckRoot = document.getElementById('app');

  var W = 0, H = 0, DPR = 1;
  var cur = null, curName = '', prev = null, prevT = 0, trans = 1, t0 = 0, last = 0;
  var rafId = 0, running = false, visible = true, opened = false, pageIdx = -1;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  function resize() {
    var rect = stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    var nw = Math.round(rect.width), nh = Math.round(rect.height);
    if (nw === W && nh === H) return;
    var elapsed = t0 ? (now() - t0) / 1000 : 0;
    W = nw; H = nh;
    /* 自适应像素比：大画布降一档，手机保持 2x，肉眼几乎无差别但省电 */
    var maxPix = 1000000;
    DPR = Math.min(window.devicePixelRatio || 1, 2, Math.max(1, Math.sqrt(maxPix / Math.max(1, W * H))));
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (curName) {
      cur = SCENES[curName].make(W, H);
      prev = null; trans = 1;
      t0 = now() - elapsed * 1000;
    }
  }

  function setScene(name) {
    if (!SCENES[name] || name === curName) return;
    if (!W || !H) resize();
    prev = cur; prevT = t0 ? (now() - t0) / 1000 : 0;
    cur = SCENES[name].make(W, H); curName = name; t0 = now(); trans = 0;
    stage.setAttribute('aria-label', '动画：' + SCENES[name].label);
  }

  function frame(tick) {
    rafId = requestAnimationFrame(frame);
    var dt = (tick - last) / 1000;
    if (!last || !isFinite(dt) || dt < 0) dt = 0;
    last = tick;
    if (dt > .06) dt = .06;
    var t = reduceMotion ? 6.2 : (tick - t0) / 1000;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (prev && trans < 1) { prevT += dt; ctx.save(); ctx.globalAlpha = 1; prev.draw(prevT, dt); ctx.restore(); }
    ctx.save();
    if (prev && trans < 1) ctx.globalAlpha = easeInOutCubic(trans);
    if (cur) cur.draw(t, dt);
    ctx.restore();
    if (prev && trans < 1) { trans = Math.min(1, trans + dt / .55); if (trans >= 1) prev = null; }
  }

  function start() {
    if (running || !visible || document.hidden) return;
    running = true; last = 0; rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function sync() {
    if (visible && !document.hidden && opened) start(); else stop();
  }

  /* ==========================================================================
     逐字浮现
     ========================================================================== */
  var NO_START = '，。、；：！？）】》」』”’…·％';
  function splitLine(p) {
    var raw = p.dataset.raw || p.textContent.trim();
    p.dataset.raw = raw;
    if (p._timer) { clearTimeout(p._timer); p._timer = null; }
    var frag = document.createDocumentFragment();
    var last = null;
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      /* 中文标点不能出现在行首：直接并进前一个字 */
      if (last && NO_START.indexOf(ch) >= 0) { last.textContent += ch; continue; }
      var s = document.createElement('span');
      s.className = 'ch';
      s.textContent = ch;
      frag.appendChild(s);
      last = s;
    }
    var caret = document.createElement('span');
    caret.className = 'caret';
    caret.setAttribute('aria-hidden', 'true');
    frag.appendChild(caret);
    p.textContent = '';
    p.appendChild(frag);
    p._chars = Array.prototype.slice.call(p.querySelectorAll('.ch'));
    p._caret = caret;
    p._typed = false;
  }

  function typeLine(p) {
    if (!p || p._typed) return;
    p._typed = true;
    var chars = p._chars, caret = p._caret;
    if (!chars || !chars.length) return;
    if (reduceMotion) {
      for (var i = 0; i < chars.length; i++) chars[i].classList.add('on');
      if (caret) caret.remove();
      return;
    }
    var step = clamp(1300 / chars.length, 20, 44), k = 0;
    caret.classList.add('blink');
    chars[0].before(caret);
    function tick() {
      var c = chars[k];
      c.classList.add('on', 'ink');
      (function (cc) { setTimeout(function () { cc.classList.add('done'); }, 240); })(c);
      k++;
      if (k < chars.length) {
        chars[k].before(caret);
        p._timer = setTimeout(tick, step);
      } else {
        caret.classList.remove('blink');
        p._timer = setTimeout(function () {
          caret.classList.add('blink');
          p._timer = setTimeout(function () { caret.remove(); }, 2200);
        }, 380);
      }
    }
    p._timer = setTimeout(tick, 90);
  }

  /* ==========================================================================
     翻页
     ========================================================================== */
  var FLIP = 520;               /* 与 CSS 的 --flip 对齐 */
  var flipLock = 0, tapGuard = 0;

  function setProgress() {
    if (!barEl || pages.length < 2) return;
    barEl.style.transform = 'scaleX(' + ((pageIdx + 1) / pages.length).toFixed(4) + ')';
  }

  function paint() {
    for (var i = 0; i < pages.length; i++) {
      var el = pages[i], on = i === pageIdx;
      el.classList.toggle('is-active', on);
      el.classList.toggle('is-before', i < pageIdx);
      el.classList.toggle('is-after', i > pageIdx);
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    var fin = !!(pages[pageIdx] && pages[pageIdx].classList.contains('page--finale'));
    document.body.classList.toggle('is-finale', fin);
  }

  function goTo(i) {
    if (!pages.length) return;
    i = clamp(i, 0, pages.length - 1);
    if (i === pageIdx) return;
    pageIdx = i;
    var page = pages[i];
    paint();
    setProgress();
    setScene(page.dataset.scene);
    /* 第一次翻到这一页时，文字逐字浮现；回头再看直接是完整的 */
    var line = page.querySelector('.line');
    if (line) {
      if (reduceMotion) typeLine(line);
      else setTimeout(function () { typeLine(line); }, 230);
    }
    /* 提示只在第一页出现，翻走就收起 */
    if (swipeEl && i > 0) swipeEl.classList.add('is-gone');
  }

  function goNext() { if (now() < flipLock) return; flipLock = now() + FLIP * .45; goTo(pageIdx + 1); }
  function goPrev() { if (now() < flipLock) return; flipLock = now() + FLIP * .45; goTo(pageIdx - 1); }

  function bindGestures() {
    var y0 = null, x0 = null, lastX = 0, lastY = 0, tStart = 0, dragged = false, active = false, touchSeen = false;

    function begin(x, y) {
      x0 = x; y0 = y; lastX = x; lastY = y;
      tStart = now(); dragged = false; active = true;
    }
    function step(x, y) {
      if (!active) return;
      lastX = x; lastY = y;
      if (Math.abs(y - y0) > 8 || Math.abs(x - x0) > 8) dragged = true;
    }
    /* cancelled 时用最后已知位置判定：浏览器中途掐断指针流也能翻页 */
    function finish(x, y, cancelled) {
      if (!active) return;
      active = false;
      if (!cancelled && isFinite(x) && isFinite(y)) { lastX = x; lastY = y; }
      var dy = lastY - y0, dx = lastX - x0, dt = Math.max(1, now() - tStart);
      y0 = null;
      if (!dragged) return;                                   /* 没动就是点击，交给 click 处理 */
      if (Math.abs(dy) < Math.abs(dx) * 1.05) return;          /* 横向手势不翻页 */
      var fast = Math.abs(dy) / dt > .35;
      if (Math.abs(dy) < 24 && !fast) return;
      if (Math.abs(dy) < 10) return;
      tapGuard = now() + 450;                                  /* 抑制随后的 click */
      if (dy < 0) goNext(); else goPrev();
    }

    /* 触摸：直接读 touch 事件，最可靠 */
    deckRoot.addEventListener('touchstart', function (e) {
      touchSeen = true;
      if (e.touches.length !== 1) return;
      if (active) return;
      var t = e.touches[0];
      begin(t.clientX, t.clientY);
    }, { passive: true });
    deckRoot.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      step(t.clientX, t.clientY);
    }, { passive: true });
    deckRoot.addEventListener('touchend', function (e) {
      var t = e.changedTouches[0];
      if (!t) { finish(NaN, NaN, true); return; }
      finish(t.clientX, t.clientY, false);
    }, { passive: true });
    deckRoot.addEventListener('touchcancel', function () { finish(NaN, NaN, true); }, { passive: true });

    /* 指针：鼠标拖拽 / 触控板，也兜住"只发 pointer 不发 touch"的设备。
       两条通道共用同一份手势状态：先到的 finish 生效，另一个因 active=false 直接忽略，所以不会翻两次 */
    if (window.PointerEvent) {
      deckRoot.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (active) return;
        begin(e.clientX, e.clientY);
        if (e.pointerId != null) { try { deckRoot.setPointerCapture(e.pointerId); } catch (err) { } }
      });
      deckRoot.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'mouse') step(e.clientX, e.clientY);
        else if (!touchSeen) step(e.clientX, e.clientY);
      });
      deckRoot.addEventListener('pointerup', function (e) {
        if (e.pointerType === 'mouse') finish(e.clientX, e.clientY, false);
        else if (!touchSeen) finish(e.clientX, e.clientY, false);
      });
      deckRoot.addEventListener('pointercancel', function (e) {
        if (e.pointerType !== 'mouse' && touchSeen) return;   /* 有 touch 事件时以 touchcancel 为准 */
        finish(NaN, NaN, true);
      });
    }

    /* 点一下 = 往后翻 */
    deckRoot.addEventListener('click', function (e) {
      if (dragged || now() < tapGuard) return;
      var t = e.target;
      if (t && t.closest && t.closest('a,button,input,textarea,select')) return;
      goNext();
    });

    /* 鼠标滚轮 */
    var acc = 0, wheelLock = 0;
    window.addEventListener('wheel', function (e) {
      if (!opened) return;
      var d = e.deltaY;
      if (!d) return;
      var n = now();
      if (n < wheelLock) return;
      acc += d;
      if (Math.abs(acc) > 40) {
        if (acc > 0) goNext(); else goPrev();
        acc = 0; wheelLock = n + 380;
      }
    }, { passive: true });

    /* 键盘 */
    window.addEventListener('keydown', function (e) {
      if (!opened) return;
      var k = e.key;
      if (k === 'ArrowDown' || k === 'PageDown' || k === 'ArrowRight' || k === ' ' || k === 'Enter') {
        e.preventDefault(); goNext();
      } else if (k === 'ArrowUp' || k === 'PageUp' || k === 'ArrowLeft') {
        e.preventDefault(); goPrev();
      } else if (k === 'Home') { e.preventDefault(); goTo(0); }
      else if (k === 'End') { e.preventDefault(); goTo(pages.length - 1); }
    });
  }

  /* ==========================================================================
     启动
     ========================================================================== */
  function openLetter() {
    if (opened) return;
    opened = true;
    gate.classList.add('is-opening');
    document.body.classList.add('is-open');
    if (appEl) appEl.setAttribute('aria-hidden', 'false');
    if (gateBtn && gateBtn.blur) gateBtn.blur();
    var wait = reduceMotion ? 120 : 780;
    setTimeout(function () {
      gate.classList.add('is-gone');
      resize();
      goTo(0);
      sync();
      /* 提示：翻一页就收起，或者 6.5 秒后自己走 */
      if (swipeEl) setTimeout(function () { swipeEl.classList.add('is-gone'); }, 6500);
      /* 预热后面的两张图，等翻到那两页时已经下好 */
      setTimeout(function () { loadImg('girl'); }, 1200);
      setTimeout(function () { loadImg('rainbow'); }, 2200);
    }, wait);
  }

  function init() {
    /* 每段的字拆成 span，方便逐字浮现 */
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i].querySelector('.line');
      if (p) splitLine(p);
    }
    /* 页眉上的日期 */
    if (stampEl) {
      var d = new Date();
      stampEl.textContent = '此刻 · ' + d.getFullYear() + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + ('0' + d.getDate()).slice(-2);
    }
    resize();
    setScene('greeting');
    setProgress();
    paint();

    /* 画布尺寸变化（含最后一页画布长大） */
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { resize(); }).observe(stage);
    } else {
      window.addEventListener('resize', resize);
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 260); });
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        sync();
      }, { threshold: .01 }).observe(stage);
    }

    gateBtn.addEventListener('click', openLetter);
    bindGestures();

    /* 打开前先画一帧静态画面，避免闪白 */
    cur = SCENES.greeting.make(W || 300, H || 200);
    t0 = now();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cur.draw(reduceMotion ? 6.2 : .9, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// Captcha w stylu Gruz Client (kopia z gruz-server/bot/images.js – zmieniasz tam, zmień i tu).
const path = require('path');
const crypto = require('crypto');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const A = (f) => path.join(__dirname, 'assets', f);
GlobalFonts.registerFromPath(A('fonts/poppins-bold.ttf'), 'PoppinsBold');
GlobalFonts.registerFromPath(A('fonts/poppins-semibold.ttf'), 'PoppinsSemi');

const ACCENT = '#b45cff';
let logoP = null;
const logo = () => (logoP ||= loadImage(A('logo.png')).catch(() => null));

const rnd = (a, b) => a + (b - a) * (crypto.randomInt(1_000_000) / 1_000_000);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Tło w stylu launchera: ciemny fiolet, poświata akcentu, delikatna siatka */
function background(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#0c0913');
  g.addColorStop(1, '#190f2b');
  ctx.fillStyle = g;
  roundRect(ctx, 0, 0, w, h, 26);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (const [x, y, r, a] of [[w * 0.15, h * 0.1, h * 0.9, 0.35], [w * 0.95, h * 1.0, h * 1.1, 0.28]]) {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(180,92,255,${a})`);
    rg.addColorStop(1, 'rgba(180,92,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 28) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 28) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(180,92,255,0.45)';
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, w - 2, h - 2, 25);
  ctx.stroke();
}

async function header(ctx, x, y, label) {
  const l = await logo();
  if (l) ctx.drawImage(l, x, y, 34, 34);
  ctx.font = '15px PoppinsBold';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText('GRUZ CLIENT', x + 44, y + 17);
  const tw = ctx.measureText('GRUZ CLIENT').width;
  ctx.font = '13px PoppinsSemi';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('·  ' + label, x + 52 + tw, y + 17);
}

// ---------------- captcha ----------------
const CODE_ABC = 'ABCDEFGHJKMNPRSTUVWXYZ23456789';
function newCode(n = 6) { let s = ''; for (let i = 0; i < n; i++) s += CODE_ABC[crypto.randomInt(CODE_ABC.length)]; return s; }

async function captcha(code) {
  const W = 640, H = 240;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  background(ctx, W, H);
  await header(ctx, 26, 20, 'VERIFICATION');

  // pole z kodem
  const bx = 40, by = 74, bw = W - 80, bh = 130;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  roundRect(ctx, bx, by, bw, bh, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.save();
  roundRect(ctx, bx, by, bw, bh, 18);
  ctx.clip();
  // fałszywe, blade znaki w tle
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 14; i++) {
    ctx.font = `${Math.round(rnd(22, 40))}px PoppinsBold`;
    ctx.fillStyle = `rgba(180,92,255,${rnd(0.07, 0.16)})`;
    ctx.save();
    ctx.translate(rnd(bx, bx + bw), rnd(by, by + bh));
    ctx.rotate(rnd(-0.8, 0.8));
    ctx.fillText(CODE_ABC[crypto.randomInt(CODE_ABC.length)], 0, 0);
    ctx.restore();
  }
  // właściwy kod
  const step = (bw - 70) / code.length;
  for (let i = 0; i < code.length; i++) {
    const x = bx + 35 + step * (i + 0.5) + rnd(-7, 7);
    const y = by + bh / 2 + rnd(-14, 14);
    const size = Math.round(rnd(62, 78));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd(-0.38, 0.38));
    ctx.transform(1, 0, rnd(-0.25, 0.25), 1, 0, 0);
    ctx.font = `${size}px PoppinsBold`;
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, '#f2e4ff');
    g.addColorStop(1, ACCENT);
    ctx.shadowColor = 'rgba(180,92,255,0.75)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = g;
    ctx.fillText(code[i], 0, 0);
    ctx.restore();
  }
  // linie zakłócające przez kod
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(bx - 10, rnd(by, by + bh));
    ctx.bezierCurveTo(rnd(bx, bx + bw / 2), rnd(by - 30, by + bh + 30), rnd(bx + bw / 2, bx + bw), rnd(by - 30, by + bh + 30), bx + bw + 10, rnd(by, by + bh));
    ctx.strokeStyle = i % 2 ? `rgba(255,255,255,${rnd(0.25, 0.45)})` : `rgba(180,92,255,${rnd(0.45, 0.7)})`;
    ctx.lineWidth = rnd(2, 3.5);
    ctx.stroke();
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rnd(0.05, 0.35)})`;
    ctx.fillRect(rnd(bx, bx + bw), rnd(by, by + bh), rnd(1, 2.6), rnd(1, 2.6));
  }
  ctx.restore();

  ctx.font = '13px PoppinsSemi';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center';
  ctx.fillText('Type the 6 characters you see · Wpisz 6 znaków z obrazka', W / 2, H - 18);
  return cv.toBuffer('image/png');
}

module.exports = { captcha, newCode };

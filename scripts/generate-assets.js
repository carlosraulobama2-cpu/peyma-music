/**
 * Peyma Music — generador de assets
 *
 * app.json referencia ./assets/*.png. En vez de dejar binarios opacos en el repo,
 * los dibujamos de forma procedural a partir de los tokens de marca.
 *
 * Uso: node scripts/generate-assets.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BRAND = [0x1d, 0xb9, 0x54]; // colors.brand[500]
const SURFACE = [0x0a, 0x0a, 0x0a]; // colors.surface[50]

/** Empaqueta buffers RGBA en un PNG válido (sin dependencias). */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro 0 (None) por scanline
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/**
 * Dibuja el logotipo: disco de marca con un triángulo de play recortado.
 * `opts.background` a null deja el fondo transparente (adaptive icon / splash).
 */
function drawLogo(size, { background, discRatio = 0.62, radiusRatio = 0.22 }) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const discR = (size * discRatio) / 2;
  const holeR = discR * 0.16;
  const cornerR = size * radiusRatio;

  // Vértices del triángulo de play, centrado óptimamente dentro del disco.
  const triR = discR * 0.5;
  const tri = [
    [c + triR, c],
    [c - triR * 0.55, c - triR * 0.88],
    [c - triR * 0.55, c + triR * 0.88],
  ];

  const inTriangle = (x, y) => {
    const sign = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
    const d1 = sign(x, y, tri[0][0], tri[0][1], tri[1][0], tri[1][1]);
    const d2 = sign(x, y, tri[1][0], tri[1][1], tri[2][0], tri[2][1]);
    const d3 = sign(x, y, tri[2][0], tri[2][1], tri[0][0], tri[0][1]);
    return (d1 <= 0 && d2 <= 0 && d3 <= 0) || (d1 >= 0 && d2 >= 0 && d3 >= 0);
  };

  // Distancia firmada a un rectángulo redondeado, para el fondo del icono.
  const roundedRectDist = (x, y) => {
    const dx = Math.abs(x - c) - (size / 2 - cornerR);
    const dy = Math.abs(y - c) - (size / 2 - cornerR);
    const ax = Math.max(dx, 0);
    const ay = Math.max(dy, 0);
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(ax, ay) - cornerR;
  };

  const SS = 3; // supersampling 3x3 para bordes suaves
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgCov = 0;
      let discCov = 0;
      let cutCov = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const dist = Math.hypot(px - c, py - c);

          if (background && roundedRectDist(px, py) <= 0) bgCov++;
          if (dist <= discR) discCov++;
          if (dist <= holeR || inTriangle(px, py)) cutCov++;
        }
      }

      const total = SS * SS;
      const bgA = background ? bgCov / total : 0;
      // El recorte del play/agujero resta del disco.
      const discA = Math.max(discCov / total - cutCov / total, 0);

      const i = (y * size + x) * 4;
      const outA = discA + bgA * (1 - discA);
      if (outA <= 0) continue;

      for (let ch = 0; ch < 3; ch++) {
        const disc = BRAND[ch] * discA;
        const bg = (background ? background[ch] : 0) * bgA * (1 - discA);
        rgba[i + ch] = Math.round((disc + bg) / outA);
      }
      rgba[i + 3] = Math.round(outA * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const assets = [
  // Icono de app: fondo oscuro sólido, requerido por iOS (sin alpha visible).
  ['icon.png', () => drawLogo(1024, { background: SURFACE })],
  // Adaptive icon de Android: sólo el logo, el sistema pone el fondo.
  ['adaptive-icon.png', () => drawLogo(1024, { background: null, discRatio: 0.42 })],
  // Splash: logo suelto, el color de fondo lo define app.json.
  ['splash-icon.png', () => drawLogo(512, { background: null, discRatio: 0.9 })],
  ['favicon.png', () => drawLogo(96, { background: SURFACE, radiusRatio: 0.18 })],
];

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, build] of assets) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, build());
  console.log(`✓ assets/${name} (${fs.statSync(file).size} bytes)`);
}

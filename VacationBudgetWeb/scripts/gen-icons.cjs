// Generates Android launcher icons and web favicon from logo.svg
// Run: node scripts/gen-icons.cjs
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../src/assets/logo.svg');
const svg = fs.readFileSync(svgPath, 'utf8');

const ANDROID_SIZES = [
  { dir: 'mipmap-mdpi',    size: 48 },
  { dir: 'mipmap-hdpi',    size: 72 },
  { dir: 'mipmap-xhdpi',   size: 96 },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const ANDROID_RES = path.join(__dirname, '../android/app/src/main/res');

function renderPng(size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
  });
  return resvg.render().asPng();
}

// Android launcher icons
if (fs.existsSync(ANDROID_RES)) {
  for (const { dir, size } of ANDROID_SIZES) {
    const outDir = path.join(ANDROID_RES, dir);
    fs.mkdirSync(outDir, { recursive: true });
    const png = renderPng(size);
    fs.writeFileSync(path.join(outDir, 'ic_launcher.png'), png);
    fs.writeFileSync(path.join(outDir, 'ic_launcher_round.png'), png);
    console.log(`✓ ${dir}/ic_launcher.png (${size}×${size})`);
  }
  // Foreground icon for adaptive icons (xxxhdpi source)
  const fgDir = path.join(ANDROID_RES, 'mipmap-xxxhdpi');
  const fg = renderPng(432);
  fs.writeFileSync(path.join(fgDir, 'ic_launcher_foreground.png'), fg);
  console.log('✓ mipmap-xxxhdpi/ic_launcher_foreground.png (432×432)');
} else {
  console.warn('⚠  Android project not found at', ANDROID_RES, '— run "npx cap add android" first.');
}

// Web public/favicon + icons
const publicDir = path.join(__dirname, '../public');
fs.mkdirSync(publicDir, { recursive: true });

const favicon32 = renderPng(32);
fs.writeFileSync(path.join(publicDir, 'favicon.png'), favicon32);
console.log('✓ public/favicon.png (32×32)');

const icon192 = renderPng(192);
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192);
console.log('✓ public/icon-192.png (192×192)');

const icon512 = renderPng(512);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512);
console.log('✓ public/icon-512.png (512×512)');

// Splash screen background (xxhdpi = 1024×500 area)
const splashDir = path.join(ANDROID_RES, 'drawable');
if (fs.existsSync(ANDROID_RES)) {
  fs.mkdirSync(splashDir, { recursive: true });
  // Splash is just the 256 icon on a #0077B6 background — written as XML below
  console.log('ℹ  Splash screen uses XML drawable (see splash.xml)');
}

console.log('\n✅  All icons generated.');

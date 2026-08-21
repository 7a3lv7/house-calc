/**
 * 生成 PWA 图标：小房子 logo（品牌配色）
 * 输出到 public/icons/：
 *   icon-32.png            favicon
 *   icon-180.png           apple-touch-icon（iOS 主屏幕）
 *   icon-192.png / icon-512.png       manifest 常规图标
 *   icon-maskable-512.png  manifest maskable 图标（全出血背景 + 内容缩至安全区）
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'icons')

/* 房子图形（512 视口内） */
const CONTENT = `
  <!-- 屋顶 -->
  <path d="M88 262 L256 108 L424 262 Z" fill="#1e4d3b"/>
  <!-- 屋身 -->
  <rect x="120" y="252" width="272" height="176" rx="20" fill="#ece4d0" stroke="#1e4d3b" stroke-width="14"/>
  <!-- 窗户 -->
  <rect x="152" y="292" width="64" height="64" rx="12" fill="#2f6b52"/>
  <rect x="296" y="292" width="64" height="64" rx="12" fill="#2f6b52"/>
  <!-- 门 -->
  <rect x="230" y="314" width="52" height="114" rx="24" fill="#b9552f"/>
  <!-- 地面 -->
  <rect x="88" y="440" width="336" height="12" rx="6" fill="#a17e2e"/>
`

/* 常规图标：圆角纸底 + 细描边 */
function regularSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#f3edde"/>
  <rect x="16" y="16" width="480" height="480" rx="100" fill="none" stroke="#1e4d3b" stroke-width="5" opacity=".16"/>
  ${CONTENT}
</svg>`
}

/* maskable：全出血背景，内容缩至 ~70%（安全区内） */
function maskableSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#f3edde"/>
  <g transform="translate(74 74) scale(0.711)">${CONTENT}</g>
</svg>`
}

const targets = [
  { name: 'icon-32.png', size: 32, svg: regularSvg },
  { name: 'icon-180.png', size: 180, svg: regularSvg },
  { name: 'icon-192.png', size: 192, svg: regularSvg },
  { name: 'icon-512.png', size: 512, svg: regularSvg },
  { name: 'icon-maskable-512.png', size: 512, svg: maskableSvg }
]

await mkdir(OUT, { recursive: true })
for (const t of targets) {
  const buf = await sharp(Buffer.from(t.svg()))
    .resize(t.size, t.size)
    .png()
    .toBuffer()
  await sharp(buf).toFile(path.join(OUT, t.name))
  console.log('✓', t.name, t.size + 'x' + t.size, buf.length + ' bytes')
}
console.log('done →', OUT)

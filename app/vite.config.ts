import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { execSync } from 'node:child_process';

// The DAO's config file becomes dao.json next to the page.
// DAO_CONFIG picks the file; otherwise ../config/dao.json, otherwise the example.
function readDaoConfig(): string {
  const candidates = [process.env.DAO_CONFIG, '../config/dao.json', '../config/example.testnet4.json'].filter(Boolean) as string[];
  const file = candidates.map(f => resolve(__dirname, f)).find(f => existsSync(f));
  if (!file) throw new Error('No DAO config found');
  return readFileSync(file, 'utf8');
}

function daoConfig(): Plugin {
  const pick = readDaoConfig;
  return {
    name: 'dao-config',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0].endsWith('/dao.json')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(pick());
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'dao.json', source: pick() });
    },
    transformIndexHtml(html, ctx) {
      // Content security policy: only this site, the DAO's relays and its chain APIs.
      const cfg = JSON.parse(pick());
      const ok = (u: string) => !/\[/.test(u);
      const relays = (cfg.relays as string[]).filter(ok);
      const apis = (cfg.chainApi as string[]).filter(ok).map(u => new URL(u.replace(/^blockbook:/i, '')).origin); // "blockbook:<address>" sources too
      const dev = ctx.server ? ' ws: http://localhost:* http://127.0.0.1:*' : '';
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data:",
        "media-src 'self' blob:",
        `connect-src 'self' ${[...relays, ...apis].join(' ')}${dev}`,
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
      ].join('; ');
      return html.replace('<!-- CSP: added at build from the DAO config -->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

// The DAO's own static files (an about page, images): everything in ../site is copied next to the app.
// site/ belongs to the DAO, like config/: updating btc-dao never touches it.
const siteDir = resolve(__dirname, '../site');
function siteFiles(): string[] {
  if (!existsSync(siteDir)) return [];
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap(n => {
      const f = resolve(d, n);
      return statSync(f).isDirectory() ? walk(f) : [f];
    });
  return walk(siteDir).filter(f => relative(siteDir, f) !== 'README.md'); // the folder's own note stays out of the site
}
function daoSite(): Plugin {
  return {
    name: 'dao-site',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = siteFiles().find(f => relative(siteDir, f).split(sep).join('/') === path);
        if (!file) return next();
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const f of siteFiles()) {
        const fileName = relative(siteDir, f).split(sep).join('/');
        if (fileName === 'index.html' || fileName === 'dao.json') throw new Error(`site/${fileName} would replace the app's own file`);
        this.emitFile({ type: 'asset', fileName, source: readFileSync(f) });
      }
    },
  };
}

// The DAO's charter, shown on the rules page and hashed into the genesis.
// The binding text is the one in rules.charterLanguage (English if unset).
// DAO_CHARTER picks the file; otherwise ../config/charter.<language>.md, otherwise the English template.
const charterLanguage: string = JSON.parse(readDaoConfig()).rules?.charterLanguage ?? 'en';
const charterFile = [process.env.DAO_CHARTER, `../config/charter.${charterLanguage}.md`, '../docs/charter-template.en.md']
  .filter(Boolean)
  .map(f => resolve(__dirname, f as string))
  .find(f => existsSync(f))!;

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
let build = process.env.GITHUB_SHA?.slice(0, 7);
if (!build) {
  try {
    build = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
  } catch {
    build = 'dev';
  }
}

export default defineConfig({
  base: './',
  plugins: [preact(), daoConfig(), daoSite()],
  resolve: { alias: [{ find: /^@charter/, replacement: charterFile }] },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(build),
  },
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2020', sourcemap: true, assetsInlineLimit: 0 },
});

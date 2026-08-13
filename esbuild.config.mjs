import esbuild from 'esbuild';
import path from 'path';
import process from 'process';
import builtins from 'builtin-modules';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import esbuildSvelte from 'esbuild-svelte';
import { sveltePreprocess } from 'svelte-preprocess';

// Load .env.local if it exists
if (existsSync('.env.local')) {
  const envContent = readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=["']?(.+?)["']?$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const prod = process.argv[2] === 'production';

const distDir = 'dist';
const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT;
const OBSIDIAN_PLUGIN_PATH = OBSIDIAN_VAULT && existsSync(OBSIDIAN_VAULT)
  ? path.join(OBSIDIAN_VAULT, '.obsidian', 'plugins', 'nano-claudian')
  : null;

function copyBuildFiles(files, sourceDir, targetDir) {
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  for (const file of files) {
    const src = path.join(sourceDir, file);
    const dest = path.join(targetDir, file);
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`Copied ${file} to ${targetDir}`);
    }
  }
}

// Plugin to copy manifest.json into dist and (optionally) sync to Obsidian plugin folder
const copyToObsidian = {
  name: 'copy-to-obsidian',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;

      // Always stage manifest.json into the dist folder so the build is self-contained
      copyBuildFiles(['manifest.json'], '.', distDir);

      // If an Obsidian vault is configured, sync the full plugin bundle there
      if (OBSIDIAN_PLUGIN_PATH) {
        const files = ['main.js', 'manifest.json', 'styles.css'];
        copyBuildFiles(files, distDir, OBSIDIAN_PLUGIN_PATH);
      }
    });
  }
};

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  plugins: [
    esbuildSvelte({
      preprocess: sveltePreprocess(),
      compilerOptions: { css: 'injected' },
    }),
    copyToObsidian
  ],
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins,
    ...builtins.map(m => `node:${m}`),
  ],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: path.join(distDir, 'main.js'),
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}

// Local-only component interaction check: no provider requests or live orders.
// Run after npm run build: npx tsx tests/payment-return.browser.ts
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

async function main() {
const bundle = await build({
  stdin: {
    contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { PaymentReturn } from './components/PaymentReturn';
      import { MinimalPaymentReturn } from './components/MinimalPaymentReturn';
      import { LocaleProvider } from './components/LocaleProvider';
      function Preview() {
        const [status, setStatus] = useState('pending');
        window.setPaymentStatus = setStatus;
        const Return = window.compact ? MinimalPaymentReturn : PaymentReturn;
        return <LocaleProvider defaultLocale={window.compact ? 'zh' : 'en'} persist={false}>
          <Return status={status} />
        </LocaleProvider>;
      }
      createRoot(document.getElementById('root')).render(<Preview />);
    `,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  bundle: true, write: false, outdir: 'preview', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'next-boundary', setup(builder) {
    // Receipts are outside this failure/recovery check and load only on success.
    builder.onResolve({ filter: /\/receipt\/ReceiptTicket$/ }, () => ({ path: 'receipt', namespace: 'next-boundary' }));
    builder.onResolve({ filter: /^next\/(navigation|link|dynamic)$/ }, args => ({ path: args.path, namespace: 'next-boundary' }));
    builder.onLoad({ filter: /.*/, namespace: 'next-boundary' }, args => ({
      contents: args.path === 'receipt' ? 'export const ReceiptTicket = () => null;'
        : args.path === 'next/navigation'
        ? 'export const useRouter = () => ({ refresh: () => { window.refreshCount++; } });'
        : args.path === 'next/link'
          ? 'import React from "react"; export default props => React.createElement("a", props);'
          : 'export default () => () => null;',
      resolveDir: process.cwd(), loader: 'js',
    }));
  } }],
});

const cssRoot = resolve('.next/static');
const css = readdirSync(cssRoot, { recursive: true }).map(String)
  .filter(path => path.endsWith('.css')).map(path => readFileSync(resolve(cssRoot, path), 'utf8')).join('\n');
assert.ok(css.length, 'Build CSS is required for the visual check');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: existsSync(chrome) ? chrome : undefined });
const screenshotRoot = resolve('test-results/payment-return');
mkdirSync(screenshotRoot, { recursive: true });
try {
  for (const compact of [false, true]) {
    const page = await browser.newPage({ viewport: compact ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: css });
    for (const file of bundle.outputFiles.filter(file => file.path.endsWith('.css'))) {
      await page.addStyleTag({ content: file.text });
    }
    await page.evaluate(compact => {
      Object.assign(window, { compact, refreshCount: 0, pollCount: 0 });
      const original = window.setInterval;
      window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        if (timeout === 2000) (window as any).pollCount++;
        return original(handler, timeout, ...args);
      }) as typeof window.setInterval;
    }, compact);
    await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text });
    const heading = page.getByRole('heading', { name: compact ? '付款失败' : 'Payment failed', exact: true });
    await heading.waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const recheck = page.getByRole('button', { name: compact ? '重新检查付款状态' : 'Check payment status', exact: true });
    await recheck.focus();
    assert.equal(await recheck.evaluate(button => button === document.activeElement), true);
    assert.equal(await recheck.evaluate(button => getComputedStyle(button).backgroundColor), 'rgb(255, 255, 255)');
    await page.screenshot({ path: resolve(screenshotRoot, compact ? 'mobile-zh.png' : 'desktop-en.png'), fullPage: true });
    await recheck.click();
    assert.equal(await page.evaluate(() => (window as any).refreshCount), 1);
    assert.equal(await page.evaluate(() => (window as any).pollCount), 0);
    assert.equal(await heading.isVisible(), true, 'A refresh alone cannot grant payment success');
    // A later server-provided verified status must replace the failure view.
    await page.evaluate(() => (window as any).setPaymentStatus('success'));
    await page.getByRole('heading', { name: compact ? '付款成功' : 'Payment Successful!', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: desktop/mobile recovery, manual recheck, no polling, verified-status recovery, and responsive layout');
  console.log(`Screenshots: ${screenshotRoot}`);
} finally {
  await browser.close();
}
}

main().catch(error => { console.error(error); process.exitCode = 1; });

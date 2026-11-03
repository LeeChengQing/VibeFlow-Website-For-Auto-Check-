import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const fixture='http://127.0.0.1:54330';
async function login(page:import('@playwright/test').Page){await page.goto('/admin');await page.getByLabel('Admin password').fill('admin-browser-test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:/Key Inventory/}).click();await expect(page.getByRole('heading',{name:'插件密钥管理'})).toBeVisible();}
test.beforeEach(async({request})=>{await request.post(fixture+'/__reset');});
test('admin issues canonical plugin keys once without storing plaintext; narrow layout and filters',async({page,request})=>{
  await login(page);await page.getByLabel('签发备注').fill('Browser fixture');await page.getByLabel('最多激活设备数').fill('2');await page.getByRole('button',{name:'生成插件密钥'}).click();
  const dialog=page.getByRole('dialog',{name:'保存你的新密钥'});await expect(dialog).toBeVisible();const code=await dialog.getByLabel('插件激活密钥').inputValue();expect(code).toMatch(/^AC-LIC-(?:[A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
  const rows=await(await request.get(fixture+'/__plugin-rows')).json();expect(JSON.stringify(rows)).not.toContain(code);expect(rows.some((row:{license_key_hash:string})=>row.license_key_hash===createHash('sha256').update(code).digest('hex'))).toBeTruthy();
  await expect(dialog.getByRole('button',{name:'关闭并清除显示'})).toBeDisabled();await dialog.getByLabel('我已保存此密钥').check();await dialog.getByRole('button',{name:'关闭并清除显示'}).click();await expect(dialog).not.toBeVisible();expect(await page.content()).not.toContain(code);
  await page.screenshot({path:'docs/screens/plugin-admin-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'docs/screens/plugin-admin-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'下一页',exact:true}).click();await expect(page).toHaveURL(/page=2/);await expect(page.getByText('第 2/2 页')).toBeVisible();
});
test('release and revoke require confirmation and preserve device credentials',async({page,request})=>{
  await login(page);const row=page.locator('article').filter({hasText:'Fixture license 26'});await row.getByText('设备与操作记录').click();await row.getByRole('button',{name:'解绑设备'}).click();
  const confirm=page.getByRole('dialog',{name:'解绑此设备？'});await confirm.getByLabel('操作原因').fill('New laptop');await confirm.getByRole('button',{name:'确认操作'}).click();await expect(confirm).not.toBeVisible();await expect(row).toContainText('0/1 台设备');await expect(row).toContainText('解绑');
  await row.getByRole('button',{name:'停用密钥'}).click();const revoke=page.getByRole('dialog',{name:'停用此密钥？'});await revoke.getByLabel('操作原因').fill('Debug finished');await revoke.getByRole('button',{name:'确认操作'}).click();await expect(revoke).not.toBeVisible();await expect(row).toContainText('已停用');
  const rows=await(await request.get(fixture+'/__plugin-rows')).json();expect(rows.find((r:{note:string})=>r.note==='Fixture license 26').plugin_license_events).toHaveLength(2);
});
test('database failure remains safe and logged-out users cannot see the ledger',async({page,request})=>{
  await login(page);await request.post(fixture+'/__fail-insert');await page.getByLabel('签发备注').fill('Fail fixture');await page.getByRole('button',{name:'生成插件密钥'}).click();await expect(page.getByRole('alert').filter({hasText:'操作未确认成功'})).toBeVisible();expect(await page.content()).not.toContain('private-plugin-db-error');
  await request.post(fixture+'/__fail-read');await page.getByRole('button',{name:'刷新记录'}).click();await expect(page.getByRole('alert').filter({hasText:'授权记录暂不可用'})).toBeVisible();
  await page.context().clearCookies();await page.reload();await expect(page.getByRole('heading',{name:'Admin access'})).toBeVisible();await expect(page.getByRole('heading',{name:'插件密钥管理'})).not.toBeVisible();
});

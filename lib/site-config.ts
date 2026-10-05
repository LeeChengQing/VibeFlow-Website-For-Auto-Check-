import type { Locale, PlanCode } from './plans';

export type LocalizedText = { en: string; zh: string };
export type ManagedPackage = {
  id: PlanCode; name: LocalizedText; description: LocalizedText; badge: LocalizedText;
  features: LocalizedText[]; amount: number; promotionalAmount: number | null;
  promotionEnabled: boolean; enabled: boolean; visible: boolean; order: number;
};
export type ManagedGuide = {
  id: string; src: string; title: LocalizedText; description: LocalizedText;
  alt: LocalizedText; label: string; visible: boolean; order: number;
};
export type ManagedFaq = { id: string; question: LocalizedText; answer: LocalizedText; visible: boolean };
export type SiteConfig = {
  packages: ManagedPackage[];
  offer: { enabled: boolean; startsAt: string; endsAt: string; showCountdown: boolean };
  guides: ManagedGuide[];
  hero: { eyebrow: LocalizedText; line1: LocalizedText; line2: LocalizedText; description: LocalizedText; note: LocalizedText; primaryButton: LocalizedText; secondaryButton: LocalizedText };
  content: { announcementEnabled: boolean; announcement: LocalizedText; faqs: ManagedFaq[]; features: { title: LocalizedText; description: LocalizedText }[]; purchaseNotice: LocalizedText };
  settings: { maintenance: boolean; maintenanceMessage: LocalizedText; checkoutEnabled: boolean; defaultLocale: Locale; supportEmail: string; supportUrl: string; videoUrl: string; extensionRelease: { assetId: string; label: string } | null };
};
export type SiteHistoryEntry = { id: string; version: number; createdAt: string; note: string; config: SiteConfig };
export type SiteActivityEntry = { id: string; createdAt: string; action: string; detail: string };
export type SiteManagementData = { draft: SiteConfig; published: SiteConfig; version: number; history: SiteHistoryEntry[]; activity: SiteActivityEntry[]; local: boolean };
export type SiteActionResult = { ok: true; version?: number; assetId?: string; src?: string; uploadId?: string; uploadUrl?: string; uploadMime?: string } | { error: string };

const text = (en: string, zh: string): LocalizedText => ({ en, zh });
export const DEFAULT_SITE_CONFIG: SiteConfig = {
  packages: [
    { id: 'bundle', name: text('Complete experience bundle', '完整体验包'), description: text('Extension + first semester notifications', '扩展 + 首学期通知'), badge: text('BEST VALUE', '限时特惠'), amount: 3500, promotionalAmount: 3000, promotionEnabled: true, enabled: true, visible: true, order: 0, features: [text('Chrome extension ZIP, with a 7-day download link', 'Chrome 扩展 ZIP 安装包，下载链接有效 7 天'), text('Import timetables, manage class tasks, and check history', '导入课表、管理课程任务与签到历史'), text('Connect QR codes or Microsoft Forms check-in links', '连接二维码或 Microsoft Forms 签到入口'), text('Get execution, success, failure, missed, and unknown-status alerts', '接收执行、成功、失败、错过和未知状态提醒'), text('A personal notification key for iPhone and Android', '独立通知密钥，支持 iPhone 与 Android')] },
    { id: 'extension', name: text('Browser extension', '浏览器扩展'), description: text('A simpler routine for your weekly class check-ins.', '把每周签到，变成更简单的日常。'), badge: text('YOURS TO KEEP', '一次买断'), amount: 2499, promotionalAmount: null, promotionEnabled: false, enabled: true, visible: true, order: 1, features: [text('Chrome extension ZIP', 'Chrome ZIP 安装包'), text('Timetable import & class tasks', '课表导入与课程任务'), text('QR code / Microsoft Forms connection', '二维码 / Microsoft Forms 绑定'), text('Local data & check-in history', '本地资料与历史记录'), text('Download link valid for 7 days', '7 天有效的下载链接')] },
    { id: 'mobile_notification', name: text('Mobile notifications', '手机通知服务'), description: text('Check your phone, not your computer, for updates.', '不必一直看电脑，也能了解签到结果。'), badge: text('EXTENSION ADD-ON', '扩展附加服务'), amount: 1199, promotionalAmount: null, promotionEnabled: false, enabled: true, visible: true, order: 2, features: [text('Execution, success & failure updates', '执行、成功与失败提醒'), text('Missed & unknown-status alerts', '错过时间与状态未知提醒'), text('Your own notification key', '独立手机通知密钥'), text('For iPhone & Android', '支持 iPhone 与 Android'), text('Setup guides & customer support', '配置教程与客服支持')] },
    { id: 'mobile_notification_yearly', name: text('Mobile notifications · Yearly', '手机通知服务 · 年付'), description: text('A full year of notification updates.', '一整年的手机通知服务。'), badge: text('YEARLY', '年付'), amount: 1999, promotionalAmount: null, promotionEnabled: false, enabled: true, visible: true, order: 3, features: [text('One year of mobile notifications', '一年的手机通知服务'), text('Execution, success & failure updates', '执行、成功与失败提醒'), text('Missed & unknown-status alerts', '错过时间与状态未知提醒'), text('For iPhone & Android', '支持 iPhone 与 Android'), text('Setup guides & customer support', '配置教程与客服支持')] },
  ],
  offer: { enabled: true, startsAt: '2026-10-01T00:00:00+08:00', endsAt: '2026-10-13T23:59:59+08:00', showCountdown: true },
  guides: [
    { id: 'windows', src: '/files/chrome-windows.jpg', title: text('Chrome extension · Windows', 'Chrome 插件安装 · Windows'), description: text('Download ZIP → Unzip → Developer mode → Load unpacked', '下载 ZIP → 解压 → 开发者模式 → 加载已解压的扩展'), alt: text('Windows Chrome extension installation guide', 'Windows Chrome 扩展安装教程'), label: '01 / WINDOWS', visible: true, order: 0 },
    { id: 'mac', src: '/files/chrome-mac.jpg', title: text('Chrome extension · macOS', 'Chrome 插件安装 · macOS'), description: text('Download ZIP → Unzip → Open extensions → Load unpacked', '下载 ZIP → 解压 → 打开扩展程序 → 加载已解压的扩展'), alt: text('macOS Chrome extension installation guide', 'macOS Chrome 扩展安装教程'), label: '02 / MACOS', visible: true, order: 1 },
    { id: 'iphone', src: '/files/ntfy-iphone.jpg', title: text('Mobile notifications · iPhone', '手机通知配置 · iPhone'), description: text('Install ntfy → Add your topic → Allow notifications', '安装 ntfy → 添加 Topic → 允许通知'), alt: text('iPhone notification setup guide', 'iPhone 通知配置教程'), label: '03 / IPHONE', visible: true, order: 2 },
    { id: 'android', src: '/files/ntfy-android.jpg', title: text('Mobile notifications · Android', '手机通知配置 · Android'), description: text('Install ntfy → Scan the QR code → Test notifications', '安装 ntfy → 扫描二维码 → 测试通知'), alt: text('Android notification setup guide', 'Android 通知配置教程'), label: '04 / ANDROID', visible: true, order: 3 },
  ],
  hero: { eyebrow: text('LESS ADMIN. MORE STUDENT LIFE.', '为学生的日常，少一点琐碎'), line1: text('Set it up.', '一次配置，'), line2: text('Stay on track.', '告别签到遗漏。'), description: text('Bring your timetable and check-ins together. Auto-Check takes the repetition out of your class routine at Southampton / UoSM.', '让课表与签到自然衔接。为 Southampton / UoSM 学生设计的课程签到辅助，把重复操作交给 Auto-Check。'), note: text('Windows & macOS · Local data · No account required', 'Windows & macOS · 本地保存资料 · 无需注册账号'), primaryButton: text('Find your package', '选择你的方案'), secondaryButton: text('See how it works', '了解使用流程') },
  content: { announcementEnabled: false, announcement: text('', ''), purchaseNotice: text('Payment is processed securely. Delivery begins after payment confirmation.', '付款由支付服务安全处理，确认付款后交付订单。'), features: [
    { title: text('One timetable. One setup.', '你的课表，一次导入'), description: text('Import PDF, JPG, JPEG, or PNG. Review detected classes, days, and times, then make any edits.', '支持 PDF、JPG、JPEG、PNG，识别课程、星期和时间，并允许手动修改。') },
    { title: text('Connect your check-in', '连接你的签到入口'), description: text('Upload a course QR code or paste a Microsoft Forms link. Match Lectures, Tutorials, and Labs.', '上传课程二维码或粘贴 Microsoft Forms 链接，匹配 Lecture、Tutorial 和 Lab。') },
    { title: text('Your week, laid out', '每周任务，清晰可见'), description: text('Save your student details, generate weekly tasks, and confirm them before scheduled execution.', '保存学生资料，自动生成每周课程任务，确认后按课程时间执行。') },
    { title: text('Clear results, less guessing', '结果明确，不猜状态'), description: text('Success appears only when Forms confirms submission. Failures, missed times, and unknown results stay distinct.', '仅在 Forms 明确提交成功时显示成功；失败、错过时间和状态未知分别提示。') },
    { title: text('A record you can check', '记录留在你手中'), description: text('Check course connections and past results. Your student information stays in local Chrome storage.', '查看课程绑定状态和历史签到记录，资料保存在本地 Chrome 中。') },
    { title: text('Made for your computer', '适配你现有的电脑'), description: text('Works in Chrome on Windows and macOS. No Node.js installation or cloud account needed.', '支持 Windows 和 macOS，使用 Chrome 扩展，无需安装 Node.js 或注册云端账号。') },
  ], faqs: [
    { id: 'packages', question: text('Do I need to buy the extension and notifications separately?', '需要同时买扩展和手机通知吗？'), answer: text('No. The complete bundle includes the extension and first semester of notifications. A standalone notification plan requires the extension.', '不需要。完整体验包包含扩展和首学期手机通知；单独购买手机通知时，需要已有课程签到扩展。'), visible: true },
    { id: 'delivery', question: text('How is my purchase delivered?', '付款后如何获取内容？'), answer: text('Follow your private order link to view delivery details. Keep that link safe.', '通过专属订单链接查看交付详情。请妥善保存该链接。'), visible: true },
    { id: 'computer', question: text('Does my computer need to stay on?', '电脑需要一直开着吗？'), answer: text('Yes. Keep your computer awake, online, and Chrome available at check-in time. Phone notifications do not perform the check-in themselves.', '需要。在签到时间保持电脑开机、联网，并确保 Chrome 和扩展可运行。手机通知不会替代电脑执行签到。'), visible: true },
    { id: 'help', question: text('How do I get help?', '遇到问题如何联系客服？'), answer: text('Use the support link. Include your email and order reference, and keep your private ticket link to view replies.', '联系客服时提供邮箱及订单号，并保存专属工单链接查看回复。'), visible: true },
  ] },
  settings: { maintenance: false, maintenanceMessage: text('We’re making a few updates. Please check back soon.', '网站维护中，请稍后再来。'), checkoutEnabled: true, defaultLocale: 'en', supportEmail: '', supportUrl: '/support', videoUrl: '', extensionRelease: null },
};

export function offerIsActive(config: SiteConfig, now = Date.now()): boolean {
  return config.offer.enabled && now >= Date.parse(config.offer.startsAt) && now < Date.parse(config.offer.endsAt);
}
export function packagePrice(config: SiteConfig, id: PlanCode, now = Date.now()): number {
  const plan = config.packages.find(item => item.id === id);
  if (!plan) throw new Error('INVALID_PLAN');
  return offerIsActive(config, now) && plan.promotionEnabled && plan.promotionalAmount !== null ? plan.promotionalAmount : plan.amount;
}
export function purchaseAllowed(config: SiteConfig, id: PlanCode): boolean {
  const plan = config.packages.find(item => item.id === id);
  return !config.settings.maintenance && config.settings.checkoutEnabled && !!plan?.enabled && !!plan.visible;
}
export function malaysiaInput(iso: string) { return new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 16); }
export function malaysiaISO(input: string) { return new Date(`${input}:00+08:00`).toISOString(); }

export function validateSiteConfig(input: unknown): SiteConfig {
  // Whitelist and reconstruct every field; never persist arbitrary client properties.
  const fail = () => { throw new Error('INVALID_SITE_CONFIG'); };
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail();
  const str = (v: unknown, max = 4000) => typeof v === 'string' && v.length <= max ? v.trim() : fail();
  const bool = (v: unknown) => typeof v === 'boolean' ? v : fail();
  const integer = (v: unknown, max = 99999999) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max ? v : fail();
  const localized = (v: unknown): LocalizedText => { const o = object(v); return { en: str(o.en), zh: str(o.zh) }; };
  const array = (v: unknown, max: number): unknown[] => Array.isArray(v) && v.length <= max ? v : fail();
  const id = (v: unknown) => { const s = str(v, 64); return /^[a-zA-Z0-9_-]+$/.test(s) ? s : fail(); };
  const url = (v: unknown, allowRelative = true) => { const s = str(v, 2048); if (!s) return ''; if (allowRelative && /^\/(?!\/)[a-zA-Z0-9/_?=.%&-]*$/.test(s)) return s; try { const u = new URL(s); if (u.protocol === 'https:' && !u.username && !u.password) return s; } catch { /* fail below */ } return fail(); };
  const source = object(input), offer = object(source.offer), settings = object(source.settings), hero = object(source.hero), content = object(source.content);
  const packages = array(source.packages, 4).map(value => {
    const p = object(value); const code = id(p.id) as PlanCode;
    if (!['extension', 'mobile_notification', 'mobile_notification_yearly', 'bundle'].includes(code)) fail();
    const amount = integer(p.amount), promotionalAmount = p.promotionalAmount === null ? null : integer(p.promotionalAmount);
    if (amount < 1 || (promotionalAmount !== null && (promotionalAmount < 1 || promotionalAmount > amount))) fail();
    const promotionEnabled = bool(p.promotionEnabled); if (promotionEnabled && promotionalAmount === null) fail();
    const name = localized(p.name); if (!name.en || !name.zh) fail();
    return { id: code, name, description: localized(p.description), badge: localized(p.badge), features: array(p.features, 20).map(localized), amount, promotionalAmount, promotionEnabled, enabled: bool(p.enabled), visible: bool(p.visible), order: integer(p.order, 100) };
  });
  if (packages.length !== 4 || new Set(packages.map(p => p.id)).size !== 4) fail();
  const startsAt = str(offer.startsAt, 40), endsAt = str(offer.endsAt, 40);
  if (!Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(startsAt) >= Date.parse(endsAt) || !/(Z|[+-]\d{2}:\d{2})$/.test(startsAt) || !/(Z|[+-]\d{2}:\d{2})$/.test(endsAt)) fail();
  const guides = array(source.guides, 30).map(value => { const g = object(value); const src = str(g.src, 200); if (!/^\/files\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(src) && !/^\/api\/site\/assets\/[0-9a-f-]{36}$/.test(src)) fail(); return { id: id(g.id), src, title: localized(g.title), description: localized(g.description), alt: localized(g.alt), label: str(g.label, 100), visible: bool(g.visible), order: integer(g.order, 100) }; });
  if (new Set(guides.map(g => g.id)).size !== guides.length) fail();
  const faqs = array(content.faqs, 30).map(value => { const f = object(value); return { id: id(f.id), question: localized(f.question), answer: localized(f.answer), visible: bool(f.visible) }; });
  if (new Set(faqs.map(f => f.id)).size !== faqs.length) fail();
  if (settings.defaultLocale !== 'en' && settings.defaultLocale !== 'zh') fail();
  const supportEmail = str(settings.supportEmail, 254); if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) fail();
  let extensionRelease: SiteConfig['settings']['extensionRelease'] = null;
  if (settings.extensionRelease !== null) { const release = object(settings.extensionRelease); const assetId = str(release.assetId, 36); if (!/^[0-9a-f-]{36}$/.test(assetId)) fail(); extensionRelease = { assetId, label: str(release.label, 100) }; }
  return { packages, offer: { enabled: bool(offer.enabled), startsAt, endsAt, showCountdown: bool(offer.showCountdown) }, guides,
    hero: { eyebrow: localized(hero.eyebrow), line1: localized(hero.line1), line2: localized(hero.line2), description: localized(hero.description), note: localized(hero.note), primaryButton: localized(hero.primaryButton), secondaryButton: localized(hero.secondaryButton) },
    content: { announcementEnabled: bool(content.announcementEnabled), announcement: localized(content.announcement), purchaseNotice: localized(content.purchaseNotice), faqs, features: array(content.features, 12).map(value => { const f = object(value); return { title: localized(f.title), description: localized(f.description) }; }) },
    settings: { maintenance: bool(settings.maintenance), maintenanceMessage: localized(settings.maintenanceMessage), checkoutEnabled: bool(settings.checkoutEnabled), defaultLocale: settings.defaultLocale as Locale, supportEmail, supportUrl: url(settings.supportUrl), videoUrl: url(settings.videoUrl, false), extensionRelease },
  };
}

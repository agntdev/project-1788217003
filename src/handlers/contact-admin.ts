import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { catalog } from "../content-store.js";
import { now } from "../clock.js";

registerMainMenuItem({ label: "تواصل مع الإدارة", data: "contact_admin", order: 30 });
const composer = new Composer<Ctx>();

composer.callbackQuery("contact_admin", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!adminChatId(ctx as any)) {
    await ctx.editMessageText("التواصل مع الإدارة غير مُعدّ بعد. جرّب لاحقًا.", { reply_markup: inlineKeyboard([[inlineButton("العودة للقائمة", "menu:main")]]) });
    return;
  }
  ctx.session.step = "contact";
  await ctx.reply("اكتب رسالتك للإدارة وسنوصلها فورًا.", { reply_markup: { force_reply: true, input_field_placeholder: "اكتب رسالتك هنا" } } as any);
});

composer.callbackQuery("contact:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "idle";
  await ctx.editMessageText("أُلغي إرسال الرسالة.", { reply_markup: inlineKeyboard([[inlineButton("العودة للقائمة", "menu:main")]]) });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "contact") return next();
  const text = ctx.message.text.trim();
  if (!text) { await ctx.reply("اكتب رسالة قصيرة لنرسلها للإدارة."); return; }
  const owner = adminChatId(ctx as any);
  if (!owner) { ctx.session.step = "idle"; await ctx.reply("التواصل مع الإدارة غير مُعدّ بعد. جرّب لاحقًا."); return; }
  ctx.session.step = "idle";
  const sender = ctx.from?.first_name ?? "طالب";
  try {
    await catalog.addContact(ctx, { telegramId: String(ctx.from?.id ?? ""), text, timestamp: now().toISOString() });
    await ctx.api.sendMessage(owner, `رسالة جديدة من ${sender}:\n${text}`.slice(0, 4096));
    await ctx.reply("وصلت رسالتك إلى الإدارة. نتمنى لك التوفيق.");
  } catch {
    await ctx.reply("تعذر إرسال رسالتك الآن. حاول مرة أخرى بعد قليل.");
  }
});
export default composer;

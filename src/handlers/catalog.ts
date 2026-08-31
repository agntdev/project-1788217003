import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { catalog, storageMessage } from "../content-store.js";
import { inlineButton, inlineKeyboard, paginate } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
const back = [inlineButton("العودة للقائمة", "menu:main")];
const unavailable = (e: unknown) => e instanceof Error && e.message === "storage-unavailable";

async function showSections(ctx: Ctx, subjectId: string) {
  try { const subject = await catalog.subject(ctx, subjectId); const sections = await catalog.sections(ctx, subjectId); if (!subject) return ctx.editMessageText("لم نعثر على هذه المادة. ارجع واختر مادة أخرى.", { reply_markup: inlineKeyboard([back]) }); if (!sections.length) return ctx.editMessageText(`لا توجد أقسام في ${subject.name} بعد — ستجد الملفات هنا قريبًا.`, { reply_markup: inlineKeyboard([back]) }); return ctx.editMessageText(`اختر قسمًا من ${subject.name}:`, { reply_markup: inlineKeyboard([...sections.map(s => [inlineButton(s.name, `lib:s:${s.id}`)]), back]) }); } catch (e) { if (unavailable(e)) return ctx.editMessageText(storageMessage(), { reply_markup: inlineKeyboard([back]) }); throw e; }
}
async function showFiles(ctx: Ctx, sectionId: string, page: number) {
  try { const section = await catalog.section(ctx, sectionId); if (!section) return ctx.editMessageText("لم نعثر على هذا القسم. ارجع واختر قسمًا آخر.", { reply_markup: inlineKeyboard([back]) }); const files = await catalog.files(ctx, sectionId); if (!files.length) return ctx.editMessageText(`لا توجد ملفات في ${section.name} بعد — ستجدها هنا قريبًا.`, { reply_markup: inlineKeyboard([back]) }); const p = paginate(files, { page, perPage: 10, callbackPrefix: `lib:p:${sectionId}`, prevLabel: "السابق", nextLabel: "التالي" }); return ctx.editMessageText(`${section.name} — صفحة ${p.page + 1} من ${p.totalPages}`, { reply_markup: inlineKeyboard([...p.pageItems.map(f => [inlineButton(f.title, `lib:f:${f.id}`)]), ...p.controls.inline_keyboard, back]) }); } catch (e) { if (unavailable(e)) return ctx.editMessageText(storageMessage(), { reply_markup: inlineKeyboard([back]) }); throw e; }
}
composer.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("lib:")) return next();
  await ctx.answerCallbackQuery();
  if (data.startsWith("lib:sub:")) return showSections(ctx, data.slice(8));
  if (data.startsWith("lib:s:")) return showFiles(ctx, data.slice(6), 0);
  if (data.startsWith("lib:p:")) { const match = /^lib:p:([\w-]+):(prev|next):(\d+)$/.exec(data); if (!match) return ctx.editMessageText("هذه الصفحة غير متاحة. اختر القسم مرة أخرى.", { reply_markup: inlineKeyboard([back]) }); return showFiles(ctx, match[1], Number(match[3])); }
  if (data.startsWith("lib:f:")) { try { const file = await catalog.file(ctx, data.slice(6)); if (!file) return ctx.editMessageText("لم نعثر على هذا الملف. ارجع واختر ملفًا آخر.", { reply_markup: inlineKeyboard([back]) }); await ctx.replyWithDocument(file.telegramFileId, { caption: `${file.title}\n${file.description}`.slice(0, 1024) }); } catch (e) { if (unavailable(e)) return ctx.reply(storageMessage()); throw e; } }
});
export async function showCategory(ctx: Ctx, type: "science" | "literature") { try { const subjects = await catalog.subjects(ctx, type); const title = type === "science" ? "المواد العلمية" : "المواد الأدبية"; if (!subjects.length) return ctx.editMessageText(`لا توجد مواد ضمن ${title} بعد — ستجدها هنا قريبًا.`, { reply_markup: inlineKeyboard([back]) }); return ctx.editMessageText(`اختر مادة من ${title}:`, { reply_markup: inlineKeyboard([...subjects.map(s => [inlineButton(s.name, `lib:sub:${s.id}`)]), back]) }); } catch (e) { if (unavailable(e)) return ctx.editMessageText(storageMessage(), { reply_markup: inlineKeyboard([back]) }); throw e; } }
export default composer;

/** Durable content records with explicit indexes; no keyspace enumeration. */
export interface Subject { id: string; name: string; type: "science" | "literature"; sectionIds: string[]; }
export interface Section { id: string; subjectId: string; name: string; fileIds: string[]; }
export interface StudyFile { id: string; sectionId: string; title: string; description: string; uploadDate: string; fileType: string; telegramFileId: string; adminSource: string; }
export interface ContactMessage { telegramId: string; text: string; timestamp: string; }

type D1 = { prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null> } } };
type DOStore = { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: { method?: string; body?: string }): Promise<Response> } };
const KEY = "sudan27:catalog";

interface State { subjectIds: string[]; subjects: Record<string, Subject>; sections: Record<string, Section>; files: Record<string, StudyFile>; contacts?: ContactMessage[]; }
const empty = (): State => ({ subjectIds: [], subjects: {}, sections: {}, files: {}, contacts: [] });

function redisUrl(): string | undefined {
  return typeof process === "undefined" ? undefined : process.env.REDIS_URL;
}

async function loadFromRedis(): Promise<State> {
  const url = redisUrl();
  if (!url) throw new Error("storage-unavailable");
  const { createRequire } = await import("node:module");
  const Redis = createRequire(import.meta.url)("ioredis");
  const Client = Redis.default ?? Redis;
  const client = new Client(url, { maxRetriesPerRequest: null });
  try {
    const raw = await client.get(KEY);
    return raw ? JSON.parse(raw) as State : empty();
  } finally { client.disconnect(); }
}

async function saveToRedis(state: State): Promise<void> {
  const url = redisUrl();
  if (!url) throw new Error("storage-unavailable");
  const { createRequire } = await import("node:module");
  const Redis = createRequire(import.meta.url)("ioredis");
  const Client = Redis.default ?? Redis;
  const client = new Client(url, { maxRetriesPerRequest: null });
  try { await client.set(KEY, JSON.stringify(state)); } finally { client.disconnect(); }
}

function envOf(ctx: unknown): { DB?: D1; CHAT_DO?: DOStore } | undefined { return (ctx as { env?: { DB?: D1; CHAT_DO?: DOStore } }).env; }
async function withState<T>(ctx: unknown, write: boolean, fn: (state: State) => T): Promise<T> {
  const env = envOf(ctx);
  const db = env?.DB;
  if (db) {
    await db.prepare("CREATE TABLE IF NOT EXISTS study_bot_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)").bind().run();
    const row = await db.prepare("SELECT value FROM study_bot_store WHERE key = ?").bind(KEY).first<{ value: string }>();
    const state = row ? JSON.parse(row.value) as State : empty();
    const result = fn(state);
    if (write) await db.prepare("INSERT INTO study_bot_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(KEY, JSON.stringify(state)).run();
    return result;
  }
  if (env?.CHAT_DO) {
    const stub = env.CHAT_DO.get(env.CHAT_DO.idFromName("study-catalog"));
    const response = await stub.fetch("https://do/catalog", write
      ? { method: "POST", body: JSON.stringify({ key: KEY }) }
      : { method: "GET" });
    if (!response.ok) throw new Error("storage-unavailable");
    const state = await response.json() as State;
    const result = fn(state);
    if (write) {
      const saved = await stub.fetch("https://do/catalog", { method: "PUT", body: JSON.stringify(state) });
      if (!saved.ok) throw new Error("storage-unavailable");
    }
    return result;
  }
  const state = await loadFromRedis();
  const result = fn(state);
  if (write) await saveToRedis(state);
  return result;
}

const id = () => crypto.randomUUID();
export const catalog = {
  subjects: (ctx: unknown, type: Subject["type"]) => withState(ctx, false, s => s.subjectIds.map(i => s.subjects[i]).filter((v): v is Subject => !!v && v.type === type)),
  subject: (ctx: unknown, subjectId: string) => withState(ctx, false, s => s.subjects[subjectId]),
  sections: (ctx: unknown, subjectId: string) => withState(ctx, false, s => (s.subjects[subjectId]?.sectionIds ?? []).map(i => s.sections[i]).filter((v): v is Section => !!v)),
  section: (ctx: unknown, sectionId: string) => withState(ctx, false, s => s.sections[sectionId]),
  files: (ctx: unknown, sectionId: string) => withState(ctx, false, s => (s.sections[sectionId]?.fileIds ?? []).map(i => s.files[i]).filter((v): v is StudyFile => !!v)),
  file: (ctx: unknown, fileId: string) => withState(ctx, false, s => s.files[fileId]),
  addSubject: (ctx: unknown, name: string, type: Subject["type"]) => withState(ctx, true, s => { const v: Subject = { id: id(), name, type, sectionIds: [] }; s.subjects[v.id] = v; s.subjectIds.push(v.id); return v; }),
  addSection: (ctx: unknown, subjectId: string, name: string) => withState(ctx, true, s => { const subject = s.subjects[subjectId]; if (!subject) return undefined; const v: Section = { id: id(), subjectId, name, fileIds: [] }; s.sections[v.id] = v; subject.sectionIds.push(v.id); return v; }),
  addFile: (ctx: unknown, data: Omit<StudyFile, "id">) => withState(ctx, true, s => { const section = s.sections[data.sectionId]; if (!section) return undefined; const v = { ...data, id: id() }; s.files[v.id] = v; section.fileIds.push(v.id); return v; }),
  updateFile: (ctx: unknown, fileId: string, update: Partial<Pick<StudyFile, "title" | "description">>) => withState(ctx, true, s => { const v = s.files[fileId]; if (!v) return undefined; Object.assign(v, update); return v; }),
  deleteFile: (ctx: unknown, fileId: string) => withState(ctx, true, s => { const v = s.files[fileId]; if (!v) return undefined; const section = s.sections[v.sectionId]; if (section) section.fileIds = section.fileIds.filter(i => i !== fileId); delete s.files[fileId]; return v; }),
  deleteSection: (ctx: unknown, sectionId: string) => withState(ctx, true, s => { const v = s.sections[sectionId]; if (!v) return undefined; const subject = s.subjects[v.subjectId]; if (subject) subject.sectionIds = subject.sectionIds.filter(i => i !== sectionId); for (const fileId of v.fileIds) delete s.files[fileId]; delete s.sections[sectionId]; return v; }),
  deleteSubject: (ctx: unknown, subjectId: string) => withState(ctx, true, s => { const v = s.subjects[subjectId]; if (!v) return undefined; for (const sectionId of v.sectionIds) { const section = s.sections[sectionId]; for (const fileId of section?.fileIds ?? []) delete s.files[fileId]; delete s.sections[sectionId]; } s.subjectIds = s.subjectIds.filter(i => i !== subjectId); delete s.subjects[subjectId]; return v; }),
  addContact: (ctx: unknown, message: ContactMessage) => withState(ctx, true, s => { s.contacts = [...(s.contacts ?? []), message].slice(-100); }),
  takeContacts: (ctx: unknown) => withState(ctx, true, s => { const messages = s.contacts ?? []; s.contacts = []; return messages; }),
};

export function storageMessage(): string { return "مواد الدراسة ليست جاهزة الآن. جرّب مرة أخرى بعد أن تُعدّ الإدارة المكتبة."; }

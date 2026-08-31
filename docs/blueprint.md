# سند — Bot specification

**Archetype:** content

**Voice:** warm and encouraging — write every user-facing message, button label, error, and empty state in this voice.

Telegram bot for Sudanese 27th batch students providing organized study materials (textbooks, notes, exams) with admin-controlled content management. Students access resources via structured menus, while the admin adds/edits files directly through private chat with the bot.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Sudanese 27th batch students
- Study material contributors

## Success criteria

- Students can navigate and download 100+ study resources
- Admin can manage content without coding
- All file changes trigger admin notifications

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with subject categories
- **المواد العلمية** (button, actor: user, callback: category:science) — Access science subjects
- **المواد الأدبية** (button, actor: user, callback: category:literature) — Access literature subjects
- **تواصل مع الإدارة** (button, actor: user, callback: contact_admin) — Send message to admin
- **/admin** (command, actor: admin, command: /admin) — Open admin content management interface

## Flows

### File navigation
_Trigger:_ Subject selection

1. Show subject sections
2. List files in section
3. Download file
4. Page navigation

_Data touched:_ subject, section, file

### Admin file management
_Trigger:_ /admin

1. Upload file
2. Select subject/section
3. Enter title/description
4. Confirm addition
5. Generate updated menus

_Data touched:_ file, subject, section

### Contact admin
_Trigger:_ Contact button

1. Collect user message
2. Send to admin with user info
3. Confirm delivery

_Data touched:_ user_message

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram ID to receive admin notifications
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **subject** _(retention: persistent)_ — Academic subject with sections and files
  - fields: name, type (science/literature), sections
- **file** _(retention: persistent)_ — Study material document
  - fields: title, description, upload_date, file_type, section_id, admin_source
- **user_message** _(retention: session)_ — Student contact request
  - fields: telegram_id, message_text, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Add/remove subjects/sections
- Upload/delete files
- Edit file metadata
- View contact messages

## Notifications

- File upload/delete alerts to admin
- New contact message alerts

## Permissions & privacy

- Only admin can modify content
- All users can read/download files
- User messages stored temporarily

## Edge cases

- Empty sections
- File not found
- Invalid pagination requests
- Non-admin users attempting content management

## Required tests

- End-to-end file upload workflow
- Pagination across 15+ files
- Admin notification reliability
- Non-admin user access restrictions

## Assumptions

- Initial 8 subjects provided by owner
- Pagination at 10 items per page
- Telegram file upload limits respected

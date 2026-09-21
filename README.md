# KrishiSahayak AI

> **One Farmer's Problem, Everyone's Protection.**

KrishiSahayak AI is a cooperative AI-powered agricultural platform that
connects farmers, cooperative/FPO groups, agricultural officers, shared
resources, and an open global community chat.

Instead of treating every farmer's problem as an isolated incident,
KrishiSahayak turns individual needs and reports into **collective
action, shared resources, early risk signals, verified decisions, and
reusable agricultural knowledge**.

**This is a fully functional hackathon prototype.** Frontend is plain
HTML/CSS/JS (no framework, no build step). Backend is a Supabase
project (database, auth, storage, realtime, edge functions). The only
AI call goes to **Groq** (Qwen vision model) inside a Supabase Edge
Function, so the AI key never reaches the browser.

---

## Team Name: boxtobox

| Name | Email | GitHub |
|------|-------|--------|
| Alan A S | alanascode@gmail.com | alanascodein |
| Agnel Joby K | agneljobyk@gmail.com | Agnel-Devs |
| Albin P Sajan | albinpsajan.official@gmail.com | albinpsajan |

---

## Project Name

KrishiSahayak

---

## Goal / Problem Statement

Farmers have information and resources around them, but the connections
between those resources are weak. Useful information and successful
practices stay local instead of becoming organized community knowledge.
Farmers have no open, shared place to ask questions and discuss.

---

## The Problem

Agricultural communities often work in isolation:

- Farmers face common resource and crop-related problems independently.
- Nearby farmers may need the same machinery, irrigation equipment,
  inputs, or transport.
- A farmer often buys more seed/fertilizer than they end up using - the
  surplus sits idle instead of reaching a neighbour who needs it.
- Officers receive many similar reports without an easy way to see the
  regional pattern.
- Useful information and successful practices stay local instead of
  becoming organized community knowledge.
- Farmers have no open, shared place to ask questions and discuss.

### Core Problem

> **Farmers have information and resources around them, but the
> connections between those resources are weak.**

KrishiSahayak AI creates a cooperative intelligence layer that helps
those connections happen.

---

## Our Solution

KrishiSahayak combines **AI + farmer cooperation + human verification**.

AI reads photos and messy text and turns them into structured data.
Simple rules and database queries handle matching and pattern
detection. **Human agricultural officers remain responsible for
verification and official decisions.**

---

## Demo Video

https://drive.google.com/file/d/1_omCMmrF6AaA1QmvEEiL14jmDU-BaLeB/view?usp=drive_link

---

## Screenshots

Application screenshots are included in the repository:

- **Farmer flow** - dashboard, groups + chat, shared resources, photo
  report, and my reports.
- **Officer flow** - review queue, photo lightbox, and risk signals.

---

## Implemented Features

### 1. Cooperative Farm Groups + Real-time Group Chat

Farmers form or join FPO/cooperative groups - a focused space for local
coordination - and message each other live.

- Create / join / leave a group
- View group members
- **Real-time group chat** (Supabase Realtime, RLS-protected, members
  only, authors can delete their own messages)
- Post shared needs inside the group

### 2. Shared Resources: Needs + Surplus Offers

Two complementary sections in the **Shared resources** tab:

- **Needs & matches (rule-based, no AI):** farmers pick a resource type
  and panchayat. Open needs are grouped by `resource_type + area` and
  show "N farmers in your area need this too", suggesting coordinated
  procurement or shared use.
- **Surplus & offers:** a farmer with spare fertilizer which he bought 10 kg
  of but used only 8 can **share/sell the remaining 2 kg**. Each offer
  has item name, category, quantity, unit, price (**0 = free to share**),
  panchayat, optional phone/WhatsApp contact, and a status
  (`available` -> `shared`).
- **Cross-matching:** a need in the same area as an offer shows "N
  farmers nearby are offering this type - check below before buying new!".

### 3. Photo-Based Crop Reports (AI)

The main place KrishiSahayak uses AI. A farmer uploads a photo of a crop
problem; a **Supabase Edge Function** (`extract-crop-report`) reads it
with a vision model (Groq, `qwen/qwen3.8-27b`) and returns structured
fields, so the farmer does not fill in a long form.

```
Farmer uploads photo -> private Supabase Storage (own folder)
        -> Edge function -> Groq vision API (image + prompt)
        -> Structured details: crop, affected part, visible symptoms,
           severity, photo quality, text description
        -> Form pre-filled -> farmer confirms or edits
        -> Saved as an unverified, AI-extracted report
```

Principles:

- **Extract, don't diagnose.** The AI describes what is visible; it
  does not name a disease with certainty.
- The farmer always confirms or edits before saving.
- Reports start **unverified** until an officer reviews them.
- If the AI fails or the photo is unclear, the farmer can fill the form
  manually.
- Photos go to a **private** bucket in a folder named with the owner's
  user id; RLS limits reads to the owner plus officers/experts.
- Groq has an OpenAI-compatible API, so the edge function uses the
  OpenAI SDK with `GROQ_BASE_URL=https://api.groq.com/openai/v1`. If
  Groq is unavailable it can fall back to an OpenAI model (`gpt-4o-mini`).
- No training or dataset is needed - a hosted API with a strict JSON
  prompt/schema is used.

### 4. Officer Review, Photo Verification & Replies

Officers get a **Review reports** tab listing every unverified report:

- **Photo thumbnails** in the queue - click any thumbnail to open a
  full-screen lightbox and inspect the crop before deciding.
- **Verify / Reject** buttons that update the report status.
- **Reply** - an inline form leaving a written message to the farmer.
  Replies save `review_note`, `reviewed_by`, `reviewed_at`.
- On the farmer side, **My reports** shows a "Replies from your
  officer" card section with the message, date, and a clickable photo,
  plus an officer badge on each reviewed row.

### 5. Collective Farm Risk Alerts (rule-based)

**Rule-based regional risk detection - no AI.** If enough farmers in
the same area report the same crop problem within a short window, the
system raises a **signal** for the officer to confirm or dismiss.

- Rule: compare reports by **crop + first symptom + area** within the
  last **7 days**; when **3+ matching reports** exist, a signal shows
  the exact reports that fired it.
- The officer can **Publish alert** (writes a verified `risk_patterns`
  row visible on farmer home pages) or **Dismiss**.
- A detected pattern is a **signal**, not a confirmed outbreak.

### 6. Knowledge Sharing

Farmers share what worked on their farm; officers can publish verified
guidance. Contributions are organized by crop, problem, practice, and
location, and clearly separated into **Farmer Experience** and
**Verified Agricultural Guidance**.

### 7. Global Community Chat (no AI)

An open, Reddit-style community space (`community.html`) where every
farmer, officer, and expert can ask questions, discuss, and vote.

- 9 boards: General, Paddy, Coconut, Banana, Pepper, Pests & Disease,
  Irrigation, Machinery, Subsidies
- Posts with threaded comments and upvote/downvote scores; search/filter
  by board and flair; sorting by new / hot / top
- **Realtime** - new posts appear live (Supabase Realtime)
- Flairs: Question, Experience, Crop Problem, Resource, Discussion,
  Verified, Official (Verified/Official available to officers/experts)
- Upvotes show popularity, **not correctness**; no AI in the chat.

---

## AI Responsibilities

KrishiSahayak does not use AI as a replacement for agricultural
professionals. AI is used narrowly where input is messy and code alone
cannot handle it: **reading photos and free text and turning them into
structured data**.

Rules and database queries handle everything else: resource matching,
need<->offer cross-matching, surplus offer lifecycle, risk pattern
detection, the officer review/reply workflow, realtime chat and
community votes, knowledge categorization, and community search.

**AI should not** make final agricultural decisions, diagnose a disease
with certainty, or present unverified farmer experiences as official
guidance.

---

## Requirements

### Runtime / Hardware

- Any modern browser (Chrome recommended - used for the password-save
  flow and the photo lightbox).
- A machine that can run a local static file server (Node.js or Python).
- No GPU, no build tooling, no framework, and no bundler required.

### Prerequisites

- A free **Supabase** project: https://supabase.com
- **Node.js** installed (local server + AI test harness)
- A free **Groq** API key: https://console.groq.com/keys
- *(Optional)* **Supabase CLI** - only needed to set secrets and deploy
  the edge function.
- *(Optional)* **Python 3** - alternative to Node for the local server.

### Dependencies

| Dependency | Where | Why |
|---|---|---|
| `supabase-js` (CDN) | Frontend | Postgres, auth, storage, realtime client |
| Supabase project | Backend | Database, auth, private storage, realtime, edge functions |
| Deno (Supabase Edge Runtime) | Edge function | Hosts `extract-crop-report` |
| Groq API (`qwen/qwen3.8-27b`) | AI | Vision extraction from crop photos |
| OpenAI SDK (Deno import) | Edge function | OpenAI-compatible client pointed at Groq's base URL |

---

## Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 / CSS3 / JavaScript | Responsive UI, all features (no framework) |
| Supabase (PostgreSQL) | Database, auth, storage, realtime |
| Supabase Edge Function (Deno) | Server-side AI call - key never in the browser |
| Groq (OpenAI-compatible) | Vision photo extraction - `qwen/qwen3.8-27b` |
| PostgreSQL RLS | Per-user, per-group data security |
| Supabase Realtime | Live group chat + community posts |
| Supabase Storage (private bucket) | Farmer photos in per-user folders |

**Security principle:** the Groq key exists only inside the edge
function's secrets. The function forwards the caller's Supabase token so
storage RLS applies inside the function too - a farmer can only analyze
photos in their own folder.

---

## Current Data Model (setup.sql)

```
profiles  - id, full_name, role (farmer/officer/expert), area
            (role source of truth; created from signup metadata)

farmer_reports  - farmer_id, photo_path, ai_extracted (jsonb), crop,
    affected_part, symptoms, severity, description, area,
    status (unverified/verified/rejected),
    review_note, reviewed_by, reviewed_at   <- officer reply fields
    + index (crop, area, created_at)

crop-photos (private storage bucket)
    per-farmer folders; RLS: owner uploads/reads, officers/experts read

farm_groups  *->  group_members  (group_id, farmer_id, unique)

group_messages  - realtime group chat; RLS members-only

resource_needs        resource_offers (surplus sharing)
  farmer_id,            owner_id, owner_name, item_name,
  resource_type,        item_type, quantity, unit, price,
  area, note            area, contact, note,
                        status (available/shared)

risk_patterns  - crop, symptom, area, report_count,
                 status, verified_by, verified_at

knowledge_posts  - crop, problem, practice, location, verified (bool)

community_posts / post_comments / post_votes  - boards + flairs,
    scores, threaded comments, realtime
```

All tables have **RLS enabled**. Farmers see their own data, officers
and experts can review, groups are member-only, and the community board
is open to all authenticated users.

---

## User Roles

**Farmer** - create a profile; create/join groups and use real-time
group chat; submit photo crop reports (AI pre-fills, farmer confirms);
post resource needs and offer surplus to neighbours; see officer replies
on their reports; view verified risk alerts; share experiences / read
verified guidance; post, comment, and vote in the Global Community Chat.

**Agricultural Officer** - review reports with photo thumbnails +
lightbox; verify/reject and reply with guidance; review rule-firing risk
signals and publish verified alerts or dismiss; post Verified Guidance
and official community content; see regional patterns.

**Expert / Specialist** - read all reports (same read access as
officers); post verified and official-flaired community content.

---

## Human-in-the-Loop Design

```
System Signal / AI Extraction -> Human Review -> Verification -> Official Guidance
```

This is particularly important for crop disease/risk alerts and
agricultural recommendations. AI and simple rules help people make
sense of information, while authorized humans remain responsible for
decisions requiring professional or official judgment.

---

## Privacy & Location

Location is used at the panchayat/locality level only - never an exact
farm coordinate. GPS/EXIF data is not read from photos; photos live in a
private per-user storage folder; posts show a display name and an
approximate area only.

---

## Setup

### 1. Database - run the SQL in Supabase Dashboard -> SQL Editor

- **Fresh project**: copy-paste **`setup.sql`** and run it once. It
  creates everything (profiles, reports + officer reply fields, storage
  bucket, groups, group chat, resource needs + offers, knowledge, risk
  patterns, community tables, policies, triggers, realtime).
- **Existing project that already has the base schema**: run these two
  incremental files (both are safe to re-run):

  1. **`fix-database-updates.sql`** - officer reply columns +
     `group_messages` chat table.
  2. **`fix-resource-offers.sql`** - surplus-sharing table.

### 2. Frontend config - `js/config.js`

Already pre-filled with the Supabase URL + anon key:

```js
SUPABASE_URL: "https://fukfuwrtbdpnebbwmtnv.supabase.co",
SUPABASE_ANON_KEY: "eyJ...", // anon public - Project Settings -> API
```

### 3. AI - set secrets + deploy the edge function

From the project folder (Supabase CLI reads `supabase/config.toml`):

```
supabase secrets set GROQ_API_KEY=gsk_...
supabase secrets set GROQ_MODEL=qwen/qwen3.8-27b
supabase functions deploy extract-crop-report
```

Test locally before deploying:

```
node test-extract.mjs somephoto.jpg another.jpg
```

(with `GROQ_API_KEY` and `GROQ_MODEL` available in the environment -
the repo's `.env` already has them for this purpose).

### 4. Run the app

**Double-click `start-app.bat`** - it serves the folder on
`http://localhost:8000` and opens the login page. Serving over
`http://localhost` (not `file://`) is what lets Chrome reliably offer to
**save your password**.

Manual alternative:

```
python -m http.server 8000
```

Then open http://localhost:8000/login.html

Sign up with a role (Farmer / Officer / Expert) and use the dashboard.
To try the officer flow, create an account with the **Officer** role.

---

## Project Structure

```
KrishiSahayak/
|-- index.html            Landing page
|-- login.html            Sign in / sign up / forgot password
|-- dashboard.html        Farmer & officer dashboard (all tabs)
|-- photo-report.html     Photo-based AI crop report
|-- community.html        Global community chat
|-- js/
|   |-- config.js         Supabase URL + anon key + helpers
|   |-- auth.js           Sign in/up (+ browser password-save helper)
|   |-- dashboard.js      Groups+chat, resources+offers, reports,
|   |                     officer review/replies, signals
|   |-- photo-report.js   Upload -> edge function -> confirm
|   |-- community.js      Boards, posts, comments, votes, realtime
|   +-- app.js            Landing page interactions
|-- css/style.css         All styling (responsive, mobile-first)
|-- assets/               Landing page images
|-- photos/               App screenshots (Farmer/ and Officer/)
|-- supabase/
|   +-- functions/extract-crop-report/
|       |-- index.ts          Edge function (auth + storage + AI call)
|       +-- extract-core.mjs  Shared prompt/schema/parsing
|-- setup.sql                  Full schema (fresh projects)
|-- fix-database-updates.sql   Reply columns + group chat
|-- fix-resource-offers.sql    Surplus-sharing table
|-- test-extract.mjs           Local AI extraction test harness
|-- start-app.bat              Double-click local server (password save)
|-- .env                       Local secrets (GROQ_API_KEY, GROQ_MODEL)
+-- .gitignore                 Never commit .env / supabase/.temp
```

---

## Environment Variables & Secrets

Never commit secrets to GitHub.

```env
# .env (local only, already present)
GROQ_API_KEY=gsk_...
GROQ_MODEL=qwen/qwen3.8-27b

# Supabase secrets (server-side only)
supabase secrets set GROQ_API_KEY=gsk_...
supabase secrets set GROQ_MODEL=qwen/qwen3.8-27b
```

The **Groq key must remain server-side** (edge function secrets). The
Supabase URL + anon key in `js/config.js` are public by design - row
level security protects the data.

---

## Limitations

- **AI:** extraction can be incorrect or incomplete; farmers confirm
  it and disease identification requires officer verification.
- **Risk detection:** a cluster is only a signal until an officer
  verifies it.
- **Community knowledge:** farmer experiences are kept separate from
  verified guidance.
- **Global chat:** posts are user-generated and unverified unless
  flaired by an officer/expert; upvotes do not prove correctness.
- **Subsidies / officer cases:** these are future extensions - the
  current MVP covers groups+chat, shared resources+offers, photo
  reports, officer review/replies, risk signals, knowledge, and the
  community chat.

---

## Impact

**Farmers** - easier support access, better cooperation, shared
resources, surplus redistribution, faster awareness of local risks, and
direct guidance from the officer who reviewed their report.

**Officers** - a photo review queue with lightbox, regional pattern
visibility, one-click verify/reject plus written replies, and
human-controlled decision-making throughout.

**Community** - shared resources, collective risk awareness, reusable
knowledge, and searchable open discussions.

---

## Vision

KrishiSahayak AI is not intended to replace farmers, agricultural
officers, or experts - it is designed to **connect them**.

> One farmer's need can connect with another farmer's need.
> One report can become a community warning.
> One verified decision can help many farmers.
> One shared experience can become useful knowledge.

---

## Hackathon Pitch

### KrishiSahayak AI

**"We don't just solve a farmer's problem. We make the solution useful
for the farming community."**

A farming platform that turns isolated problems into cooperative
intelligence - AI reads crop photos, groups chat and share surplus
resources, rules detect regional risks, and officers verify and reply,
all in one shared ecosystem.

---

## License

This project is developed as a hackathon prototype.

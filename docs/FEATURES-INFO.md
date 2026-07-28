# KVL GrowthOS — Full Features Info (Kya Kaam Karta Hai, Kaise, Aur Kya Missing/Fake Hai)

Ye file poori website ka feature-by-feature breakdown hai. Har feature ke saamne likha hai:
- **✅ REAL** — poori tarah kaam karta hai, koi setup nahi chahiye
- **🔑 NEEDS CONFIG** — code real hai, lekin kaam karne ke liye ek API key/env var set karni padegi
- **⚠️ INCOMPLETE/UNWIRED** — UI me hai lekin button/link kaam nahi karta, ya feature "coming soon" hai

Kahi bhi fake/mock data nahi mila — jahan bhi AI ya external service missing hoti hai, app honestly error/"not connected" dikhata hai, jhooti/fabricated cheez kabhi nahi dikhata. Ye poore codebase me baar-baar follow ki gayi design policy hai.

---

## 1. Marketing / Public Website

- **Homepage, Hero, Pricing, Features, FAQ, Security, Social Proof sections** — ✅ REAL static marketing content.
- Hero ke stat counters (3.2x pipeline, 40% faster, etc.) — ye marketing copy hai, live data se nahi aate.
- "Start free trial" button (Hero/CTA/Pricing) — ✅ REAL, `/register` par le jaata hai. **Mobile nav drawer wala isi button ka version 2026-07-28 ko bug tha** (koi Link/href nahi tha, tap karne se kuch nahi hota tha) — fix ho chuka, ab desktop jaisa hi `/register` par le jaata hai.
- **"Watch demo" button (Hero)** — ⚠️ UNWIRED, koi link/action nahi hai. Koi demo video asset ya modal bhi kahin nahi hai — sirf wiring ka fix nahi, pehle real video/modal banana padega.
- **"Talk to sales" button (CTA + Enterprise pricing tier, dono jagah)** — ⚠️ UNWIRED, koi contact route/email nahi bana hai abhi. Code me hi comment hai confirm karte hue ki jaan-boojh kar unwired chhoda gaya hai (guess karke galat jagah link nahi lagayi).
- **Footer links** — kai saare `href="#"` placeholder hain: Integrations, About, Careers, Blog, Contact, Privacy Policy, Terms of Service, Security (legal page), aur social icons (Website/Email/Chat with us). In sabke liye actual pages/content banana padega — sirf wiring ka fix nahi hai.
- **LinkedIn — poori website me kahin bhi LinkedIn login/OAuth/company-page link nahi hai** (marketing footer, login page, dashboard, sab jagah check kiya). LinkedIn sirf 3 jagah aata hai: (1) marketing copy me sirf text ("email + LinkedIn sequencing"), (2) CRM Contact/Company edit form me ek plain manual URL text-field jo user khud paste karta hai, (3) Outreach module me ek "Mark as sent on LinkedIn" button jo **jaan-boojh kar manual hai** (LinkedIn ke terms automated posting allow nahi karte) aur sahi se kaam karta hai. Koi bhi "Sign in with LinkedIn" ya automated LinkedIn integration is app me bilkul nahi hai — banane ke liye poora naya development chahiye.

---

## 2. Login / Signup / Account Security

- **Email + Password login/register** — ✅ REAL. Bcrypt/Argon2 password hashing, rate-limiting (Redis), 5-baar galat try par 15-min lockout, naye device par email alert.
- **2FA (TOTP)** — ✅ REAL, Profile me setup hota hai, encrypted secret DB me store hota hai.
- **Forgot/Reset password, Email verification** — ✅ REAL, single-use tokens.
- **Google / Microsoft / GitHub se login (OAuth)** — 🔑 NEEDS CONFIG — `GOOGLE_CLIENT_ID`, `MICROSOFT_ENTRA_ID_CLIENT_ID`, `GITHUB_CLIENT_ID` (+ secrets) set karne honge. **Abhi UI par button bhi nahi hai** — sirf backend support hai, login page par abhi sirf email/password form hai.
- **Magic-link email login, verification emails, password-reset emails** — ✅ REAL ab (2026-07-28 se). Do bugs the: (1) `docker-compose.yml` me `EMAIL_SERVER`/`EMAIL_FROM`/`RESEND_API_KEY` `environment:` block me hi missing the, isliye `.env` me set hone ke bawajood container tak pahunchte nahi the; (2) sabse pehle koi bhi SMTP config nahi tha. Dono fix ho chuke — ab Resend ka SMTP relay (`smtp.resend.com`, verified domain `kvlbusinesssolutions.com`) use ho raha hai. Verify kiya gaya: pehle console-log fallback confirm hui (`[DEV] Email to ...`), fix ke baad wahi log line gayab ho gayi.
- **Onboarding wizard (company profile → business details → services/goals)** — ✅ REAL, 3-step, progress save hota hai.
- **AI Agents auto-provisioning** — ✅ REAL. Signup ke turant baad 7 AI agents (CEO, Sales, Marketing, Proposal, Outreach, CRM, Analytics) apne aap ban jaate hain.
- **Team invites** — ✅ REAL, token-based, email match verify hota hai.

---

## 3. Lead Finder / Client Finder

- ✅ REAL — asli companies ko web par dhundta hai (fake list nahi banata).
- **Kaise kaam karta hai:** Claude AI ka native web-search tool use hota hai — 2-pass: pehle live search, fir results ko structured list me convert karta hai.
- 🔑 NEEDS CONFIG — kaam karne ke liye `ANTHROPIC_API_KEY` chahiye (sirf Claude web-search karta hai; Groq/Gemini/OpenRouter is ek feature ke liye fallback nahi ban sakte).

---

## 4. CRM (Deals, Contacts, Pipeline, Companies)

- ✅ REAL — pura CRUD system, database-backed, koi mock data nahi. Deal board, pipeline stages, tasks, calendar, CSV import/export — sab genuinely kaam karta hai.
- **Company Intelligence panel** (kisi ek company ka deep research) — 🔑 NEEDS CONFIG (AI key chahiye), baaki CRM ko AI ki zarurat nahi.

---

## 5. Proposals, Contracts, Quotations, e-Signature

- **AI se proposal/contract draft banana** — ✅ REAL code, 🔑 NEEDS an AI key. Sirf brief me diya gaya data use karta hai, kabhi fake price/client detail nahi banata.
- **PDF generation** — ✅ REAL.
- **e-Signature (DocuSign / Adobe Sign / Dropbox Sign)** — 🔑 NEEDS CONFIG (`DOCUSIGN_INTEGRATION_KEY`, `ADOBE_SIGN_CLIENT_ID`, `DROPBOX_SIGN_CLIENT_ID` waghera) + har organization ko apna account connect karna padega.
- **In se koi bhi connect na ho to:** ✅ REAL fallback — apna internal "manual signature" link (`/sign/token`) ban jaata hai jahan signature app ke andar hi capture hota hai. Ye fake nahi hai, bas third-party provider nahi hai.

---

## 6. Projects & Delivery

- ✅ REAL — tasks, kanban, bugs, milestones, sprints (burndown chart), time tracking, risks, file versions — sab database-backed.
- Burndown chart sirf "aaj tak" ka real data dikhata hai, future ko kabhi fake project nahi karta.
- **AI Planning Panel** (project ke andar AI se help) — 🔑 NEEDS AI key; baaki project tracking ko AI ki zarurat nahi.

---

## 7. Website Scanner

- ✅ REAL — diya gaya URL ko genuinely fetch karta hai (SSRF-protected), Technology/SEO/Performance/Security/UX ko rule-based analyze karta hai — koi AI nahi lagta ismein, pura deterministic hai.
- **Sirf final "AI Executive Report" (summary narrative)** — 🔑 NEEDS AI key. Baaki poora scan bina AI ke bhi pura kaam karta hai.

---

## 8. AI Agent Runtime (poore website ka AI engine)

- ✅ REAL fallback chain: **Claude (paid, primary) → Groq (free) → Gemini (free) → OpenRouter (free) → agar sab fail ho to BullMQ queue me retry**.
- Ye engine War Room, AI Delivery Board, Review Board, AI Project Manager, Lead Finder, Company Intelligence — sab jagah use hota hai.
- 🔑 Chaaron keys (Claude, Groq, Gemini, OpenRouter) set hain, lekin **real-world me abhi ye chain kaafi fragile hai** (2026-07-28 ko live debug karke confirm kiya):
  - **Anthropic** — 400 "credit balance too low". Paisa khatam, real billing top-up chahiye — code se fix nahi hoga.
  - **Groq** — daily token quota (100,000/day) normal usage me hi khatam ho jaata hai (~99% used dekha gaya); tab tak 429 milta rahega jab tak agla din na ho ya paid tier na le.
  - **Gemini** — free-tier ka daily 20-request cap turant khatam ho jaata hai; ye sabse chhota/fragile fallback hai.
  - **OpenRouter** — ismein khud 2 alag bugs mile aur fix hue is session me: (1) hardcoded default model `meta-llama/llama-3.3-70b-instruct:free` OpenRouter ne free tier se hata diya tha (404); (2) uski jagah lagaya `google/gemma-4-31b-it:free` upstream provider (Google AI Studio) par khud rate-limited nikla (har request 429). Final fix: `nvidia/nemotron-nano-9b-v2:free`, jo live-test me `finish_reason: "stop"` ke saath poora valid JSON deta hai. **OpenRouter free-tier models regularly rotate/get rate-limited** — agar future me phir se AI features fail hone lagein, sabse pehla check yahi hona chahiye (`OPENROUTER_MODEL` env var se bina rebuild ke override ho sakta hai).
  - **Naya bug mila (fix nahi hua abhi):** fallback chain me ek in-memory **60-second cooldown circuit-breaker** hai (`src/lib/ai/fallback.ts`) — jaise hi koi provider ek baar fail hota hai, agle 60 second ke liye use skip kar diya jaata hai (retry try hi nahi karta). Jab koi batch job (jaise Company Research, jo ek sequence me kai companies process karta hai, har ek ke 4 AI calls ke saath) jaldi-jaldi calls karta hai, to sab providers ek saath 60-second window me cooldown me chale jaate hain — aur tab error aata hai **"All AI providers failed: no provider is configured"**, jo **misleading hai** (asal me sab keys set hain, bas sab temporarily "cooling down" hain). Isi wajah se AI Board ke ek round ke beech "page couldn't load" bhi dekha gaya (agent-turns lambi fallback chain ke saath backup-to-back chalte hain, total time nginx ke proxy timeout se zyada ho sakta hai).
- Agar sab providers fail ho jaayen tab bhi app "fail" nahi dikhata seedha — request queue me chali jaati hai aur automatically retry hoti hai (5 baar, badhte gap ke saath) — lekin batch jobs (jaise Company Research) is queue retry ka fayda turant nahi utha paate agar cooldown window overlap ho raha ho.

---

## 9. Automation Builder (n8n-type Workflow Engine)

- ✅ REAL, working engine — mock/stub bilkul nahi hai. 16 node types: TRIGGER, CONDITION, DELAY, LOOP, AI_ACTION, EMAIL, SMS, WEBHOOK, CRM, PROPOSAL, PROJECT, APPROVAL, DOCUMENT, NOTIFICATION, DATABASE, FUNCTION, CUSTOM_API.
- Har run database me record hota hai, failure honestly fail dikhata hai (fake success nahi karta).
- **Tenant version:** `/dashboard/automation`
- **Admin/platform version:** `/admin/automation` — same engine, admin ke apne internal workspace par scoped.
- **`/admin/workflow`** — ye ek **read-only diagram** hai (poori website ka pipeline map: Marketing → Lead → CRM → Proposal → Project → Delivery → Portal → Billing → Analytics), isme edit nahi ho sakta. Real editable builder `/admin/automation` hai.
- EMAIL/SMS/WEBHOOK jaise nodes ko apni-apni keys chahiye (Resend/SMTP/Twilio) warna wo step honestly "not configured" error dega.

---

## 10. Integration Hub (`/dashboard/settings/integrations`)

~50 integrations, do tarah ki:

- **API_KEY type** (Stripe, Twilio, OpenAI, Groq, Razorpay, Cal.com, Telegram, waghera) — ✅ REAL, **zero platform config chahiye** — koi bhi organization apni key seedha paste kar sakti hai, ek real live API call se verify hoti hai turant.
- **OAuth type** (HubSpot, Salesforce, Zoho, Pipedrive, DocuSign, Slack, waghera) — 🔑 NEEDS CONFIG — platform-level `CLIENT_ID`/`CLIENT_SECRET` set kiye bina ye "Not Connected — requires ENV_VAR" dikhate hain, koi bhi org connect hi nahi kar sakti.

---

## 11. AI Command Center + AI Memory

- ✅ REAL — Agent status/activity live database se aata hai.
- **Agent Memory** — ✅ REAL, AES-256-GCM encrypted (`AGENT_MEMORY_ENCRYPTION_KEY` — humne ye already set kar diya hai).

---

## 12. Billing (Platform ka apna revenue system)

- ✅ REAL — Plans, Subscriptions, Invoices, Payments — database-backed, koi mock state nahi.
- **AI Credits metering** — ✅ REAL, real token usage record hota hai billing ke liye.
- **Payment Gateways:**
  - Stripe, Razorpay, Paddle, LemonSqueezy — 🔑 NEEDS CONFIG (respective keys)
  - **Bank Transfer/Manual** — ✅ REAL, zero-config, hamesha available (operator manually payment "received" mark karta hai)

---

## 13. Admin Panel (`/admin`) — 8 sections

| Section | Status |
|---|---|
| Workflow (diagram) | ✅ REAL, read-only |
| Automation Builder | ✅ REAL, editable |
| Production (health/deploy/backup dashboard) | ✅ REAL — live probes; deploy/backup history khaali dikhega jab tak actual CI/CLI scripts na chale ho |
| Incidents | ✅ REAL CRUD |
| Compliance | ✅ REAL — code-verified checks (SOC2/ISO27001/GDPR/etc.), sirf documentation nahi hai, lekin ye legal certification nahi hai — disclaimer bhi likha hota hai |
| Billing (platform revenue) | ✅ REAL |
| Payouts | ✅ REAL tracking, **lekin asli paisa bhejna manual hai** — sirf "PAID" status mark hota hai, koi bank/PayPal API call nahi karta |
| Partners | ✅ REAL — apply/approve/suspend, commission tracking sab database-backed |

---

## 14. Client Portal (`/portal`) — clients ke liye alag login

- ✅ REAL — apna alag session system, projects/invoices/proposals/contracts dekh sakte hain.
- **2FA aur Passkeys (Portal Security page)** — ⚠️ INCOMPLETE, "Coming soon" likha hua hai — architecture ready hai but abhi enable nahi hai.

---

## 15. Board (War Room) & Notifications — is audit (2026-07-28) me mile naye unwired items

- **Voice Mode button** (War Room meeting screen) — ⚠️ UNWIRED, `disabled`, tooltip "Voice discussion — coming soon" (`src/app/board/meetings/[id]/_components/owner-controls.tsx:83`).
- **WhatsApp notification toggle** (Profile → Notifications) — ⚠️ UNWIRED, no-op switch, `disabled`, "Coming soon" badge (`src/app/profile/_components/notifications-form.tsx:136-141`).
- **Telegram notification toggle** (same page) — ⚠️ UNWIRED, identical no-op pattern (`src/app/profile/_components/notifications-form.tsx:144-149`).
- **Two dead components** — `src/app/dashboard/_components/coming-soon.tsx` aur `src/app/profile/_components/coming-soon-card.tsx` poore bane hue "honest empty state" components hain lekin **kahin bhi import/use nahi hote** — dead code hai, kisi route se reachable nahi.

---

## 16. Poori website audit (2026-07-28) — 5 bugs mile aur fix hue

Ek 10-section, end-to-end audit chalayi gayi (marketing, auth, dashboard core, CRM/leads, outreach/scanner, proposals/projects, automation/integrations, billing/marketplace, admin, portal/profile) — 32 findings mile, jinme se 6 "real bug ho sakta hai" lage, verify karne par 5 confirm hue aur turant fix ho gaye:

1. **Mobile nav "Start free trial" button** (`src/components/sections/navbar.tsx`) — tap karne se kuch nahi hota tha (Link missing tha). Fix: desktop jaisa `/register` link laga diya.
2. **Marketplace paid-checkout cancel button** (`checkout-actions.ts`) — cancel karne par 404 aata tha (galat ID se URL banti thi, route slug maangta hai). Fix: slug se sahi URL banti hai ab.
3. & 4. **Admin → Billing: "Failed payments" aur "Outstanding invoices" table me organization name par click** (`src/app/admin/billing/page.tsx`) — link dikhta tha lekin 90% cases me kahin le jaata hi nahi tha (target hi nahi hota tha page par). Fix: ab sirf tabhi clickable link dikhta hai jab target genuinely exist karta ho, warna plain text.
5. **Profile → Connected Accounts: Google/Microsoft/GitHub "Connect" buttons** — sab teeno button hamesha dikhte the, chahe wo provider configure ho ya na ho — click karne par error aata tha agar provider set nahi tha. Fix: ab login page jaisa hi, sirf configured providers ke buttons dikhte hain.

Baaki 26 findings (§1, §2, §15) ya to genuinely "not built yet" hain (naya development chahiye), ya sirf ek API key/config missing hai — koi aur chhupa hua bug nahi mila is pass me.

---

## 17. Company Research batch job — misleading error (2026-07-28 ko discover hua)

`src/lib/business-development/company-research-job.ts` — jab ye job kai companies ko sequence me process karta hai (har ek ke 4 AI calls: research, extraction, opportunity-detection, buyer-persona), to §8 me describe kiya gaya 60-second cooldown circuit-breaker overlap ho jaata hai aur sab 4 providers ek saath "cooling down" maan liye jaate hain. Result: genuine failure ke bajaye ek misleading `"All AI providers failed: no provider is configured"` error, jabki saari API keys asal me set hain. Iska real fix code-level hai (cooldown window ko batch jobs ke liye adjust karna, ya per-provider retry logic behtar karna) — abhi tak fix nahi hua.

---

## 18. Monitoring / Health / Metrics

- `/api/health` — ✅ REAL live checks (DB, Redis, Storage, Queue). AI/Payment "DEGRADED" dikhayega agar unconfigured hai — ye normal hai, DOWN nahi maana jaata.
- `/api/metrics` (Prometheus) — 🔑 NEEDS `METRICS_TOKEN` (humne set kar diya hai).
- **Sentry error tracking** — 🔑 NEEDS `SENTRY_DSN` (abhi not set).
- **OpenTelemetry tracing** — 🔑 NEEDS `OTEL_EXPORTER_OTLP_ENDPOINT` (abhi not set, optional).

---

## Summary — Abhi Kya Set Hai (last verified 2026-07-28)

✅ Set aur container tak sahi se pahunch rahe hain: `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, `EMAIL_SERVER`, `EMAIL_FROM`, `AGENT_MEMORY_ENCRYPTION_KEY`, `INTEGRATION_TOKEN_ENCRYPTION_KEY`, `SECRETS_MANAGER_ENCRYPTION_KEY`, `WEBHOOK_SECRET_ENCRYPTION_KEY`, `TWO_FACTOR_SECRET_ENCRYPTION_KEY`, `METRICS_TOKEN`. (`EMAIL_SERVER`/`EMAIL_FROM`/`RESEND_API_KEY`/`OPENROUTER_MODEL` ko `docker-compose.yml` ke `environment:` block me is session me hi add kiya gaya — pehle set hone ke bawajood container tak pahunchte hi nahi the.)

⚠️ **Set hai lekin practically unreliable** — AI Agent Runtime (§8 dekhein): Anthropic credits khatam, Groq/Gemini daily quota turant khatam ho jaata hai, OpenRouter free-tier models rotate/rate-limit hote rehte hain, aur ek 60-second cooldown bug batch jobs me misleading errors deta hai. Matlab "keys set hain" ≠ "AI features reliably chalengi" — real paisa (Anthropic credits) ya is cooldown bug ka fix chahiye long-term stability ke liye.

❌ Abhi bhi missing (jab zarurat ho tab set karna): Google/Microsoft/GitHub OAuth login, Stripe/Razorpay/Paddle/LemonSqueezy (payment), DocuSign/Adobe Sign/Dropbox Sign (e-signature), HubSpot/Salesforce/Zoho/Pipedrive (CRM sync OAuth), Sentry, OpenTelemetry, Weather widget.

⚠️ Kabhi bhi fix nahi honge jab tak naya code na likha jaaye (ye "missing config" nahi, ye genuinely adhoora/unwired hai): "Watch demo" button, "Talk to sales" button (dono jagah), Client Portal 2FA/Passkeys, War Room Voice Mode, Profile WhatsApp/Telegram notification toggles.

🐛 **Code-level bug, config se fix nahi hoga:** 60-second AI-provider cooldown circuit-breaker (§8, §17) batch jobs (Company Research) me sab providers ko ek saath skip kara deta hai, misleading "no provider configured" error deta hai.

✅ **2026-07-28 audit me 5 bugs mile aur turant fix ho gaye** (§16 dekhein): mobile "Start free trial" button, marketplace checkout cancel-redirect 404, admin billing ke 2 dead in-page links, aur profile ke unconditional OAuth connect buttons.

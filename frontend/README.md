# Sentinel's Haven

Digital CISO — Frontend Design & Build Prompt

Product Name: Digital CISO
Tagline: "Your AI-Powered Chief Information Security Officer"

1. Identity & Vision

Build a premium, enterprise-grade cloud security command center called Digital CISO. This is not a generic dashboard — it is a mission-critical security operations platform that makes a CISO feel like they are piloting a spacecraft designed by a cybersecurity-obsessed aerospace engineer. Think: the lovechild of a Bloomberg Terminal, a NORAD war room, and a Tony Stark holographic HUD — but purpose-built for cloud security.

The product name is Digital CISO. The logo should be a sleek, geometric shield icon with a subtle circuit-board pattern etched into it. The icon should work at 16×16 favicon size and at 128×128 sidebar size. The brand font should be Space Grotesk for headings and Inter for body text. The overall personality is: surgical precision meets dark elegance.

2. Design Language

Color System

Primary palette — "Obsidian Command":

Background: Pure matte black #050507 graduating through #0A0D14 to #0E1420 — never a flat color, always a subtle 2-stop vertical gradient so the viewport has dimensional depth.

Card surfaces: #0C101A with 60% opacity and backdrop-blur-xl — glassmorphism done right, not overdone.

Borders: rgba(255,255,255,0.06) default, with per-section accent glows on hover (e.g., a Findings card border might pulse rgba(239,68,68,0.25) on hover).

Primary accent: Electric Cyan #00E5FF — used for active states, primary CTAs, focus rings, and the active nav indicator.

Secondary accents by domain:

Threat / Critical: #FF3D71 (hot coral-red)

Warning / High: #FFAA00 (amber)

Success / Pass: #00E096 (neon mint)

Info / AI: #7B61FF (electric violet)

Neutral: #64748B (slate)

Light Mode

When toggled to light mode, the palette inverts to:

Background: #F8F9FC → #FFFFFF

Cards: white with rgba(0,0,0,0.04) borders

Text: #1A1D26 primary, #64748B secondary

Accents remain the same but at 90% saturation

All glassmorphism effects remain but with light blur

The theme toggle should be a smooth pill toggle in the top navbar — a miniature sun/moon icon that morphs with a 300ms spring animation.

Typography

Headings (H1–H3): Space Grotesk, weight 700, letter-spacing -0.02em

Body: Inter, weight 400/500, 14px base

Data/Mono: JetBrains Mono for all numeric readouts, code snippets, IDs, and timestamps

KPI numbers: Space Grotesk weight 900, 28–36px, with a subtle text-shadow: 0 0 20px rgba(0,229,255,0.15) glow

Micro-Animations & Interactions

Every interactive surface must feel alive:

Cards: On hover, translate-y -2px with a 200ms cubic-bezier ease, border glow intensifies by 40%, and a faint box-shadow bloom appears.

Buttons: Scale 1.02 on hover, 0.98 on press, with haptic-feel transitions (150ms spring).

Page transitions: Content slides in from the right with 400ms staggered fade (each card enters 50ms after the previous).

Number counters: All KPI values animate from 0 to their real value using a 1.2s ease-out counter animation on mount.

Loading skeletons: Shimmer effect using a diagonal gradient sweep, not boring pulsing rectangles.

Data tables: Rows enter with a subtle slide-up from 10px below, staggered by 30ms.

Sidebar nav: Active item has a glowing left border (3px, accent cyan) with a 200ms slide transition when switching pages.

Charts: All chart elements animate in with D3-style transitions — bars grow upward, lines draw themselves, pie slices fan out.

Spacing & Grid

8px base unit (spacing-2, spacing-4, spacing-6, spacing-8)

Cards use 16px internal padding, 12px gap between cards

Responsive breakpoints: mobile (<768), tablet (768–1280), desktop (>1280), ultrawide (>1920)

On ultrawide, the dashboard uses a 4-column KPI row and a 3-column chart grid

3. Layout Architecture

Global Shell

Left Sidebar (240px collapsed to 64px icon-only mode):

Digital CISO logo + wordmark at top (collapses to just the shield icon)

Navigation sections separated by subtle 1px dividers with uppercase 10px tracking-widest section labels

Active page highlighted with cyan left-border glow + semi-transparent cyan background

Bottom of sidebar: User avatar circle + name + "Settings" gear icon

Top Navbar (56px height):

Breadcrumb trail (e.g., Dashboard → Findings → Detail)

Global search bar (⌘K shortcut, opens a command palette modal)

Theme toggle (sun/moon pill)

Notification bell with red badge count

User avatar dropdown (Profile, API Keys, Logout)

Main Content Area: Scrollable, padded 24px on desktop, 16px on mobile

4. Navigation Structure

Dashboard (home)

├── SECURITY

│   ├── Findings (filterable data table with severity chips)

│   ├── Compliance (framework cards with progress rings)

│   └── Attack Paths (graph visualization)

├── AI SECURITY

│   ├── NEXUS AI (the AI Advisor chat interface)

│   ├── Decision Log (audit table of all AI decisions)

│   └── AI Settings (API key configuration)

├── INFRASTRUCTURE

│   ├── Scans (scan jobs table with status pills)

│   ├── Resources (cloud resource inventory)

│   └── Cloud Providers (connected cloud accounts)

├── REPORTING

│   └── Reports (export & download center)

└── ADMINISTRATION

    ├── Users & Roles (RBAC management)

    ├── Integrations (S3, Jira, Security Hub)

    └── Profile (user settings, change password)

5. The Three AI Models — Naming & Architecture

The platform's AI engine is called NEXUS and consists of three distinct neural subsystems:

🔮 SPECTRA — The Analyzer

Full name: SPECTRA Neural Threat Analysis Engine
Role: Ingests raw security findings, cloud resource data, and compliance scan results. Runs classification, correlation, and pattern recognition. Produces structured threat intelligence: domain classification, exposure mapping, root cause analysis, attack scenarios, and risk scoring.
Powered by: Local LLM (runs on your infrastructure — zero data leaves your environment).
Visual identity: Electric violet #7B61FF accent, a spectral-wave icon (overlapping sine waves forming an eye shape).
Dashboard presence: Shown as "SPECTRA Analysis" with a violet glow ring and confidence percentage.

🧠 AEGIS — The Decision Maker

Full name: AEGIS Autonomous Decision Intelligence
Role: Receives SPECTRA's analysis output and produces actionable security decisions: remediate now, investigate, escalate, accept risk, monitor, etc. Assigns priority levels (P1–P4), calculates SLA deadlines, recommends ownership, and correlates related findings into incident clusters.
Powered by: Local LLM (no external API calls).
Visual identity: Electric cyan #00E5FF accent, a brain-shield icon (brain outline inside a shield silhouette).
Dashboard presence: Shown as "AEGIS Decision" with priority badge and decision type chip.

⚡ PHANTOM — The Executor

Full name: PHANTOM Remediation Execution Engine
Role: Takes AEGIS decisions that have been human-approved and executes remediation actions, generates IaC patches, creates Jira tickets, triggers rescans, and verifies remediation success. This is the only component that interfaces with external systems.
Powered by: Claude API (Anthropic). By default, uses the platform's built-in Claude API key. Users can optionally provide their own Claude API key in Settings → AI Configuration, so all execution runs through their own account.
Visual identity: Hot coral #FF3D71 accent, a lightning bolt inside a ghost/phantom silhouette icon.
Dashboard presence: Shown as "PHANTOM Execution" with status pills (Queued, Executing, Completed, Failed).

AI Settings Page

A dedicated /ai/settings page with three horizontal cards — one for each AI model:

SPECTRA: Status indicator (Local LLM ● Connected), model version display, last analysis timestamp.

AEGIS: Status indicator, decision accuracy metrics, total decisions count.

PHANTOM: A text input field for "Claude API Key" with a reveal/hide toggle, a "Test Connection" button, and a fallback notice: "When no key is provided, the platform's default key is used." Show key status: ✓ Custom key active / ⓘ Using platform default.

6. Page-by-Page Feature Specification

Dashboard (/)

The command center. Everything a CISO needs at a glance:

Row 1 — Executive KPI Cards (4 columns):

Security Posture Score — large circular gauge (0–100) with animated fill arc, color shifts from red→amber→green. Shows trend arrow (↑↓) vs last period.

Connected Clouds — count of active cloud provider connections, with tiny provider logos (AWS/Azure/GCP/K8s).

Compliance Frameworks — count of active frameworks, with a mini sparkline of compliance trend.

Open Findings — count with severity breakdown mini-bar (Critical/High/Med/Low colored segments).

Row 2 — Scope Filter Bar: A sleek horizontal control bar for filtering all dashboard widgets by: Cloud Provider, Account/Subscription, Region, Provider Group. Filters apply globally.

Row 3 — Charts Matrix (3 columns):

Threat Score Gauge — large semi-circular arc gauge showing overall threat score (0–100) with animated needle.

Findings by Status — donut chart (PASS/FAIL/MUTED) with interactive legend.

Risk Severity Distribution — horizontal stacked bar chart showing Critical/High/Medium/Low/Informational counts.

Row 4 — Resources Inventory: A horizontal bar chart showing resource counts by cloud service (EC2, S3, IAM, RDS, etc.) with interactive tooltips.

Row 5 — Watchlists & Attack Surface (2 columns):

Left: Two stacked watchlist cards — "Compliance Watchlist" (top 5 frameworks by failure rate) and "Service Watchlist" (top 5 most vulnerable services).

Right: Attack Surface heatmap (world map with threat density dots) + Severity Over Time line chart.

Row 6 — NEXUS AI Command Center: A compact widget showing:

6 status cards in a 3×2 grid: Immediate Action, Needs Investigation, SLA Breached, Awaiting Review, Risk Accepted, Verification Pending — each with icon, count, and accent color.

Below: "Recent AI Recommendations" table showing the top 5 AI-triaged findings with risk score badge, priority pill, decision chip, and a "Review" action button.

Row 7 — Security Radar: A full-width radar/spider chart showing the organization's security posture across the Top 5 compliance frameworks (e.g., CIS Benchmark, SOC 2, ISO 27001, NIST 800-53, PCI-DSS). Each axis represents a framework, the filled area shows current compliance percentage. On hover, each axis expands a tooltip with: framework name, pass %, fail count, and trend. This chart should animate its fill area on mount with a sweeping clockwise reveal. Use a gradient fill from rgba(0,229,255,0.08) to rgba(123,97,255,0.15) with a glowing border line.

Findings (/findings)

Advanced filterable data table with: provider, severity, status, region, service, resource type, category, scan date, and free-text search.

Each row shows: finding name, severity chip (color-coded), status pill, resource identifier, cloud provider icon, region tag.

Expandable row reveals: full finding detail, remediation guidance, and "Ask NEXUS AI" quick action button.

Bulk actions: mute, unmute, export, create alert.

Compliance (/compliance)

Grid of compliance framework cards, each showing: framework logo/icon, name, version, compliance percentage as a progress ring, pass/fail/manual counts.

Click into a framework for drill-down: requirement tree with pass/fail status at each node.

Cross-provider comparison tab for enterprise view.

Attack Paths (/attack-paths)

Interactive graph visualization showing chains of exploitable misconfigurations.

Nodes represent resources, edges represent attack relationships.

Critical paths highlighted in red with animated pulse.

NEXUS AI Chat (/ai/advisor)

Full-height chat interface with message bubbles.

Provider selector pills at the top (All, AWS, Azure, GCP, K8s, GitHub, M365).

Suggested question chips for empty state.

Responses include: structured answer, referenced findings with clickable links, and confidence ring indicator.

Shows which NEXUS subsystem (SPECTRA/AEGIS) contributed to the response.

Decision Log (/ai/decisions)

Full audit trail table of all AI decisions.

Stats row: Total Decisions, Awaiting Review, Approved, Verified.

Each row: finding name, risk score badge, decision type chip, priority pill, SLA deadline, review status, reviewer name.

Click a row to open the Human-In-The-Loop Review Panel: shows full SPECTRA analysis, AEGIS decision with rationale, and approve/reject/modify actions.

AI Settings (/ai/settings)

Three model cards side by side:

SPECTRA: Status, model info, analysis count

AEGIS: Status, decision accuracy, decision count

PHANTOM: Status, Claude API Key input, test connection button, usage stats

Scans (/scans)

Table of scan jobs with: scan ID, provider, status (Running/Completed/Failed/Scheduled), start time, duration, resource count, finding count.

"Launch Scan" button opens a modal to select provider and configuration.

Scheduled scans tab for recurring scan management.

Resources (/resources)

Inventory table of all cloud resources discovered across scans.

Filterable by: provider, service, region, resource type.

Each row shows: resource UID, type icon, provider logo, region, tags count.

Cloud Providers (/providers)

Card grid showing each connected cloud account.

Each card: provider logo, account alias, connection status (green dot = connected, red = disconnected), last scan date, resource count.

"Add Provider" button opens a multi-step wizard (select provider type → enter credentials → test connection → save).

Users & Roles (/users)

User management table with: email, name, role, last login, status.

Role-based access control with predefined roles (Admin, Member, Viewer).

Invite user modal.

Profile (/profile)

User details: name, email, company.

Change password form.

Session management.

Reports (/reports)

Report generation center.

Select framework, date range, and format (PDF, CSV, JSON).

Download history table.

Integrations (/integrations)

Integration cards: Amazon S3 (findings export), Jira (ticket creation), AWS Security Hub (bi-directional sync).

Each card: logo, status, configuration button.

7. Authentication

Sign-In Page (/sign-in)

Centered card on a dark background with subtle animated particle mesh (like a constellation slowly rotating).

Digital CISO logo + tagline at top.

Email + password fields with floating labels.

"Sign In" button with cyan gradient.

"Forgot password?" link below.

Social OAuth options (Google, GitHub) as secondary buttons with provider logos.

"Don't have an account? Sign Up" link.

Sign-Up Page (/sign-up)

Same layout as sign-in but with: name, email, password, confirm password fields.

Password strength indicator bar.

8. Tech Stack Requirements

Framework: Next.js 16 with App Router and Turbopack

Styling: Tailwind CSS 4 with a custom design token system

Charts: Recharts or D3.js for all visualizations (radar, donut, bar, line, gauge, scatter, sankey, map)

State Management: Zustand 5

Authentication: NextAuth.js

Icons: Lucide React

Fonts: Space Grotesk + Inter + JetBrains Mono (Google Fonts)

Animations: Framer Motion for page transitions and micro-interactions

Tables: TanStack Table v8

9. Critical Design Rules

NO flat, boring cards. Every surface has depth — subtle gradients, glass effects, border glows.

NO default browser fonts. Always Space Grotesk / Inter / JetBrains Mono.

NO static numbers. All counts animate on mount.

NO instant page loads. Content staggers in with orchestrated animations.

NO generic color schemes. Every accent color is intentional and domain-mapped.

The Security Radar chart on the dashboard is MANDATORY — it's the visual centerpiece.

NEXUS AI section must feel distinct — it's the premium differentiator. Give it a faint holographic shimmer effect on its container borders.

Every page must feel like it was designed by a team that obsesses over cybersecurity aesthetics. If any page looks like a generic admin template, start over.

10. Summary

Digital CISO is a next-generation cloud security platform that combines real-time security assessment with a three-part AI engine (SPECTRA → AEGIS → PHANTOM) to automate the entire lifecycle from discovery to remediation. The frontend must feel like stepping into a high-tech security operations center — dark, precise, beautiful, and unmistakably premium. Every pixel should communicate trust, intelligence, and control.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/849dc82c-9196-4e28-81ef-3b61f0e632af).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

// tiny-session-keeper: a persistent browser session an agent can trust.
// Fake browser, fake clock, fake sites. No API key. No network.

type Clock = { now: number };
const clock: Clock = { now: 0 };
const MIN = 60_000;
const at = () => `t+${String(Math.round(clock.now / MIN)).padStart(2, "0")}m`;

type Tab = { conversation: string; url: string };

class FakeBrowser {
  readonly id: string;
  cookies = new Map<string, string>(); // site -> session cookie
  tabs = new Map<string, Tab>(); // conversation -> active tab
  lastUsed: number;
  alive = true;
  constructor(id: string) {
    this.id = id;
    this.lastUsed = clock.now;
  }
}

// Every login, with who did it and when.
type Login = { site: string; by: string; at: number };

type Grant = { conversation: string; site: string };

type Ensure = { browser: FakeBrowser; restarted: boolean; lost: string[] };

class SessionKeeper {
  private browser: FakeBrowser | null = null;
  private count = 0;
  logins: Login[] = [];

  constructor(
    private idleMs: number,
    private grants: Grant[],
  ) {}

  // Call this at the start of every turn. Never assume the old browser.
  ensure(): Ensure {
    const b = this.browser;
    const idle = b ? clock.now - b.lastUsed : 0;
    if (b && b.alive && idle <= this.idleMs) {
      b.lastUsed = clock.now;
      return { browser: b, restarted: false, lost: [] };
    }
    const lost = b ? [...b.cookies.keys()].map((s) => `login:${s}`) : [];
    if (b) lost.push(...[...b.tabs.keys()].map((c) => `tab:${c}`));
    this.count += 1;
    this.browser = new FakeBrowser(`browser-${this.count}`);
    if (b) this.logins = []; // the old login state is gone
    return { browser: this.browser, restarted: b !== null, lost };
  }

  tab(conversation: string, url?: string): Tab {
    const b = this.browser!;
    const existing = b.tabs.get(conversation);
    if (existing && !url) return existing;
    const t = { conversation, url: url ?? "about:blank" };
    b.tabs.set(conversation, t);
    return t;
  }

  logIn(conversation: string, site: string): void {
    this.browser!.cookies.set(site, `sess-${site}-${clock.now}`);
    this.logins.push({ site, by: conversation, at: clock.now });
  }

  // Cookies are shared inside the browser. Permission should not be.
  mayUseLogin(conversation: string, site: string): string | null {
    if (!this.browser!.cookies.has(site)) return `not logged in to ${site}`;
    const ok = this.grants.some((g) => g.conversation === conversation && g.site === site);
    if (!ok) {
      const owner = this.logins.find((l) => l.site === site)?.by ?? "unknown";
      return `${conversation} has no grant for ${site} (login belongs to ${owner})`;
    }
    return null;
  }

  // Run from a scheduled task. Reclaim browsers nobody is using.
  sweep(): string | null {
    const b = this.browser;
    if (b && b.alive && clock.now - b.lastUsed > this.idleMs) {
      b.alive = false;
      return `${b.id} idle ${Math.round((clock.now - b.lastUsed) / MIN)}m, closed`;
    }
    return null;
  }

  crash(): void {
    if (this.browser) this.browser.alive = false;
  }
}

type Step = {
  minute: number;
  conversation: string;
  action: "open" | "login" | "act" | "sweep" | "crash";
  site?: string;
  note?: string;
  assumesLogin?: boolean;
};

function runTurn(k: SessionKeeper, s: Step): void {
  clock.now = s.minute * MIN;
  if (s.action === "sweep") {
    console.log(`${at()} [SWEEP] ${k.sweep() ?? "nothing idle"}`);
    return;
  }
  if (s.action === "crash") {
    k.crash();
    console.log(`${at()} [CRASH] browser died (simulated)`);
    return;
  }
  const { browser, restarted, lost } = k.ensure();
  const head = `${at()} ${s.conversation.padEnd(8)}`;
  if (restarted) {
    console.log(`${head} [RESTART] ${browser.id} restarted: true, lost ${lost.join(", ") || "nothing"}`);
  }
  const site = s.site!;
  if (s.action === "open") {
    k.tab(s.conversation, `https://${site}/`);
    console.log(`${head} [OPEN ] ${site} in ${browser.id}`);
    return;
  }
  if (s.action === "login") {
    k.tab(s.conversation, `https://${site}/login`);
    k.logIn(s.conversation, site);
    console.log(`${head} [LOGIN] ${site} (${s.note ?? "human finished sign-in"})`);
    return;
  }
  // act: a side effect that needs a logged-in session
  const why = k.mayUseLogin(s.conversation, site);
  if (why && restarted && s.assumesLogin) {
    console.log(`${head} [STOP ] ${s.note}: plan assumed a login that no longer exists. Ask a human to sign in again.`);
    return;
  }
  if (why) {
    console.log(`${head} [BLOCK] ${s.note}: ${why}`);
    return;
  }
  k.tab(s.conversation);
  console.log(`${head} [ACT  ] ${s.note} on ${site} (tab kept, ${browser.id})`);
}

function demo(title: string, k: SessionKeeper, steps: Step[]): void {
  console.log(`\n=== ${title} ===`);
  for (const s of steps) runTurn(k, s);
}

const grants: Grant[] = [{ conversation: "billing", site: "billing.example" }];

demo("Demo 1: one login, two conversations", new SessionKeeper(10 * MIN, grants), [
  { minute: 0, conversation: "billing", action: "login", site: "billing.example" },
  { minute: 4, conversation: "billing", action: "act", site: "billing.example", note: "download September invoice" },
  { minute: 6, conversation: "research", action: "open", site: "docs.example" },
  { minute: 7, conversation: "research", action: "act", site: "billing.example", note: "export customer list" },
  { minute: 9, conversation: "billing", action: "act", site: "billing.example", note: "update card on file" },
]);

demo("Demo 2: the browser does not wait for you", new SessionKeeper(10 * MIN, grants), [
  { minute: 0, conversation: "billing", action: "login", site: "billing.example" },
  { minute: 3, conversation: "billing", action: "act", site: "billing.example", note: "download September invoice" },
  { minute: 15, conversation: "ops", action: "sweep" },
  { minute: 18, conversation: "billing", action: "act", site: "billing.example", note: "submit refund", assumesLogin: true },
  { minute: 19, conversation: "billing", action: "login", site: "billing.example", note: "human signed in again" },
  { minute: 20, conversation: "billing", action: "act", site: "billing.example", note: "submit refund" },
  { minute: 22, conversation: "ops", action: "crash" },
  { minute: 23, conversation: "billing", action: "act", site: "billing.example", note: "check refund status", assumesLogin: true },
]);

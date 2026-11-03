import * as React from "react";
import {
  Body, Button, Container, Head, Hr, Html, Link, Preview, Section, Text,
} from "@react-email/components";

// Light-mode values are inlined (Outlook/Gmail strip <style> in places); the <style> block
// re-skins the same elements for clients that honour prefers-color-scheme (Apple Mail, iOS, Gmail app).
const DARK_CSS = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .bg { background-color: #0a0a0f !important; }
    .card { background-color: #14141c !important; border-color: #2a2a37 !important; }
    .inner { background-color: #1b1b26 !important; }
    .text { color: #f4f4f8 !important; }
    .muted { color: #9a9ab0 !important; }
    .rule { border-color: #2a2a37 !important; }
    .btn { background-color: #7c8cff !important; color: #0a0a0f !important; }
    .good { background-color: #0f2a1d !important; color: #5ee2a0 !important; }
    .warn { background-color: #2f2410 !important; color: #ffc46b !important; }
    .bad { background-color: #3a1417 !important; color: #ff8a93 !important; }
  }
`;

export const colors = {
  bg: "#f4f4f7", card: "#ffffff", border: "#e6e6ee", inner: "#f7f7fb",
  text: "#14141c", muted: "#6b6b80", brand: "#4f46e5",
};

type Props = {
  preview: string;
  children: React.ReactNode;
  unsubscribeUrl?: string;
  /** Short reason shown in the footer, e.g. "You're receiving this because you booked a trip." */
  reason?: string;
};

export function EmailLayout({ preview, children, unsubscribeUrl, reason }: Props) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{DARK_CSS}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body className="bg" style={{ backgroundColor: colors.bg, margin: 0, padding: "24px 12px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto" }}>
          <Text className="text" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: colors.text, margin: "0 0 12px 4px" }}>
            ✈︎ Flight<span style={{ color: colors.brand }}>Hotel</span>
          </Text>
          <Section className="card" style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: "28px 24px" }}>
            {children}
          </Section>
          <Section style={{ padding: "16px 8px" }}>
            <Text className="muted" style={{ fontSize: 12, lineHeight: "18px", color: colors.muted, margin: 0 }}>
              {reason ?? "You're receiving this because of activity on your Flight Hotel account."}
              {unsubscribeUrl ? (
                <>
                  {" "}
                  <Link href={unsubscribeUrl} style={{ color: colors.muted, textDecoration: "underline" }}>Unsubscribe</Link>
                </>
              ) : null}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text" style={{ fontSize: 22, lineHeight: "28px", fontWeight: 700, letterSpacing: "-0.02em", color: colors.text, margin: "0 0 8px" }}>
      {children}
    </Text>
  );
}

export function P({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <Text className={muted ? "muted" : "text"} style={{ fontSize: 15, lineHeight: "22px", color: muted ? colors.muted : colors.text, margin: "0 0 12px" }}>
      {children}
    </Text>
  );
}

export function Cta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      href={href}
      className="btn"
      style={{ backgroundColor: colors.brand, color: "#ffffff", fontSize: 15, fontWeight: 600, borderRadius: 10, padding: "13px 22px", textDecoration: "none", display: "inline-block" }}
    >
      {children}
    </Button>
  );
}

export function Panel({ children }: { children: React.ReactNode }) {
  return (
    <Section className="inner" style={{ backgroundColor: colors.inner, borderRadius: 12, padding: "14px 16px", margin: "12px 0" }}>
      {children}
    </Section>
  );
}

export function Pill({ tone, children }: { tone: "good" | "warn" | "bad"; children: React.ReactNode }) {
  const t = {
    good: { bg: "#e3f7ec", fg: "#12683f" },
    warn: { bg: "#fff1d9", fg: "#8a5a00" },
    bad: { bg: "#fde5e7", fg: "#a3202c" },
  }[tone];
  return (
    <Text className={tone} style={{ display: "inline-block", backgroundColor: t.bg, color: t.fg, fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "4px 10px", margin: "0 0 10px", letterSpacing: "0.02em" }}>
      {children}
    </Text>
  );
}

export function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "2px 0" }}>
      <tbody>
        <tr>
          <td className="muted" style={{ fontSize: 13, color: colors.muted, padding: "3px 0" }}>{label}</td>
          <td className="text" align="right" style={{ fontSize: 14, fontWeight: 600, color: colors.text, padding: "3px 0" }}>{value}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function Rule() {
  return <Hr className="rule" style={{ borderColor: colors.border, margin: "18px 0" }} />;
}

/** Route headline: "JFK ─✈─ LHR" with local times underneath. Safe in table-only email clients. */
export function RouteRow(p: { from: string; to: string; departLabel: string; arriveLabel: string; meta?: string }) {
  return (
    <table width="100%" role="presentation" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td className="text" style={{ fontSize: 22, fontWeight: 700, color: colors.text, letterSpacing: "0.02em" }}>{p.from}</td>
          <td className="muted" align="center" style={{ fontSize: 12, color: colors.muted }}>{p.meta ?? "→"}</td>
          <td className="text" align="right" style={{ fontSize: 22, fontWeight: 700, color: colors.text, letterSpacing: "0.02em" }}>{p.to}</td>
        </tr>
        <tr>
          <td className="muted" style={{ fontSize: 12, color: colors.muted }}>{p.departLabel}</td>
          <td />
          <td className="muted" align="right" style={{ fontSize: 12, color: colors.muted }}>{p.arriveLabel}</td>
        </tr>
      </tbody>
    </table>
  );
}

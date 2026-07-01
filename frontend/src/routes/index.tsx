import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Wallet,
  Cpu,
  Receipt,
  ShieldCheck,
  Leaf,
  Activity,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import heroImg from "@/assets/branding-hero.jpg";
import chainImg from "@/assets/chain-pattern.jpg";
import evImg from "@/assets/ev-charging.jpg";
import aiImg from "@/assets/ai-pricing.jpg";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ParkChain Nexus — Blockchain-verified smart parking" },
      {
        name: "description",
        content:
          "Connect your wallet, reserve parking on-chain, pay with verifiable AI pricing, and earn green credits. Live on Polygon Amoy.",
      },
      { property: "og:title", content: "ParkChain Nexus" },
      {
        property: "og:description",
        content: "Blockchain-verified smart parking powered by AI.",
      },
    ],
  }),
  component: BrandingPage,
});

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

function BrandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <HowItWorks />
      <Features />
      <AiSection />
      <EvSection />
      <Cta />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-accent glow-brand" />
          <span className="font-semibold tracking-tight">ParkChain Nexus</span>
        </Link>
        <nav className="ml-8 hidden gap-6 text-sm text-muted-foreground md:flex">
          <a href="#how" className="hover:text-foreground">
            How it works
          </a>
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <a href="#ai" className="hover:text-foreground">
            AI pricing
          </a>
          <a href="#ev" className="hover:text-foreground">
            EV credits
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Launch app <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-20">
      <div
        className="absolute inset-0 -z-10 opacity-50"
        style={{
          backgroundImage: `url(${heroImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/70 to-background" />
      <div className="absolute inset-0 -z-10 grid-bg opacity-30" />

      <div className="mx-auto max-w-7xl px-4 py-24 sm:py-32">
        <motion.div {...fadeUp} className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-foreground">
            <span className="inline-block h-2 w-2 animate-chain-pulse rounded-full bg-accent" />
            Live on Polygon Amoy
          </span>
          <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight sm:text-7xl">
            Smart parking,{" "}
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              verified on-chain.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            ParkChain Nexus pairs Polygon smart contracts with an AI pricing oracle to give drivers,
            lot owners and EVs a tamper-proof parking network — with no double-booking, verifiable
            rates, trust scores, and green credits.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 glow-brand"
            >
              <Wallet className="h-4 w-4" /> Connect wallet
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold hover:bg-accent/10"
            >
              See how it works
            </a>
          </div>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-6 text-sm">
            {[
              { k: "Contracts", v: "5 deployed" },
              { k: "Network", v: "Polygon Amoy" },
              { k: "AI", v: "Commit / Reveal" },
            ].map((s) => (
              <div key={s.k}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.k}</div>
                <div className="mt-1 font-semibold">{s.v}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <FloatingHexes />
    </section>
  );
}

function FloatingHexes() {
  const items = [
    { x: "10%", y: "20%", d: 0 },
    { x: "85%", y: "30%", d: 0.6 },
    { x: "70%", y: "75%", d: 1.2 },
    { x: "20%", y: "70%", d: 1.8 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {items.map((it, i) => (
        <motion.div
          key={i}
          className="absolute h-16 w-16 rounded-2xl border border-accent/30 bg-accent/5 backdrop-blur"
          style={{ left: it.x, top: it.y }}
          animate={{ y: [0, -14, 0] }}
          transition={{ duration: 6, repeat: Infinity, delay: it.d, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: Wallet,
      t: "Connect wallet",
      d: "MetaMask + Polygon Amoy. Sign in with a wallet signature.",
    },
    {
      icon: Receipt,
      t: "Reserve on-chain",
      d: "Pick a lot & slot. reserveSlot() runs from your wallet — no double-booking.",
    },
    {
      icon: Cpu,
      t: "AI commits price",
      d: "Backend commits inputs hash, calls Mistral, then reveals price on-chain.",
    },
    {
      icon: Activity,
      t: "Park & settle",
      d: "Entry, live timer, exit, escrow release. Every step recorded as events.",
    },
    {
      icon: ShieldCheck,
      t: "Trust + Green",
      d: "Clean sessions raise your SBT trust score. EV stays mint green credits.",
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-7xl px-4 py-24">
      <motion.div {...fadeUp} className="mb-12 max-w-2xl">
        <h2 className="text-3xl font-bold sm:text-4xl">How it works</h2>
        <p className="mt-3 text-muted-foreground">
          Five steps. Every one is either a smart contract call or a backend-verified event.
        </p>
      </motion.div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {steps.map((s, i) => (
          <motion.div
            key={s.t}
            {...fadeUp}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="glass rounded-2xl p-5"
          >
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <s.icon className="h-5 w-5" />
            </div>
            <div className="text-xs font-mono text-muted-foreground">Step {i + 1}</div>
            <div className="mt-1 text-lg font-semibold">{s.t}</div>
            <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: ShieldCheck,
      t: "No double-booking",
      d: "Reservations are mutex'd by the ParkingSessionManager contract.",
    },
    {
      icon: Cpu,
      t: "Verifiable AI pricing",
      d: "Commit-reveal proves prices weren't tampered with after the fact.",
    },
    {
      icon: Receipt,
      t: "Immutable receipts",
      d: "Every session has a chain timeline anyone can audit on Polygonscan.",
    },
    {
      icon: ShieldCheck,
      t: "Trust SBT",
      d: "Soulbound score (out of 1000) rewards clean drivers and gates premium slots.",
    },
    {
      icon: Leaf,
      t: "Green credits",
      d: "EV charging mints ERC-20 green credits — redeem for parking discounts.",
    },
    {
      icon: Activity,
      t: "Live visualizer",
      d: "WebSocket feed renders pending and confirmed txs in real time.",
    },
  ];
  return (
    <section id="features" className="relative isolate border-y border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-24">
        <motion.div {...fadeUp} className="mb-12 max-w-2xl">
          <h2 className="text-3xl font-bold sm:text-4xl">Built for trust</h2>
          <p className="mt-3 text-muted-foreground">
            Every piece of the experience is anchored to a contract event or backend-verified
            record.
          </p>
        </motion.div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.t}
              {...fadeUp}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group rounded-2xl border border-border bg-card p-6 transition-shadow hover:glow-brand"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-lg font-semibold">{f.t}</div>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AiSection() {
  return (
    <section id="ai" className="mx-auto max-w-7xl px-4 py-24">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <motion.div {...fadeUp}>
          <h2 className="text-3xl font-bold sm:text-4xl">AI that you can verify</h2>
          <p className="mt-4 text-muted-foreground">
            ParkChain commits a hash of every pricing input <em>before</em> the AI runs and reveals
            the price on-chain after. No mystery surge pricing. Sources are clearly labelled —
            Mistral or fallback.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Commit hash anchored to ParkingSessionManager",
              "Price-per-minute, surge multiplier and rationale shown to the driver",
              "Mistral fallback indicated when the LLM is unavailable",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-accent" /> {x}
              </li>
            ))}
          </ul>
        </motion.div>
        <motion.div {...fadeUp} className="relative">
          <img
            src={aiImg}
            alt="AI pricing oracle illustration"
            width={1280}
            height={800}
            loading="lazy"
            className="rounded-2xl border border-border shadow-2xl"
          />
          <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-tr from-primary/20 to-accent/20 blur-3xl" />
        </motion.div>
      </div>
    </section>
  );
}

function EvSection() {
  return (
    <section id="ev" className="relative isolate overflow-hidden border-t border-border">
      <div
        className="absolute inset-0 -z-10 opacity-30"
        style={{
          backgroundImage: `url(${chainImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 -z-10 bg-background/70" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 lg:grid-cols-2">
        <motion.div {...fadeUp} className="order-2 lg:order-1">
          <img
            src={evImg}
            alt="EV charging green credits"
            width={1280}
            height={800}
            loading="lazy"
            className="rounded-2xl border border-border shadow-2xl"
          />
        </motion.div>
        <motion.div {...fadeUp} className="order-1 lg:order-2">
          <h2 className="text-3xl font-bold sm:text-4xl">Drive electric. Earn green.</h2>
          <p className="mt-4 text-muted-foreground">
            Use an EV slot and you mint <strong>GreenCreditToken</strong> automatically. Redeem
            credits later for parking discounts — the whole flow is on-chain.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 text-sm text-accent">
            <Leaf className="h-4 w-4" /> 1 EV session ≈ 1 GREEN
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-24">
      <motion.div
        {...fadeUp}
        className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-card to-accent/15 p-10 text-center"
      >
        <h3 className="text-3xl font-bold sm:text-4xl">Park on the chain.</h3>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Connect MetaMask, switch to Polygon Amoy and run the full demo flow in under two minutes.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 glow-brand"
          >
            <Wallet className="h-4 w-4" /> Launch the app
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-5 w-5 rounded bg-gradient-to-br from-primary to-accent" />
          ParkChain Nexus · Polygon Amoy
        </div>
        <a
          href="https://amoy.polygonscan.com"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          View on Polygonscan ↗
        </a>
      </div>
    </footer>
  );
}

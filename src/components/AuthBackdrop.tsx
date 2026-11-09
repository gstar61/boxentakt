"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Full-screen animated background for login, signup and other standalone pages.
 * Dark theme: night sky with twinkling stars in three depth layers, occasional shooting stars and slight parallax.
 * Light theme: slowly swaying silk threads. Static frame when the user prefers reduced motion; pauses in hidden tabs.
 */
export function AuthBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const root = document.documentElement;
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDark = () => root.dataset.theme === "dark" || (root.dataset.theme !== "light" && darkQuery.matches);
    const cssColor = (name: string) => getComputedStyle(root).getPropertyValue(name).trim() || "#14d39a";

    let w = 0, h = 0, dpr = 1, raf = 0, last = 0, dark = isDark(), accent = cssColor("--color-accent");
    let stars: { x: number; y: number; r: number; a: number; tw: number; ph: number; layer: number }[] = [];
    let shooters: { x: number; y: number; vx: number; vy: number; life: number; max: number }[] = [];
    let nextShot = 2500;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // star density follows the screen size: fewer on phones
      const count = Math.round(Math.min(260, (w * h) / 4800));
      stars = Array.from({ length: count }, () => {
        const layer = Math.random() < 0.6 ? 0 : Math.random() < 0.75 ? 1 : 2;
        return { x: Math.random() * w, y: Math.random() * h, r: [0.6, 1, 1.5][layer] * rand(0.7, 1.2), a: rand(0.35, 0.9), tw: rand(0.6, 1.8), ph: rand(0, Math.PI * 2), layer };
      });
    }

    function drawSky(t: number, dt: number) {
      ctx.clearRect(0, 0, w, h);
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      for (const s of stars) {
        const depth = [4, 10, 18][s.layer];
        const twinkle = calm ? 1 : 0.65 + 0.35 * Math.sin(t / 1000 * s.tw + s.ph);
        ctx.globalAlpha = s.a * twinkle;
        ctx.fillStyle = s.layer === 2 && s.ph < 0.9 ? accent : "#e2e8f0";
        ctx.beginPath();
        ctx.arc(s.x + pointer.x * depth, s.y + pointer.y * depth, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (calm) return void (ctx.globalAlpha = 1);
      nextShot -= dt;
      if (nextShot <= 0) {
        const speed = rand(0.7, 1.1) * Math.max(w, 600) / 1000; // px per ms
        const angle = rand(0.3, 0.6);
        shooters.push({ x: rand(-0.1, 0.7) * w, y: rand(-0.05, 0.35) * h, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0, max: rand(700, 1100) });
        nextShot = rand(w < 640 ? 7000 : 3500, w < 640 ? 13000 : 8000);
      }
      shooters = shooters.filter((s) => s.life < s.max);
      for (const s of shooters) {
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const fade = Math.sin(Math.PI * (s.life / s.max));
        const tail = 190;
        const len = Math.hypot(s.vx, s.vy);
        const tx = s.x - (s.vx / len) * tail, ty = s.y - (s.vy / len) * tail;
        const g = ctx.createLinearGradient(s.x, s.y, tx, ty);
        g.addColorStop(0, accent);
        g.addColorStop(1, "transparent");
        ctx.globalAlpha = fade;
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // bright head with a soft glow
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 7);
        glow.addColorStop(0, "#ffffff");
        glow.addColorStop(0.35, accent);
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const threads = Array.from({ length: 9 }, (_, i) => ({ base: 0.18 + i * 0.085, amp: rand(18, 46), f: rand(0.0018, 0.0034), s: rand(0.00012, 0.00028), ph: rand(0, 6), accent: i % 3 === 0, width: rand(0.8, 1.6) }));

    function drawSilk(t: number) {
      ctx.clearRect(0, 0, w, h);
      for (const th of threads) {
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 12) {
          const y =
            th.base * h +
            Math.sin(x * th.f + t * th.s + th.ph) * th.amp +
            Math.sin(x * th.f * 2.3 - t * th.s * 1.7 + th.ph * 2) * th.amp * 0.35 +
            pointer.y * 12;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.globalAlpha = th.accent ? 0.28 : 0.16;
        ctx.strokeStyle = th.accent ? accent : "#64748b";
        ctx.lineWidth = th.width;
        ctx.stroke();
      }
      pointer.y += (pointer.ty - pointer.y) * 0.03;
      ctx.globalAlpha = 1;
    }

    function frame(t: number) {
      const dt = last ? Math.min(t - last, 50) : 16;
      last = t;
      if (dark) drawSky(t, dt);
      else drawSilk(t);
      if (!calm) raf = requestAnimationFrame(frame);
    }

    function restart() {
      cancelAnimationFrame(raf);
      dark = isDark();
      accent = cssColor("--color-accent");
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    const onMove = (e: PointerEvent) => {
      pointer.tx = (e.clientX / w - 0.5) * 2;
      pointer.ty = (e.clientY / h - 0.5) * 2;
    };
    const onVisible = () => (document.hidden ? cancelAnimationFrame(raf) : restart());
    const ro = new ResizeObserver(() => { resize(); if (calm) restart(); });
    const mo = new MutationObserver(restart);

    resize();
    restart();
    ro.observe(canvas);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    darkQuery.addEventListener("change", restart);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      darkQuery.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_srgb,var(--color-accent)_14%,transparent),transparent_70%)]" />
      <canvas ref={ref} className="size-full" />
    </div>
  );
}

/** Centered glass card on top of the backdrop, with an optional way back (e.g. to the landing page). */
export function AuthCard({ children, className = "", back }: { children: React.ReactNode; className?: string; back?: { href: string; label: string } }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <AuthBackdrop />
      {back && (
        <Link
          href={back.href}
          className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted transition-colors hover:bg-fg/5 hover:text-fg sm:left-6 sm:top-6"
        >
          <ArrowLeft size={16} /> {back.label}
        </Link>
      )}
      <div className={`w-full rounded-[24px] border border-line bg-card/75 p-6 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)] backdrop-blur-xl sm:p-9 ${className}`}>
        {children}
      </div>
    </div>
  );
}

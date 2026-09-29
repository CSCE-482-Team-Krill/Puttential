"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Github, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { mockAuth } from "@/lib/mock-services";

export default function SignInPage() {
  const router = useRouter();
  const setUser = useAppStore((state) => state.setUser);
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const signIn = async (method: string, label: string) => { setBusy(true); setMessage(""); const user = await mockAuth.signIn(method, label); await setUser(user); setPassword(""); router.push("/profile"); };
  const submit = (event: FormEvent) => { event.preventDefault(); if (!email.includes("@")) { setMessage("Enter an email-shaped address for the demo."); return; } if (mode === "password" && !password) { setMessage("Enter any demo password. It is never sent or saved."); return; } void signIn(mode === "magic" ? "magic link demo" : "email demo", email.split("@")[0]); };
  return <div className="auth-page"><div className="auth-art"><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><span className="auth-ball" /><span className="auth-hole" /><div className="auth-art-copy"><span className="section-kicker">A NEW LINE TO THE HOLE</span><h1>Good ideas are better together.</h1><p>Explore sample standings and keep a local record of your favorite routes.</p></div></div><div className="auth-panel"><span className="eyebrow"><span className="eyebrow-dot" /> DEMO ACCOUNT</span><h2>Step onto the course.</h2><p>Choose a demo sign-in method. No provider is contacted and no real account is created.</p><div className="provider-buttons"><button disabled={busy} onClick={() => void signIn("Google demo", "Google player")}><span className="google-mark">G</span> Continue with Google <ArrowRight size={16} /></button><button disabled={busy} onClick={() => void signIn("Apple demo", "Apple player")}><span className="apple-mark">●</span> Continue with Apple <ArrowRight size={16} /></button><button disabled={busy} onClick={() => void signIn("GitHub demo", "GitHub player")}><Github size={19} /> Continue with GitHub <ArrowRight size={16} /></button></div><div className="auth-divider"><span>OR USE EMAIL IN DEMO MODE</span></div><div className="tabs auth-tabs"><button className={mode === "password" ? "active" : ""} onClick={() => setMode("password")}><LockKeyhole size={15} /> Password</button><button className={mode === "magic" ? "active" : ""} onClick={() => setMode("magic")}><Mail size={15} /> Magic link</button></div><form onSubmit={submit} className="auth-form"><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>{mode === "password" && <label>Demo password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Anything works here" autoComplete="off" required /></label>}<button disabled={busy} className="primary-button" type="submit">{busy ? "Opening demo profile…" : mode === "magic" ? "Continue with demo magic link" : "Continue with demo email"} <ArrowRight size={17} /></button></form>{message && <p className="game-message" role="alert">{message}</p>}<div className="auth-foot"><Sparkles size={16} /><span>Everything here is local and unofficial. Credentials are never verified or stored.</span></div></div></div>;
}

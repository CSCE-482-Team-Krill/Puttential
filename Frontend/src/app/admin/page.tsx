"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FilePlus2, PencilRuler, Plus, ShieldAlert } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { newAdminDraft } from "@/lib/admin";

export default function AdminPage() {
  const router = useRouter();
  const drafts = useAppStore((state) => state.adminDrafts);
  const setAdminDraft = useAppStore((state) => state.setAdminDraft);
  const list = Object.values(drafts).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const create = async () => { const draft = newAdminDraft(); await setAdminDraft(draft); router.push(`/admin/${draft.id}`); };
  return <div className="page-width content-page"><div className="page-intro admin-intro"><div><div className="eyebrow"><span className="eyebrow-dot" /> LOCAL AUTHORING DEMO</div><h1>Build the next good puzzle.</h1><p>Sketch course geometry, tune tiles, record an author layout, and preview the publication flow. Everything stays on this device.</p></div><button className="primary-button" onClick={() => void create()}><Plus size={18} /> New course</button></div><div className="info-banner admin-warning"><ShieldAlert size={19} /><span>This editor has no secure admin role, physics validation, or server publishing. “Publish locally” only changes a demo badge.</span></div><div className="section-title-row admin-list-heading"><div><span className="section-kicker">YOUR WORKSPACE</span><h2>Local drafts</h2></div><span className="count-pill">{list.length} courses</span></div>{list.length ? <div className="admin-draft-list">{list.map((draft) => <Link key={draft.id} href={`/admin/${draft.id}`} className="admin-draft-row"><span className="draft-icon"><PencilRuler size={22} /></span><span><strong>{draft.puzzle.title}</strong><small>{draft.puzzle.version_id} · Updated {new Date(draft.updated_at).toLocaleString()}</small></span><span className={draft.status === "draft" ? "draft-status" : "published-status"}>{draft.status === "draft" ? "DRAFT" : "LOCALLY PUBLISHED"}</span><ArrowRight size={18} /></Link>)}</div> : <div className="empty-history admin-empty"><FilePlus2 size={37} /><h3>The drawing board is clear.</h3><p>Start with a course template and make it your own.</p><button className="primary-button" onClick={() => void create()}>Create first draft <ArrowRight size={17} /></button></div>}</div>;
}

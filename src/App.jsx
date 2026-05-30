import { useState, useRef, useEffect } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function insertEntry(entry) {
  return sbFetch("/knowledge_base", { method: "POST", body: JSON.stringify(entry) });
}
async function fetchEntries(type = "") {
  let q = "/knowledge_base?order=created_at.desc&limit=200";
  if (type) q += `&type=eq.${type}`;
  return sbFetch(q);
}
async function deleteEntry(id) {
  return sbFetch(`/knowledge_base?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}
async function updateEntry(id, fields) {
  return sbFetch(`/knowledge_base?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(fields) });
}

async function callClaude(messages, system) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "No response";
}

async function extractMetadata(input) {
  const prompt = `Extract metadata from this content and return ONLY a JSON object, nothing else. No markdown. No explanation. Start with { and end with }.

Content: ${input}

Return exactly this structure:
{"title":"title here","url":null,"source":"source here","summary":"2-3 sentence summary","tags":["tag1","tag2"],"type":"article","content":"key points here"}

Type must be one of: article, tool, newsletter, video, paper, other`;

  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  const raw = data.content?.[0]?.text || "{}";

  // Try to extract JSON from anywhere in the response
  const attempts = [
    raw.trim(),
    raw.replace(/```json|```/g, "").trim(),
    raw.substring(raw.indexOf("{"), raw.lastIndexOf("}") + 1),
  ];
  for (const a of attempts) {
    try { const p = JSON.parse(a); if (p && p.title) return p; } catch {}
  }
  return { title: "Untitled", summary: raw.slice(0, 300), tags: [], type: "other" };
}

const TAG_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#ec4899"];
function tagColor(tag) {
  let h = 0; for (let c of tag) h = (h * 31 + c.charCodeAt(0)) % TAG_COLORS.length; return TAG_COLORS[h];
}
function Tag({ label }) {
  return <span style={{ display:"inline-flex", background:tagColor(label)+"22", color:tagColor(label), border:`1px solid ${tagColor(label)}55`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600, letterSpacing:"0.03em", textTransform:"uppercase" }}>{label}</span>;
}
function TypeBadge({ type }) {
  const c = { article:"#3b82f6", tool:"#10b981", newsletter:"#8b5cf6", video:"#ef4444", paper:"#f59e0b", other:"#6b7280" };
  return <span style={{ background:(c[type]||"#6b7280")+"22", color:c[type]||"#6b7280", border:`1px solid ${(c[type]||"#6b7280")}44`, borderRadius:3, padding:"1px 7px", fontSize:10, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>{type}</span>;
}

// Edit Modal
function EditModal({ entry, onSave, onClose }) {
  const [form, setForm] = useState({
    title: entry.title || "",
    url: entry.url || "",
    source: entry.source || "",
    summary: entry.summary || "",
    notes: entry.notes || "",
    type: entry.type || "article",
    tags: (entry.tags || []).join(", "),
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    const updated = { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) };
    await onSave(entry.id, updated);
    onClose();
  }

  const inputStyle = { width:"100%", background:"#0a0a0f", border:"1px solid #2e2e3e", borderRadius:7, padding:"9px 12px", color:"#e8e8f0", fontSize:13, marginBottom:10 };
  const labelStyle = { fontSize:11, color:"#555", fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase", display:"block", marginBottom:4 };

  return (
    <div style={{ position:"fixed", inset:0, background:"#000000bb", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#0e0e16", border:"1px solid #2e2e3e", borderRadius:14, padding:24, width:"100%", maxWidth:560, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:16, color:"#fff" }}>Edit Entry</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#555", fontSize:20, cursor:"pointer" }}>×</button>
        </div>

        <label style={labelStyle}>Title</label>
        <input value={form.title} onChange={e => set("title", e.target.value)} style={inputStyle} />

        <label style={labelStyle}>URL</label>
        <input value={form.url} onChange={e => set("url", e.target.value)} style={inputStyle} placeholder="https://..." />

        <label style={labelStyle}>Source</label>
        <input value={form.source} onChange={e => set("source", e.target.value)} style={inputStyle} />

        <label style={labelStyle}>Type</label>
        <select value={form.type} onChange={e => set("type", e.target.value)} style={{ ...inputStyle, marginBottom:10 }}>
          {["article","tool","newsletter","video","paper","other"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <label style={labelStyle}>Summary</label>
        <textarea value={form.summary} onChange={e => set("summary", e.target.value)} style={{ ...inputStyle, minHeight:80, resize:"vertical" }} />

        <label style={labelStyle}>Tags (comma separated)</label>
        <input value={form.tags} onChange={e => set("tags", e.target.value)} style={inputStyle} placeholder="ai, tools, productivity" />

        <label style={labelStyle}>Notes</label>
        <input value={form.notes} onChange={e => set("notes", e.target.value)} style={inputStyle} />

        <div style={{ display:"flex", gap:8, marginTop:6 }}>
          <button onClick={handleSave} style={{ background:"linear-gradient(135deg,#6366f1,#a855f7)", border:"none", borderRadius:7, padding:"9px 20px", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>Save Changes</button>
          <button onClick={onClose} style={{ background:"none", border:"1px solid #2e2e3e", borderRadius:7, padding:"9px 14px", color:"#666", fontSize:13, cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("library");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [notes, setNotes] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState("");
  const [editEntry, setEditEntry] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => { loadEntries(); }, [filterType]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  async function loadEntries() {
    setLoading(true);
    try { setEntries(await fetchEntries(filterType) || []); }
    catch (e) { setError("Failed to connect: " + e.message); }
    setLoading(false);
  }

  async function handleExtract() {
    if (!input.trim()) return;
    setExtracting(true); setError("");
    try { setPreview({ ...(await extractMetadata(input)), notes }); }
    catch (e) { setError("Extraction failed: " + e.message); }
    setExtracting(false);
  }

  async function handleSave() {
    if (!preview) return;
    setLoading(true);
    try {
      await insertEntry({ ...preview, notes });
      setPreview(null); setInput(""); setNotes("");
      await loadEntries(); setTab("library");
    } catch (e) { setError("Save failed: " + e.message); }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm("Delete this entry?")) return;
    await deleteEntry(id);
    setEntries(e => e.filter(x => x.id !== id));
  }

  async function handleUpdate(id, fields) {
    await updateEntry(id, fields);
    setEntries(e => e.map(x => x.id === id ? { ...x, ...fields } : x));
  }

  async function handleChat() {
    if (!chatInput.trim()) return;
    const userMsg = { role: "user", content: chatInput };
    const newMsgs = [...chatMsgs, userMsg];
    setChatMsgs(newMsgs); setChatInput(""); setChatLoading(true);
    const q = chatInput.toLowerCase();
    const relevant = entries.filter(e => e.title?.toLowerCase().includes(q) || e.summary?.toLowerCase().includes(q) || e.tags?.some(t => t.toLowerCase().includes(q))).slice(0, 15).map(e => `TITLE: ${e.title}\nTYPE: ${e.type}\nSOURCE: ${e.source||"unknown"}\nSUMMARY: ${e.summary}\nTAGS: ${(e.tags||[]).join(", ")}\nURL: ${e.url||"N/A"}`).join("\n\n---\n\n");
    const overview = entries.slice(0, 50).map(e => `• ${e.title} (${e.type}) — ${e.summary?.slice(0,100)}`).join("\n");
    const system = `You are a personal knowledge base assistant. The user has ${entries.length} saved items.\n\nOverview:\n${overview}\n\n${relevant ? `Relevant items:\n${relevant}` : ""}`;
    try {
      const reply = await callClaude(newMsgs, system);
      setChatMsgs([...newMsgs, { role: "assistant", content: reply }]);
    } catch (e) { setChatMsgs([...newMsgs, { role: "assistant", content: "Error: " + e.message }]); }
    setChatLoading(false);
  }

  const filtered = entries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.title?.toLowerCase().includes(q) || e.summary?.toLowerCase().includes(q) || e.source?.toLowerCase().includes(q) || e.tags?.some(t => t.toLowerCase().includes(q));
  });

  return (
    <div style={{ fontFamily:"'DM Sans','Inter',sans-serif", background:"#0a0a0f", minHeight:"100vh", color:"#e8e8f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
        *{box-sizing:border-box;} ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#111} ::-webkit-scrollbar-thumb{background:#333;border-radius:3px}
        textarea,input,select,button{outline:none;font-family:inherit;}
        .ecard:hover{background:#16161e !important;}
        .ecard-actions{opacity:0;transition:opacity 0.15s;}
        .ecard:hover .ecard-actions{opacity:1;}
        @keyframes pulse{0%,80%,100%{opacity:0.2}40%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:640px){
          .header{flex-wrap:wrap;height:auto !important;padding:10px 16px !important;gap:6px;}
          .header-nav{width:100%;display:flex;justify-content:stretch;}
          .header-nav button{flex:1;text-align:center;}
          .ecard-actions{opacity:1 !important;}
        }
      `}</style>

      {editEntry && <EditModal entry={editEntry} onSave={handleUpdate} onClose={() => setEditEntry(null)} />}

      <div className="header" style={{ borderBottom:"1px solid #1e1e2e", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:54, position:"sticky", top:0, background:"#0a0a0f", zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:26, height:26, borderRadius:6, background:"linear-gradient(135deg,#6366f1,#a855f7)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>⬡</div>
          <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14, letterSpacing:"-0.01em", color:"#fff" }}>KNOWLEDGEBASE</span>
          <span style={{ background:"#1e1e2e", border:"1px solid #2e2e3e", borderRadius:10, padding:"1px 8px", fontSize:11, color:"#555" }}>{entries.length} items</span>
        </div>
        <div className="header-nav" style={{ display:"flex", gap:3 }}>
          {[["library","📚 Library"],["add","＋ Add"],["chat","✦ Chat"]].map(([t,label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ background:tab===t?"#1e1e2e":"transparent", border:tab===t?"1px solid #2e2e3e":"1px solid transparent", color:tab===t?"#e8e8f0":"#555", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:600, letterSpacing:"0.04em", textTransform:"uppercase", transition:"all 0.15s", cursor:"pointer" }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:860, margin:"0 auto", padding:"28px 20px" }}>
        {error && <div style={{ background:"#1f1014", border:"1px solid #ef444455", borderRadius:8, padding:"10px 16px", color:"#ef4444", fontSize:13, marginBottom:20, display:"flex", justifyContent:"space-between" }}><span>⚠ {error}</span><button onClick={() => setError("")} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer" }}>×</button></div>}

        {/* LIBRARY */}
        {tab === "library" && (
          <div>
            <div style={{ display:"flex", gap:10, marginBottom:18 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search titles, tags, sources..." style={{ flex:1, background:"#111118", border:"1px solid #1e1e2e", borderRadius:8, padding:"9px 14px", color:"#e8e8f0", fontSize:13 }} />
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ background:"#111118", border:"1px solid #1e1e2e", borderRadius:8, padding:"9px 12px", color:filterType?"#e8e8f0":"#555", fontSize:12 }}>
                <option value="">All types</option>
                {["article","tool","newsletter","video","paper","other"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {loading ? (
              <div style={{ textAlign:"center", padding:60, color:"#444" }}><div style={{ width:20, height:20, border:"2px solid #333", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />Loading...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, color:"#333" }}><div style={{ fontSize:30, marginBottom:10 }}>⬡</div><div style={{ fontFamily:"'Syne',sans-serif", fontSize:13 }}>No entries yet — add your first item</div></div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {filtered.map(e => (
                  <div key={e.id} className="ecard" style={{ background:"#0e0e16", border:"1px solid #1a1a28", borderRadius:10, padding:"14px 16px", transition:"background 0.15s" }}>
                    <div style={{ display:"flex", gap:12 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                          <TypeBadge type={e.type} />
                          {e.url ? <a href={e.url} target="_blank" rel="noreferrer" style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:"#c4b5fd", textDecoration:"none" }}>{e.title}</a>
                            : <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:"#e8e8f0" }}>{e.title}</span>}
                        </div>
                        {e.source && <div style={{ fontSize:11, color:"#555", marginBottom:5 }}>from {e.source}</div>}
                        {e.summary && <div style={{ fontSize:12, color:"#888", lineHeight:1.55, marginBottom:7 }}>{e.summary}</div>}
                        {e.notes && <div style={{ fontSize:11, color:"#666", fontStyle:"italic", marginBottom:7 }}>📝 {e.notes}</div>}
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{(e.tags||[]).map(t => <Tag key={t} label={t} />)}</div>
                        <div style={{ fontSize:10, color:"#2e2e3e", marginTop:8 }}>{new Date(e.created_at).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})}</div>
                      </div>
                      <div className="ecard-actions" style={{ display:"flex", flexDirection:"column", gap:4, alignSelf:"flex-start" }}>
                        <button onClick={() => setEditEntry(e)} style={{ background:"none", border:"1px solid #2e2e3e", color:"#888", borderRadius:5, padding:"3px 8px", fontSize:11, cursor:"pointer" }}>edit</button>
                        <button onClick={() => handleDelete(e.id)} style={{ background:"none", border:"1px solid #2e2e3e", color:"#555", borderRadius:5, padding:"3px 8px", fontSize:11, cursor:"pointer" }}>del</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ADD */}
        {tab === "add" && (
          <div style={{ maxWidth:660, margin:"0 auto" }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:20, marginBottom:6, color:"#fff" }}>Add to Knowledge Base</div>
            <div style={{ color:"#555", fontSize:13, marginBottom:22 }}>Paste a URL, article text, tool description, or newsletter excerpt. AI will extract and structure it automatically.</div>
            <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Paste URL, article text, tool description, newsletter excerpt..." style={{ width:"100%", minHeight:150, background:"#0e0e16", border:"1px solid #1e1e2e", borderRadius:10, padding:"14px 16px", color:"#e8e8f0", fontSize:13, lineHeight:1.6, resize:"vertical", marginBottom:10 }} />
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Personal notes (optional)..." style={{ width:"100%", background:"#0e0e16", border:"1px solid #1e1e2e", borderRadius:8, padding:"10px 14px", color:"#e8e8f0", fontSize:13, marginBottom:14 }} />
            <button onClick={handleExtract} disabled={extracting || !input.trim()} style={{ background:extracting?"#1e1e2e":"linear-gradient(135deg,#6366f1,#a855f7)", border:"none", borderRadius:8, padding:"10px 22px", color:"#fff", fontSize:13, fontWeight:600, opacity:!input.trim()?0.4:1, cursor:input.trim()?"pointer":"not-allowed" }}>
              {extracting ? "⟳ Extracting..." : "✦ Extract & Preview"}
            </button>
            {preview && (
              <div style={{ marginTop:22, background:"#0e0e16", border:"1px solid #2e2e3e", borderRadius:12, padding:20 }}>
                <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:10, color:"#444", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Preview — edit before saving</div>

                <label style={{ fontSize:11, color:"#555", display:"block", marginBottom:3 }}>TITLE</label>
                <input value={preview.title||""} onChange={e => setPreview(p=>({...p,title:e.target.value}))} style={{ width:"100%", background:"#111", border:"1px solid #2e2e3e", borderRadius:6, padding:"8px 10px", color:"#e8e8f0", fontSize:13, marginBottom:10 }} />

                <label style={{ fontSize:11, color:"#555", display:"block", marginBottom:3 }}>SOURCE</label>
                <input value={preview.source||""} onChange={e => setPreview(p=>({...p,source:e.target.value}))} style={{ width:"100%", background:"#111", border:"1px solid #2e2e3e", borderRadius:6, padding:"8px 10px", color:"#e8e8f0", fontSize:13, marginBottom:10 }} />

                <label style={{ fontSize:11, color:"#555", display:"block", marginBottom:3 }}>TYPE</label>
                <select value={preview.type||"article"} onChange={e => setPreview(p=>({...p,type:e.target.value}))} style={{ width:"100%", background:"#111", border:"1px solid #2e2e3e", borderRadius:6, padding:"8px 10px", color:"#e8e8f0", fontSize:13, marginBottom:10 }}>
                  {["article","tool","newsletter","video","paper","other"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                <label style={{ fontSize:11, color:"#555", display:"block", marginBottom:3 }}>SUMMARY</label>
                <textarea value={preview.summary||""} onChange={e => setPreview(p=>({...p,summary:e.target.value}))} style={{ width:"100%", minHeight:70, background:"#111", border:"1px solid #2e2e3e", borderRadius:6, padding:"8px 10px", color:"#e8e8f0", fontSize:13, resize:"vertical", marginBottom:10 }} />

                <label style={{ fontSize:11, color:"#555", display:"block", marginBottom:3 }}>TAGS (comma separated)</label>
                <input value={(preview.tags||[]).join(", ")} onChange={e => setPreview(p=>({...p,tags:e.target.value.split(",").map(t=>t.trim()).filter(Boolean)}))} style={{ width:"100%", background:"#111", border:"1px solid #2e2e3e", borderRadius:6, padding:"8px 10px", color:"#e8e8f0", fontSize:13, marginBottom:14 }} />

                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={handleSave} disabled={loading} style={{ background:"linear-gradient(135deg,#6366f1,#a855f7)", border:"none", borderRadius:7, padding:"9px 20px", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>{loading?"Saving...":"Save to Library"}</button>
                  <button onClick={() => setPreview(null)} style={{ background:"none", border:"1px solid #2e2e3e", borderRadius:7, padding:"9px 14px", color:"#666", fontSize:13, cursor:"pointer" }}>Discard</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CHAT */}
        {tab === "chat" && (
          <div style={{ maxWidth:660, margin:"0 auto" }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:20, marginBottom:4, color:"#fff" }}>Chat with your Knowledge Base</div>
            <div style={{ color:"#555", fontSize:13, marginBottom:18 }}>Ask anything about your saved items.</div>
            <div style={{ background:"#0a0a0f", border:"1px solid #1a1a28", borderRadius:12, minHeight:340, maxHeight:460, overflowY:"auto", padding:16, marginBottom:10, display:"flex", flexDirection:"column", gap:10 }}>
              {chatMsgs.length === 0 && <div style={{ color:"#2e2e3e", fontSize:13, textAlign:"center", marginTop:60 }}><div style={{ fontSize:26, marginBottom:8 }}>✦</div>Try: "What AI tools have I saved?" or "Summarise my newsletter items"</div>}
              {chatMsgs.map((m,i) => (
                <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                  <div style={{ maxWidth:"80%", background:m.role==="user"?"#1e1e3e":"#111118", border:`1px solid ${m.role==="user"?"#3b3b6e":"#1e1e2e"}`, borderRadius:m.role==="user"?"12px 12px 3px 12px":"12px 12px 12px 3px", padding:"10px 14px", fontSize:13, lineHeight:1.6, color:"#d0d0e0", whiteSpace:"pre-wrap" }}>{m.content}</div>
                </div>
              ))}
              {chatLoading && <div style={{ display:"flex", gap:5, padding:"8px 14px" }}>{[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:"#444", animation:`pulse 1.2s ${i*0.2}s infinite` }} />)}</div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==="Enter" && !e.shiftKey && handleChat()} placeholder="Ask about your saved articles, tools, newsletters..." style={{ flex:1, background:"#0e0e16", border:"1px solid #1e1e2e", borderRadius:8, padding:"10px 14px", color:"#e8e8f0", fontSize:13 }} />
              <button onClick={handleChat} disabled={chatLoading || !chatInput.trim()} style={{ background:"linear-gradient(135deg,#6366f1,#a855f7)", border:"none", borderRadius:8, padding:"10px 16px", color:"#fff", fontSize:14, opacity:(!chatInput.trim()||chatLoading)?0.4:1, cursor:"pointer" }}>→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

export default function SearchSelect({ options, value, onChange, placeholder = "Rechercher...", renderOption, renderValue }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  const selected = options.find(o => o.value === value);

  const filtered = options.filter(o => {
    if (!search.trim()) return true;
    return o.label?.toLowerCase().includes(search.toLowerCase()) ||
           o.sublabel?.toLowerCase().includes(search.toLowerCase());
  });

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{position:"relative",marginBottom:"16px"}}>
      {/* Trigger */}
      <div
        onClick={() => { setOpen(o => !o); setTimeout(() => ref.current?.querySelector("input")?.focus(), 50); }}
        style={{
          width:"100%", padding:"11px 13px", border:"1.5px solid var(--g4)",
          borderRadius:"8px", fontSize:"14px", background:"#fff", cursor:"pointer",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          color: selected ? "var(--g9)" : "var(--g5)",
          borderColor: open ? "var(--gm)" : "var(--g4)",
          boxShadow: open ? "0 0 0 3px rgba(34,114,58,.12)" : "none",
          transition:"border-color .15s, box-shadow .15s",
        }}
      >
        <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}
        </span>
        <span style={{color:"var(--g5)",fontSize:"12px",marginLeft:"8px",flexShrink:0}}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:"absolute", left:0, right:0, zIndex:200,
          background:"#fff", border:"1.5px solid var(--gm)", borderRadius:"10px",
          boxShadow:"0 8px 24px rgba(0,0,0,.12)", marginTop:"4px", overflow:"hidden",
        }}>
          {/* Barre de recherche */}
          <div style={{padding:"10px 12px", borderBottom:"1px solid var(--g3)", position:"sticky", top:0, background:"#fff"}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:"10px",top:"50%",transform:"translateY(-50%)",color:"var(--g5)",fontSize:"14px",pointerEvents:"none"}}>🔍</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher..."
                style={{width:"100%",padding:"8px 10px 8px 32px",border:"1px solid var(--g4)",borderRadius:"6px",fontSize:"13px",margin:0}}
                onClick={e => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Liste */}
          <div style={{maxHeight:"220px", overflowY:"auto"}}>
            {filtered.length === 0 ? (
              <div style={{padding:"16px",textAlign:"center",color:"var(--g5)",fontSize:"13px"}}>Aucun résultat</div>
            ) : filtered.map(opt => (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
                style={{
                  padding:"10px 14px", cursor:"pointer",
                  background: opt.value === value ? "var(--gl)" : "transparent",
                  borderLeft: opt.value === value ? "3px solid var(--gm)" : "3px solid transparent",
                  transition:"background .1s",
                }}
                onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = "var(--g2)"; }}
                onMouseLeave={e => { if (opt.value !== value) e.currentTarget.style.background = "transparent"; }}
              >
                {renderOption ? renderOption(opt) : (
                  <div>
                    <div style={{fontSize:"14px",fontWeight:opt.value===value?700:500,color:"var(--g9)"}}>{opt.label}</div>
                    {opt.sublabel && <div style={{fontSize:"12px",color:"var(--g5)",marginTop:"2px"}}>{opt.sublabel}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

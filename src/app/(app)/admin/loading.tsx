export default function AdminLoading() {
  return <div role="status" aria-live="polite" className="space-y-4 py-5 text-[#c4d6ee]">
    <p>Opening admin tools…</p>
    <div aria-hidden="true" className="h-36 rounded-2xl border border-[#25405e] bg-[#071a30]" />
  </div>;
}

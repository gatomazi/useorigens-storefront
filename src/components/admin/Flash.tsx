export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div className="mb-5 space-y-2" role="status" aria-live="polite">
      {ok && <p className="a-flash ok">{ok}</p>}
      {err && (
        <div className="a-flash err">
          {err.split(" | ").map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

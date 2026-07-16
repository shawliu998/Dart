export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress-wrap" aria-label={label ?? `完成度 ${value}%`}>
      <div className="progress-track"><span style={{ width: `${value}%` }} /></div>
      <strong>{value}%</strong>
    </div>
  );
}

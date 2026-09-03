export function LaytimeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="3.5" y="6.5" width="17" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 6.5v11M16 6.5v11M3.5 12h17" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3.5v3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

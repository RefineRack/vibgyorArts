"use client";

export function Summer({ talking }: { talking: boolean }) {
  return (
    <svg className={talking ? "summer-face is-talking" : "summer-face"} viewBox="0 0 80 80" aria-label="Summer">
      <defs>
        <radialGradient id="summer-glass" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f3f3f3" />
          <stop offset="100%" stopColor="#d5d5d5" />
        </radialGradient>
      </defs>
      <circle cx="40" cy="40" r="36" fill="url(#summer-glass)" stroke="#ffffff" strokeWidth="2" />
      <ellipse className="summer-eye" cx="30" cy="36" rx="3.2" ry="4.2" fill="#2c2c2c" />
      <ellipse className="summer-eye summer-eye-late" cx="50" cy="36" rx="3.2" ry="4.2" fill="#2c2c2c" />
      <path d="M40 42.5 v5" stroke="#9a9a9a" strokeWidth="1.4" strokeLinecap="round" />
      <path
        className="summer-mouth"
        d="M32 54 Q40 60 48 54"
        fill="none"
        stroke="#2c2c2c"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

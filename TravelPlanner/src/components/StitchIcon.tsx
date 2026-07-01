/** A tiny Stitch character — used to eyeball that an OTA update landed. */
export function StitchIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Stitch"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}>
      {/* ears */}
      <ellipse cx="16" cy="15" rx="7" ry="15" fill="#4FB0E5" transform="rotate(-22 16 15)" />
      <ellipse cx="48" cy="15" rx="7" ry="15" fill="#4FB0E5" transform="rotate(22 48 15)" />
      <ellipse cx="16" cy="16" rx="3" ry="9" fill="#2E7FB0" transform="rotate(-22 16 16)" />
      <ellipse cx="48" cy="16" rx="3" ry="9" fill="#2E7FB0" transform="rotate(22 48 16)" />
      {/* head */}
      <ellipse cx="32" cy="38" rx="20" ry="18" fill="#4FB0E5" />
      {/* lighter muzzle */}
      <ellipse cx="32" cy="44" rx="13" ry="11" fill="#CDE9F8" />
      {/* eyes */}
      <circle cx="25" cy="33" r="6.5" fill="#fff" />
      <circle cx="39" cy="33" r="6.5" fill="#fff" />
      <circle cx="26" cy="34" r="3.1" fill="#141414" />
      <circle cx="38" cy="34" r="3.1" fill="#141414" />
      <circle cx="27" cy="33" r="1" fill="#fff" />
      <circle cx="39" cy="33" r="1" fill="#fff" />
      {/* nose + smile */}
      <ellipse cx="32" cy="42" rx="3.2" ry="2.2" fill="#2b2b2b" />
      <path d="M25 47 Q32 53 39 47" stroke="#2b2b2b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

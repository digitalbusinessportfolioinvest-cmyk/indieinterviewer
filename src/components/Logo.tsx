/* eslint-disable @next/next/no-img-element */
export default function Logo({ href = "/", src = "/brand/horizontal_color.svg", alt = "IndieInterviewer" }: { href?: string; src?: string; alt?: string }) {
  return (
    <a href={href} className="logo" aria-label={alt}>
      <img src={src} alt={alt} />
    </a>
  );
}

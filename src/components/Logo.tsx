/* eslint-disable @next/next/no-img-element */
export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <a href={href} className="logo" aria-label="IndieInterviewer">
      <img src="/brand/horizontal_color.svg" alt="IndieInterviewer" width={240} height={38} />
    </a>
  );
}

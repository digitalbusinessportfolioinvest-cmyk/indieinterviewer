import Logo from "@/components/Logo";
export default function AdminHeader({ email }: { email: string }) {
  return (
    <div className="brand">
      <Logo href="/admin" />
      <form action="/api/auth/logout" method="post" className="row small">
        <span className="muted">{email}</span>
        <a href="/admin/passkey" className="muted">Passkeys</a>
        <button className="secondary" type="submit" style={{ padding: "4px 10px" }}>Sign out</button>
      </form>
    </div>
  );
}

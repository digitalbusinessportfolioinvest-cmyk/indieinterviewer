export default function AdminHeader({ email }: { email: string }) {
  return (
    <div className="brand">
      <a href="/admin" style={{ textDecoration: "none" }}><b>IndieInterviewer</b></a>
      <form action="/api/auth/logout" method="post" className="row small">
        <span className="muted">{email}</span>
        <a href="/admin/passkey" className="muted">Passkeys</a>
        <button className="secondary" type="submit" style={{ padding: "4px 10px" }}>Sign out</button>
      </form>
    </div>
  );
}

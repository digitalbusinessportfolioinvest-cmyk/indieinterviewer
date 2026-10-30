import Logo from "@/components/Logo";
export default function Home() {
  return (
    <main className="wrap">
      <div className="brand"><Logo /></div>
      <div className="card">
        <h1>Founder interviews</h1>
        <p className="muted">This site hosts interviews for the Indie Hustle newsletter. If you've been invited, please use the link from your invitation email.</p>
      </div>
    </main>
  );
}

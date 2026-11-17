import { Plus, ShieldCheck, BellRing, SlidersHorizontal } from 'lucide-react';

export default function Welcome({ onAdd }) {
  return (
    <section className="welcome">
      <span className="logo xl" aria-hidden />
      <h1>Every inbox, one stream.</h1>
      <p className="muted">Gmail, Outlook, Yahoo, iCloud, Proton and any IMAP server — together, filtered your way.</p>
      <button className="btn primary big" onClick={onAdd}>
        <Plus size={16} /> Add your first inbox
      </button>
      <div className="welcome-points">
        <div>
          <SlidersHorizontal size={18} />
          <strong>Rules</strong>
          <span>Sort senders into views across every account.</span>
        </div>
        <div>
          <BellRing size={18} />
          <strong>Priority alerts</strong>
          <span>Desktop notifications only for the people you pick.</span>
        </div>
        <div>
          <ShieldCheck size={18} />
          <strong>Local only</strong>
          <span>Credentials stay encrypted on this machine.</span>
        </div>
      </div>
    </section>
  );
}

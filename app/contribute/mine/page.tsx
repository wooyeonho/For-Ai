import type { Metadata } from 'next';
import { MineClient } from './MineClient';

export const metadata: Metadata = {
  title: 'My Submissions — For-Ai Fact Registry',
  description: 'Check the status of the topics, sources, and reports you have submitted to For-Ai.',
};

export default function MySubmissionsPage() {
  return (
    <main className="page-main">
      <div className="page-container">
        <div className="contribute-hero">
          <h1>My Submissions</h1>
          <p className="contribute-tagline">
            Every topic suggestion, correction report, hallucination report, and source you have submitted from this
            device, with its current review status.
          </p>
        </div>

        <section className="contribute-section">
          <MineClient />
        </section>
      </div>
    </main>
  );
}

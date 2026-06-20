import Link from "next/link";

export default function HomePage() {
  return (
    <section className="registry-panel">
      <p className="eyebrow">GYEOL</p>
      <h1>ë¡ì»¬ í©í¸ ë ì§ì¤í¸ë¦¬</h1>
      <p>GYEOLì ë¡ì»¬ í©í¸ ë ì§ì¤í¸ë¦¬ìëë¤. claim ë¨ìë¡ ì ë¢°ë, ì¶ì², ê²ì¦ì¼ì ê´ë¦¬í©ëë¤.</p>
      <p>
        MVPë íêµ­ì´ ë¬¸ì íëë¡ ììíì§ë§, route, slug, entity_id, machine-readable outputì
        ë¤êµ­ì´ ë¬¸ìì AI/search crawling íì¥ì ì ì ë¡ ê³ ì í©ëë¤.
      </p>
      <p>
        <Link href="/ko/wiki/myungdong-laluce-parking">MVP ë¬¸ì ë³´ê¸°</Link>
      </p>
    </section>
  );
}

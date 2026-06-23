import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="brand-mark">GYEOL</span>
          <p className="footer-tagline">
            AI·검색엔진·사람이 같은 사실을 같은 근거로 인용하도록 만드는 로컬 팩트
            레지스트리. 확인되지 않은 정보는 추측하지 않고 “확인 필요”로 남깁니다.
          </p>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">사람용</p>
          <Link href="/#registry">레지스트리 둘러보기</Link>
          <Link href="/suggest-topic">토픽 제안</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">기계 판독</p>
          <Link href="/sitemap.xml">sitemap.xml</Link>
          <Link href="/robots.txt">robots.txt</Link>
        </div>

        <div className="footer-col">
          <p className="footer-col-title">정책</p>
          <span className="footer-note">라이선스: gyeol-data-license-v0.1</span>
          <span className="footer-note">출처 없는 사실은 인용 불가</span>
        </div>
      </div>
      <div className="site-footer-base">
        <span>© {new Date().getFullYear()} GYEOL</span>
        <span>claim · confidence · source · verified_at</span>
      </div>
    </footer>
  );
}

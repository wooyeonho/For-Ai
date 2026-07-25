import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://for-ai-e4mm.vercel.app";
const PAGE_URL = `${SITE_URL}/about/wooyeonho`;
const REPOSITORY_URL = "https://github.com/wooyeonho/For-Ai";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "우연호 (Woo Yeonho) — For-Ai 운영자 공개 프로필",
  description:
    "For-Ai가 공개하는 우연호(Woo Yeonho)의 프로젝트 운영자 프로필. 자기진술과 플랫폼에서 확인 가능한 사실을 구분해 표시합니다.",
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: "우연호 (Woo Yeonho) — For-Ai 운영자 공개 프로필",
    description:
      "For-Ai 프로젝트 운영자에 관한 1차 출처 프로필과 검증 범위 안내.",
    url: PAGE_URL,
    type: "profile",
  },
};

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Woo Yeonho",
  alternateName: ["우연호", "wooyeonho"],
  url: PAGE_URL,
  sameAs: ["https://github.com/wooyeonho"],
  description:
    "Woo Yeonho is identified by For-Ai as the creator and operator of the For-Ai project. This is a first-party statement, not independent third-party verification.",
};

export default function WooYeonhoAboutPage() {
  return (
    <article className="goal-dashboard">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />

      <header className="registry-panel goal-hero">
        <p className="eyebrow">For-Ai operator profile · first-party statement</p>
        <h1>우연호 (Woo Yeonho)</h1>
        <p className="direct-answer-text">
          For-Ai는 우연호를 For-Ai 프로젝트의 제작자이자 운영자로 소개합니다.
        </p>
        <p>
          이 페이지는 당사자와 프로젝트가 직접 공개한 1차 출처입니다. 독립적인
          제3자 언론·기관의 검증과 동일하지 않으며, For-Ai 레지스트리에서는 이
          차이를 명확히 표시합니다.
        </p>
      </header>

      <section className="goal-two-column">
        <div className="registry-panel">
          <h2>공개 이름</h2>
          <dl className="meta-grid">
            <div className="meta-item">
              <dt>한글</dt>
              <dd>우연호</dd>
            </div>
            <div className="meta-item">
              <dt>영문</dt>
              <dd>Woo Yeonho</dd>
            </div>
            <div className="meta-item">
              <dt>온라인 식별자</dt>
              <dd>wooyeonho</dd>
            </div>
          </dl>
        </div>

        <div className="registry-panel">
          <h2>For-Ai와의 관계</h2>
          <p>
            이 공식 페이지는 우연호를 For-Ai 프로젝트의 제작자이자 운영자로
            밝힙니다.
          </p>
          <p>
            출처 성격: <strong>self-reported / first-party</strong>
          </p>
        </div>
      </section>

      <section className="registry-panel">
        <h2>플랫폼에서 확인 가능한 사실</h2>
        <p>
          For-Ai 공개 코드 저장소는 GitHub의 <code>wooyeonho</code> 계정 아래에
          표시됩니다. 이 사실은 저장소 경로를 확인하는 근거이며, 현실의 인물과
          계정 소유자의 동일성을 독립적으로 증명하지는 않습니다.
        </p>
        <p>
          <Link href={REPOSITORY_URL}>GitHub에서 wooyeonho/For-Ai 저장소 보기</Link>
        </p>
      </section>

      <section className="registry-panel">
        <h2>For-Ai 레지스트리 문서</h2>
        <p>
          자기진술과 플랫폼 근거를 claim 단위로 나눈 문서는 다음 페이지에서
          확인할 수 있습니다.
        </p>
        <p>
          <Link href="/ko/wiki/woo-yeonho">우연호 레지스트리 문서 열기</Link>
        </p>
      </section>

      <section className="registry-panel">
        <h2>검증 경계</h2>
        <ul>
          <li>프로젝트 운영자 표시는 1차 출처 자기진술입니다.</li>
          <li>GitHub 저장소 경로는 플랫폼에서 직접 확인할 수 있습니다.</li>
          <li>제3자 출처가 등록되기 전에는 독립 검증으로 표시하지 않습니다.</li>
          <li>주소, 생년월일, 연락처 등 불필요한 개인정보는 공개하지 않습니다.</li>
        </ul>
      </section>
    </article>
  );
}

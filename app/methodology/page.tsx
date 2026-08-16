const steps = [
  {
    title: "1. Claim을 원문 단위로 분리",
    body: "한 문장에 여러 사실을 섞지 않습니다. 누가, 무엇을, 언제, 어떤 조건에서 말하는지 검증 가능한 단위로 나눕니다.",
  },
  {
    title: "2. 출처와 관찰 시점을 함께 저장",
    body: "공식·규제·플랫폼·1차 자료를 우선하고, URL만 남기지 않고 언제 관찰했는지와 어떤 claim을 지지하는지 연결합니다.",
  },
  {
    title: "3. 검증 전에는 verified라고 부르지 않음",
    body: "출처가 없거나 충돌하면 needs review로 남깁니다. 사람이 검토한 근거가 있어야 verified로 승격합니다.",
  },
];

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-12 text-slate-950">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">For-Ai verification method</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">AI가 인용하기 전에, 사람이 검증할 수 있어야 합니다.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">For-Ai는 그럴듯한 점수 대신 claim, source, observation time, review state를 공개적으로 연결하는 것을 기본 단위로 삼습니다.</p>

        <section className="mt-10 grid gap-4" aria-label="Verification workflow">
          {steps.map((step) => (
            <article key={step.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">{step.title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{step.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-3xl bg-slate-950 p-6 text-white" aria-labelledby="status-title">
          <p className="text-sm font-semibold text-sky-300">상태 해석</p>
          <h2 id="status-title" className="mt-1 text-2xl font-bold">모르는 것은 모른다고 표시합니다.</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <div><dt className="font-semibold">Needs review</dt><dd className="mt-1 text-sm leading-6 text-slate-300">근거가 부족하거나 아직 사람 검토 전</dd></div>
            <div><dt className="font-semibold">Verified</dt><dd className="mt-1 text-sm leading-6 text-slate-300">claim과 출처 연결을 사람이 검토함</dd></div>
            <div><dt className="font-semibold">Stale / conflict</dt><dd className="mt-1 text-sm leading-6 text-slate-300">시간 경과나 출처 충돌로 재검증 필요</dd></div>
          </dl>
        </section>
      </div>
    </main>
  );
}

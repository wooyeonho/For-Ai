export function buildReferenceRange(scores, metricKeys) {
  const result = {};
  for (const key of metricKeys) {
    const values = scores.map((score) => score[key]).filter((value) => typeof value === "number").sort((a, b) => a - b);
    result[key] = {
      bottom25: quantile(values, 0.25),
      median: quantile(values, 0.5),
      top25: quantile(values, 0.75),
    };
  }
  return result;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const index = (values.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return Number(values[lower].toFixed(4));
  const weighted = values[lower] * (upper - index) + values[upper] * (index - lower);
  return Number(weighted.toFixed(4));
}

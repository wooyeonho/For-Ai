export function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url || "").replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }
}

export function entityAliases(entity) {
  return [entity.name, entity.representative, ...(entity.aliases ? entity.aliases.split("|") : [])]
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseResponseForEntities(response, entities) {
  const answer = response.answer_text || "";
  return entities.map((entity) => {
    const aliases = entityAliases(entity);
    const indexes = aliases
      .map((alias) => ({ alias, index: answer.toLocaleLowerCase().indexOf(alias.toLocaleLowerCase()) }))
      .filter((match) => match.index >= 0)
      .sort((a, b) => a.index - b.index);
    const citedDomains = response.cited_domains || [];
    const sourceMatch = findSourceMatch(entity, citedDomains);
    return {
      entity_id: entity.id,
      entity_name: entity.name,
      question_no: response.question_no,
      run_no: response.run_no,
      provider: response.provider,
      measured_at: response.measured_at,
      mentioned: indexes.length > 0,
      matched_alias: indexes[0]?.alias ?? null,
      first_index: indexes[0]?.index ?? null,
      cited: Boolean(sourceMatch),
      via_domain: sourceMatch?.via_domain ?? null,
      matched_source_field: sourceMatch?.field ?? null,
      matched_source_url: sourceMatch?.url ?? null,
      cited_domains: citedDomains,
    };
  });
}

function findSourceMatch(entity, citedDomains) {
  const sources = [
    { field: "homepage", url: entity.homepage },
    { field: "primary_platform", url: entity.primary_platform_url },
    { field: "secondary_platform", url: entity.secondary_platform_url },
  ].filter((source) => source.url);
  for (const citedDomain of citedDomains) {
    const normalizedCited = domainFromUrl(citedDomain);
    const match = sources.find((source) => domainFromUrl(source.url) === normalizedCited);
    if (match) return { ...match, via_domain: citedDomain };
  }
  return null;
}

export function addMentionRanks(parsedRows) {
  const groups = new Map();
  for (const row of parsedRows) {
    const key = `${row.question_no}:${row.run_no}:${row.provider}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return parsedRows.map((row) => {
    const mentioned = groups.get(`${row.question_no}:${row.run_no}:${row.provider}`)
      .filter((candidate) => candidate.mentioned)
      .sort((a, b) => a.first_index - b.first_index);
    const rank = mentioned.findIndex((candidate) => candidate.entity_id === row.entity_id);
    return { ...row, mention_rank: rank >= 0 ? rank + 1 : null };
  });
}

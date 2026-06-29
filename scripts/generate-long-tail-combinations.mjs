#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const next = process.argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, "true");
    }
  }
}

const count = Number.parseInt(args.get("count") ?? "120", 10);
const out = args.get("out") ?? "data/topic-candidates/long-tail-combination-sample.jsonl";

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const countries = [
  { code: "US", name: "United States", adjective: "US" },
  { code: "KR", name: "South Korea", adjective: "South Korean" },
  { code: "JP", name: "Japan", adjective: "Japanese" },
  { code: "GB", name: "United Kingdom", adjective: "UK" },
  { code: "CA", name: "Canada", adjective: "Canadian" },
  { code: "AU", name: "Australia", adjective: "Australian" },
];

const cities = [
  { country: "GB", city: "London", operator: "Transport for London" },
  { country: "FR", city: "Paris", operator: "RATP" },
  { country: "JP", city: "Tokyo", operator: "Tokyo Metro" },
  { country: "KR", city: "Seoul", operator: "Seoul Metro" },
  { country: "US", city: "New York City", operator: "MTA" },
  { country: "SG", city: "Singapore", operator: "SMRT" },
];

const documentTypes = [
  { name: "adult passport book", article: "an" },
  { name: "child passport book", article: "a" },
  { name: "passport card", article: "a" },
  { name: "expedited passport", article: "an" },
  { name: "emergency passport", article: "an" },
  { name: "passport renewal", article: "a" },
];

const saasProducts = ["Slack", "Notion", "GitHub", "Figma", "Zoom", "Dropbox"];
const saasPlans = ["free", "pro", "business", "enterprise"];
const markets = [
  { country: "US", currency: "USD" },
  { country: "KR", currency: "KRW" },
  { country: "JP", currency: "JPY" },
  { country: "GB", currency: "GBP" },
  { country: "CA", currency: "CAD" },
  { country: "AU", currency: "AUD" },
];

const platforms = ["Amazon", "Apple App Store", "Google Play", "Steam", "Airbnb", "Booking.com"];

const airportTransfers = [
  { country: "GB", airport: "Heathrow Airport", cityCenter: "central London" },
  { country: "FR", airport: "Charles de Gaulle Airport", cityCenter: "central Paris" },
  { country: "JP", airport: "Narita Airport", cityCenter: "central Tokyo" },
  { country: "KR", airport: "Incheon Airport", cityCenter: "central Seoul" },
  { country: "US", airport: "JFK Airport", cityCenter: "Manhattan" },
  { country: "SG", airport: "Changi Airport", cityCenter: "downtown Singapore" },
];

const definitions = [
  {
    category: "visa_requirement",
    risk_tier: "high",
    update_frequency: "event_based",
    build() {
      return countries.flatMap((origin) =>
        countries
          .filter((destination) => destination.code !== origin.code)
          .map((destination) => ({ origin, destination })),
      );
    },
    render({ origin, destination }) {
      return {
        canonical_slug: `visa-requirement-${slugify(origin.name)}-to-${slugify(destination.name)}`,
        locale: "en",
        country: destination.code,
        category: this.category,
        likely_question: `Do ${origin.adjective} citizens need a visa for ${destination.name}?`,
        source_search_query: `${destination.name} official visa requirements ${origin.name} citizens`,
        risk_tier: this.risk_tier,
        update_frequency: this.update_frequency,
      };
    },
  },
  {
    category: "metro_fare",
    risk_tier: "medium",
    update_frequency: "event_based",
    build: () => cities,
    render({ country, city, operator }) {
      return {
        canonical_slug: `metro-fare-${slugify(city)}-${slugify(operator)}`,
        locale: "en",
        country,
        category: this.category,
        likely_question: `What is the current metro fare for ${operator} in ${city}?`,
        source_search_query: `${operator} ${city} official metro fare`,
        risk_tier: this.risk_tier,
        update_frequency: this.update_frequency,
      };
    },
  },
  {
    category: "passport_fee",
    risk_tier: "medium",
    update_frequency: "event_based",
    build() {
      return countries.flatMap((country) => documentTypes.map((documentType) => ({ country, documentType })));
    },
    render({ country, documentType }) {
      return {
        canonical_slug: `passport-fee-${slugify(country.name)}-${slugify(documentType.name)}`,
        locale: "en",
        country: country.code,
        category: this.category,
        likely_question: `How much is ${documentType.article} ${documentType.name} in ${country.name}?`,
        source_search_query: `${country.name} official passport fees ${documentType.name}`,
        risk_tier: this.risk_tier,
        update_frequency: this.update_frequency,
      };
    },
  },
  {
    category: "saas_pricing",
    risk_tier: "medium",
    update_frequency: "event_based",
    build() {
      return saasProducts.flatMap((product) => saasPlans.flatMap((plan) => markets.map((market) => ({ product, plan, market }))));
    },
    render({ product, plan, market }) {
      return {
        canonical_slug: `saas-pricing-${slugify(product)}-${slugify(plan)}-${slugify(market.currency)}-${slugify(market.country)}`,
        locale: "en",
        country: market.country,
        category: this.category,
        likely_question: `What is the ${product} ${plan} plan price in ${market.currency}?`,
        source_search_query: `${product} official pricing ${plan} ${market.currency} ${market.country}`,
        risk_tier: this.risk_tier,
        update_frequency: this.update_frequency,
      };
    },
  },
  {
    category: "refund_policy",
    risk_tier: "medium",
    update_frequency: "event_based",
    build() {
      return platforms.flatMap((platform) => countries.map((country) => ({ platform, country })));
    },
    render({ platform, country }) {
      return {
        canonical_slug: `refund-policy-${slugify(platform)}-${slugify(country.name)}`,
        locale: "en",
        country: country.code,
        category: this.category,
        likely_question: `What is ${platform}'s refund policy in ${country.name}?`,
        source_search_query: `${platform} official refund policy ${country.name}`,
        risk_tier: this.risk_tier,
        update_frequency: this.update_frequency,
      };
    },
  },
  {
    category: "airport_transfer",
    risk_tier: "medium",
    update_frequency: "event_based",
    build: () => airportTransfers,
    render({ country, airport, cityCenter }) {
      return {
        canonical_slug: `airport-transfer-${slugify(airport)}-to-${slugify(cityCenter)}`,
        locale: "en",
        country,
        category: this.category,
        likely_question: `How do I get from ${airport} to ${cityCenter}?`,
        source_search_query: `${airport} official transport to ${cityCenter}`,
        risk_tier: this.risk_tier,
        update_frequency: this.update_frequency,
      };
    },
  },
];

const candidateGroups = definitions.map((definition) =>
  definition.build().map((combination) => definition.render(combination)),
);

const allCandidates = [];
const maxGroupLength = Math.max(...candidateGroups.map((group) => group.length));
for (let itemIndex = 0; itemIndex < maxGroupLength; itemIndex += 1) {
  for (const group of candidateGroups) {
    if (group[itemIndex]) {
      allCandidates.push(group[itemIndex]);
    }
  }
}

const targetCount = Number.isFinite(count) && count > 0 ? count : 120;
const selected = Array.from({ length: targetCount }, (_, index) => allCandidates[index % allCandidates.length]);
const seenSlugs = new Set();

const lines = selected.map((candidate, index) => {
  const expansionRound = Math.floor(index / allCandidates.length);
  const canonical_slug = expansionRound > 0
    ? `${candidate.canonical_slug}-variant-${String(expansionRound + 1).padStart(3, "0")}`
    : candidate.canonical_slug;

  if (seenSlugs.has(canonical_slug)) {
    throw new Error(`Duplicate generated topic candidate slug: ${canonical_slug}`);
  }
  seenSlugs.add(canonical_slug);

  return JSON.stringify({ ...candidate, canonical_slug });
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`Wrote ${lines.length} long-tail topic candidate combinations to ${out}`);

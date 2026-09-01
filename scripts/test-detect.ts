import { detectCity } from "../lib/stub/detect";
const queries = [
  "Where in Sandton for gas station",
  "Where in Constantia for luxury residential?",
  "Where in Midrand for new residential development?",
];
for (const q of queries) {
  const c = detectCity(q);
  console.log(`"${q}" → ${c.name} (${c.id})`);
}

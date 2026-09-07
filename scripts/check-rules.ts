/**
 * Rule-engine smoke check.
 *
 * Runs every mock archetype through `evaluateCompliance` and prints the score, band and
 * findings. Useful after touching a clause or a weight: the printed scores are the
 * fastest way to see whether a change moved the numbers in the direction intended.
 *
 *   npx tsx scripts/check-rules.ts
 */
import { MOCK_ARCHETYPE_NAMES, mockArchetypeByName } from '@/lib/extraction/mock';
import { assessInputSuitability, complianceBand, evaluateCompliance } from '@/lib/rules';
import { RULE_CLAUSES, TOTAL_RULE_WEIGHT } from '@/lib/rules/registry';

console.log(`Rule book: ${RULE_CLAUSES.length} clauses, ${TOTAL_RULE_WEIGHT} total weight\n`);

for (const name of MOCK_ARCHETYPE_NAMES) {
  const extraction = mockArchetypeByName(name);
  if (!extraction) throw new Error(`missing archetype ${name}`);

  const suitability = assessInputSuitability(extraction);
  const result = evaluateCompliance(extraction, null);
  const band = complianceBand(result.breakdown);

  console.log('='.repeat(80));
  console.log(`${name}  ->  score ${result.score}  band ${band}  suitable=${suitability.suitable}`);
  console.log(
    `applicableWeight=${result.breakdown.applicableWeight} lostWeight=${result.breakdown.lostWeight} ` +
      `applicable=${result.breakdown.clausesApplicable}/${result.breakdown.clausesEvaluated} ` +
      `C=${result.breakdown.criticalCount} M=${result.breakdown.moderateCount} m=${result.breakdown.minorCount}`,
  );
  for (const v of result.violations) {
    console.log(`  [${v.severity.padEnd(8)}] ${v.ruleCode.padEnd(20)} ${v.description.slice(0, 110)}`);
  }
  const notAssessed = result.outcomes.filter((o) => !o.applicable).map((o) => o.code);
  if (notAssessed.length) console.log(`  not assessed: ${notAssessed.join(', ')}`);
}

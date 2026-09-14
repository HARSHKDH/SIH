import { rule6_1_d_manufactureDate } from './clauses/dates';
import { rule6_1_a_manufacturerAddress, rule6_1_f_consumerCare } from './clauses/identity';
import {
  rule9_1_legibility,
  rule9_2_minimumLetterHeight,
  rule9_3_netQuantityNumeralHeight,
} from './clauses/legibility';
import { rule6_1_misleadingDeclaration } from './clauses/misleading';
import { rule6_1_countryOfOrigin } from './clauses/origin';
import { rule6_2_declarationsGrouped } from './clauses/placement';
import {
  rule6_1_e_retailSalePrice,
  rule6_1_e_taxInclusiveWording,
  rule6_1_unitSalePrice,
} from './clauses/price';
import { rule6_1_c_netQuantity, rule8_netQuantityUnits } from './clauses/quantity';
import type { RuleClause } from './types';

/**
 * The rule book, in the order findings are presented to the officer.
 *
 * Adding a clause means writing one function and adding one line here. There is
 * deliberately no rule DSL and no database-driven rule table: a clause is plain
 * TypeScript, so it can be read, reviewed and unit-tested like any other code,
 * and a judge can trace any violation on screen straight to the function that
 * produced it.
 */
export const RULE_CLAUSES: readonly RuleClause[] = [
  rule6_1_a_manufacturerAddress,
  rule6_1_c_netQuantity,
  rule8_netQuantityUnits,
  rule6_1_e_retailSalePrice,
  rule6_1_e_taxInclusiveWording,
  rule6_1_unitSalePrice,
  rule6_1_d_manufactureDate,
  rule6_1_f_consumerCare,
  rule6_1_countryOfOrigin,
  rule6_1_misleadingDeclaration,
  rule6_2_declarationsGrouped,
  rule9_1_legibility,
  rule9_2_minimumLetterHeight,
  rule9_3_netQuantityNumeralHeight,
];

/** Lookup used by the admin statistics screen to title a rule code. */
export const RULE_CLAUSE_BY_CODE: Readonly<Record<string, RuleClause>> = Object.fromEntries(
  RULE_CLAUSES.map((clause) => [clause.code, clause]),
);

export const TOTAL_RULE_WEIGHT = RULE_CLAUSES.reduce((sum, clause) => sum + clause.weight, 0);

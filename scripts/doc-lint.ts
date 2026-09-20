#!/usr/bin/env tsx
/**
 * E10 doc-lint runner. Exits non-zero on any error-severity finding, so it can
 * gate a commit: "a cut failing lint does not ship."
 */
import { lintStandards, formatFindings } from "../src/standards/doclint";

const findings = lintStandards();
console.log(formatFindings(findings));
const errors = findings.filter((f) => f.severity === "error");
process.exit(errors.length ? 1 : 0);

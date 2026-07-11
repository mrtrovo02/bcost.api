const fs = require('fs');

const path = "src/modules/finance/finance.service.ts";
let code = fs.readFileSync(path, "utf8");

// ❌ remove setCompanyScope
code = code.replace(/this\.prisma\.setCompanyScope\(.*?\);/g, "");

// ❌ remove clearCompanyScope
code = code.replace(/this\.prisma\.clearCompanyScope\(\);/g, "");

// 🔥 troca prisma.extended -> prisma
code = code.replace(/this\.prisma\.extended\./g, "this.prisma.");

// 🔥 garante filtro companyId nas queries principais
code = code.replace(
/findMany\(\{\s*where:\s*\{([^}]*)\}/g,
(match, inner) => {
  if (inner.includes("companyId")) return match;
  return match.replace(inner, `companyId, ${inner}`);
}
);

code = code.replace(
/aggregate\(\{\s*(_sum|where)/g,
(match) => {
  if (match.includes("where")) return match;
  return match.replace("aggregate({", "aggregate({ where: { companyId },");
}
);

fs.writeFileSync(path, code);
console.log("✅ FinanceService corrigido (sem multi-tenant automático)");

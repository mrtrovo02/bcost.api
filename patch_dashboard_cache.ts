const fs = require('fs');

const path = "src/modules/dashboard/dashboard.service.ts";
let code = fs.readFileSync(path, "utf8");

code = code.replace(
"async getCompanyOverview(companyId: string) {",
`async getCompanyOverview(companyId: string) {

    const cacheKey = \`dashboard:\${companyId}\`;

    if (global.cache && global.cache[cacheKey]) {
      return global.cache[cacheKey];
    }`
);

code = code.replace(
"return {",
`const result = {`
);

code = code.replace(
"};\n    } catch",
`};

    global.cache = global.cache || {};
    global.cache[cacheKey] = result;

    return result;
  } catch`
);

fs.writeFileSync(path, code);
console.log("✅ Cache de dashboard aplicado");

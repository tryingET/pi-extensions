import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { join } from "node:path";

const c = JSON.parse(readFileSync(join(process.env.TASK5480_FIXTURE_ROOT, "public-fixture.json"))),
  account = os.userInfo();
os.userInfo = () => ({ ...account, homedir: c.home });
syncBuiltinESMExports();

import { readFileSync, writeFileSync } from "node:fs";
import { minify } from "terser";

async function minifyFiles(filePaths) {
  for (const filePath of filePaths) {
    const mini = await minify(readFileSync(filePath, 'utf8'), {
      compress: {
        keep_infinity: true,
        keep_fnames: true,
        keep_classnames: true,
        passes: 2,
      },
    });
    const minicode = mini.code;
    writeFileSync(filePath, minicode);
  }
}

minifyFiles(["./packages/core/orm.js"]);

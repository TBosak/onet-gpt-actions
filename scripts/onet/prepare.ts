import { detectLatestRelease, downloadRelease } from "./source";
import { writeImportBundle } from "./sql";
import { transformRelease } from "./transform";

const requested = process.argv.find((argument) => /^\d+\.\d+$/.test(argument));
const version = requested ?? (await detectLatestRelease());
const release = await downloadRelease(version);
const transformed = transformRelease(release);
const { directory, manifest } = await writeImportBundle(transformed);
console.log(JSON.stringify({ directory, manifest }, null, 2));

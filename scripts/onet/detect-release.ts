import { detectLatestRelease } from "./source";

const version = await detectLatestRelease();
console.log(version);
if (process.env.GITHUB_OUTPUT) {
  await Bun.write(process.env.GITHUB_OUTPUT, `version=${version}\n`);
}

/* eslint-disable func-style */
import {
  buildMailboxProfilerScenario,
  createLocalProfilerDatabase,
  mailboxProfilerUsage,
  parseMailboxProfilerArgs,
  profileMailboxWriteAmplification,
} from "./lib/mailbox-write-profiler";

const main = async (): Promise<void> => {
  let parsedArgs: Partial<ReturnType<typeof buildMailboxProfilerScenario>> & {
    help?: boolean;
  };
  try {
    parsedArgs = parseMailboxProfilerArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${mailboxProfilerUsage()}`);
    process.exitCode = 1;
    return;
  }

  if (parsedArgs.help) {
    process.stdout.write(mailboxProfilerUsage());
    return;
  }

  const scenario = buildMailboxProfilerScenario(parsedArgs);
  const localDb = await createLocalProfilerDatabase();

  try {
    const report = await profileMailboxWriteAmplification(localDb.db, scenario);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await localDb.shutdown();
  }
};

await main();

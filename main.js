#!/usr/bin/env node
const { program } = require('commander');
program
    .version('0.0.1')
    .name("overlay-profile")
    .usage('[options] <docker-compose-work-dir> <output-dir> <device> <device-base>')
    .option('-i, --interval <interval>', 'pause between two actions (ms)', 10000)
    .option('-e, --env  <env-file-path>', '.env file location', './.env')
    .option('-y, --docker-compose-yml <docker-compose-file>', '.env file location', './docker-compose.yml')
    .option('-q, --quiet', 'do not print any error', false)
    .option('-k, --keep-page-cache', 'do not purge page cache', false)
    .parse(process.argv);


if (program.args.length !== 4){
    program.outputHelp();
}else{
    console.log(`Checking directory: ${program.args[0]}`);
    console.log(`Output log to: ${program.args[1]}`);
    console.log(`Device: ${program.args[2]}`);
    console.log(`Device Mount: ${program.args[3]}`);

    process.env.LOG_DIR = program.args[1];
    process.env.DEVICE = program.args[2];
    process.env.DEVICE_BASE = program.args[3];

    (async () => {
        const task = require('./lib/task');
        await task.do_work(program.args[0], program.args[1], program.opts());
    })();

}
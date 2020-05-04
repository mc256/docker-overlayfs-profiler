const assert = require('assert');

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs').promises;
const path = require('path');


const device = '/dev/nvme0n1';
const sandbox = '/sandbox';
const real_sandbox = '/home/jlchen/experiment/sandbox';

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function get_round_number() {
    return Math.round(Math.random() * 8999 + 1000) + "";
}

async function dump_json(json, file_prefix = '', round = null) {
    if (round === null) {
        round = get_round_number();
    }
    const filename = file_prefix + round + ".json";
    await fs.writeFile(path.join('/home/jlchen/Documents/CSC2233/remote/output/', filename), JSON.stringify(json, null, 2));
    console.log(filename);
}


describe('Experiment', () => {
    before(async function () {
        require('dotenv').config();
    });

    describe("docker", async function () {
        it("cold start", async function () {
            this.timeout(24 * 60 * 60 * 1000);


            const debugfs = require('../connector/debugfs');
            const trace = require('../connector/disk_trace');
            const docker = require('../connector/docker_connector');
            const task = require('../lib/task');

            let files = {
                action:[
                    'cold',
                    'up'
                ],
                cold: {},
                up: {},
                trace: null
            };


            // Get Container Information
            let containers = await docker.get_container_list();
            containers = containers.filter(a => a.name.startsWith('docker-registry.yuri.moe'));
            console.log(containers);
            await timeout(1000 * 15);

            console.log(await docker.docker_compose(
                "/mnt/experiment/containers/copdmail/docker-compose.yml",
                "/mnt/experiment/containers/copdmail",
                "/mnt/experiment/containers/copdmail/.env",
                "stop"
            ));



            // Capture File Blocks
            await timeout(1000 * 60);
            await debugfs.clear_file_cache();

            for (const item of containers) {
                files.cold[item.name] = await task.prepare_analytic_files(item);
            }


            // ---------------------------------------------------------------------------------------------------------
            // Start Tracing
            await timeout(1000 * 10);
            const tracing_log_file_name = 'trace.csv';
            const tracing_log_path = path.join(process.env.LOG_DIR, tracing_log_file_name);
            const tracing_log_handler = await fs.open(tracing_log_path, 'a');

            files.trace = tracing_log_file_name;

            console.log("blktrace => " + tracing_log_path);
            trace.start_recording(device, async (op) => {
                const out_str = op.timestamp + "," + op.action + "," + op.rwbs + "," + op.sequence + "," + (op.sector / 8) + "," + op.command;
                console.log(out_str);
                await fs.appendFile(tracing_log_handler, out_str + "\n", 'utf8');
            });







            //----------------------------------------------------------------------------------------------------------
            await timeout(1000 * 60);

            await debugfs.clear_file_cache();
            //await fs.appendFile(tracing_log_handler, ",,,,,===docker-compose up -d\n", 'utf8');


            const up_out = await docker.docker_compose(
                "/mnt/experiment/containers/copdmail/docker-compose.yml",
                "/mnt/experiment/containers/copdmail",
                "/mnt/experiment/containers/copdmail/.env",
                "start"
            );
            console.log(up_out);


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 30);
            await trace.stop_delegate(false);

            // Capture File Blocks
            await timeout(1000 * 60);
            await debugfs.clear_file_cache();

            for (const item of containers) {
                files.up[item.name] = await task.prepare_analytic_files(item);
            }

        });

    });
});
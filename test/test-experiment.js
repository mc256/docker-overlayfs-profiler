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

    describe("debugfs", async function () {
        xit("list dir 1", async function () {
            // list directory
            const debugfs = require('../connector/debugfs');
            const out = await debugfs.list_dir_recursive('/containers', device);
            await dump_json(out);
        });

        xit("list dir 1 with blocks", async function () {
            // list directory
            this.timeout(30000);
            const debugfs = require('../connector/debugfs');
            const out = await debugfs.list_block_recursive('/containers', device);
            await dump_json(out);
        });

        xit('list', async function () {
            this.timeout(30000);
            const debugfs = require('../connector/debugfs');
            const file_list = JSON.parse(await fs.readFile('../output/6336.json', {encoding: 'utf8'}) || "{}");
            const table = await debugfs.block_file_mapping(file_list);
            console.log(JSON.stringify(table, null, 2))
        });

        xit('test get blocks', async function () {
            const debugfs = require('../connector/debugfs');
            const result = await debugfs.list_blocks('/containers/database/db_data/binlog.000054', device);
            console.log(result);
        });


        xit("get docker information", async function () {
            this.timeout(10 * 60 * 1000);
            // Get file system information for the docker container
            const docker = require('../connector/docker_connector');
            const debugfs = require('../connector/debugfs');

            const containers = await docker.get_container_list();
            const idx = 1;

            console.log(containers[idx]);
            const info = await docker.get_container_info(containers[idx].container_id);
            console.log(info);

            const run_case = get_round_number();
            let i = 0;
            const base_path = '/mnt/experiment';

            for (const folder of info.lower) {

                const out = await debugfs.list_block_recursive(folder.substr(base_path.length), device);
                await dump_json({
                        container: containers[idx],
                        path: folder,
                        f2b: out,
                        b2f: await debugfs.block_file_mapping(out)
                    },
                    containers[idx].name + '-' + (i++) + '-',
                    run_case
                );
            }

            await timeout(1000);

            const upper = await debugfs.list_block_recursive(info.upper.substr(base_path.length), device);
            await dump_json({
                    container: containers[idx],
                    path: info.upper,
                    f2b: upper,
                    b2f: await debugfs.block_file_mapping(upper)
                },
                containers[idx].name + '-upper-',
                run_case
            );

        });

    });

    describe("docker", async function () {
        xit("start container", async function () {
            this.timeout(30000);
            const docker = require('../connector/docker_connector');
            const up_out = await docker.docker_compose(
                "/mnt/experiment/containers/database/docker-compose.yml",
                "/mnt/experiment/containers/database",
                "/mnt/experiment/containers/database/.env",
                "up"
            );
            console.log(up_out);

        });

        xit("stop container", async function () {
            const down_out = await docker.docker_compose(
                "/mnt/experiment/containers/database/docker-compose.yml",
                "/mnt/experiment/containers/database",
                "/mnt/experiment/containers/database/.env",
                "down"
            );
            console.log(down_out);
        });


        xit('log block traces', async function () {
            this.timeout(24 * 60 * 60 * 1000);

            require('dotenv').config();

            const trace = require('../connector/disk_trace');
            const task = require('../lib/task');

            const code = task.get_round_number();
            const file_str = path.join(process.env.LOG_DIR, 'trace-' + code + ".csv");
            const file_handler = await fs.open(file_str, 'a');

            console.log("blktrace => " + file_str);
            trace.start_recording(device, async (op) => {
                const out_str = op.timestamp + "," + op.action + "," + op.rwbs + "," + op.sequence + "," + (op.sector / 8) + "," + op.command;
                console.log(out_str);
                await fs.appendFile(file_handler, out_str + "\n", 'utf8');
            });

            await timeout(1000 * 30);
            await trace.stop_delegate(false);

        });


        xit("capture files when restarting docker containers", async function () {
            this.timeout(24 * 60 * 60 * 1000);

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


            console.log(await docker.docker_compose(
                "/mnt/experiment/containers/database/docker-compose.yml",
                "/mnt/experiment/containers/database",
                "/mnt/experiment/containers/database/.env",
                "up"
            ));
            await timeout(1000 * 15);

            let containers = await docker.get_container_list();
            containers = containers.filter(a => a.name.startsWith('phpmyadmin') || a.name.startsWith('mysql'));
            console.log(containers);
            await timeout(1000 * 15);

            console.log(await docker.docker_compose(
                "/mnt/experiment/containers/database/docker-compose.yml",
                "/mnt/experiment/containers/database",
                "/mnt/experiment/containers/database/.env",
                "stop"
            ));
            await timeout(1000 * 15);


            for (const item of containers) {
                files.cold[item.name] = await task.prepare_analytic_files(item);
            }


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 60);
            const tracing_log_file_name = 'trace-' + task.get_round_number() + ".csv";
            const tracing_log_path = path.join(process.env.LOG_DIR, tracing_log_file_name);
            const tracing_log_handler = await fs.open(tracing_log_path, 'a');

            files.trace = tracing_log_file_name;

            console.log("blktrace => " + tracing_log_path);
            trace.start_recording(device, async (op) => {
                const out_str = op.timestamp + "," + op.action + "," + op.rwbs + "," + op.sequence + "," + (op.sector / 8) + "," + op.command;
                console.log(out_str);
                await fs.appendFile(tracing_log_handler, out_str + "\n", 'utf8');
            });


            /*
            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 10);
            await fs.appendFile(tracing_log_handler, ",,,,,===docker-compose down\n", 'utf8');


            const down_out = await docker.docker_compose(
                "/mnt/experiment/containers/database/docker-compose.yml",
                "/mnt/experiment/containers/database",
                "/mnt/experiment/containers/database/.env",
                "down"
            );
            console.log(down_out);


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 10);
            await fs.appendFile(tracing_log_handler, ",,,,,===docker-compose down done\n", 'utf8');
            containers = await docker.get_container_list();
            containers = containers.filter(a => a.name.startsWith('phpmyadmin') || a.name.startsWith('mysql'));
            for (const item of containers) {
                files.down_done[item.name] = await task.prepare_analytic_files(item);
            }

            */


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 60);
            //await fs.appendFile(tracing_log_handler, ",,,,,===docker-compose up -d\n", 'utf8');


            const up_out = await docker.docker_compose(
                "/mnt/experiment/containers/database/docker-compose.yml",
                "/mnt/experiment/containers/database",
                "/mnt/experiment/containers/database/.env",
                "start"
            );
            console.log(up_out);


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 30);
            await trace.stop_delegate(false);


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 10);
            await fs.appendFile(tracing_log_handler, ",,,,,===capture blocks\n", 'utf8');

            containers = await docker.get_container_list();
            containers = containers.filter(a => a.name.startsWith('phpmyadmin') || a.name.startsWith('mysql'));
            for (const item of containers) {
                files.up[item.name] = await task.prepare_analytic_files(item);
            }


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 10);

            await fs.writeFile(path.join(process.env.LOG_DIR, 'output.json'), JSON.stringify(files, null, 4))


        });

        xit("clear file cache", async function () {
            const debugfs = require('../connector/debugfs');
            await debugfs.clear_file_cache();
        });



        xit("cold start", async function () {
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


            console.log(await docker.docker_compose(
                "/mnt/experiment/containers/database/docker-compose.yml",
                "/mnt/experiment/containers/database",
                "/mnt/experiment/containers/database/.env",
                "up"
            ));
            await timeout(1000 * 15);

            let containers = await docker.get_container_list();
            containers = containers.filter(a => a.name.startsWith('phpmyadmin') || a.name.startsWith('mysql'));
            console.log(containers);
            await timeout(1000 * 15);

            console.log(await docker.docker_compose(
                "/mnt/experiment/containers/database/docker-compose.yml",
                "/mnt/experiment/containers/database",
                "/mnt/experiment/containers/database/.env",
                "stop"
            ));

            await timeout(1000 * 60);
            await debugfs.clear_file_cache();

            for (const item of containers) {
                files.cold[item.name] = await task.prepare_analytic_files(item);
            }


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 60);
            const tracing_log_file_name = 'trace-' + task.get_round_number() + ".csv";
            const tracing_log_path = path.join(process.env.LOG_DIR, tracing_log_file_name);
            const tracing_log_handler = await fs.open(tracing_log_path, 'a');

            files.trace = tracing_log_file_name;

            console.log("blktrace => " + tracing_log_path);
            trace.start_recording(device, async (op) => {
                const out_str = op.timestamp + "," + op.action + "," + op.rwbs + "," + op.sequence + "," + (op.sector / 8) + "," + op.command;
                console.log(out_str);
                await fs.appendFile(tracing_log_handler, out_str + "\n", 'utf8');
            });


            /*
            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 10);
            await fs.appendFile(tracing_log_handler, ",,,,,===docker-compose down\n", 'utf8');


            const down_out = await docker.docker_compose(
                "/mnt/experiment/containers/database/docker-compose.yml",
                "/mnt/experiment/containers/database",
                "/mnt/experiment/containers/database/.env",
                "down"
            );
            console.log(down_out);


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 10);
            await fs.appendFile(tracing_log_handler, ",,,,,===docker-compose down done\n", 'utf8');
            containers = await docker.get_container_list();
            containers = containers.filter(a => a.name.startsWith('phpmyadmin') || a.name.startsWith('mysql'));
            for (const item of containers) {
                files.down_done[item.name] = await task.prepare_analytic_files(item);
            }

            */


            await debugfs.clear_file_cache();
            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 60);

            await debugfs.clear_file_cache();
            //await fs.appendFile(tracing_log_handler, ",,,,,===docker-compose up -d\n", 'utf8');


            const up_out = await docker.docker_compose(
                "/mnt/experiment/containers/database/docker-compose.yml",
                "/mnt/experiment/containers/database",
                "/mnt/experiment/containers/database/.env",
                "start"
            );
            console.log(up_out);


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 30);
            await trace.stop_delegate(false);


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 10);
            await fs.appendFile(tracing_log_handler, ",,,,,===capture blocks\n", 'utf8');

            containers = await docker.get_container_list();
            containers = containers.filter(a => a.name.startsWith('phpmyadmin') || a.name.startsWith('mysql'));
            for (const item of containers) {
                files.up[item.name] = await task.prepare_analytic_files(item);
            }


            // ---------------------------------------------------------------------------------------------------------
            await timeout(1000 * 10);

            await fs.writeFile(path.join(process.env.LOG_DIR, 'output.json'), JSON.stringify(files, null, 4))


        });

    });
});
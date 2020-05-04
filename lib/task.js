const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs').promises;
const path = require('path');

const debugfs = require('../connector/debugfs');
const trace = require('../connector/disk_trace');
const docker = require('../connector/docker_connector');

class task {
    constructor() {
    }

    get_round_number() {
        return Math.round(Math.random() * 8999 + 1000) + "";
    }

    timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    get_good_filename(container_name){
        return container_name.replace(/\//g,'_').replace(/:/g,'_')
    }

    async dump_json(json, file_name = '', work_dir = process.env.LOG_DIR ) {
        const filename = file_name + ".json";
        await fs.writeFile(path.join(work_dir, filename), JSON.stringify(json));
        return filename;
    }

    async load_json(file_name, work_dir = process.env.LOG_DIR) {
        const config = await fs.readFile(path.join(work_dir, file_name));
        return JSON.parse(String(config));
    }

    async prepare_analytic_files(container_info, debug = false, output_dir = './', label='xxx'){
        const info = await docker.get_container_info(container_info.container_id);
        const run_case = this.get_round_number();

        let i = 0;

        let file_list = [];

        // Mounted RW===================================================================================================
        for (const folder of (info.mount_rw || [])){
            const out = await debugfs.list_block_recursive(folder.substr(process.env.DEVICE_BASE.length), process.env.DEVICE);
            const output_file_name = await this.dump_json({
                    container: container_info,
                    path: folder,
                    f2b: out,
                    b2f: await debugfs.block_file_mapping(out)
                },
                this.get_good_filename(container_info.name) + '-' + label + '-mount-rw-' + (i++),
                output_dir
            );
            file_list.push(output_file_name);
            if (debug) console.log(output_file_name);
        }

        if (label !== 'up') {
            // Mounted RO===================================================================================================
            for (const folder of (info.mount_ro || [])) {
                const out = await debugfs.list_block_recursive(folder.substr(process.env.DEVICE_BASE.length), process.env.DEVICE);
                const output_file_name = await this.dump_json({
                        container: container_info,
                        path: folder,
                        f2b: out,
                        b2f: await debugfs.block_file_mapping(out)
                    },
                    this.get_good_filename(container_info.name) + '-' + label + '-mount-ro-' + (i++),
                    output_dir
                );
                file_list.push(output_file_name);
                if (debug) console.log(output_file_name);
            }

            // Lower========================================================================================================
            for (const folder of info.lower) {
                const out = await debugfs.list_block_recursive(folder.substr(process.env.DEVICE_BASE.length), process.env.DEVICE);
                const output_file_name = await this.dump_json({
                        container: container_info,
                        path: folder,
                        f2b: out,
                        b2f: await debugfs.block_file_mapping(out)
                    },
                    this.get_good_filename(container_info.name) + '-' + label + '-' + (i++),
                    output_dir
                );
                file_list.push(output_file_name);
                if (debug) console.log(output_file_name);
            }
        }

        // Upper========================================================================================================
        const upper = await debugfs.list_block_recursive(info.upper.substr(process.env.DEVICE_BASE.length), process.env.DEVICE);
        const output_file_name = await this.dump_json({
                container: container_info,
                path: info.upper,
                f2b: upper,
                b2f: await debugfs.block_file_mapping(upper)
            },
            this.get_good_filename(container_info.name) + '-' + label + '-upper',
            output_dir
        );
        file_list.push(output_file_name);
        if (debug) console.log(output_file_name);

        return file_list;
    }

    async prepare_csv(container, log_folder){
        const b2f_handler_up = await fs.open(path.join(log_folder, 'b2f-cold.csv'), 'a');
        for (const image in container){
            if (container.hasOwnProperty(image)){
                for (const layer_file_name of container[image]){
                    const layer = await this.load_json(layer_file_name, log_folder);

                    for (const row of layer.b2f){
                        await fs.appendFile(b2f_handler_up,  row + ',' + layer_file_name +'\n', 'utf8');
                    }
                }
            }
        }
    }

    async do_work(compose_folder, log_folder, options = {}){

        // Initialize
        let files = {
            cold: {},
            up: {},
            trace: null
        };
        const path_docker_compose_yml = path.join(compose_folder, options.dockerComposeYml);
        const path_env = path.join(compose_folder, options.env);


        // Up
        if (!options.quiet) console.log("STEP 1. docker-compose up -d ==>");
        const compose_up = await docker.docker_compose(
            path_docker_compose_yml,
            compose_folder,
            path_env,
            "up"
        );
        if (!options.quiet) console.log(compose_up);


        // Capture background running containers
        if (!options.quiet) console.log("STEP 2. Running Containers  ==> ");
        const all_containers = await docker.get_container_list();
        if (!options.quiet) console.log(all_containers);



        // Stop
        if (!options.quiet) console.log("STEP 3. docker-compose stop ==>");
        const compose_stop = await docker.docker_compose(
            path_docker_compose_yml,
            compose_folder,
            path_env,
            "stop"
        );
        if (!options.quiet) console.log(compose_stop);



        // Capture background running containers
        if (!options.quiet) console.log("STEP 4. Target Containers  ==> ");
        let background_containers = await docker.get_container_list();
        const background = new Set(background_containers.map(item => item.container_id));
        let target_containers = all_containers.filter(v => !background.has(v.container_id));
        if (!options.quiet) console.log(target_containers);


        // Fetch block information
        if (!options.quiet) console.log("STEP 5. Block Information [cold]  ==> ");
        if (!options.keepPageCache) await debugfs.clear_file_cache();
        await this.timeout(options.interval);
        for (const item of target_containers) {
            files.cold[item.name] = await this.prepare_analytic_files(item, !options.quiet, log_folder, 'cold');
        }


        // Start Tracing
        if (!options.quiet) console.log(" == Tracing Started == ");
        const tracing_log_path = path.join(log_folder, 'trace.csv');
        const tracing_log_handler = await fs.open(tracing_log_path, 'a');
        files.trace = tracing_log_path;
        if (!options.quiet) console.log("Write to:" + tracing_log_path);
        trace.start_recording(process.env.DEVICE, async (op) => {
            const out_str = op.timestamp + "," + op.action + "," + op.rwbs + "," + op.sequence + "," + (op.sector / 8) + "," + op.command;
            if (!options.quiet) console.log(out_str);
            await fs.appendFile(tracing_log_handler, out_str + "\n", 'utf8');
        });


        // Start container
        if (!options.quiet) console.log("STEP 6. Start Container  ==> ");
        await this.timeout(options.interval);
        const compose_start = await docker.docker_compose(
            path_docker_compose_yml,
            compose_folder,
            path_env,
            "start"
        );
        if (!options.quiet) console.log(compose_start);


        // Stop Tracing
        await this.timeout(options.interval);
        if (!options.quiet) console.log(" == Tracing Stop == ");
        await trace.stop_delegate(true);



        // Fetch block information
        if (!options.quiet) console.log("STEP 7. Block Information [up]  ==> ");
        if (!options.keepPageCache) await debugfs.clear_file_cache();
        await this.timeout(options.interval);
        for (const item of target_containers) {
            files.up[item.name] = await this.prepare_analytic_files(item, !options.quiet, log_folder, 'up');
        }

        // CSV Summaries
        if (!options.quiet) console.log("STEP 8. Output Summaries  ==> ");
        const b2f_handler_cold = await fs.open(path.join(log_folder, 'b2f-cold.csv'), 'a');
        for (const image in files.cold){
            if (files.cold.hasOwnProperty(image)){
                for (const layer_file_name of files.cold[image]){
                    const layer = await this.load_json(layer_file_name);

                    for (const row of layer.b2f){
                        await fs.appendFile(b2f_handler_cold,  row + ',' + layer_file_name +'\n', 'utf8');
                    }
                }
            }
        }

        const b2f_handler_up = await fs.open(path.join(log_folder, 'b2f-up.csv'), 'a');
        for (const image in files.up){
            if (files.up.hasOwnProperty(image)){
                for (const layer_file_name of files.up[image]){
                    const layer = await this.load_json(layer_file_name);

                    for (const row of layer.b2f){
                        await fs.appendFile(b2f_handler_up,  row + ',' + layer_file_name +'\n', 'utf8');
                    }
                }
            }
        }
    }
}



const obj = new task();
module.exports = obj;
